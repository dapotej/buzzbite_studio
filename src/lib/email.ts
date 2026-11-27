import "server-only";

// Email goes through Resend when RESEND_API_KEY is set; without it, nothing is sent
// and callers fall back (alerts stay in the app; reset links are made by the owner).
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
const FROM = () => process.env.EMAIL_FROM || "Buzzbite <hello@buzzbite.io>";

export async function sendEmail(to: string | string[], subject: string, text: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM(), to: Array.isArray(to) ? to : [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("email failed", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (e) {
    console.error("email failed", e);
    return false;
  }
}
