import { ADMIN_BRIDGE_COOKIE, USER_VIEW_COOKIE } from "@/lib/access-cookies"
import { auth } from "@/lib/auth"
import config from "@/lib/config"
import { NextRequest, NextResponse } from "next/server"

const AUTH_COOKIE_PREFIX = "taxhacker."

// Signs the person out and returns them to the sign-in page.
export async function POST(request: NextRequest) {
  try {
    // Ends the session in the database, so a copied cookie stops working too.
    await auth.api.signOut({ headers: request.headers })
  } catch (error) {
    console.error("Sign-out could not end the session:", error)
  }

  const response = NextResponse.redirect(new URL(config.auth.loginUrl, request.url), 303)

  // Always clear this browser, even if ending the session failed. That includes the cookie that lets the
  // browser which turned Login on act as the default account: logging out has to mean logged out.
  const names = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => name.includes(AUTH_COOKIE_PREFIX))
  for (const name of [...names, ADMIN_BRIDGE_COOKIE, USER_VIEW_COOKIE]) {
    response.cookies.set(name, "", {
      path: "/",
      // An expiry date, not only a zero max age: Next drops a zero max age when it merges cookies into the response.
      expires: new Date(0),
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-") || process.env.NODE_ENV === "production",
    })
  }

  return response
}
