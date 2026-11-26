"use client"

import {
  autoFillFromEfiAction,
  combineFieldsAction,
  createEfiCodeAction,
  createNrCodeAction,
  linkEfiCodeAction,
  renameFieldAction,
  seedFromSheetAction,
  setFieldDepartmentsAction,
  splitFieldAction,
} from "@/app/(app)/settings/categories/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

export type BoardField = {
  id: string
  key: string
  name: string
  combined: boolean
  postCode: string | null
  members: string[]
  departmentIds: string[]
}

export type BoardData = {
  departments: { id: string; code: string; name: string }[]
  fields: BoardField[]
  efi: { id: string; code: string; name: string; departmentId: string; departmentCode: string; nrCode: string | null }[]
  nrCodes: { code: string; name: string }[]
}

type Drag = { ids: string[]; origin: string | null }
type Dialog =
  | { kind: "combine"; ids: string[] }
  | { kind: "rename"; field: BoardField }
  | { kind: "new-nr" }
  | { kind: "new-efi" }
  | null

const TONE = ["border-teal-600", "border-amber-500", "border-violet-600", "border-blue-700", "border-emerald-700", "border-rose-700", "border-yellow-700"]

export function GlCodesBoard({ data, hasDepartments }: { data: BoardData; hasDepartments: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<"board" | "efi">("board")
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "unassigned" | "combined">("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<Drag | null>(null)

  const fieldById = useMemo(() => new Map(data.fields.map((field) => [field.id, field])), [data.fields])
  const nameOf = useMemo(() => new Map(data.nrCodes.map((nr) => [nr.code, nr.name])), [data.nrCodes])
  const efiFor = useMemo(() => {
    const map = new Map<string, BoardData["efi"][number]>()
    for (const efi of data.efi) if (efi.nrCode) map.set(`${efi.nrCode}|${efi.departmentId}`, efi)
    return map
  }, [data.efi])

  function run(work: () => Promise<{ success: boolean; error?: string }>, done?: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await work()
      if (!result.success) setMessage({ kind: "error", text: result.error ?? "Something went wrong" })
      else if (done) setMessage({ kind: "info", text: done })
      router.refresh()
    })
  }

  if (!hasDepartments) {
    return (
      <div className="space-y-4 rounded-md border p-6">
        <h3 className="text-lg font-semibold">Set up departments</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Load the departments, GL codes (NR), EFI codes and cardholder departments from the credit card workbook. This
          only runs once, and only when no departments exist yet.
        </p>
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await seedFromSheetAction()
              if (!result.success) return result
              const s = result.summary
              setMessage({
                kind: "info",
                text: `Loaded ${s.departments} departments, ${s.efiCodes} EFI codes, ${s.glFields} GL codes. ${s.peopleMatched} people assigned.${
                  s.unmatched.length ? ` Not found as users: ${s.unmatched.join(", ")}.` : ""
                }`,
              })
              return { success: true }
            })
          }
        >
          Load from sheet
        </Button>
        {message && <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>{message.text}</p>}
      </div>
    )
  }

  const visible = data.fields
    .filter((field) => {
      if (filter === "unassigned" && field.departmentIds.length > 0) return false
      if (filter === "combined" && !field.combined) return false
      const q = query.trim().toLowerCase()
      if (!q) return true
      return field.name.toLowerCase().includes(q) || field.members.some((member) => member.includes(q))
    })
    .sort((a, b) => (a.combined === b.combined ? a.name.localeCompare(b.name) : a.combined ? -1 : 1))

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCombine(ids: string[]) {
    if (ids.length < 2) return
    setDialog({ kind: "combine", ids })
  }

  function onPoolDrop() {
    if (!drag || drag.origin === null) return
    const origin = drag.origin
    run(() => setFieldDepartmentsAction(drag.ids, [], [origin]), "Removed from department")
    setDrag(null)
  }

  function onLaneDrop(departmentId: string) {
    if (!drag || drag.origin === departmentId) return
    const origin = drag.origin
    run(
      () => setFieldDepartmentsAction(drag.ids, [departmentId], origin ? [origin] : []),
      "Assigned to department"
    )
    setDrag(null)
  }

  function onPoolCardDrop(targetId: string) {
    if (!drag || drag.origin !== null) return
    const ids = [...new Set([...drag.ids, targetId])]
    setDrag(null)
    openCombine(ids)
  }

  function cardTags(field: BoardField, departmentId: string | null) {
    if (departmentId === null) {
      const count = field.departmentIds.length
      return count === 0 ? (
        <Tag tone="warn">Unassigned</Tag>
      ) : (
        <Tag tone="muted">{count} dept{count > 1 ? "s" : ""}</Tag>
      )
    }
    return field.members.map((nr) => {
      const efi = efiFor.get(`${nr}|${departmentId}`)
      return efi ? (
        <Tag key={nr} tone="ok">{efi.code}</Tag>
      ) : (
        <Tag key={nr} tone="bad">No EFI for {nr}</Tag>
      )
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b">
        <TabButton active={tab === "board"} onClick={() => setTab("board")}>
          Department visibility
        </TabButton>
        <TabButton active={tab === "efi"} onClick={() => setTab("efi")}>
          EFI codes
          {data.efi.some((efi) => !efi.nrCode) && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 text-xs text-amber-800">
              {data.efi.filter((efi) => !efi.nrCode).length} unlinked
            </span>
          )}
        </TabButton>
      </div>

      {message && (
        <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>{message.text}</p>
      )}

      {tab === "board" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search GL codes..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-60"
            />
            {(["all", "unassigned", "combined"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full border px-3 py-1 text-xs ${filter === value ? "bg-primary text-primary-foreground" : ""}`}
              >
                {value === "all" ? "All" : value === "unassigned" ? "Unassigned" : "Combined"}
              </button>
            ))}
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">
              Drag a GL code onto a department. Tick two or drop one on another to combine.
            </span>
            <Button variant="outline" disabled={selected.size < 2} onClick={() => openCombine([...selected])}>
              {selected.size >= 2 ? `Combine ${selected.size} selected` : "Combine selected"}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => autoFillFromEfiAction(), "Added departments that already have an EFI code")}
            >
              Auto-fill from EFI
            </Button>
            <Button onClick={() => setDialog({ kind: "new-nr" })}>+ New GL code</Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <div
              className="flex max-h-[70vh] min-h-[320px] flex-col rounded-md border bg-muted/30"
              onDragOver={(event) => {
                if (drag && drag.origin !== null) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                onPoolDrop()
              }}
            >
              <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
                <span>GL codes (NR)</span>
                <span className="text-xs text-muted-foreground">
                  {visible.length} of {data.fields.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {visible.map((field) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() =>
                      setDrag({ ids: selected.has(field.id) ? [...selected] : [field.id], origin: null })
                    }
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(event) => {
                      if (drag && drag.origin === null && !drag.ids.includes(field.id)) event.preventDefault()
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onPoolCardDrop(field.id)
                    }}
                    className="rounded-md border bg-background p-2 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(field.id)}
                        onChange={() => toggleSelected(field.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-snug">
                          {!field.combined && <span className="mr-1 font-mono text-xs">{field.key}</span>}
                          {field.name}
                          {field.combined && <Tag tone="muted">combined</Tag>}
                        </div>
                        {field.combined && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {field.members.map((nr) => (
                              <span key={nr} className="rounded bg-muted px-1 font-mono text-xs">
                                {nr}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">{cardTags(field, null)}</div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setDialog({ kind: "rename", field })}
                          title={field.combined ? "Rename or change post code" : "Rename"}
                        >
                          ✎
                        </button>
                        {field.combined && (
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground"
                            title="Split back into the individual GL codes"
                            onClick={() => run(() => splitFieldAction(field.id), "Split back into GL codes")}
                          >
                            split
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {visible.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No GL codes match</p>}
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2">
              {data.departments.map((department, index) => {
                const members = data.fields.filter((field) => field.departmentIds.includes(department.id))
                const gaps = members.filter((field) => field.members.some((nr) => !efiFor.has(`${nr}|${department.id}`)))
                return (
                  <div
                    key={department.id}
                    onDragOver={(event) => {
                      if (drag && drag.origin !== department.id) event.preventDefault()
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      onLaneDrop(department.id)
                    }}
                    className={`flex max-h-[70vh] min-h-[320px] w-56 shrink-0 flex-col rounded-md border border-t-4 bg-background ${TONE[index % TONE.length]}`}
                  >
                    <div className="border-b px-3 py-2">
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>
                          {department.code} {department.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{members.length}</span>
                      </div>
                      {gaps.length > 0 && <p className="text-xs text-amber-700">{gaps.length} without EFI code</p>}
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto p-2">
                      {members.map((field) => (
                        <div
                          key={field.id}
                          draggable
                          onDragStart={() => setDrag({ ids: [field.id], origin: department.id })}
                          onDragEnd={() => setDrag(null)}
                          className="rounded-md border bg-muted/30 p-2 text-sm"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-medium leading-snug">{field.name}</span>
                            <button
                              className="text-muted-foreground hover:text-red-600"
                              title="Remove from this department"
                              onClick={() =>
                                run(() => setFieldDepartmentsAction([field.id], [], [department.id]), "Removed")
                              }
                            >
                              ×
                            </button>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">{cardTags(field, department.id)}</div>
                        </div>
                      ))}
                      {members.length === 0 && (
                        <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                          Drop GL codes here. Cardholders in this department only see these.
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
              {data.departments.length === 0 && <p className="text-sm text-muted-foreground">No departments yet.</p>}
            </div>
          </div>
        </>
      )}

      {tab === "efi" && <EfiTable data={data} nameOf={nameOf} onAdd={() => setDialog({ kind: "new-efi" })} onLink={(id, nr) => run(() => linkEfiCodeAction(id, nr))} />}

      {dialog?.kind === "combine" && (
        <CombineDialog
          fields={dialog.ids.map((id) => fieldById.get(id)).filter((field): field is BoardField => !!field)}
          nameOf={nameOf}
          onClose={() => setDialog(null)}
          onSave={(name, postCode) => {
            setDialog(null)
            setSelected(new Set())
            run(() => combineFieldsAction(dialog.ids, name, postCode), `Combined into "${name}"`)
          }}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameDialog
          field={dialog.field}
          onClose={() => setDialog(null)}
          onSave={(name, postCode) => {
            const id = dialog.field.id
            setDialog(null)
            run(() => renameFieldAction(id, name, postCode))
          }}
        />
      )}
      {dialog?.kind === "new-nr" && (
        <NewNrDialog
          onClose={() => setDialog(null)}
          onSave={(code, name) => {
            setDialog(null)
            run(() => createNrCodeAction(code, name), `Created ${code}. Drag it onto departments to show it.`)
          }}
        />
      )}
      {dialog?.kind === "new-efi" && (
        <NewEfiDialog
          departments={data.departments}
          nrCodes={data.nrCodes}
          onClose={() => setDialog(null)}
          onSave={(input) => {
            setDialog(null)
            run(() => createEfiCodeAction(input), `Created ${input.code}`)
          }}
        />
      )}
    </div>
  )
}

function Tag({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const styles = {
    ok: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-800",
    bad: "bg-red-100 text-red-800",
    muted: "bg-muted text-muted-foreground",
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${styles[tone]}`}>{children}</span>
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-foreground" : "border-transparent text-muted-foreground"}`}
    >
      {children}
    </button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={onClose}>
      <div className="w-[460px] max-w-[92vw] rounded-xl bg-background p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function CombineDialog({
  fields,
  nameOf,
  onClose,
  onSave,
}: {
  fields: BoardField[]
  nameOf: Map<string, string>
  onClose: () => void
  onSave: (name: string, postCode: string | null) => void
}) {
  const codes = [...new Set(fields.flatMap((field) => field.members))]
  const [name, setName] = useState(fields.length === 1 ? fields[0].name : "")
  const [post, setPost] = useState("")
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title="Combine GL codes" onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">
        Cardholders see one field. Each code keeps its own EFI codes per department.
      </p>
      <div className="mb-3 flex flex-wrap gap-1">
        {codes.map((code) => (
          <span key={code} className="rounded bg-muted px-1 font-mono text-xs">
            {code} {nameOf.get(code)}
          </span>
        ))}
      </div>
      <label className="text-sm font-medium">Name shown to cardholders</label>
      <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Meals & Entertainment" />
      <label className="mt-3 block text-sm font-medium">When exported to SAP</label>
      <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={post} onChange={(event) => setPost(event.target.value)}>
        <option value="">Accounts choose the exact code at review</option>
        {codes.map((code) => (
          <option key={code} value={code}>
            Always post to {code} {nameOf.get(code)}
          </option>
        ))}
      </select>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!name.trim()) return setError("Enter a name")
            onSave(name.trim(), post || null)
          }}
        >
          Combine
        </Button>
      </div>
    </Modal>
  )
}

function RenameDialog({
  field,
  onClose,
  onSave,
}: {
  field: BoardField
  onClose: () => void
  onSave: (name: string, postCode: string | null) => void
}) {
  const [name, setName] = useState(field.name)
  const [post, setPost] = useState(field.postCode ?? "")
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title={field.combined ? "Edit combined field" : "Rename GL code"} onClose={onClose}>
      <label className="text-sm font-medium">Name shown to cardholders</label>
      <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
      {field.combined && (
        <>
          <label className="mt-3 block text-sm font-medium">When exported to SAP</label>
          <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={post} onChange={(event) => setPost(event.target.value)}>
            <option value="">Accounts choose the exact code at review</option>
            {field.members.map((code) => (
              <option key={code} value={code}>
                Always post to {code}
              </option>
            ))}
          </select>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!name.trim()) return setError("Enter a name")
            onSave(name.trim(), field.combined ? post || null : null)
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  )
}

function NewNrDialog({ onClose, onSave }: { onClose: () => void; onSave: (code: string, name: string) => void }) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  return (
    <Modal title="New GL code (NR)" onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">
        The simple code cardholders pick. It is hidden until you drag it onto a department. Then add its EFI codes on the EFI
        codes tab.
      </p>
      <label className="text-sm font-medium">Code</label>
      <Input className="mt-1" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. 2230" />
      <label className="mt-3 block text-sm font-medium">Name</label>
      <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Trade Shows" />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(code, name)}>Create</Button>
      </div>
    </Modal>
  )
}

function NewEfiDialog({
  departments,
  nrCodes,
  onClose,
  onSave,
}: {
  departments: BoardData["departments"]
  nrCodes: BoardData["nrCodes"]
  onClose: () => void
  onSave: (input: { code: string; name: string; departmentId: string; nrCode: string | null }) => void
}) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "")
  const [nrCode, setNrCode] = useState("")
  return (
    <Modal title="New EFI code" onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">The specific account SAP posts to. Link it to the GL code cardholders choose.</p>
      <label className="text-sm font-medium">Link to GL code (NR)</label>
      <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={nrCode} onChange={(event) => setNrCode(event.target.value)}>
        <option value="">Not linked yet</option>
        {nrCodes.map((nr) => (
          <option key={nr.code} value={nr.code}>
            {nr.code} {nr.name}
          </option>
        ))}
      </select>
      <label className="mt-3 block text-sm font-medium">Department</label>
      <select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.code} {department.name}
          </option>
        ))}
      </select>
      <label className="mt-3 block text-sm font-medium">EFI code</label>
      <Input className="mt-1 font-mono" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. 2230-04" />
      <label className="mt-3 block text-sm font-medium">Account name</label>
      <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Trade Shows - Sales (SM)" />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave({ code, name, departmentId, nrCode: nrCode || null })}>Create EFI code</Button>
      </div>
    </Modal>
  )
}

function EfiTable({
  data,
  nameOf,
  onAdd,
  onLink,
}: {
  data: BoardData
  nameOf: Map<string, string>
  onAdd: () => void
  onLink: (efiId: string, nrCode: string | null) => void
}) {
  const [query, setQuery] = useState("")
  const [department, setDepartment] = useState("")
  const [unlinkedOnly, setUnlinkedOnly] = useState(false)
  const unlinked = data.efi.filter((efi) => !efi.nrCode).length
  const rows = data.efi.filter((efi) => {
    if (department && efi.departmentId !== department) return false
    if (unlinkedOnly && efi.nrCode) return false
    const q = query.trim().toLowerCase()
    return !q || efi.code.toLowerCase().includes(q) || efi.name.toLowerCase().includes(q)
  })
  return (
    <div className="space-y-4">
      {unlinked > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {unlinked} EFI codes are not linked to a GL code (NR). Cardholders cannot pick them until they are linked. Each GL
          code can have one EFI code per department.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search EFI code or name..." value={query} onChange={(event) => setQuery(event.target.value)} className="w-64" />
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={department} onChange={(event) => setDepartment(event.target.value)}>
          <option value="">All departments</option>
          {data.departments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} {item.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setUnlinkedOnly((value) => !value)}
          className={`rounded-full border px-3 py-1 text-xs ${unlinkedOnly ? "bg-primary text-primary-foreground" : ""}`}
        >
          Unlinked only
        </button>
        <span className="flex-1" />
        <Button onClick={onAdd}>+ New EFI code</Button>
      </div>
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">EFI code</th>
              <th className="px-3 py-2 font-medium">Account name</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Linked GL code (NR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((efi) => (
              <tr key={efi.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{efi.code}</td>
                <td className="px-3 py-2">{efi.name}</td>
                <td className="px-3 py-2">
                  {efi.departmentCode} {data.departments.find((item) => item.id === efi.departmentId)?.name}
                </td>
                <td className="px-3 py-2">
                  <select
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                    value={efi.nrCode ?? ""}
                    onChange={(event) => onLink(efi.id, event.target.value || null)}
                  >
                    <option value="">Not linked</option>
                    {data.nrCodes.map((nr) => (
                      <option key={nr.code} value={nr.code}>
                        {nr.code} {nameOf.get(nr.code) ?? nr.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No EFI codes match
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
