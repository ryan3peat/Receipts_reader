import { requestLLM, type LLMResponse, type LLMSettings } from "@/ai/providers/llmProvider"
import { mkdtemp, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { degrees, PDFDocument } from "pdf-lib"
import { fromPath } from "pdf2pic"
import sharp from "sharp"

const MAX_PAGES = 150
// A page is read as a 200 dpi picture, turned upright. Smaller or sideways pictures misread amounts.
const RENDER_DENSITY = 200
const RENDER_SIZE = 2400
// A page with less than this share of dark pixels is blank, and is not sent to the model.
const INK_SHARE = 0.0005
// Each page is one request. Multi-page requests stalled the connection to the model.
const REQUEST_LIMIT_MS = 90_000

export const STATEMENT_PROMPT = `You read one page from a scanned Australian company credit card statement, for example from NAB.
The page is upright.

kind is one of:
- cardholder: a page of one cardholder's transaction record. It shows "Cardholder Details" or "Transaction record for:" followed by a person's name.
- billing: a page of the transaction record of the billing account.
- summary: a page with the "Cardholder summary" table that lists every cardholder account with its totals.
- other: cover page, account summary, notices, terms and blank pages.

On cardholder and billing pages:
- cardholderName is the name after "Cardholder Name:" or "Transaction record for:", without "(continued)". Use "Billing account" for the billing account.
- accountNumber is the card number printed as "Account No" on this page. Leave it empty when this page does not print it. Never copy it from another page.
- period is the statement period printed on this page. Leave it empty when this page does not print it.
- totalForPeriod is the "Total for this period" amount exactly as printed, including CR when it is there. Leave it empty when this page does not print it.
- lines holds every transaction row of the table, from top to bottom. Never skip, merge, reorder or invent a row. Two rows that look the same are two transactions.
  - date is YYYY-MM-DD.
  - narrative is the Details text, unchanged.
  - amount is the "Amount A$" value in dollars and is always positive.
  - credit is true when the amount is followed by CR, otherwise false.
  - foreign is explained below, otherwise empty.
- A row whose Details start with "FRGN AMT:" is not a transaction. It repeats the date and amount of the row above it to show what was charged in the foreign currency. Do not return it as a line. Put the text that follows "FRGN AMT:", for example "162,205 Dong", in the foreign field of the row above it.
- Ignore the Explanation, GST and Reference columns.

On summary pages:
- summary holds one row for every account in the "Cardholder summary" table, including the billing account. accountNumber and cardholderName are as printed. credits is "Payments and other credits (A)", purchases is "Purchases and cash advances (B)" and charges is "Interest and other charges (C)", each exactly as printed.
- Ignore the rewards points table and the grand total row.

Leave lines empty on summary and other pages. Leave summary empty on every page that is not a summary page.`

export const STATEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          page: { type: "number" },
          kind: { type: "string", enum: ["cardholder", "billing", "summary", "other"] },
          cardholderName: { type: "string" },
          accountNumber: { type: "string" },
          period: { type: "string" },
          totalForPeriod: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                date: { type: "string" },
                narrative: { type: "string" },
                amount: { type: "number" },
                credit: { type: "boolean" },
                foreign: { type: "string" },
              },
              required: ["date", "narrative", "amount", "credit", "foreign"],
            },
          },
          summary: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                accountNumber: { type: "string" },
                cardholderName: { type: "string" },
                credits: { type: "string" },
                purchases: { type: "string" },
                charges: { type: "string" },
              },
              required: ["accountNumber", "cardholderName", "credits", "purchases", "charges"],
            },
          },
        },
        required: ["page", "kind", "cardholderName", "accountNumber", "period", "totalForPeriod", "lines", "summary"],
      },
    },
  },
  required: ["pages"],
}

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  let source: PDFDocument
  try {
    source = await PDFDocument.load(bytes)
  } catch {
    throw new Error("That PDF could not be opened. Save it again without a password and upload it once more.")
  }
  const total = source.getPageCount()
  if (total === 0) throw new Error("That PDF has no pages")
  if (total > MAX_PAGES) throw new Error(`That PDF has ${total} pages. The most a statement can have is ${MAX_PAGES}.`)
  return total
}

// Renders every page of a PDF as an upright picture. The pages are turned before rendering.
async function renderPdfPages(pdf: PDFDocument): Promise<{ page: number; png: Buffer }[]> {
  for (const page of pdf.getPages()) page.setRotation(degrees(90))
  const workDir = await mkdtemp(path.join(os.tmpdir(), "ef-statement-"))
  try {
    const uprightPath = path.join(workDir, "statement.pdf")
    await writeFile(uprightPath, await pdf.save())
    const convert = fromPath(uprightPath, {
      density: RENDER_DENSITY,
      format: "png",
      width: RENDER_SIZE,
      height: RENDER_SIZE,
      preserveAspectRatio: true,
    })
    const results = await convert.bulk(-1, { responseType: "buffer" })
    return results
      .flatMap((result) => (result.buffer && result.page ? [{ page: result.page, png: result.buffer }] : []))
      .sort((left, right) => left.page - right.page)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

// Every page of the statement as an upright picture, numbered from 1.
export async function renderStatementPages(bytes: Uint8Array): Promise<{ page: number; png: Buffer }[]> {
  const total = await pageCountOf(bytes)
  const pages = await renderPdfPages(await PDFDocument.load(bytes))
  if (pages.length !== total) {
    throw new Error(`The statement could only be prepared for ${pages.length} of its ${total} pages. Upload it again.`)
  }
  return pages
}

// One page of the statement as an upright picture. Used to read a single page per request.
export async function renderOnePage(bytes: Uint8Array, page: number): Promise<Buffer> {
  const source = await PDFDocument.load(bytes)
  if (page < 1 || page > source.getPageCount()) throw new Error(`Page ${page} is not in this statement`)
  const single = await PDFDocument.create()
  const [copied] = await single.copyPages(source, [page - 1])
  single.addPage(copied)
  const pages = await renderPdfPages(single)
  if (pages.length !== 1) throw new Error(`Page ${page} of the statement could not be prepared`)
  return pages[0].png
}

// Drops blank pages, so no request is spent on them.
export async function printedPages(pages: { page: number; png: Buffer }[]): Promise<{ page: number; png: Buffer }[]> {
  const printed: { page: number; png: Buffer }[] = []
  for (const item of pages) {
    const { data } = await sharp(item.png).greyscale().raw().toBuffer({ resolveWithObject: true })
    let dark = 0
    for (const value of data) if (value < 200) dark++
    if (dark / data.length >= INK_SHARE) printed.push(item)
  }
  return printed
}

function withLimit<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The model did not answer in time")), ms)
  })
  return Promise.race([work, limit]).finally(() => clearTimeout(timer))
}

// Reads one upright page picture. Every entry the model returns belongs to that page.
export async function readPicture(llm: LLMSettings, page: number, png: Buffer, filename: string): Promise<unknown[]> {
  let failure = ""
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now()
    let response: LLMResponse
    try {
      response = await withLimit(
        requestLLM(llm, {
          prompt: STATEMENT_PROMPT,
          schema: STATEMENT_SCHEMA,
          attachments: [{ filename: `${filename}-page-${page}.png`, contentType: "image/png", base64: png.toString("base64") }],
        }),
        REQUEST_LIMIT_MS
      )
    } catch (error) {
      response = { output: {}, provider: llm.providers[0]?.provider ?? "openai", error: error instanceof Error ? error.message : String(error) }
    }
    console.info(`[statement] page ${page} attempt ${attempt + 1} took ${Date.now() - started} ms${response.error ? `, error: ${response.error}` : ""}`)

    if (!response.error) {
      const pages = (response.output as unknown as { pages?: unknown }).pages
      if (Array.isArray(pages) && pages.length > 0) {
        return pages.flatMap((item) => (item && typeof item === "object" ? [{ ...(item as Record<string, unknown>), page }] : []))
      }
      failure = "The answer had no pages"
    } else {
      failure = response.error
    }
  }
  throw new Error(`Page ${page} of the statement could not be read. ${failure}`)
}

// Renders one page of the stored statement and reads it.
export async function readOnePage(llm: LLMSettings, bytes: Uint8Array, page: number, filename: string): Promise<unknown[]> {
  return readPicture(llm, page, await renderOnePage(bytes, page), filename)
}
