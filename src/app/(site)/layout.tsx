import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { recordPresence } from "@/lib/presence";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // live-visitor tracking for the admin "online now" panel (never blocks render)
  recordPresence().catch(() => {});
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <BottomNav />
    </>
  );
}
