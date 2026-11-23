import config from "@/lib/config"
import { getSelfHostedUser, SELF_HOSTED_USER } from "@/models/users"
import { User } from "@/prisma/client"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"
import { prisma } from "./db"

export type UserProfile = {
  id: string
  name: string
  email: string
  avatar?: string
  membershipPlan: string
  storageUsed: number
  storageLimit: number
  aiBalance: number
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  user: {
    fields: {
      image: "avatar",
    },
  },
  appName: config.app.title,
  baseURL: config.app.baseURL,
  secret: config.auth.secret,
  emailAndPassword: {
    enabled: config.auth.devLogin !== null,
    disableSignUp: true,
  },
  session: {
    strategy: "jwt",
    expiresIn: 180 * 24 * 60 * 60, // 365 days
    updateAge: 24 * 60 * 60, // 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 365 * 24 * 60 * 60, // 365 days
    },
  },
  advanced: {
    cookiePrefix: "taxhacker",
    database: {
      generateId: "uuid",
    },
  },
  ...(config.auth.microsoft
    ? {
        socialProviders: {
          microsoft: {
            clientId: config.auth.microsoft.clientId,
            clientSecret: config.auth.microsoft.clientSecret,
            tenantId: config.auth.microsoft.tenantId,
            prompt: "select_account",
            // The photo would be stored as a large inline image on the user and in the session cookie.
            disableProfilePhoto: true,
          },
        },
      }
    : {}),
  account: {
    accountLinking: {
      trustedProviders: ["microsoft"],
      // Nobody edits a profile in the app: the name is taken from Microsoft the first time a person signs in.
      updateUserInfoOnLink: true,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          throw new APIError("FORBIDDEN", {
            message: "This Microsoft account is not on the EF Expenses list. Ask accounts to add you.",
          })
        },
      },
    },
  },
  plugins: [
    nextCookies(), // make sure this is the last plugin in the array
  ],
})

export async function getSession() {
  const { isLoginRequired } = await import("@/lib/access")
  if (config.selfHosted.isEnabled && !(await isLoginRequired())) {
    const user = await getSelfHostedUser()
    return user ? { user } : null
  }

  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function getCurrentUser(): Promise<User> {
  const { getActor } = await import("@/lib/access")
  const actor = await getActor()
  return actor.companyUser
}

export function isSubscriptionExpired(user: User) {
  if (config.selfHosted.isEnabled) {
    return false
  }
  return user.membershipExpiresAt && user.membershipExpiresAt < new Date()
}

export function isAiBalanceExhausted(user: User) {
  if (config.selfHosted.isEnabled || user.membershipPlan === SELF_HOSTED_USER.membershipPlan) {
    return false
  }
  return user.aiBalance <= 0
}
