"use client";

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be read as an image."));
    img.src = url;
  });
}

/** Reads a logo file into a PNG data URL, at most 240 px tall. SVGs are kept as they are. */
export async function logoToDataUrl(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    if (file.size > 300_000) throw new Error("That SVG is over 300 KB. Use a smaller file.");
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Could not read the file.")); r.readAsDataURL(file); });
  }
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG, WebP or SVG logo.");
  const img = await load(file);
  const h = Math.min(240, img.naturalHeight), w = Math.round((img.naturalWidth / img.naturalHeight) * h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/png");
}

/**
 * Makes an all-white version of a logo for dark backgrounds. Only works for logos with a
 * transparent background; returns null for logos on a solid box.
 */
export async function whiteVersion(dataUrl: string): Promise<string | null> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = dataUrl; }).catch(() => null);
  if (!img.naturalWidth) return null;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const corners = [0, (c.width - 1) * 4, (c.height - 1) * c.width * 4, (c.height * c.width - 1) * 4];
  if (corners.filter((i) => d.data[i + 3] > 200).length >= 3) return null; // solid background
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 255; d.data[i + 1] = 255; d.data[i + 2] = 255; }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL("image/png");
}
