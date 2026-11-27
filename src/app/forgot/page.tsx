import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { findUserByEmail } from "@/lib/accounts";
import { appUrl } from "@/lib/alerts";
import { emailConfigured, sendEmail } from "@/lib/email";
import { LIMITS, RESET_LINK_HOURS, clientIp, createResetToken, limited, noteAttempt } from "@/lib/security";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset your password · Buzzbite" };

async function requestReset(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) redirect("/forgot?error=email");
  const emailKey = `reset:email:${email}`;
  const ipKey = `reset:ip:${await clientIp()}`;
  // Same answer whether or not the account exists, so the form can't be used to find accounts.
  if (!(await limited([[emailKey, LIMITS.resetEmail], [ipKey, LIMITS.resetIp]]))) {
    await noteAttempt(emailKey, ipKey);
    const user = await findUserByEmail(email);
    if (user) {
      const token = await createResetToken(user.id);
      await sendEmail(user.email, "Reset your Buzzbite password",
        `Someone asked to reset the password for your Buzzbite account.\n\nChoose a new password here (the link works once, for ${RESET_LINK_HOURS} hours):\n${appUrl()}/reset?token=${token}\n\nIf it wasn't you, ignore this email. Your password stays the same.`);
    }
  }
  redirect("/forgot?sent=1");
}

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  return (
    <main className="wrap" style={{ maxWidth: 440, paddingTop: "10vh", paddingInline: 16, paddingBottom: 48 }}>
      <h1 style={{ margin: 0 }}><Wordmark height={34} /></h1>
      {!emailConfigured() ? (
        <p className="lede">Ask the owner of your workspace for a reset link. They can make one in Settings, under Team.</p>
      ) : sent ? (
        <p className="lede" role="status">If that email has a Buzzbite account, a reset link is on its way. It works for {RESET_LINK_HOURS} hours.</p>
      ) : (
        <>
          <p className="lede">Enter your email and we&rsquo;ll send you a link to choose a new password.</p>
          <form action={requestReset} className="card stack">
            <label className="field" htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" required autoFocus /></label>
            {error && <p className="error" role="alert">Enter a valid email address.</p>}
            <button className="btn btn-ink" type="submit">Send reset link</button>
          </form>
        </>
      )}
      <p className="small muted" style={{ marginTop: 16 }}><Link href="/login">Back to sign in</Link></p>
    </main>
  );
}
