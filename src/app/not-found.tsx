import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { NotFoundBody } from "@/components/NotFoundBody";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "الصفحة غير موجودة",
  // Next already sends a 404 status; this just makes the intent explicit
  robots: { index: false, follow: true },
};

/**
 * The 404 for a URL that matches no route at all (/wat). It lands outside the
 * (site) group, so it gets none of that layout's chrome and has to bring its
 * own — otherwise the user is dropped on a bare slab with no way back.
 *
 * A listing that no longer exists is a different case: it *is* inside (site),
 * already has the header and footer from that layout, and is handled by
 * (site)/not-found.tsx. Rendering the chrome here as well would draw it twice.
 */
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <NotFoundBody />
      </main>
      <Footer />
      <BottomNav />
    </>
  );
}
