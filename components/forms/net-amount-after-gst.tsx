"use client"

import { netAmountAfterGstCents } from "@/lib/sap"
import { FormInput } from "@/components/forms/simple"

/** Read-only total minus GST, matching the SAP export "Amount after GST" column. */
export function NetAmountAfterGst({
  total,
  vat,
  vatRate,
}: {
  total: number | string | null | undefined
  vat?: number | string | null | undefined
  vatRate?: number | string | null | undefined
}) {
  const totalCents = Math.round((Number(total) || 0) * 100)
  const net = (
    netAmountAfterGstCents(totalCents, {
      vat: vat == null || vat === "" ? undefined : String(vat),
      vat_rate: vatRate == null || vatRate === "" ? undefined : String(vatRate),
    }) / 100
  ).toFixed(2)

  return (
    <FormInput
      title="Net Amount after GST"
      type="number"
      step="0.01"
      value={net}
      readOnly
      tabIndex={-1}
      className="w-32 bg-muted"
    />
  )
}
