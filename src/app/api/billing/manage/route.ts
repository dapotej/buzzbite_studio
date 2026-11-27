import { NextResponse } from "next/server";
import { requireSession } from "@/lib/accounts";
import { handle } from "@/lib/http";
import { PaymentError, paystackManageLink, stripePortal } from "@/lib/payments";

/** Opens the provider's page to change card, switch plan or cancel. Owners only. */
export const POST = handle(async (req: Request) => {
  const s = await requireSession();
  if (s.role !== "owner") return NextResponse.json({ error: "Only the workspace owner can manage billing." }, { status: 403 });
  try {
    const url = s.workspace.billing.provider === "paystack" ? await paystackManageLink(s.workspace) : await stripePortal(s.workspace, new URL(req.url).origin);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof PaymentError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
});
