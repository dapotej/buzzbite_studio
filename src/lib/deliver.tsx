"use client";
import { upload } from "@vercel/blob/client";
import { createRoot } from "react-dom/client";
import { PostCanvas, POST_W } from "@/templates/PostCanvas";
import { ensureFonts, exportMp4, exportPng, slidesPdf } from "./export";
import { exportReel } from "./reel";
import { designKey, isVideoPost, type Brand, type Post, type PublishFile } from "./types";

const plain = (s: string) => s.replace(/\*/g, "").trim();
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Makes the final files for a post (a JPEG, carousel slides plus a LinkedIn PDF, or an MP4),
 * uploads them, and saves them on the post so it can be scheduled. Rendered off-screen at
 * full size with full-resolution photos.
 */
export async function makePostFiles(brand: Brand, post: Post, onProgress: (fraction: number) => void = () => {}): Promise<void> {
  const key = designKey(post.spec, brand.updated_at);
  ensureFonts([brand.profile.fonts.display, brand.profile.fonts.body]);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-20000px", top: "0", width: `${POST_W}px`, pointerEvents: "none" });
  document.body.appendChild(host);
  const root = createRoot(host);

  async function draw(slide: number): Promise<HTMLElement> {
    root.render(<PostCanvas brand={brand.profile} spec={post.spec} logoOnLight={brand.logo_on_light} logoOnDark={brand.logo_on_dark} slide={slide} />);
    await nextFrame();
    await nextFrame();
    const node = host.firstElementChild as HTMLElement | null;
    if (!node) throw new Error("Could not draw the post.");
    await Promise.all(Array.from(node.querySelectorAll("img")).map((img) => img.decode().catch(() => undefined)));
    return node;
  }

  const dir = `brands/${brand.id}/posts/${post.id}`;
  const put = async (blob: Blob, name: string) =>
    (await upload(`${dir}/${name}`, blob, { access: "public", handleUploadUrl: "/api/media/upload", contentType: blob.type })).url;

  try {
    let files: Record<"instagram" | "linkedin", PublishFile[]>;
    if (post.spec.template === "reel") {
      // Vertical 9:16 with voice-over and music: Instagram posts it as a Reel.
      const { blob, audio } = await exportReel({ spec: post.spec, brand: brand.profile, logo: brand.logo_on_dark ?? brand.logo_on_light }, (f) => onProgress(f * 0.85));
      if (audio !== "aac") throw new Error("This browser can't record reel sound in the format Instagram needs. Approve this reel from Chrome or Safari.");
      const url = await put(blob, "reel.mp4");
      files = { instagram: [{ url, type: "video" }], linkedin: [{ url, type: "video" }] };
    } else if (isVideoPost(post.spec)) {
      const { blob } = await exportMp4(await draw(0), (f) => onProgress(f * 0.85));
      const url = await put(blob, "post.mp4");
      files = { instagram: [{ url, type: "video" }], linkedin: [{ url, type: "video" }] };
    } else if (post.spec.template === "carousel" && post.spec.slides.length > 1) {
      const count = Math.min(10, post.spec.slides.length); // Instagram allows 10 slides
      const jpegs: Blob[] = [];
      for (let i = 0; i < count; i++) {
        jpegs.push(await exportPng(await draw(i), "jpeg"));
        onProgress(((i + 1) / count) * 0.6);
      }
      const urls: string[] = [];
      for (let i = 0; i < jpegs.length; i++) {
        urls.push(await put(jpegs[i], `slide-${String(i + 1).padStart(2, "0")}.jpg`));
        onProgress(0.6 + ((i + 1) / jpegs.length) * 0.25);
      }
      const pdf = await put(await slidesPdf(jpegs), "carousel.pdf");
      const title = plain(post.spec.slides[0]?.headline || post.spec.headline || post.title).slice(0, 200);
      files = { instagram: urls.map((url) => ({ url, type: "image" })), linkedin: [{ url: pdf, type: "document", title }] };
    } else {
      const url = await put(await exportPng(await draw(0), "jpeg"), "post.jpg");
      onProgress(0.85);
      files = { instagram: [{ url, type: "image" }], linkedin: [{ url, type: "image" }] };
    }
    const res = await fetch(`/api/posts/${post.id}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, files }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save the post's files.");
    onProgress(1);
  } finally {
    root.unmount();
    host.remove();
  }
}

/** True when a post's saved files still match its design. */
export function filesReady(brand: Brand, post: Post): boolean {
  return Boolean(post.publishing.files) && post.publishing.filesKey === designKey(post.spec, brand.updated_at);
}
