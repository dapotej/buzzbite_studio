import Link from "next/link";
import { listLeads } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website sign-ups · Buzzbite" };

const KIND: Record<string, string> = { waitlist: "Waitlist", campaign: "Influencer campaign", creator: "Creator" };

/** Sign-ups from the Buzzbite website: waitlist, campaign enquiries and creators. */
export default async function Leads() {
  const leads = await listLeads();
  const count = (k: string) => leads.filter((l) => l.kind === k).length;
  return (
    <main className="wrap" style={{ paddingTop: 32, paddingBottom: 48 }}>
      <p className="small"><Link href="/">← Back to Buzzbite</Link></p>
      <div className="head">
        <div>
          <h1 className="title">Website sign-ups</h1>
          <p className="sub">{count("waitlist")} on the waitlist · {count("campaign")} campaign enquiries · {count("creator")} creators</p>
        </div>
      </div>
      {leads.length === 0 ? (
        <div className="empty"><strong>No sign-ups yet</strong>People who fill in a form on buzzbite.io appear here.</div>
      ) : (
        <div className="card" style={{ overflowX: "auto", padding: 0 }}>
          <table className="leads">
            <thead><tr><th scope="col">When</th><th scope="col">Type</th><th scope="col">Email</th><th scope="col">Name</th><th scope="col">Company or handle</th><th scope="col">Message</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}</td>
                  <td>{KIND[l.kind] ?? l.kind}</td>
                  <td><a href={`mailto:${l.email}`}>{l.email}</a></td>
                  <td>{l.name}</td>
                  <td>{l.company || l.handle}</td>
                  <td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
