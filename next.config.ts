import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    unoptimized: true, // FIXME: bug on prod, images always empty, investigate later
  },
  // mupdf reads its wasm file from disk by its own path, so it must not be bundled.
  serverExternalPackages: ["@prisma/adapter-pg", "exceljs", "mupdf"],
  // Vercel only deploys files it can trace. The wasm file is opened by path, so trace it for every route that renders a PDF.
  outputFileTracingIncludes: {
    "/sap": ["./node_modules/mupdf/dist/mupdf-wasm.wasm"],
    "/sap/**": ["./node_modules/mupdf/dist/mupdf-wasm.wasm"],
    "/api/unsorted/analyze": ["./node_modules/mupdf/dist/mupdf-wasm.wasm"],
    "/files/preview/[fileId]": ["./node_modules/mupdf/dist/mupdf-wasm.wasm"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "256mb",
    },
  },
}

const isSentryEnabled = process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT

export default isSentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: !process.env.CI,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      disableLogger: true,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
    })
  : nextConfig
