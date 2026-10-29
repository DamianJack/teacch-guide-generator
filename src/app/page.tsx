"use client";
/* eslint-disable @next/next/no-img-element -- Photos are private local blob URLs, never optimizer requests. */
/* eslint-disable react-hooks/set-state-in-effect -- Initialize browser preferences and manage object URL lifetimes after hydration. */

import { useEffect, useRef, useState } from "react";
import { approvalIssues, listedMaterials, showMaterials, editDraft, generationSchema, headings, id, LIMITS, move, newDraft, newStep, photosInStepOrder, sameRevision, usedPhotos, type Draft, type Language, type Step } from "../lib/guide";
import { dataUrl, loadDraft, preparePhoto, saveDraft } from "../lib/storage";
import { copy } from "../lib/copy";
import { SpeechField } from "../components/speech-field";

const Icon = {
  up: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>,
  down: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>,
  trash: <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>,
  camera: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  gallery: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /></svg>,
  close: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
};
type Message = "imageError" | "photoLimit" | "configured" | "aiError" | "staleResponse" | "limitError" | "pdfError" | "offlineAI";
function PhotoDialog({ src, alt, label, close }: { src: string; alt: string; label: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="photo-modal" aria-label={label} onCancel={close}><button autoFocus onClick={close}>{label} ×</button><img src={src} alt={alt} /></dialog>;
}
function exampleDraft(language: Language) {
  const d = newDraft(language); d.example = true;
  const de = language === "de";
  const steps = de ? ["Stelle die leere Schachtel auf den Tisch.", "Lege 4 Schrauben hinein.", "Lege 4 Unterlegscheiben hinein.", "Prüfe die Mengen.", "Schließe die Schachtel."]
    : ["Put the empty box on the table.", "Put 4 screws in the box.", "Put 4 washers in the box.", "Check the amounts.", "Close the box."];
  return { ...d, steps: steps.map(text => newStep(text)), title: de ? "Ein Materialset packen" : "Pack one materials kit",
    materials: [{ id: id(), name: de ? "Schachtel" : "Box", quantity: "1", unit: de ? "Stück" : "piece" }, { id: id(), name: de ? "Schraube" : "Screw", quantity: "4", unit: de ? "Stück" : "pieces" }, { id: id(), name: de ? "Unterlegscheibe" : "Washer", quantity: "4", unit: de ? "Stück" : "pieces" }],
    notes: "" };
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en"); const t = copy[language];
  const [draft, setDraft] = useState<Draft | null>(null); const current = useRef<Draft | null>(null);
  const [ready, setReady] = useState(false); const [loadError, setLoadError] = useState(false);
  const [started, setStarted] = useState(false); const [area, setArea] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [retry, setRetry] = useState(0); const saveQueue = useRef(Promise.resolve()); const saveVersion = useRef(0);
  const [online, setOnline] = useState(true); const [busy, setBusy] = useState(false); const requestBusy = useRef(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [manual, setManual] = useState(false);
  const [exporting, setExporting] = useState(false); const [photoBusy, setPhotoBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({}); const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [scrollToStep, setScrollToStep] = useState<string | null>(null);

  useEffect(() => {
    try { const stored = localStorage.getItem("interface-language"); if (stored === "en" || stored === "de") setLanguage(stored); } catch { /* Interface preference is optional. */ }
    const update = () => setOnline(navigator.onLine); update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem("interface-language", language); } catch { /* Draft storage is independent. */ } }, [language]);
  useEffect(() => {
    let active = true;
    loadDraft().then(saved => { if (active) { current.current = saved; setDraft(saved); setReady(true); setLoadError(false); } }).catch(() => { if (active) { setLoadError(true); setReady(true); } });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!draft) return;
    const version = ++saveVersion.current;
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      try { await saveDraft(draft); if (version === saveVersion.current) setSaveState("saved"); }
      catch { if (version === saveVersion.current) setSaveState("unsaved"); }
    });
  }, [draft]);
  const photos = draft?.photos;
  useEffect(() => {
    const next = Object.fromEntries((photos ?? []).map(p => [p.id, URL.createObjectURL(p.blob)])); setUrls(next);
    return () => Object.values(next).forEach(url => URL.revokeObjectURL(url));
  }, [photos]);
  useEffect(() => {
    if (!scrollToStep) return;
    document.getElementById(`step-${scrollToStep}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); setScrollToStep(null);
  }, [scrollToStep]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saveState !== "saved") event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  function store(next: Draft, content = true) {
    current.current = next; setSaveState("saving"); setDraft(next);
    if (content) setManual(false);
  }
  function edit(patch: Partial<Draft>) { if (current.current) store(editDraft(current.current, patch)); }
  function begin(example = false) {
    if ((current.current || loadError) && !window.confirm(t.replaceConfirm)) return;
    store(example ? exampleDraft(language) : newDraft(language)); setStarted(true); setArea(0); setMessage(null); setLoadError(false);
  }
  function navigate(next: number) {
    setArea(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function editSteps(steps: Step[]) { if (current.current) edit({ steps, photos: usedPhotos(current.current.photos, steps) }); }
  function addStep(at = current.current?.steps.length ?? 0, photoIds: string[] = []) {
    if (!current.current) return;
    const step = { ...newStep(), photoIds }; const steps = [...current.current.steps]; steps.splice(at, 0, step);
    edit({ steps }); setScrollToStep(step.id);
  }
  async function upload(files: FileList | null, stepId: string) {
    if (!files?.length || !current.current) return;
    const snapshot = current.current; setPhotoBusy(true); setMessage(null);
    if (snapshot.photos.length + files.length > LIMITS.photos) { setMessage("photoLimit"); setPhotoBusy(false); return; }
    try {
      const prepared = await Promise.all(Array.from(files).map(file => preparePhoto(file)));
      const latest = current.current;
      if (!latest || latest.id !== snapshot.id || !latest.steps.some(s => s.id === stepId)) return;
      if (latest.photos.length + prepared.length > LIMITS.photos) { setMessage("photoLimit"); return; }
      edit({ photos: [...latest.photos, ...prepared], steps: latest.steps.map(s => s.id === stepId ? { ...s, photoIds: [...s.photoIds, ...prepared.map(p => p.id)] } : s) });
    } catch { setMessage("imageError"); } finally { setPhotoBusy(false); }
  }
  async function generate() {
    const snapshot = current.current;
    if (!snapshot || requestBusy.current || !snapshot.photos.length) return;
    if (!navigator.onLine) { setMessage("offlineAI"); return; }
    requestBusy.current = true; setBusy(true); setMessage(null);
    try {
      const photoData = await Promise.all(photosInStepOrder(snapshot).map(async p => ({ id: p.id, data: await dataUrl(p.blob) })));
      const { language, title, notes, materials, noMaterials } = snapshot;
      const body = JSON.stringify({ facts: { language, title, notes, materials, noMaterials }, photos: photoData, steps: snapshot.steps });
      if (new Blob([body]).size > LIMITS.requestBytes) { setMessage("limitError"); return; }
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(65_000) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error === "configuration" ? "configured" : result.error === "limit" ? "limitError" : "aiError"); return; }
      if (!current.current || !sameRevision(current.current, snapshot)) { setMessage("staleResponse"); return; }
      const generated = generationSchema.parse(result);
      if (generated.steps.some(g => !snapshot.steps.some(s => s.id === g.stepId))) throw new Error("step");
      const texts = new Map(generated.steps.map(g => [g.stepId, g.text.trim()]));
      store(editDraft(snapshot, { steps: snapshot.steps.map(s => ({ ...s, text: texts.get(s.id) || s.text })) }));
      navigate(1);
    } catch { setMessage("aiError"); } finally { requestBusy.current = false; setBusy(false); }
  }
  const issueLabels = { steps: t.noSteps, stepContent: t.stepContent };
  const issues = draft ? approvalIssues(draft) : [];
  const approved = !!draft && draft.approvedRevision === draft.revision;
  const h = headings[draft?.language ?? "en"];
  const hasContent = !!draft && (!!draft.title || !!draft.notes || !!draft.materials.length || draft.steps.some(s => !!s.text || !!s.photoIds.length) || draft.noMaterials);
  const speechLanguage = { language: draft?.language ?? "en", uiLanguage: language };
  function stepCard(s: Step, index: number, capture: boolean) {
    const label = `${t.step} ${index + 1}`; const full = photoBusy || draft!.photos.length >= LIMITS.photos;
    return <article className="step-editor" id={`step-${s.id}`} key={s.id}>
      <div className="step-editor-heading"><h3><span className="step-number">{index + 1}</span>{label}</h3><div className="step-tools">{stepButtons(index)}<button type="button" className="tool-danger" aria-label={`${t.remove}: ${label}`} onClick={() => { if (window.confirm(t.deleteStep)) editSteps(draft!.steps.filter(x => x.id !== s.id)); }}>{Icon.trash}</button></div></div>
      <div className={`step-photos ${s.photoIds.length ? "" : "empty"}`}>{s.photoIds.map((pid, pi) => <div className="step-photo" key={pid}>
        <button className="photo-preview" onClick={() => setViewPhoto(pid)} aria-label={`${t.viewPhoto}: ${label}, ${t.photo} ${pi + 1}`}>{urls[pid] && <img src={urls[pid]} alt={`${label}, ${t.photo} ${pi + 1}`} />}</button>
        <button className="icon-button danger" aria-label={`${t.remove}: ${label}, ${t.photo} ${pi + 1}`} onClick={() => { if (window.confirm(t.deletePhoto)) editSteps(draft!.steps.map(x => x.id === s.id ? { ...x, photoIds: x.photoIds.filter(other => other !== pid) } : x)); }}>{Icon.close}</button>
      </div>)}
        <label className="photo-add file-button">{Icon.camera}<span>{s.photoIds.length ? t.cameraMore : t.camera}</span><input aria-label={`${t.camera}: ${label}`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={full} onChange={e => { void upload(e.target.files, s.id); e.target.value = ""; }} /></label>
      </div>
      <label className="file-link">{Icon.gallery}{t.choose}<input aria-label={`${t.choose}: ${label}`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={full} onChange={e => { void upload(e.target.files, s.id); e.target.value = ""; }} /></label>
      <SpeechField {...speechLanguage} label={`${capture ? t.stepNote : t.action} · ${label}`} maxLength={600} rows={capture ? 2 : 3} value={s.text} onChange={value => edit({ steps: draft!.steps.map(x => x.id === s.id ? { ...x, text: value } : x) })} />
      {!capture && <div className="step-footer"><button className="text-button" disabled={draft!.steps.length >= LIMITS.steps} onClick={() => addStep(index + 1, s.photoIds)}>＋ {t.split}</button></div>}
    </article>;
  }
  function stepButtons(index: number) {
    return <><button type="button" disabled={index === 0} onClick={() => edit({ steps: move(draft!.steps, index, -1) })} aria-label={`${t.up}: ${t.step} ${index + 1}`}>{Icon.up}</button><button type="button" disabled={index === draft!.steps.length - 1} onClick={() => edit({ steps: move(draft!.steps, index, 1) })} aria-label={`${t.down}: ${t.step} ${index + 1}`}>{Icon.down}</button></>;
  }

  const aiDisabled = !online || busy || photoBusy || !draft?.photos.length;
  const canApprove = !issues.length && manual && !photoBusy && !busy;
  async function exportPDF() {
    setExporting(true); setMessage(null);
    const snapshot = current.current!;
    try {
      const { downloadGuide } = await import("../components/guide-pdf");
      if (current.current && sameRevision(snapshot, current.current)) await downloadGuide(snapshot);
    } catch { setMessage("pdfError"); } finally { setExporting(false); }
  }

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setStarted(false)}><span className="brand-icon" aria-hidden="true">▥</span>{t.brand}</button>
      <div className="top-actions">
        {!online && <span className="offline-status" role="status">{t.offline}</span>}
        <div className="language-toggle" role="group" aria-label={t.uiLanguage}>{(["en", "de"] as const).map(l => <button key={l} type="button" aria-pressed={language === l} onClick={() => setLanguage(l)}>{l.toUpperCase()}</button>)}</div>
      </div>
    </header>
    {!ready ? <main className="welcome"><p role="status">{t.loading}</p></main> : !started || !draft ? <main className="welcome">
      <div className="welcome-symbol" aria-hidden="true">▧</div>
      <h1>{t.welcome}</h1>
      {loadError && <div className="alert" role="alert">{t.loadError}<button onClick={() => { setReady(false); setRetry(n => n + 1); }}>{t.retry}</button></div>}
      <div className="welcome-actions">
        {draft && <button className="primary" onClick={() => { setStarted(true); navigate(draft.steps.some(s => s.text.trim()) ? 1 : 0); }}>{t.resume} <span>→</span></button>}
        <button className={draft ? "secondary" : "primary"} onClick={() => begin()}>{t.start}<span>＋</span></button>
        <button className="text-button" onClick={() => begin(true)}>{t.example}</button>
      </div>
      <details className="welcome-info"><summary>{t.storageInfo}</summary><p>{t.local}</p></details>
    </main> : <main className="workspace-main">
      <nav className="workflow-tabs" aria-label={t.workspace}>
        {[t.describe, t.edit, t.review].map((label, index) => <button key={index} className={area === index ? "active" : ""} aria-current={area === index ? "step" : undefined} onClick={() => navigate(index)}><span>{index + 1}</span>{label}</button>)}
      </nav>
      <div className="page-heading"><h1>{[t.stage1, t.stage2, t.stage3][area]}</h1><div className="save-status" role="status"><span className={saveState === "unsaved" ? "error-text" : ""}>{saveState === "saved" ? "✓ " : "◌ "}{t[saveState]}</span>{saveState === "unsaved" && <button className="text-button" onClick={() => store({ ...draft }, false)}>{t.retry}</button>}</div></div>
      {message && <div className="alert" role="alert">{t[message]}</div>}
      {draft.example && <p className="example-note">{t.exampleBadge}</p>}
      {area === 0 && <>
        <section className="task-fields"><div className="instruction-language" title={hasContent ? t.languageLocked : undefined}><label htmlFor="instruction-language">{t.language}</label><select id="instruction-language" value={draft.language} disabled={hasContent} onChange={e => edit({ language: e.target.value as Language })}><option value="en">English</option><option value="de">Deutsch</option></select></div>
          <SpeechField {...speechLanguage} label={t.title} maxLength={160} value={draft.title} onChange={value => edit({ title: value })} />

        </section>
        <section className="photos-section"><div className="section-heading"><h2>{t.steps}</h2><span className="count">{draft.photos.length}/{LIMITS.photos} {t.photos}</span></div>
          <p className="section-hint">{t.stepsHint}</p>
          {draft.steps.map((s, index) => stepCard(s, index, true))}
          <button className="secondary full-width" disabled={draft.steps.length >= LIMITS.steps} onClick={() => addStep()}>＋ {t.addStep}</button>
        </section>
        <details className="task-details"><summary><span>{t.taskDetails}</span><span className="detail-status">{t.optional}</span></summary><div className="details-content">
          <div className="subheading"><h3>{t.materials}</h3><label className="checkbox-label"><input type="checkbox" checked={draft.noMaterials} onChange={e => edit({ noMaterials: e.target.checked })} />{t.noMaterials}</label></div>
          {!draft.noMaterials && <><div className="materials-list">{draft.materials.map((m, index) => <div className="material-row" key={m.id}>
            <SpeechField {...speechLanguage} label={`${t.material} ${index + 1}`} value={m.name} maxLength={100} onChange={value => edit({ materials: draft.materials.map(x => x.id === m.id ? { ...x, name: value } : x) })} />
            <button className="icon-button danger" aria-label={`${t.remove}: ${t.material} ${index + 1}`} onClick={() => edit({ materials: draft.materials.filter(x => x.id !== m.id) })}>×</button>
            <SpeechField {...speechLanguage} label={t.quantity} value={m.quantity} maxLength={40} onChange={value => edit({ materials: draft.materials.map(x => x.id === m.id ? { ...x, quantity: value } : x) })} />
            <SpeechField {...speechLanguage} label={t.unit} value={m.unit} maxLength={40} onChange={value => edit({ materials: draft.materials.map(x => x.id === m.id ? { ...x, unit: value } : x) })} />
          </div>)}</div><button className="secondary compact" disabled={draft.materials.length >= 24} onClick={() => edit({ materials: [...draft.materials, { id: id(), name: "", quantity: "", unit: "" }] })}>＋ {t.addMaterial}</button></>}
        </div></details>

      </>}
      {area === 1 && <>
        <div className="section-heading"><h2>{t.steps}</h2><span className="count">{draft.steps.length}</span></div>
        {draft.steps.map((s, index) => stepCard(s, index, false))}
        <button className="secondary full-width" disabled={draft.steps.length >= LIMITS.steps} onClick={() => addStep()}>＋ {t.addStep}</button>
      </>}
      {busy && <p className="request-status" role="status">{t.generating}</p>}
      {area === 2 && <>
        <article className="learner-preview" lang={draft.language}>
          {draft.title.trim() && <h2>{draft.title}</h2>}{showMaterials(draft) && <section><h3>{h.materials}</h3>{draft.noMaterials ? <p>{h.none}</p> : <ul className="learner-materials">{listedMaterials(draft).map(m => <li key={m.id}><b>{m.quantity} {m.unit}</b> {m.name}</li>)}</ul>}</section>}
          <section><h3>{h.steps}</h3>{draft.steps.map((s, index) => <div className="learner-step" key={s.id}><h4><span>{index + 1}</span>{h.step} {index + 1}</h4>{s.photoIds.length > 0 && <div className={`learner-photos ${s.photoIds.length > 1 ? "multiple" : ""}`}>{s.photoIds.filter(pid => urls[pid]).map((pid, pi) => <img key={pid} src={urls[pid]} alt={`${h.step} ${index + 1}, ${pi + 1}`} />)}</div>}{s.text.trim() && <p>{s.text}</p>}</div>)}</section>
        </article>
        <section className="approval-panel">
          {issues.length > 0 && <div className="validation"><strong>{t.missing}</strong><ul>{issues.map(issue => <li key={issue}>{issueLabels[issue as keyof typeof issueLabels]}</li>)}</ul><button className="text-button" onClick={() => navigate(0)}>{t.fixMissing} →</button></div>}
          <label className="checkbox-label"><input type="checkbox" checked={manual || approved} disabled={approved} onChange={e => setManual(e.target.checked)} />{t.manual}</label>
          {approved && <p className="approval-status">✓ {t.approved}</p>}
        </section>
      </>}
      <details className="draft-options"><summary>{t.draftOptions}</summary><p>{t.local}</p><button className="text-button danger" disabled={photoBusy} onClick={() => begin()}>{t.new}</button></details>
      <div className="action-dock">
        {area === 0 ? <><button className="text-button" onClick={() => navigate(1)}>{t.manualEdit}</button><button className="primary" disabled={aiDisabled} onClick={() => void generate()}>{busy ? t.generating : t.generate}<span aria-hidden="true">→</span></button></> : area === 1 ? <><button className="text-button" onClick={() => navigate(0)}>← {t.back}</button><button className="primary" onClick={() => navigate(2)}>{t.preview} <span aria-hidden="true">→</span></button></> : <><button className="text-button" onClick={() => navigate(1)}>← {t.edit}</button>{approved ? <button className="primary" disabled={exporting || saveState !== "saved"} onClick={() => void exportPDF()}>{exporting ? t.exporting : t.download}<span aria-hidden="true">↓</span></button> : <button className="primary" disabled={!canApprove} onClick={() => { const latest = current.current; if (latest && !approvalIssues(latest).length) store({ ...latest, approvedRevision: latest.revision }, false); }}>{t.approve} <span aria-hidden="true">✓</span></button>}</>}
      </div>
    </main>}
    {viewPhoto && urls[viewPhoto] && <PhotoDialog src={urls[viewPhoto]} alt={draft?.photos.find(p => p.id === viewPhoto)?.name ?? t.photo} label={t.close} close={() => setViewPhoto(null)} />}
  </div>;
}
