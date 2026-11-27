import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getBrand } from "@/lib/db";

// Issues short-lived tokens so the browser can upload photos and clips straight to Vercel Blob.
// The middleware has already checked the session cookie.
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const m = /^brands\/([0-9a-f-]{36})\//.exec(pathname);
        if (!m || !(await getBrand(m[1]))) throw new Error("Invalid upload path.");
        return {
          allowedContentTypes: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime", "video/webm", "application/pdf"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload refused." }, { status: 400 });
  }
}
