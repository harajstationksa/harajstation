"use server";
import { reviewVerification } from "@/lib/admin-verification";
export async function approveStoreAction(data: FormData) {
  return reviewVerification("store", true, data);
}
export async function rejectStoreAction(data: FormData) {
  return reviewVerification("store", false, data);
}
