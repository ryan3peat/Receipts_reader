import { describe, expect, it } from "vitest"
import { limitReceiptFiles, uploadPhaseLabel } from "./upload-progress"

describe("limitReceiptFiles", () => {
  it("accepts a batch of 10", () => {
    const files = Array.from({ length: 10 }, (_, index) => index)
    expect(limitReceiptFiles(files)).toEqual({ accepted: files, dropped: 0 })
  })

  it("keeps the first 10 when more are selected", () => {
    const files = Array.from({ length: 12 }, (_, index) => index)
    const result = limitReceiptFiles(files)
    expect(result.accepted).toEqual(files.slice(0, 10))
    expect(result.dropped).toBe(2)
  })

  it("leaves room for receipts already held in a camera session", () => {
    const result = limitReceiptFiles(["a", "b", "c"], 9)
    expect(result).toEqual({ accepted: ["a"], dropped: 2 })
  })
})

describe("uploadPhaseLabel", () => {
  it("counts the file currently uploading when several were selected", () => {
    expect(uploadPhaseLabel("uploading", { current: 2, total: 5 })).toBe("Uploading 2/5")
  })

  it("stays generic for a single file", () => {
    expect(uploadPhaseLabel("uploading", { current: 1, total: 1 })).toBe("Uploading...")
  })

  it("labels analysis separately from upload", () => {
    expect(uploadPhaseLabel("analysing")).toBe("Analysing...won't be long")
  })
})
