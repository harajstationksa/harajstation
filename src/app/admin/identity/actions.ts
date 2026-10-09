"use server";
import { reviewVerification } from "@/lib/admin-verification";
export async function approveIdentityAction(data: FormData) {
  return reviewVerification("identity", true, data);
}
export async function rejectIdentityAction(data: FormData) {
  return reviewVerification("identity", false, data);
}
