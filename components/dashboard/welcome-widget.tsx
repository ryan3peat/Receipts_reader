import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { ColoredText } from "@/components/ui/colored-text"
import { getActor } from "@/lib/access"

export async function WelcomeWidget() {
  const actor = await getActor()
  const accounts = actor.effectiveRole === "accounts"

  return (
    <Card className="w-full p-6">
      <div className="flex flex-col">
        <CardTitle className="text-2xl font-bold">
          <ColoredText>Hey, I&apos;m EF Expenses 👋</ColoredText>
        </CardTitle>
        <CardDescription className="mt-5">
          <p className="mb-3">
            I&apos;m a little expense app that helps you deal with endless receipts, checks and invoices with (you
            guessed it) AI. Here&apos;s what I can do:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Upload me a photo or a PDF</strong> and I will recognize, categorize and save it as a transaction
              for Essential
            </li>
            {accounts && <li>Let you sort and manage each employee&apos;s expense uploads and import into SAP</li>}
          </ul>
        </CardDescription>
      </div>
    </Card>
  )
}
