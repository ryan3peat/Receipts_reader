import { PDFDocument, StandardFonts } from "pdf-lib"
import sharp from "sharp"
import { describe, expect, it } from "vitest"
import { printedPages, renderOnePage, renderStatementPages } from "@/ai/statement"

async function statementPdf(pages: { text?: string; width?: number; height?: number }[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const { text, width = 612, height = 792 } of pages) {
    const page = pdf.addPage([width, height])
    if (text) page.drawText(text, { x: 50, y: height - 100, size: 24, font })
  }
  return pdf.save()
}

describe("statement rendering", () => {
  it("renders each page as an upright picture, turned to landscape", async () => {
    const bytes = await statementPdf([{ text: "Total for this period 12.34" }, { text: "Second page" }])
    const pages = await renderStatementPages(bytes)

    expect(pages.map((page) => page.page)).toEqual([1, 2])
    const meta = await sharp(pages[0].png).metadata()
    // Pages are turned 90 degrees, as the scanned statements need, so a portrait page comes out landscape.
    expect(meta.width).toBeGreaterThan(meta.height ?? 0)
    expect(meta.width).toBeLessThanOrEqual(2400)
    expect(meta.height).toBeLessThanOrEqual(2400)
  })

  it("renders a single requested page", async () => {
    const bytes = await statementPdf([{ text: "One" }, { text: "Two" }])
    const png = await renderOnePage(bytes, 2)
    const meta = await sharp(png).metadata()
    expect(meta.format).toBe("png")
    expect(meta.width).toBeGreaterThan(meta.height ?? 0)
  })

  it("counts a page with text as printed and leaves a blank page out", async () => {
    const bytes = await statementPdf([{ text: "Card transactions" }, {}, { text: "More rows" }])
    const pages = await renderStatementPages(bytes)
    const printed = await printedPages(pages)
    expect(printed.map((page) => page.page)).toEqual([1, 3])
  })

  it("rejects a PDF that cannot be opened", async () => {
    await expect(renderStatementPages(new TextEncoder().encode("not a pdf"))).rejects.toThrow(
      "could not be opened"
    )
  })
})
