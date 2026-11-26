"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopBarClient } from "@/components/TopBarClient";

export default function NewBrand() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), source: fd.get("source") }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error ?? "Could not create the brand.");
      return;
    }
    router.push(`/brands/${data.id}/settings?new=1`);
  }

  return (
    <>
      <TopBarClient />
      <main className="page page-narrow">
        <div>
          <h1>Add a brand</h1>
          <p className="lede">Paste anything that describes the business: a concept note, pitch deck text, website copy or past posts. Brandloom drafts the voice, audience, pillars and colours. You can edit everything after.</p>
        </div>
        <form className="card stack" onSubmit={submit}>
          <label className="field" htmlFor="name">
            Brand name
            <input id="name" name="name" type="text" required maxLength={80} placeholder="e.g. Beamer" />
          </label>
          <label className="field" htmlFor="source">
            About the business
            <span className="hint">The more detail, the better the drafts. Leave empty to fill in the profile by hand.</span>
            <textarea id="source" name="source" rows={14} maxLength={60000} placeholder="Paste a concept note, pitch deck text, website copy…" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Drafting the brand profile… (up to a minute)" : "Create brand"}</button>
          </div>
        </form>
      </main>
    </>
  );
}
