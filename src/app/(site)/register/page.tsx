import { getFreeTierConfig } from "@/lib/settings";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "حساب جديد" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const [freeTier, { ref }] = await Promise.all([getFreeTierConfig(), searchParams]);
  return (
    <RegisterForm
      freeTierDays={freeTier.enabled ? freeTier.days : null}
      initialRef={ref?.trim().toUpperCase().slice(0, 30) ?? ""}
    />
  );
}
