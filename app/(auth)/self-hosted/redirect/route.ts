import { isLoginRequired } from "@/lib/access"
import { getSession } from "@/lib/auth"
import config from "@/lib/config"
import { createUserDefaults, isDatabaseEmpty } from "@/models/defaults"
import { getOrCreateSelfHostedUser, getSelfHostedUser } from "@/models/users"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function GET() {
  if (!config.selfHosted.isEnabled) {
    redirect(config.auth.loginUrl)
  }

  const user = (await getSelfHostedUser()) ?? (await getOrCreateSelfHostedUser())

  if (await isDatabaseEmpty(user.id)) {
    await createUserDefaults(user.id)
  }

  revalidatePath("/dashboard")

  if ((await isLoginRequired()) && !(await getSession())) {
    redirect(config.auth.loginUrl)
  }

  redirect("/dashboard")
}
