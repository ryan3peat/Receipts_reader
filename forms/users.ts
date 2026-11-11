import { z } from "zod"

export const userFormSchema = z.object({
  name: z.string().max(128).optional(),
  email: z.string().max(256).optional().or(z.literal("")),
  avatar: z.instanceof(File).optional(),
  businessName: z.string().max(128).optional(),
  businessAddress: z.string().max(1024).optional(),
  businessBankDetails: z.string().max(1024).optional(),
  businessLogo: z.instanceof(File).optional(),
})
