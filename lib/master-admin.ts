import config from "@/lib/config"

// The Master Admin is the one person who can add people, change roles, and switch Login on or off.
// It is set with MASTER_ADMIN_EMAIL rather than stored in the database, so nobody can change it from inside the app.
export function getMasterAdminEmail(): string | null {
  return config.auth.masterAdminEmail
}

export function isMasterAdminEmail(email: string | null | undefined): boolean {
  const master = getMasterAdminEmail()
  return master !== null && typeof email === "string" && email.trim().toLowerCase() === master
}

export function isValidMasterAdminEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
