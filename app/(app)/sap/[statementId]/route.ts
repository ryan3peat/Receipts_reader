import { getActor } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { buildSapWorkbook } from "@/lib/sap-workbook"
import { rowsForStatement } from "@/models/statements"
import { NextRequest, NextResponse } from "next/server"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ statementId: string }> }) {
  const actor = await getActor()
  if (actor.effectiveRole !== "accounts") return new NextResponse("Forbidden", { status: 403 })
  const user = await getCurrentUser()
  const { statementId } = await params
  const built = await rowsForStatement(statementId, user.id)
  if (!built) return new NextResponse("Not found", { status: 404 })

  const buffer = await buildSapWorkbook({
    accountName: built.statement.accountName || built.statement.employee.name,
    accountNumber: built.statement.accountNumber || built.statement.employee.cardNumber || "",
    employeeCode: built.statement.employee.employeeCode || "",
    rows: built.rows,
    bankLines: built.bankLines,
  })
  const filename = `FOR SAP ${built.statement.employee.name || "employee"}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  })
}
