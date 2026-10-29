"use client";
import { useEffect, useId, useRef, useState } from "react";
import { copy } from "../lib/copy";
import { dataUrl } from "../lib/storage";
import { focusSuggestionSchema, type FocusRegion, type Language, type Photo } from "../lib/guide";
import { placeFocus } from "../lib/focus";
import { FocusImage } from "./focus-image";

export function FocusEditor({ photo, src, initial, text, language, uiLanguage, online, save, close }: {
  photo: Photo; src: string; initial?: FocusRegion; text: string; language: Language; uiLanguage: Language; online: boolean;
  save: (region: FocusRegion | null) => void; close: () => void;
}) {
  const t = copy[uiLanguage], titleId = useId(), hintId = useId(), privacyId = useId();
  const dialog = useRef<HTMLDialogElement>(null), request = useRef<AbortController | null>(null);
  const [region, setRegion] = useState<FocusRegion | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"focusFailed" | "focusNone" | "focusReview" | "focusConfigured" | null>(null);
  useEffect(() => {
    const node = dialog.current; node?.showModal();
    return () => { request.current?.abort(); node?.close(); };
  }, []);
  function change(next: FocusRegion | null) {
    request.current?.abort(); request.current = null; setBusy(false); setStatus(null); setRegion(next);
  }
  async function suggest() {
    if (request.current || !online || !text.trim()) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setStatus(null);
    try {
      const data = await dataUrl(photo.blob);
      if (controller.signal.aborted) return;
      const response = await fetch("/api/focus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts: { language, title: "", notes: "", materials: [], noMaterials: false },
          steps: [{ id: "focus-step", text, photoIds: [photo.id] }], photos: [{ id: photo.id, data }] }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]),
      });
      const result = await response.json();
      if (controller.signal.aborted || request.current !== controller) return;
      if (!response.ok) { setStatus(result.error === "configuration" ? "focusConfigured" : "focusFailed"); return; }
      const suggestion = focusSuggestionSchema.parse(result);
      // An unclear suggestion leaves the trainer's existing selection intact.
      if (suggestion.region) setRegion(suggestion.region);
      setStatus(suggestion.region ? "focusReview" : "focusNone");
    } catch { if (!controller.signal.aborted) setStatus("focusFailed"); }
    finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  const current = region ?? placeFocus(0.5, 0.5);
  const cx = current.x + current.width / 2, cy = current.y + current.height / 2;
  return <dialog ref={dialog} className="focus-dialog" aria-labelledby={titleId} aria-describedby={hintId} onCancel={close}>
    <div className="voice-heading"><h2 id={titleId}>{t.focusTitle}</h2><button autoFocus className="icon-button" aria-label={t.close} onClick={close}>×</button></div>
    <p id={hintId} className="focus-hint">{t.focusHint}</p>
    <button type="button" className="focus-stage" aria-label={t.focusTitle} aria-describedby={hintId}
      onClick={event => {
        // Keyboard activation places the oval in the centre; pointer input uses the full image bounds.
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.detail === 0 ? 0.5 : (event.clientX - bounds.left) / bounds.width;
        const y = event.detail === 0 ? 0.5 : (event.clientY - bounds.top) / bounds.height;
        change(placeFocus(x, y, current.width, current.height));
      }}
      onKeyDown={event => {
        const delta = event.shiftKey ? 0.05 : 0.01;
        const dx = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0;
        const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
        if (dx || dy) { event.preventDefault(); change(placeFocus(cx + dx, cy + dy, current.width, current.height)); }
      }}>
      <FocusImage src={src} region={region} alt={photo.name} errorLabel={t.focusImageError} />
    </button>
    <div className="focus-sliders">
      {([
        ["focusX", cx * 100, 0, 100, (value: number) => placeFocus(value / 100, cy, current.width, current.height)],
        ["focusY", cy * 100, 0, 100, (value: number) => placeFocus(cx, value / 100, current.width, current.height)],
        ["focusWidth", Math.round(current.width * 100), 5, 100, (value: number) => placeFocus(cx, cy, value / 100, current.height)],
        ["focusHeight", Math.round(current.height * 100), 5, 100, (value: number) => placeFocus(cx, cy, current.width, value / 100)],
      ] as const).map(([label, value, min, max, update]) => <label key={label}>{t[label]} <span>{Math.round(value)}%</span>
        <input type="range" min={min} max={max} step="any" value={value} onChange={event => change(update(Number(event.target.value)))} />
      </label>)}
    </div>
    <button className="secondary full-width" disabled={busy || !online || !text.trim()} aria-describedby={privacyId} onClick={() => void suggest()}>{busy ? t.focusSuggesting : t.focusSuggest}</button>
    <p id={privacyId} className="focus-hint">{t.focusPrivacy}</p>
    <div role="status" className="focus-status">{busy ? t.focusSuggesting : status ? t[status] : ""}</div>
    <div className="focus-actions"><button className="text-button" disabled={!region} onClick={() => change(null)}>{t.focusRemove}</button><button className="secondary" onClick={close}>{t.focusCancel}</button><button className="primary" disabled={!region && !initial} onClick={() => save(region)}>{t.focusSave}</button></div>
  </dialog>;
}
