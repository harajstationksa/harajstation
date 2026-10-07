import { z } from "zod";
/** bcrypt uses only the first 72 UTF-8 bytes. Reject ambiguous new credentials. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "كلمة المرور يجب أن تكون بين 8 أحرف و72 بايت",
  );

export const loginPasswordSchema = z
  .string()
  .min(1)
  .max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72);
