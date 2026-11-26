import { describe, expect, it } from "vitest"
import { documentKindLabel, normalizeDocumentKind } from "@/lib/document-kind"

describe("normalizeDocumentKind", () => {
  it("keeps the three document kinds", () => {
    expect(normalizeDocumentKind("invoice")).toBe("invoice")
    expect(normalizeDocumentKind("Receipt")).toBe("receipt")
    expect(normalizeDocumentKind("payment_confirmation")).toBe("payment_confirmation")
    expect(normalizeDocumentKind("Payment confirmation")).toBe("payment_confirmation")
  })

  it("drops anything else", () => {
    expect(normalizeDocumentKind("quote")).toBeNull()
    expect(normalizeDocumentKind("")).toBeNull()
    expect(normalizeDocumentKind(null)).toBeNull()
  })

  it("labels them for the tag", () => {
    expect(documentKindLabel("invoice")).toBe("Invoice")
    expect(documentKindLabel("payment_confirmation")).toBe("Payment confirmation")
  })
})
