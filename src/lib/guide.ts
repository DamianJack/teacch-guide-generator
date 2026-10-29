import { z } from "zod";

export type Language = "en" | "de";
export const LIMITS = { photos: 12, photoBytes: 160_000, requestBytes: 3_500_000, steps: 24 };
export const materialSchema = z.object({ id: z.string().max(80), name: z.string().max(100), quantity: z.string().max(40), unit: z.string().max(40) });
export const stepSchema = z.object({ id: z.string().min(1).max(80), text: z.string().max(600), photoIds: z.array(z.string().max(80)).max(LIMITS.photos) });
export const factsSchema = z.object({
  language: z.enum(["en", "de"]), title: z.string().max(160), notes: z.string().max(5000),
  materials: z.array(materialSchema).max(24), noMaterials: z.boolean(),
  finished: z.string().max(1000), next: z.string().max(1000), help: z.string().max(1000),
});
export const aiRequestSchema = z.object({
  facts: factsSchema, steps: z.array(stepSchema).max(LIMITS.steps),
  photos: z.array(z.object({ id: z.string().min(1).max(80), data: z.string().max(214000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/) })).min(1).max(LIMITS.photos),
});
export const generationSchema = z.object({
  steps: z.array(z.object({ stepId: z.string().min(1).max(80), text: z.string().max(600) })).min(1).max(LIMITS.steps),
  finished: z.string().max(1000), next: z.string().max(1000), help: z.string().max(1000),
});
export const reviewSchema = z.object({
  suggestions: z.array(z.object({ target: z.string().min(1).max(80), issue: z.string().min(1).max(500) })).max(30),
});
export type Facts = z.infer<typeof factsSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Photo = { id: string; name: string; blob: Blob };
export type Draft = Facts & {
  id: string; revision: number; example: boolean; photos: Photo[]; steps: Step[];
  approvedRevision: number | null;
  review: { revision: number; suggestions: { target: string; issue: string; dismissed: boolean }[] } | null;
};
export const id = () => crypto.randomUUID();
export const newStep = (text = ""): Step => ({ id: id(), text, photoIds: [] });
export function newDraft(language: Language = "en"): Draft {
  return { id: id(), revision: 0, example: false, language, title: "", notes: "", materials: [], noMaterials: false,
    finished: "", next: "", help: "", photos: [], steps: [newStep()], approvedRevision: null, review: null };
}
// Photos belong to steps; drop any photo no step uses so the shared store never holds hidden images.
export function usedPhotos(photos: Photo[], steps: Step[]) {
  const used = new Set(steps.flatMap(s => s.photoIds));
  return photos.filter(p => used.has(p.id));
}
// Photos in the order the learner meets them, each once.
export function photosInStepOrder(d: Pick<Draft, "photos" | "steps">) {
  const ids = [...new Set(d.steps.flatMap(s => s.photoIds))];
  return ids.map(pid => d.photos.find(p => p.id === pid)).filter((p): p is Photo => !!p);
}
// Drafts saved before steps owned photos had one optional photoId per step and could hold photos no step used.
export function migrateDraft(d: Draft): Draft {
  type Legacy = Omit<Step, "photoIds"> & { photoId?: string; photoIds?: string[] };
  const steps = (d.steps as Legacy[]).map(({ photoId, photoIds, ...s }) => ({ ...s, photoIds: photoIds ?? (photoId ? [photoId] : []) }));
  const used = new Set(steps.flatMap(s => s.photoIds));
  for (const p of d.photos) if (!used.has(p.id)) steps.push({ id: id(), text: "", photoIds: [p.id] });
  return { ...d, steps: steps.length ? steps : [newStep()] };
}
export function editDraft(draft: Draft, patch: Partial<Draft>): Draft {
  return { ...draft, ...patch, revision: draft.revision + 1, approvedRevision: null };
}
export function sameRevision(a: Draft, b: Draft) { return a.id === b.id && a.revision === b.revision; }
export function move<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  if (index + delta < 0 || index + delta >= items.length) return next;
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
// A guide only needs its photographed steps; title, materials, step text and finish details are optional and hidden when empty.
export function approvalIssues(d: Draft): string[] {
  const issues: string[] = [];
  if (!d.steps.length) issues.push("steps");
  if (d.steps.some(s => !s.photoIds.some(pid => d.photos.some(p => p.id === pid)))) issues.push("stepContent");
  return issues;
}
export const listedMaterials = (d: Draft) => d.materials.filter(m => m.name.trim());
export const showMaterials = (d: Draft) => d.noMaterials || listedMaterials(d).length > 0;
export const headings = {
  en: { goal: "Your task", materials: "What you need", steps: "What to do", finished: "You are finished when", next: "What happens next", help: "Need help?", none: "No materials needed", step: "Step", page: "Page" },
  de: { goal: "Deine Aufgabe", materials: "Das brauchst du", steps: "Das machst du", finished: "Du bist fertig, wenn", next: "Danach", help: "Brauchst du Hilfe?", none: "Kein Material nötig", step: "Schritt", page: "Seite" },
};
