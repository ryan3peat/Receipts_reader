import { analyzeLimiter, analyzeProgress } from "@/lib/analyze-queue"

const MAX_ANALYZE_RETRIES = 8
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type AnalysisResponse = {
  success: boolean
  error?: string | null
  data?: { output?: Record<string, unknown>; tokensUsed?: number } | null
}

const inFlight = new Map<string, Promise<AnalysisResponse>>()

export function requestFileAnalysis(fileId: string): Promise<AnalysisResponse> {
  const existing = inFlight.get(fileId)
  if (existing) return existing

  const request = analyzeOne(fileId).finally(() => {
    inFlight.delete(fileId)
  })
  inFlight.set(fileId, request)
  return request
}

async function analyzeOne(fileId: string): Promise<AnalysisResponse> {
  let attempt = 0
  analyzeProgress.setState(fileId, "queued")
  while (true) {
    const response = await analyzeLimiter.run(async () => {
      analyzeProgress.setState(fileId, "analyzing")
      return fetch("/api/unsorted/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      })
    })
    if (response.status === 429 && attempt < MAX_ANALYZE_RETRIES) {
      analyzeProgress.setState(fileId, "queued")
      analyzeLimiter.reduceMax()
      attempt += 1
      await delay(Math.min(2000 * 2 ** (attempt - 1), 30000))
      continue
    }
    const results = (await response.json()) as AnalysisResponse
    analyzeProgress.setState(fileId, results.success ? "done" : "error")
    return results
  }
}
