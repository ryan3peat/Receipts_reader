export const DOCUMENT_KINDS = ["invoice", "receipt", "payment_confirmation"] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

const LABELS: Record<DocumentKind, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  payment_confirmation: "Payment confirmation",
}

const ALIASES: Record<string, DocumentKind> = {
  invoice: "invoice",
  "tax invoice": "invoice",
  "tax-invoice": "invoice",
  receipt: "receipt",
  "payment confirmation": "payment_confirmation",
  payment_confirmation: "payment_confirmation",
  "payment-confirmation": "payment_confirmation",
  confirmation: "payment_confirmation",
}

export function normalizeDocumentKind(value: unknown): DocumentKind | null {
  if (typeof value !== "string") return null
  const key = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
  return ALIASES[key] ?? ALIASES[key.replace(/ /g, "_")] ?? null
}

export function documentKindLabel(kind: DocumentKind): string {
  return LABELS[kind]
}
