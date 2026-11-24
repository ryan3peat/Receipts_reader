import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { getMasterAdminEmail, isMasterAdminEmail, isValidMasterAdminEmail } from "@/lib/master-admin"

// The claims Microsoft sends about the person signing in.
export type MicrosoftProfile = { email?: unknown; name?: unknown; tid?: unknown }

const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The company's email domain is the Master Admin's, so there is nothing extra to configure.
export function getCompanyEmailDomain(): string | null {
  const master = getMasterAdminEmail()
  if (!master || !isValidMasterAdminEmail(master)) return null
  return master.slice(master.lastIndexOf("@") + 1)
}

// Returns the email to enrol, or null when this person must be added on the People page instead.
export function emailToEnrol(profile: MicrosoftProfile): string | null {
  const domain = getCompanyEmailDomain()
  const tenantId = config.auth.microsoft?.tenantId
  if (!domain || !tenantId) return null

  // Only when sign-in is tied to the company's own Microsoft tenant, and the person belongs to it.
  // With a shared endpoint such as "common", any Microsoft customer could present a matching address.
  if (!TENANT_ID.test(tenantId)) return null
  if (typeof profile.tid !== "string" || profile.tid.toLowerCase() !== tenantId.toLowerCase()) return null

  if (typeof profile.email !== "string") return null
  const email = profile.email.trim().toLowerCase()
  if (!isValidMasterAdminEmail(email)) return null

  // Guests invited into the tenant keep their outside address, so they are not enrolled.
  if (email.slice(email.lastIndexOf("@") + 1) !== domain) return null
  return email
}

// Creates the account for a company person signing in for the first time. Everyone starts as Sales, which only
// shows them their own receipts; the Master Admin promotes people on the People page.
//
// It runs before the sign-in library looks the person up, so the library then finds them and signs them in the
// same way as someone added by hand. The library never creates users itself: its own default role is accounts.
export async function enrolOnFirstSignIn(profile: MicrosoftProfile): Promise<void> {
  const email = emailToEnrol(profile)
  if (!email) return

  try {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) return

    const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : email
    await prisma.user.create({
      data: {
        email,
        name,
        role: isMasterAdminEmail(email) ? "accounts" : "sales",
        membershipPlan: "unlimited",
        emailVerified: true,
      },
    })
  } catch (error) {
    // Sign-in then ends with the usual "not on the list" refusal instead of an error page.
    console.error("Could not enrol a person on first sign-in:", error)
  }
}
