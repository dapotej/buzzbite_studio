import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { addMember, createUser, createWorkspace, findUserByEmail, getInvite, getWorkspace, useInvite, type Invite } from "@/lib/accounts";
import { startSession } from "@/lib/security";
import { PASSWORD_RULE, hashPassword, passwordOk, verifyPassword } from "@/lib/passwords";

export const dynamic = "force-dynamic";

const signupsOpen = () => process.env.SIGNUPS_OPEN === "true";

async function validInvite(token: string): Promise<Invite | null> {
  if (!token) return null;
  const inv = await getInvite(token);
  return inv && !inv.used_at && new Date(inv.expires_at).getTime() > Date.now() ? inv : null;
}

async function signUp(formData: FormData) {
  "use server";
  const g = (k: string) => String(formData.get(k) ?? "").trim();
  const token = g("invite");
  const back = (code: string) => redirect(`/signup?invite=${encodeURIComponent(token)}&error=${code}`);
  const invite = await validInvite(token);
  if (!invite && !signupsOpen()) back("invite");
  const email = (invite?.email || g("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) back("email");

  const existing = await findUserByEmail(email);
  let userId: string;
  if (existing) {
    // Joining a team with an account you already have: confirm it's you.
    if (invite?.kind !== "team" || !(await verifyPassword(password, existing.password_hash))) back("exists");
    userId = existing!.id;
  } else {
    if (!passwordOk(password)) back("short");
    userId = (await createUser(email, g("name"), await hashPassword(password))).id;
  }

  if (invite?.kind === "team" && invite.workspace_id) {
    await addMember(invite.workspace_id, userId, "member");
  } else {
    const ws = await createWorkspace(g("business") || g("name") || "My workspace");
    await addMember(ws.id, userId, "owner");
  }
  if (invite) await useInvite(invite.token);
  await startSession(userId);
  redirect("/");
}

const ERRORS: Record<string, string> = {
  invite: "This invite link has expired or was already used. Ask for a new one.",
  email: "Enter a valid email address.",
  short: `Choose a longer password. ${PASSWORD_RULE}`,
  exists: "There's already an account with that email. Sign in instead, or use your existing password to join this team.",
};

export default async function SignUp({ searchParams }: { searchParams: Promise<{ invite?: string; error?: string }> }) {
  const { invite: token = "", error } = await searchParams;
  const invite = await validInvite(token);
  const team = invite?.kind === "team" && invite.workspace_id ? await getWorkspace(invite.workspace_id) : null;

  if (!invite && !signupsOpen()) {
    return (
      <main className="wrap" style={{ maxWidth: 440, paddingTop: "10vh", paddingInline: 16 }}>
        <h1 style={{ margin: 0 }}><Wordmark height={34} /></h1>
        <div className="card stack">
          <h2 style={{ fontSize: 22 }}>{token ? "This invite link doesn't work" : "Buzzbite is invite-only for now"}</h2>
          <p className="muted">{token ? "It has expired or was already used. Ask the person who sent it for a new one." : "We're opening to a small group first."} </p>
          <div className="row"><a className="btn btn-ink" href="https://buzzbite.io/#waitlist">Join the waitlist</a><Link className="btn" href="/login">Sign in</Link></div>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap" style={{ maxWidth: 440, paddingTop: "8vh", paddingInline: 16, paddingBottom: 48 }}>
      <h1 style={{ margin: 0 }}><Wordmark height={34} /></h1>
      <p className="lede">{team ? `Join ${team.name} on Buzzbite.` : "Create your account. Your 14-day free trial starts now, no card needed."}</p>
      <form action={signUp} className="card stack">
        <input type="hidden" name="invite" value={token} />
        <label className="field" htmlFor="name">Your name<input id="name" name="name" type="text" autoComplete="name" required /></label>
        {!team && <label className="field" htmlFor="business">Business name<input id="business" name="business" type="text" autoComplete="organization" /></label>}
        <label className="field" htmlFor="email">Email
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={invite?.email || ""} readOnly={!!invite?.email} />
        </label>
        <label className="field" htmlFor="password">Password<span className="hint">{PASSWORD_RULE}</span>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        {error && <p className="error" role="alert">{ERRORS[error] ?? "Something went wrong. Try again."}</p>}
        <button className="btn btn-ink" type="submit">{team ? "Join the team" : "Create my account"}</button>
      </form>
      <p className="small muted" style={{ marginTop: 16 }}>Already have an account? <Link href="/login">Sign in</Link>.</p>
    </main>
  );
}
