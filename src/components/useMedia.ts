"use client";
import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/types";

/** The brand's media library, with uploads, AI generation and polling of pending jobs. */
export function useMedia(brandId: string, initial: Media[] = []) {
  const [items, setItems] = useState<Media[]>(initial);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/brands/${brandId}/media`);
    if (res.ok) setItems(await res.json());
  }, [brandId]);

  // Poll pending generations every 6 seconds until they finish.
  useEffect(() => {
    const pending = items.filter((m) => m.status === "pending");
    if (!pending.length) return;
    timer.current = setTimeout(async () => {
      const updated = await Promise.all(pending.map((m) => fetch(`/api/media/${m.id}`).then((r) => (r.ok ? r.json() : m)).catch(() => m)));
      setItems((cur) =>
        cur
          .map((m) => updated.find((u: Media) => u.id === m.id) ?? m)
          .filter((m) => {
            if (m.status === "failed") setError(m.error ?? "A generation failed.");
            return m.status !== "failed";
          }),
      );
    }, 6000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [items]);

  async function uploadFiles(files: FileList | File[], onProgress?: (name: string, pct: number) => void) {
    setError("");
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
      if (!kind) { setError(`${file.name} is not an image or video.`); continue; }
      try {
        const blob = await upload(`brands/${brandId}/${file.name.replace(/[^\w.-]+/g, "-")}`, file, {
          access: "public",
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: (p) => onProgress?.(file.name, p.percentage),
        });
        const res = await fetch(`/api/brands/${brandId}/media`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: blob.url, kind, description: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save the upload.");
        const m = await res.json();
        setItems((cur) => [m, ...cur]);
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
  }

  async function generate(body: { kind: "image" | "video"; brief: string; sourceId?: string }): Promise<Media | null> {
    setError("");
    const res = await fetch(`/api/brands/${brandId}/media/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? "Could not start the generation."); return null; }
    setItems((cur) => [data, ...cur]);
    return data;
  }

  async function remove(id: string) {
    await fetch(`/api/media/${id}`, { method: "DELETE" });
    setItems((cur) => cur.filter((m) => m.id !== id));
  }

  return { items, error, setError, reload, uploadFiles, generate, remove };
}
