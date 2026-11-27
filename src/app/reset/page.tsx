import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { setPassword } from "@/lib/accounts";
import { PASSWORD_RULE, hashPassword, passwordOk } from "@/lib/passwords";
import { resetTokenUser, useResetToken } from "@/lib/security";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password · Buzzbite" };

async function reset(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const userId = await resetTokenUser(token);
  if (!userId) redirect("/reset?error=link");
  if (!passwordOk(password)) redirect(`/reset?token=${encodeURIComponent(token)}&error=short`);
  if (!(await useResetToken(token))) redirect("/reset?error=link");
  // A new password ends every session, on every device.
  await setPassword(userId, await hashPassword(password));
  redirect("/login?reset=1");
}

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = "", error } = await searchParams;
  const valid = token ? Boolean(await resetTokenUser(token)) : false;
  return (
    <main className="wrap" style={{ maxWidth: 440, paddingTop: "10vh", paddingInline: 16, paddingBottom: 48 }}>
      <h1 style={{ margin: 0 }}><Wordmark height={34} /></h1>
      {!valid ? (
        <>
          <p className="lede">This reset link has expired or was already used.</p>
          <p className="small"><Link href="/forgot">Get a new link</Link> · <Link href="/login">Sign in</Link></p>
        </>
      ) : (
        <>
          <p className="lede">Choose a new password. You&rsquo;ll be signed out everywhere else.</p>
          <form action={reset} className="card stack">
            <input type="hidden" name="token" value={token} />
            <label className="field" htmlFor="password">New password<span className="hint">{PASSWORD_RULE}</span>
              <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />
            </label>
            {error === "short" && <p className="error" role="alert">Choose a longer password. {PASSWORD_RULE}</p>}
            <button className="btn btn-ink" type="submit">Save new password</button>
          </form>
        </>
      )}
    </main>
  );
}
