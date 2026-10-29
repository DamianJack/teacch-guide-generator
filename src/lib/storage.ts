import Dexie, { type Table } from "dexie";
import type { Draft, Photo } from "./guide";
import { id, LIMITS } from "./guide";

const db = new Dexie("work-instructions");
db.version(1).stores({ drafts: "key" });
const drafts = db.table("drafts") as Table<{ key: string; draft: Draft }>;
export async function loadDraft() { return (await drafts.get("current"))?.draft ?? null; }
// A single record commits facts and photo blobs together or leaves the previous save intact.
export async function saveDraft(draft: Draft) { await drafts.put({ key: "current", draft }); }
export function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("image"));
    reader.readAsDataURL(blob);
  });
}
export async function preparePhoto(file: File, photoId = id()): Promise<Photo> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12_000_000 || !file.size) throw new Error("image");
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) throw new Error("image");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("image");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45, 0.25]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= LIMITS.photoBytes) return { id: photoId, name: file.name, blob };
    }
    throw new Error("image");
  } finally { bitmap.close(); }
}
