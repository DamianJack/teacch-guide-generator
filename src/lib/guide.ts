import { z } from "zod";

export type Language = "en" | "de";
export const LIMITS = { photos: 12, photoBytes: 160_000, requestBytes: 3_500_000, steps: 24 };
export const materialSchema = z.object({ id: z.string().max(80), name: z.string().max(100), quantity: z.string().max(40), unit: z.string().max(40) });
export const stepSchema = z.object({ id: z.string().max(80), text: z.string().max(600), photoId: z.string().max(80) });
export const questionSchema = z.object({ question: z.string().min(1).max(500), answer: z.string().max(1000) });
export const factsSchema = z.object({
  language: z.enum(["en", "de"]), title: z.string().max(160), notes: z.string().max(5000),
  materials: z.array(materialSchema).max(24), noMaterials: z.boolean(),
  finished: z.string().max(1000), next: z.string().max(1000), help: z.string().max(1000),
});
export const aiRequestSchema = z.object({
  facts: factsSchema, steps: z.array(stepSchema).max(LIMITS.steps), questions: z.array(questionSchema).max(20),
  photos: z.array(z.object({ id: z.string().min(1).max(80), data: z.string().max(214000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/) })).min(1).max(LIMITS.photos),
});
export const generationSchema = z.object({
  steps: z.array(z.object({ text: z.string().min(1).max(600), photoId: z.string().min(1).max(80) })).min(1).max(LIMITS.steps),
  finished: z.string().max(1000), next: z.string().max(1000), help: z.string().max(1000),
  questions: z.array(z.string().min(1).max(500)).max(20),
});
export const reviewSchema = z.object({
  suggestions: z.array(z.object({ target: z.string().min(1).max(80), issue: z.string().min(1).max(500) })).max(30),
  questions: z.array(z.string().min(1).max(500)).max(20),
});
export type Facts = z.infer<typeof factsSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Photo = { id: string; name: string; blob: Blob };
export type Draft = Facts & {
  id: string; revision: number; example: boolean; photos: Photo[]; steps: Step[];
  questions: z.infer<typeof questionSchema>[]; approvedRevision: number | null;
  review: { revision: number; suggestions: { target: string; issue: string; dismissed: boolean }[] } | null;
};
export const id = () => crypto.randomUUID();
export function newDraft(language: Language = "en"): Draft {
  return { id: id(), revision: 0, example: false, language, title: "", notes: "", materials: [], noMaterials: false,
    finished: "", next: "", help: "", photos: [], steps: [], questions: [], approvedRevision: null, review: null };
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
export function approvalIssues(d: Draft): string[] {
  const issues: string[] = [];
  for (const field of ["title", "finished", "next", "help"] as const) if (!d[field].trim()) issues.push(field);
  if (!d.noMaterials && (!d.materials.length || d.materials.some(m => !m.name.trim() || !m.quantity.trim() || !m.unit.trim()))) issues.push("materials");
  if (!d.steps.length) issues.push("steps");
  if (d.steps.some(s => !s.text.trim() || !d.photos.some(p => p.id === s.photoId))) issues.push("stepContent");
  if (d.questions.some(q => !q.answer.trim())) issues.push("questions");
  return issues;
}
export const headings = {
  en: { goal: "Your task", materials: "What you need", steps: "What to do", finished: "You are finished when", next: "What happens next", help: "Need help?", none: "No materials needed", step: "Step", page: "Page" },
  de: { goal: "Deine Aufgabe", materials: "Das brauchst du", steps: "Das machst du", finished: "Du bist fertig, wenn", next: "Danach", help: "Brauchst du Hilfe?", none: "Kein Material nötig", step: "Schritt", page: "Seite" },
};
