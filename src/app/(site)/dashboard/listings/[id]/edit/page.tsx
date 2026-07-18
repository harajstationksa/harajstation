import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseImages } from "@/lib/utils";
import { EditListingForm } from "@/components/EditListingForm";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.dash.editListing.title };
}

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const { id } = await params;

  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) notFound();
  if (listing.sellerId !== user.id) redirect("/dashboard/listings");

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="section-title">{t.dash.editListing.title}</h1>
        <p className="text-sm text-neutral-500 mt-1 line-clamp-1">{listing.title}</p>
      </div>
      <EditListingForm
        listing={{
          id: listing.id,
          type: listing.type,
          title: listing.title,
          description: listing.description,
          price: listing.price,
          condition: listing.condition,
          city: listing.city,
          neighborhood: listing.neighborhood,
          deliveryMethod: listing.deliveryMethod,
          showPhone: listing.showPhone,
          images: parseImages(listing.images),
        }}
      />
    </div>
  );
}
