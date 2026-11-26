import { prisma } from "@/lib/db"
import type { GlFieldRule } from "@/lib/gl-resolve"
import { randomHexColor } from "@/lib/utils"
import { ESSENTIAL_CATEGORIES } from "@/models/gl-codes"
import { SEED_DEPARTMENTS, SEED_EFI_CODES, SEED_NR_CODES, SEED_PEOPLE } from "@/models/gl-department-seed"
import { Prisma } from "@/prisma/client"

export type GlFieldRow = GlFieldRule & { id: string; departmentIds: string[]; sortOrder: number }

export type DepartmentRow = { id: string; code: string; name: string }

export type PersonDepartment = DepartmentRow & { isDefault: boolean }

export async function listDepartments(companyId: string): Promise<DepartmentRow[]> {
  return prisma.department.findMany({
    where: { userId: companyId },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  })
}

export async function listGlFieldRows(companyId: string): Promise<GlFieldRow[]> {
  const rows = await prisma.glField.findMany({
    where: { userId: companyId },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    include: {
      members: { select: { nrCode: true }, orderBy: { nrCode: "asc" } },
      departments: { select: { department: { select: { id: true, code: true } } } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    combined: row.combined,
    postCode: row.postCode,
    sortOrder: row.sortOrder,
    members: row.members.map((member) => member.nrCode),
    departments: row.departments.map((link) => link.department.code),
    departmentIds: row.departments.map((link) => link.department.id),
  }))
}

export async function getGlBoardData(companyId: string) {
  const [departments, fields, efi, nrCodes] = await Promise.all([
    listDepartments(companyId),
    listGlFieldRows(companyId),
    prisma.efiCode.findMany({
      where: { userId: companyId },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        departmentId: true,
        nrCode: true,
        department: { select: { code: true } },
      },
    }),
    prisma.category.findMany({
      where: { userId: companyId },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
  ])
  return {
    departments,
    fields,
    efi: efi.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      departmentId: row.departmentId,
      departmentCode: row.department.code,
      nrCode: row.nrCode,
    })),
    nrCodes,
  }
}

export async function personDepartments(companyId: string, personId: string): Promise<PersonDepartment[]> {
  const rows = await prisma.userDepartment.findMany({
    where: { userId: personId, department: { userId: companyId } },
    select: { isDefault: true, department: { select: { id: true, code: true, name: true } } },
  })
  return rows
    .map((row) => ({ ...row.department, isDefault: row.isDefault }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

/** Every person's departments, for the People page. */
export async function departmentsByPerson(companyId: string) {
  const rows = await prisma.userDepartment.findMany({
    where: { department: { userId: companyId } },
    select: { userId: true, isDefault: true, department: { select: { id: true, code: true, name: true } } },
  })
  const byPerson = new Map<string, PersonDepartment[]>()
  for (const row of rows) {
    const list = byPerson.get(row.userId) ?? []
    list.push({ ...row.department, isDefault: row.isDefault })
    byPerson.set(row.userId, list)
  }
  for (const list of byPerson.values()) list.sort((a, b) => a.code.localeCompare(b.code))
  return byPerson
}

/** GL choices a cardholder can pick: those shown to at least one of their departments. */
export async function personGlFields(companyId: string, personId: string): Promise<GlFieldRule[]> {
  const mine = await personDepartments(companyId, personId)
  if (mine.length === 0) return []
  const codes = mine.map((department) => department.code)
  const rules = await listGlFieldRows(companyId)
  return rules
    .filter((rule) => codes.some((code) => rule.departments.includes(code)))
    .map(({ id: _id, departmentIds: _ids, sortOrder: _order, ...rule }) => rule)
}

// ---------- Department assignments for people ----------

export async function setPersonDepartments(companyId: string, personId: string, codes: string[], defaultCode: string) {
  const departments = await listDepartments(companyId)
  const wanted = departments.filter((department) => codes.includes(department.code))
  const defaultId = wanted.find((department) => department.code === defaultCode)?.id ?? wanted[0]?.id
  const allIds = departments.map((department) => department.id)

  await prisma.$transaction([
    prisma.userDepartment.deleteMany({ where: { userId: personId, departmentId: { in: allIds } } }),
    prisma.userDepartment.createMany({
      data: wanted.map((department) => ({
        userId: personId,
        departmentId: department.id,
        isDefault: department.id === defaultId,
      })),
    }),
  ])
}

// ---------- GL fields ----------

export async function setFieldDepartments(companyId: string, fieldIds: string[], addIds: string[], removeIds: string[]) {
  const [fields, departments] = await Promise.all([
    prisma.glField.findMany({ where: { userId: companyId, id: { in: fieldIds } }, select: { id: true } }),
    listDepartments(companyId),
  ])
  const ownFieldIds = fields.map((field) => field.id)
  const ownDepartmentIds = new Set(departments.map((department) => department.id))
  const adds = addIds.filter((id) => ownDepartmentIds.has(id))
  const removes = removeIds.filter((id) => ownDepartmentIds.has(id))

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.glFieldDepartment.deleteMany({
      where: { fieldId: { in: ownFieldIds }, departmentId: { in: removes } },
    }),
  ]
  if (adds.length > 0) {
    operations.push(
      prisma.glFieldDepartment.createMany({
        data: ownFieldIds.flatMap((fieldId) => adds.map((departmentId) => ({ fieldId, departmentId }))),
        skipDuplicates: true,
      })
    )
  }
  await prisma.$transaction(operations)
}

export async function renameField(companyId: string, fieldId: string, name: string) {
  const field = await prisma.glField.findFirst({
    where: { id: fieldId, userId: companyId },
    include: { members: { select: { nrCode: true } } },
  })
  if (!field) throw new Error("Not found")

  await prisma.$transaction(async (tx) => {
    await tx.glField.update({ where: { id: fieldId }, data: { name } })
    // Single NR fields share their name with the category cardholders pick in forms.
    if (!field.combined && field.members.length === 1) {
      await tx.category.updateMany({
        where: { userId: companyId, code: field.members[0].nrCode },
        data: { name },
      })
    }
  })
  return { combined: field.combined }
}

export async function setCombinedPostCode(companyId: string, fieldId: string, postCode: string | null) {
  const field = await prisma.glField.findFirst({
    where: { id: fieldId, userId: companyId },
    include: { members: { select: { nrCode: true } } },
  })
  if (!field || !field.combined) throw new Error("Only combined fields have a post code")
  if (postCode && !field.members.some((member) => member.nrCode === postCode)) {
    throw new Error("The post code must be one of the combined codes")
  }
  await prisma.glField.update({ where: { id: fieldId }, data: { postCode } })
}

export async function combineFields(companyId: string, fieldIds: string[], name: string, postCode: string | null) {
  const rows = (await listGlFieldRows(companyId)).filter((row) => fieldIds.includes(row.id))
  if (rows.length < 2) throw new Error("Choose at least two GL codes to combine")
  const members = [...new Set(rows.flatMap((row) => row.members))]
  if (postCode && !members.includes(postCode)) throw new Error("The post code must be one of the combined codes")
  const departmentIds = [...new Set(rows.flatMap((row) => row.departmentIds))]
  const sortOrder = Math.min(...rows.map((row) => row.sortOrder ?? 0))

  await prisma.$transaction(async (tx) => {
    await tx.glField.deleteMany({ where: { userId: companyId, id: { in: rows.map((row) => row.id) } } })
    const created = await tx.glField.create({
      data: {
        userId: companyId,
        key: `combo-${crypto.randomUUID().slice(0, 8)}`,
        name,
        combined: true,
        postCode,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      },
    })
    await tx.glFieldMember.createMany({ data: members.map((nrCode) => ({ fieldId: created.id, nrCode })) })
    if (departmentIds.length > 0) {
      await tx.glFieldDepartment.createMany({
        data: departmentIds.map((departmentId) => ({ fieldId: created.id, departmentId })),
      })
    }
  })
}

/** Puts a combined field back into one field per NR code, keeping its department visibility. */
export async function splitCombinedField(companyId: string, fieldId: string) {
  const rows = await listGlFieldRows(companyId)
  const combined = rows.find((row) => row.id === fieldId)
  if (!combined || !combined.combined) throw new Error("Only combined fields can be split")
  const categories = await prisma.category.findMany({
    where: { userId: companyId, code: { in: combined.members } },
    select: { code: true, name: true },
  })
  const nameOf = new Map(categories.map((category) => [category.code, category.name]))

  await prisma.$transaction(async (tx) => {
    await tx.glField.delete({ where: { id: fieldId } })
    for (const [index, nrCode] of combined.members.entries()) {
      const field = await tx.glField.upsert({
        where: { userId_key: { userId: companyId, key: nrCode } },
        update: { name: nameOf.get(nrCode) ?? nrCode, combined: false, postCode: null },
        create: {
          userId: companyId,
          key: nrCode,
          name: nameOf.get(nrCode) ?? nrCode,
          sortOrder: index,
        },
      })
      await tx.glFieldMember.createMany({ data: [{ fieldId: field.id, nrCode }], skipDuplicates: true })
      if (combined.departmentIds.length > 0) {
        await tx.glFieldDepartment.createMany({
          data: combined.departmentIds.map((departmentId) => ({ fieldId: field.id, departmentId })),
          skipDuplicates: true,
        })
      }
    }
  })
}

/** Creates a GL (NR) code. It is not shown to anyone until it is added to a department. */
export async function createNrCode(companyId: string, code: string, name: string) {
  const existingField = await prisma.glField.findFirst({ where: { userId: companyId, key: code } })
  if (existingField) throw new Error(`GL code ${code} is already on the board`)
  const category = await prisma.category.findFirst({ where: { userId: companyId, code } })

  await prisma.$transaction(async (tx) => {
    if (!category) {
      await tx.category.create({
        data: { userId: companyId, code, name, color: randomHexColor(), llm_prompt: name },
      })
    }
    const field = await tx.glField.create({ data: { userId: companyId, key: code, name: category?.name ?? name } })
    await tx.glFieldMember.create({ data: { fieldId: field.id, nrCode: code } })
  })
}

/** Adds every department that has an EFI code for a field's GL code. Existing choices are kept. */
export async function autoFillFromEfi(companyId: string) {
  const [rows, efi] = await Promise.all([
    listGlFieldRows(companyId),
    prisma.efiCode.findMany({ where: { userId: companyId }, select: { nrCode: true, departmentId: true } }),
  ])
  const data: { fieldId: string; departmentId: string }[] = []
  for (const row of rows) {
    const wanted = new Set(efi.filter((code) => code.nrCode && row.members.includes(code.nrCode)).map((code) => code.departmentId))
    for (const departmentId of wanted) {
      if (!row.departmentIds.includes(departmentId)) data.push({ fieldId: row.id, departmentId })
    }
  }
  if (data.length > 0) {
    await prisma.glFieldDepartment.createMany({ data, skipDuplicates: true })
  }
  return data.length
}

// ---------- EFI codes ----------

export async function linkEfiCode(companyId: string, efiId: string, nrCode: string | null) {
  const efi = await prisma.efiCode.findFirst({ where: { id: efiId, userId: companyId } })
  if (!efi) throw new Error("Not found")
  if (nrCode) {
    const clash = await prisma.efiCode.findFirst({
      where: { userId: companyId, nrCode, departmentId: efi.departmentId, NOT: { id: efiId } },
    })
    if (clash) throw new Error(`${clash.code} already covers ${nrCode} for this department`)
  }
  await prisma.efiCode.update({ where: { id: efiId }, data: { nrCode } })
}

export async function createEfiCode(
  companyId: string,
  input: { code: string; name: string; departmentId: string; nrCode: string | null }
) {
  const department = await prisma.department.findFirst({ where: { id: input.departmentId, userId: companyId } })
  if (!department) throw new Error("Choose a department")
  if (input.nrCode) {
    const clash = await prisma.efiCode.findFirst({
      where: { userId: companyId, nrCode: input.nrCode, departmentId: input.departmentId },
    })
    if (clash) throw new Error(`${clash.code} already covers ${input.nrCode} for this department`)
  }
  try {
    await prisma.efiCode.create({
      data: { userId: companyId, code: input.code, name: input.name, departmentId: input.departmentId, nrCode: input.nrCode },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error(`EFI code ${input.code} already exists`)
    }
    throw error
  }
}

// ---------- One-time load from the spreadsheet ----------

export async function seedFromSheet(companyId: string) {
  const existing = await prisma.department.count({ where: { userId: companyId } })
  if (existing > 0) throw new Error("Departments are already set up")

  const unmatched: string[] = []
  let matchedPeople = 0

  await prisma.$transaction(
    async (tx) => {
      await tx.department.createMany({
        data: SEED_DEPARTMENTS.map((department) => ({ userId: companyId, code: department.code, name: department.name })),
      })
      const departments = await tx.department.findMany({ where: { userId: companyId }, select: { id: true, code: true } })
      const departmentId = new Map(departments.map((department) => [department.code, department.id]))

      const existingCodes = new Set(
        (await tx.category.findMany({ where: { userId: companyId }, select: { code: true } })).map((row) => row.code)
      )
      const missing = SEED_NR_CODES.filter((nr) => !existingCodes.has(nr.code)).map((nr) => {
        const essential = ESSENTIAL_CATEGORIES.find((category) => category.code === nr.code)
        return {
          userId: companyId,
          code: nr.code,
          name: essential?.name ?? nr.name,
          color: essential?.color ?? randomHexColor(),
          llm_prompt: essential?.llm_prompt ?? nr.name,
        }
      })
      if (missing.length > 0) await tx.category.createMany({ data: missing })

      await tx.efiCode.createMany({
        data: SEED_EFI_CODES.map((efi) => ({
          userId: companyId,
          code: efi.code,
          name: efi.name,
          departmentId: departmentId.get(efi.department) as string,
          nrCode: efi.nr,
        })),
      })

      for (const [index, nr] of SEED_NR_CODES.entries()) {
        const departmentIds = [
          ...new Set(
            SEED_EFI_CODES.filter((efi) => efi.nr === nr.code).map((efi) => departmentId.get(efi.department) as string)
          ),
        ]
        const field = await tx.glField.create({
          data: { userId: companyId, key: nr.code, name: nr.name, sortOrder: index },
        })
        await tx.glFieldMember.create({ data: { fieldId: field.id, nrCode: nr.code } })
        if (departmentIds.length > 0) {
          await tx.glFieldDepartment.createMany({ data: departmentIds.map((id) => ({ fieldId: field.id, departmentId: id })) })
        }
      }

      for (const person of SEED_PEOPLE) {
        const user = await tx.user.findFirst({ where: { employeeCode: person.employeeCode }, select: { id: true } })
        if (!user) {
          unmatched.push(`${person.name} (${person.employeeCode})`)
          continue
        }
        matchedPeople += 1
        await tx.userDepartment.createMany({
          data: person.departments.map((code, index) => ({
            userId: user.id,
            departmentId: departmentId.get(code) as string,
            isDefault: index === 0,
          })),
          skipDuplicates: true,
        })
      }
    },
    { timeout: 60_000 }
  )

  return {
    departments: SEED_DEPARTMENTS.length,
    efiCodes: SEED_EFI_CODES.length,
    glFields: SEED_NR_CODES.length,
    peopleMatched: matchedPeople,
    unmatched,
  }
}
