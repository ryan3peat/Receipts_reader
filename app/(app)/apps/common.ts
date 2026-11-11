export type AppManifest = {
  name: string
  description: string
  icon: string
}

export async function getApps(): Promise<{ id: string; manifest: AppManifest }[]> {
  return []
}
