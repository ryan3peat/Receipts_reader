import React from "react"
import { EmailLayout } from "./email-layout"

export const MissingReceiptsEmail: React.FC<{
  name: string
  lines: { when: string; narrative: string; amount: string }[]
}> = ({ name, lines }) => (
  <EmailLayout preview={`${lines.length} card transactions are missing receipts`}>
    <h2 style={{ color: "#1e293b" }}>Receipts missing</h2>
    <p>Hi {name},</p>
    <p>These transactions are on your credit card statement and do not have a receipt in EF Expenses yet:</p>
    <ul>
      {lines.map((line) => (
        <li key={`${line.when}-${line.narrative}-${line.amount}`}>
          {line.when}: {line.narrative} ({line.amount})
        </li>
      ))}
    </ul>
    <p>Upload the receipt for each one so accounts can finish the FOR SAP sheet.</p>
  </EmailLayout>
)
