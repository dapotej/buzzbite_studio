import { redirect } from "next/navigation";
import { listBrands } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const brands = await listBrands();
  redirect(brands.length ? `/b/${brands[0].id}` : "/setup");
}
