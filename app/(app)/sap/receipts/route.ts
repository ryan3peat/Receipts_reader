import { getActor } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { buildSapWorkbook } from "@/lib/sap-workbook"
import { rowsForEmployeeReceipts } from "@/models/statements"
import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const actor = await getActor()
  if (actor.effectiveRole !== "accounts") return new NextResponse("Forbidden", { status: 403 })
  const employeeId = request.nextUrl.searchParams.get("employeeId") || ""
  const employee = await prisma.user.findUnique({ where: { id: employeeId } })
  if (!employee) return new NextResponse("Choose an employee", { status: 400 })

  const user = await getCurrentUser()
  const rows = await rowsForEmployeeReceipts(user.id, employee.id, employee.employeeCode || "")
  const buffer = await buildSapWorkbook({
    accountName: employee.name,
    accountNumber: employee.cardNumber || "",
    employeeCode: employee.employeeCode || "",
    rows,
    bankLines: [],
  })
  const filename = `FOR SAP ${employee.name || "employee"}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  })
}
