import { documentKindLabel, normalizeDocumentKind } from "@/lib/document-kind"

const TONE: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-800",
  receipt: "bg-slate-100 text-slate-700",
  payment_confirmation: "bg-amber-100 text-amber-800",
  unknown: "bg-muted text-muted-foreground",
}

export function DocumentKindTag({ value }: { value: unknown }) {
  const kind = normalizeDocumentKind(value)
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Document</span>
      <span
        className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
          kind ? TONE[kind] : TONE.unknown
        }`}
      >
        {kind ? documentKindLabel(kind) : "Not detected"}
      </span>
    </div>
  )
}
