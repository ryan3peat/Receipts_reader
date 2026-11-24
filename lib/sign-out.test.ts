import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: mocks.signOut } } }))
vi.mock("@/lib/config", () => ({ default: { auth: { loginUrl: "/enter" } } }))

import { POST } from "@/app/(auth)/sign-out/route"
import { ADMIN_BRIDGE_COOKIE, USER_VIEW_COOKIE } from "@/lib/access-cookies"
import { NextRequest } from "next/server"

function request(cookie: string) {
  return new NextRequest("https://app.ef.test/sign-out", { method: "POST", headers: cookie ? { cookie } : {} })
}

// Names of the cookies the response tells the browser to drop.
function cleared(response: Response) {
  return response.headers
    .getSetCookie()
    .filter((line) => /Expires=Thu, 01 Jan 1970/i.test(line))
    .map((line) => line.split("=")[0])
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.signOut.mockResolvedValue({ success: true })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /sign-out", () => {
  it("ends the session and sends the person to the sign-in page", async () => {
    const response = await POST(request("taxhacker.session_token=abc"))

    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(mocks.signOut.mock.calls[0][0].headers.get("cookie")).toBe("taxhacker.session_token=abc")
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://app.ef.test/enter")
  })

  it("clears every sign-in cookie the browser sent, and leaves unrelated cookies alone", async () => {
    const response = await POST(
      request("__Secure-taxhacker.session_token=abc; __Secure-taxhacker.session_data=def; theme=dark")
    )

    expect(cleared(response)).toEqual(
      expect.arrayContaining(["__Secure-taxhacker.session_token", "__Secure-taxhacker.session_data"])
    )
    expect(cleared(response)).not.toContain("theme")
  })

  it("marks secure cookies as secure, otherwise the browser would ignore the removal", async () => {
    const response = await POST(request("__Secure-taxhacker.session_token=abc"))

    const line = response.headers.getSetCookie().find((cookie) => cookie.startsWith("__Secure-taxhacker.session_token="))
    expect(line).toMatch(/Secure/i)
  })

  it("also removes the default-account access and User View from this browser", async () => {
    const response = await POST(request(`${ADMIN_BRIDGE_COOKIE}=company; ${USER_VIEW_COOKIE}=1`))

    expect(cleared(response)).toEqual(expect.arrayContaining([ADMIN_BRIDGE_COOKIE, USER_VIEW_COOKIE]))
  })

  it("still clears the browser when ending the session fails", async () => {
    mocks.signOut.mockRejectedValue(new Error("database is down"))

    const response = await POST(request("taxhacker.session_token=abc"))

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://app.ef.test/enter")
    expect(cleared(response)).toEqual(expect.arrayContaining(["taxhacker.session_token", ADMIN_BRIDGE_COOKIE]))
  })

  it("works for a browser that is not signed in", async () => {
    const response = await POST(request(""))

    expect(response.status).toBe(303)
    expect(cleared(response)).toEqual(expect.arrayContaining([ADMIN_BRIDGE_COOKIE, USER_VIEW_COOKIE]))
  })
})
