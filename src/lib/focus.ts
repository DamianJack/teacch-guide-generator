import type { FocusRegion } from "./guide";

// Coordinates describe the oval's bounding box, relative to the full original image.
export function placeFocus(cx: number, cy: number, width = 0.35, height = 0.35): FocusRegion {
  width = Math.min(1, Math.max(0.05, width)); height = Math.min(1, Math.max(0.05, height));
  return { x: Math.min(1 - width, Math.max(0, cx - width / 2)), y: Math.min(1 - height, Math.max(0, cy - height / 2)), width, height };
}

// Shared by the editor, learner view and flattened PDF images.
export function drawFocus(context: CanvasRenderingContext2D, image: HTMLImageElement, region?: FocusRegion | null) {
  const width = image.naturalWidth, height = image.naturalHeight;
  context.drawImage(image, 0, 0, width, height);
  if (!region) return;
  const cx = (region.x + region.width / 2) * width, cy = (region.y + region.height / 2) * height;
  const rx = region.width * width / 2, ry = region.height * height / 2;
  context.fillStyle = "rgba(0, 0, 0, 0.28)";
  context.fillRect(0, 0, width, height);
  context.save();
  context.beginPath(); context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); context.clip();
  context.drawImage(image, 0, 0, width, height);
  context.restore();
  const line = Math.max(2, Math.min(width, height) * 0.004);
  // Inset the outline so it stays visible even when the selection touches an edge.
  context.beginPath(); context.ellipse(cx, cy, Math.max(0.5, rx - line), Math.max(0.5, ry - line), 0, 0, Math.PI * 2);
  context.strokeStyle = "#172d27"; context.lineWidth = line * 2; context.stroke();
  context.strokeStyle = "#fff1a6"; context.lineWidth = line; context.stroke();
}

export async function focusImageData(src: string, region: FocusRegion): Promise<string> {
  const image = new Image(); image.src = src; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  drawFocus(context, image, region);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export const stepPhotoKey = (stepId: string, photoId: string) => JSON.stringify([stepId, photoId]);
