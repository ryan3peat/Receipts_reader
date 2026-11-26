import { documentKindLabel, normalizeDocumentKind } from "@/lib/document-kind"

const TONE: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-800",
  receipt: "bg-slate-100 text-slate-700",
  payment_confirmation: "bg-amber-100 text-amber-800",
}

export function DocumentKindTag({ value }: { value: unknown }) {
  const kind = normalizeDocumentKind(value)
  if (!kind) return null
  return (
    <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[kind]}`}>
      {documentKindLabel(kind)}
    </span>
  )
}
