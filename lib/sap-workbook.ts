import ExcelJS from "exceljs"
import type { ParsedStatementLine, SapRow } from "@/lib/sap"

const MISSING_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
}

function dollars(cents: number) {
  return Math.round(cents) / 100
}

function writeHeader(sheet: ExcelJS.Worksheet, accountName: string, accountNumber: string, employeeCode: string) {
  sheet.getCell("A1").value = "Account Name:"
  sheet.getCell("B1").value = accountName
  sheet.getCell("C1").value = employeeCode
  sheet.getCell("A2").value = "Account Number:"
  sheet.getCell("B2").value = accountNumber
  sheet.getCell("C3").value = "Cardholder Input"
  sheet.getCell("E3").value = "Accounts Input"
  sheet.getCell("C4").value = "Filled from the receipt"
  sheet.getCell("D4").value = "GL code from the Essential chart. Add the department suffix in SAP if this export does not include one."
  sheet.getCell("G4").value =
    "P1 = 10% GST. P2 = no GST. Mixed receipts add a second line. Entertainment 2210/2211 is split 50-50 for FBT."
  sheet.getCell("H4").value = "Amount after GST"
  sheet.getCell("I4").value = "Employee code"
  sheet.getRow(4).alignment = { wrapText: true, vertical: "top" }
  sheet.getRow(4).height = 48

  const headers = ["Date", "Narrative", "Description", "GL Code", "G/L Account Name", "Project", "GST", "Amount", "Dimension 1", "Note"]
  headers.forEach((header, index) => {
    const cell = sheet.getCell(5, index + 1)
    cell.value = header
    cell.font = { bold: true }
  })
  sheet.views = [{ state: "frozen", ySplit: 5 }]
  sheet.columns = [
    { width: 14 },
    { width: 62 },
    { width: 42 },
    { width: 14 },
    { width: 36 },
    { width: 18 },
    { width: 10 },
    { width: 14 },
    { width: 16 },
    { width: 64 },
  ]
}

export async function buildSapWorkbook(input: {
  accountName: string
  accountNumber: string
  employeeCode: string
  rows: SapRow[]
  bankLines: ParsedStatementLine[]
}) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("For SAP")
  writeHeader(sheet, input.accountName, input.accountNumber, input.employeeCode)

  input.rows.forEach((row, index) => {
    const excelRow = sheet.getRow(6 + index)
    excelRow.getCell(1).value = row.date ? new Date(`${row.date}T00:00:00.000Z`) : null
    excelRow.getCell(1).numFmt = "dd/mm/yyyy"
    excelRow.getCell(2).value = row.narrative
    excelRow.getCell(3).value = row.description
    excelRow.getCell(4).value = row.glCode
    excelRow.getCell(5).value = row.glName
    excelRow.getCell(6).value = row.project
    excelRow.getCell(7).value = row.gstCode
    excelRow.getCell(8).value = dollars(row.amountCents)
    excelRow.getCell(8).numFmt = "#,##0.00"
    excelRow.getCell(9).value = row.dimension
    excelRow.getCell(10).value = row.note
    if (row.missing) {
      for (let column = 1; column <= 10; column += 1) excelRow.getCell(column).fill = MISSING_FILL
      excelRow.getCell(3).font = { bold: true }
    }
  })

  const bank = workbook.addWorksheet("Downloaded from Bank")
  bank.getCell("A1").value = "Account Name:"
  bank.getCell("B1").value = input.accountName
  bank.getCell("A2").value = "Account Number:"
  bank.getCell("B2").value = input.accountNumber
  ;["Date", "Narrative", "Kind", "Amount"].forEach((header, index) => {
    const cell = bank.getCell(4, index + 1)
    cell.value = header
    cell.font = { bold: true }
  })
  input.bankLines.forEach((line, index) => {
    const excelRow = bank.getRow(5 + index)
    excelRow.getCell(1).value = line.postedOn ? new Date(`${line.postedOn}T00:00:00.000Z`) : null
    excelRow.getCell(1).numFmt = "dd/mm/yyyy"
    excelRow.getCell(2).value = line.narrative
    excelRow.getCell(3).value = line.kind
    excelRow.getCell(4).value = dollars(line.amountCents)
    excelRow.getCell(4).numFmt = "#,##0.00"
  })
  bank.columns = [{ width: 14 }, { width: 62 }, { width: 14 }, { width: 14 }]

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
