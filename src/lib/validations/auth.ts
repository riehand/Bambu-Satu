import { z } from "zod";

export const registerSchema = z.object({
  fullName: z.string().min(2, "Nama terlalu pendek"),
  userType: z.enum(["STUDENT", "LECTURER"]),
  institutionalId: z.string().min(5, "NIM/NIP tidak valid"),
  phoneNumber: z.string().min(9, "Nomor telepon tidak valid"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Password tidak cocok",
  path: ["confirmPassword"],
});