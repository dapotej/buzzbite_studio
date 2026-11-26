import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { listBrands } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const brands = await listBrands();
  return (
    <>
      <TopBar />
      <main className="page">
        <div className="head">
          <div>
            <h1>Your brands</h1>
            <p className="lede">Each brand keeps its own voice, colours, content pillars and posts.</p>
          </div>
          <Link className="btn btn-primary" href="/brands/new">Add a brand</Link>
        </div>
        {brands.length === 0 ? (
          <div className="empty">
            <strong>No brands yet</strong>
            Add your first brand. Paste a pitch deck, website copy or concept note and Brandloom drafts the brand profile for you.
          </div>
        ) : (
          <div className="grid">
            {brands.map((b) => (
              <Link key={b.id} href={`/brands/${b.id}`} className="card stack" style={{ textDecoration: "none" }}>
                <div className="row">
                  <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 8, background: b.profile.colors.primary, border: "1px solid var(--line)" }} />
                  <h2>{b.name}</h2>
                </div>
                <p className="muted small">{b.profile.oneLiner || "No description yet."}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
