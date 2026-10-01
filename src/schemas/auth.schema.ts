import { z } from "zod";
import { MAX_EMAIL_LENGTH } from "@/constants";

const email = z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).email("email must be a valid email address");
const password = z.string().min(8, "password must be at least 8 characters long").max(128);

export const loginSchema = z.object({ email, password }).strict();
export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z.object({ email, password }).strict();
export type RegisterDto = z.infer<typeof registerSchema>;
