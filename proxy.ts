import { LOGIN_COOKIE } from "@/lib/access-cookies"
import { default as globalConfig } from "@/lib/config"
import { getSessionCookie } from "better-auth/cookies"
import { NextRequest, NextResponse } from "next/server"

export async function proxy(request: NextRequest) {
  // Same rule as isLoginRequired: sign-in is always required once Microsoft sign-in is set up.
  const loginRequired = globalConfig.auth.microsoft !== null || request.cookies.get(LOGIN_COOKIE)?.value === "1"
  if (!loginRequired && globalConfig.selfHosted.isEnabled) {
    return NextResponse.next()
  }

  const sessionCookie = getSessionCookie(request, { cookiePrefix: "taxhacker" })
  if (!sessionCookie) {
    return NextResponse.redirect(new URL(globalConfig.auth.loginUrl, request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/transactions/:path*",
    "/settings/:path*",
    "/export/:path*",
    "/import/:path*",
    "/unsorted/:path*",
    "/files/:path*",
    "/dashboard/:path*",
    "/employees/:path*",
  ],
}
