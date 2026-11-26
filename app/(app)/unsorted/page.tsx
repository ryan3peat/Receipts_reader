import { FilePreview } from "@/components/files/preview"
import { UploadButton } from "@/components/files/upload-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AnalyzeAllButton } from "@/components/unsorted/analyze-all-button"
import { AnalyzeConcurrencyBadge } from "@/components/unsorted/analyze-concurrency-badge"
import AnalyzeForm from "@/components/unsorted/analyze-form"
import { getActor, listMembers } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getCurrencies } from "@/models/currencies"
import { glFormChoices } from "@/lib/gl-options"
import { getFields } from "@/models/fields"
import { getUnsortedFiles } from "@/models/files"
import { getProjects } from "@/models/projects"
import { getAnalyzeConcurrency, getLLMSettings, getSettings } from "@/models/settings"
import { FileText, PartyPopper, Settings, Upload } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Unsorted",
  description: "Analyze unsorted files",
}

export default async function UnsortedPage({
  searchParams,
}: {
  searchParams: Promise<{ submittedById?: string }>
}) {
  const { submittedById } = await searchParams
  const [user, actor] = await Promise.all([getCurrentUser(), getActor()])
  const isAccounts = actor.effectiveRole === "accounts"
  const employee =
    isAccounts && submittedById ? (await listMembers()).find((member) => member.id === submittedById) : undefined
  const files = await getUnsortedFiles(user.id, employee?.id)
  const { options, picker } = await glFormChoices(actor)
  const categories = options.map((option) => ({ code: option.code, name: option.name, color: option.color }))
  const projects = await getProjects(user.id)
  const currencies = await getCurrencies(user.id)
  const fields = await getFields(user.id)
  const settings = await getSettings(user.id)
  const analyzeConcurrency = getAnalyzeConcurrency(settings)
  const llmReady = getLLMSettings(settings).providers.some((provider) =>
    provider.provider === "openai_compatible" ? Boolean(provider.baseUrl) : Boolean(provider.apiKey)
  )

  return (
    <>
      <header className="flex items-center justify-between">
        {employee ? (
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-bold tracking-tight">
              {files.length} unsorted files from {employee.name || employee.email}
            </h2>
            <Link href="/unsorted" className="text-sm text-muted-foreground underline">
              Show everyone
            </Link>
          </div>
        ) : (
          <h2 className="text-3xl font-bold tracking-tight">You have {files.length} unsorted files</h2>
        )}
        <div className="flex items-center gap-3">
          <AnalyzeConcurrencyBadge />
          {files.length > 1 && <AnalyzeAllButton />}
        </div>
      </header>

      {config.selfHosted.isEnabled && !llmReady && (
          <Alert>
            <Settings className="h-4 w-4 mt-2" />
            <div className="flex flex-row justify-between pt-2">
              <div className="flex flex-col">
                <AlertTitle>LLM provider API Key is required for analyzing files</AlertTitle>
                <AlertDescription>
                  Please set your LLM provider API key in the settings to use the analyze form.
                </AlertDescription>
              </div>
              <Link href="/settings/llm">
                <Button>Go to Settings</Button>
              </Link>
            </div>
          </Alert>
        )}

      <main className="flex flex-col gap-5">
        {files.map((file) => (
          <Card
            key={file.id}
            id={file.id}
            className="flex flex-row flex-wrap md:flex-nowrap justify-center items-start gap-5 p-5 bg-gradient-to-br from-violet-50/80 via-indigo-50/80 to-white border-violet-200/60 rounded-2xl"
          >
            <div className="w-full max-w-[500px]">
              {isAccounts && (
                <p className="mb-2 text-sm text-muted-foreground">
                  Uploaded by{" "}
                  <span className="font-medium text-foreground">
                    {file.submittedBy?.name || file.submittedBy?.email || "Unknown"}
                  </span>
                </p>
              )}
              <Card>
                <FilePreview file={file} />
              </Card>
            </div>

            <div className="w-full">
              <AnalyzeForm
                file={file}
                categories={categories}
                picker={picker}
                projects={projects}
                currencies={currencies}
                fields={fields}
                settings={settings}
                analyzeConcurrency={analyzeConcurrency}
                autoAnalyze={llmReady}
              />
            </div>
          </Card>
        ))}
        {files.length == 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[600px]">
            <PartyPopper className="w-12 h-12 text-muted-foreground" />
            <p className="pt-4 text-muted-foreground">Everything is clear! Congrats!</p>
            <p className="flex flex-row gap-2 text-muted-foreground">
              <span>Drag and drop new files here to analyze</span>
              <Upload />
            </p>

            <div className="flex flex-row gap-5 mt-8">
              <UploadButton>
                <Upload /> Upload New File
              </UploadButton>
              <Button variant="outline" asChild>
                <Link href="/transactions">
                  <FileText />
                  Go to Transactions
                </Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
