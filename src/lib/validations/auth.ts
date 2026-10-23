import { z } from "zod";

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Nama terlalu pendek").max(150),
  userType: z.enum(["STUDENT", "LECTURER"]),
  institutionalId: z.string().trim().regex(/^[A-Za-z0-9.-]{5,40}$/, "NIM/NIP tidak valid"),
  phoneNumber: z.string().trim().regex(/^\+?[0-9 ()-]{9,25}$/, "Nomor telepon tidak valid"),
  email: z.string().trim().toLowerCase().email("Format email tidak valid").max(254),
  password: z.string().min(8, "Password minimal 8 karakter").max(128),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Password tidak cocok",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Format email tidak valid").max(254),
  password: z.string().min(1, "Password wajib diisi").max(128),
});
