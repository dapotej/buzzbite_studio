import { notFound } from "next/navigation";
import { BrandForm } from "@/components/BrandForm";
import { BrandHeader } from "@/components/BrandHeader";
import { TopBar } from "@/components/TopBar";
import { getBrand } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BrandSettings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const brand = await getBrand(id);
  if (!brand) notFound();
  return (
    <>
      <TopBar />
      <main className="page" style={{ maxWidth: 980 }}>
        <BrandHeader brand={brand} current="settings" />
        {isNew && (
          <p className="notice">Here is the drafted brand profile. Check the facts, add your logo, then save. Every post is built from this page.</p>
        )}
        <BrandForm brand={brand} />
      </main>
    </>
  );
}
