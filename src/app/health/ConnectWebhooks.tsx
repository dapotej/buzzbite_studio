"use client";
import { useState } from "react";

/** Registers the app with Zernio so publishing results arrive without anyone checking. */
export function ConnectWebhooks() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function go() {
    setState("busy");
    const res = await fetch("/api/admin/webhooks", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { setState("done"); setMsg(body.existed ? "Already connected." : "Connected. Zernio will now report each post's result."); }
    else { setState("error"); setMsg(body.error ?? "Could not connect."); }
  }
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn" onClick={go} disabled={state === "busy"}>{state === "busy" ? "Connecting…" : "Connect publishing updates from Zernio"}</button>
      {msg && <span className={state === "error" ? "error" : "muted"} role="status">{msg}</span>}
    </div>
  );
}
