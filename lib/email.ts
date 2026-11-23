import { MissingReceiptsEmail } from "@/components/emails/missing-receipts-email"
import { NewsletterWelcomeEmail } from "@/components/emails/newsletter-welcome-email"
import { OTPEmail } from "@/components/emails/otp-email"
import React from "react"
import { Resend } from "resend"
import config from "./config"

export const resend = new Resend(config.email.apiKey)

export async function sendOTPCodeEmail({ email, otp }: { email: string; otp: string }) {
  const html = React.createElement(OTPEmail, { otp })

  return await resend.emails.send({
    from: config.email.from,
    to: email,
    subject: "Your EF Expenses verification code",
    react: html,
  })
}

export function canSendEmail() {
  return Boolean(config.email.apiKey) && !config.email.apiKey.includes("please-set") && !config.email.from.includes("user@localhost")
}

export async function sendMissingReceiptsEmail({
  email,
  name,
  lines,
}: {
  email: string
  name: string
  lines: { when: string; narrative: string; amount: string }[]
}) {
  if (!canSendEmail() || lines.length === 0 || email.endsWith("@localhost")) {
    return { sent: false as const }
  }
  await resend.emails.send({
    from: config.email.from,
    to: email,
    subject: `${lines.length} card transaction${lines.length === 1 ? "" : "s"} missing a receipt`,
    react: React.createElement(MissingReceiptsEmail, { name, lines }),
  })
  return { sent: true as const }
}

export async function sendNewsletterWelcomeEmail(email: string) {
  const html = React.createElement(NewsletterWelcomeEmail)

  return await resend.emails.send({
    from: config.email.from,
    to: email,
    subject: "Welcome to EF Expenses Newsletter!",
    react: html,
  })
}
