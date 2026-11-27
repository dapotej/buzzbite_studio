import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { SetupWizard } from "@/components/SetupWizard";
import { listBrands } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const brands = await listBrands();
  return (
    <main className="main">
      <div className="wrap narrow" style={{ gap: 26 }}>
        <div className="row">
          <Link href="/" className="logo" style={{ padding: 0 }}><Wordmark height={22} /></Link>
          <span className="spacer" />
          {brands.length > 0 && <Link className="btn btn-ghost" href={`/b/${brands[0].id}`}>Cancel</Link>}
        </div>
        <SetupWizard />
      </div>
    </main>
  );
}
