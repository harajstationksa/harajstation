import { getFreeTierConfig } from "@/lib/settings";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "حساب جديد" };

export default async function RegisterPage() {
  const freeTier = await getFreeTierConfig();
  return <RegisterForm freeTierDays={freeTier.enabled ? freeTier.days : null} />;
}
