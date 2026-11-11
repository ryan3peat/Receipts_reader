import { ADMIN_BRIDGE_COOKIE, LOGIN_COOKIE } from "@/lib/access-cookies"
import { default as globalConfig } from "@/lib/config"
import { getSessionCookie } from "better-auth/cookies"
import { NextRequest, NextResponse } from "next/server"

export async function proxy(request: NextRequest) {
  const loginRequired = request.cookies.get(LOGIN_COOKIE)?.value === "1"
  if (!loginRequired && globalConfig.selfHosted.isEnabled) {
    return NextResponse.next()
  }

  const sessionCookie = getSessionCookie(request, { cookiePrefix: "taxhacker" })
  const bridge = request.cookies.get(ADMIN_BRIDGE_COOKIE)?.value
  if (!sessionCookie && !bridge) {
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
  ],
}
