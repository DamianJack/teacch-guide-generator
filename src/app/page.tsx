"use client";
/* eslint-disable @next/next/no-img-element -- Photos are private local blob URLs, never optimizer requests. */
/* eslint-disable react-hooks/set-state-in-effect -- Initialize browser preferences and manage object URL lifetimes after hydration. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { approvalIssues, editDraft, generationSchema, headings, id, LIMITS, move, newDraft, reviewSchema, sameRevision, type Draft, type Language } from "../lib/guide";
import { dataUrl, loadDraft, preparePhoto, saveDraft } from "../lib/storage";
import { copy } from "../lib/copy";

type Message = "imageError" | "photoLimit" | "configured" | "aiError" | "staleResponse" | "limitError" | "pdfError" | "offlineAI";
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function PhotoDialog({ src, alt, label, close }: { src: string; alt: string; label: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="photo-modal" aria-label={label} onCancel={close}><button autoFocus onClick={close}>{label} ×</button><img src={src} alt={alt} /></dialog>;
}
function exampleDraft(language: Language) {
  const d = newDraft(language); d.example = true;
  const de = language === "de";
  return { ...d, title: de ? "Ein Materialset packen" : "Pack one materials kit",
    materials: [{ id: id(), name: de ? "Schachtel" : "Box", quantity: "1", unit: de ? "Stück" : "piece" }, { id: id(), name: de ? "Schraube" : "Screw", quantity: "4", unit: de ? "Stück" : "pieces" }, { id: id(), name: de ? "Unterlegscheibe" : "Washer", quantity: "4", unit: de ? "Stück" : "pieces" }],
    notes: de ? "Stelle die leere Schachtel auf den Tisch. Lege 4 Schrauben hinein. Lege 4 Unterlegscheiben hinein. Prüfe die Mengen. Schließe die Schachtel." : "Put the empty box on the table. Put 4 screws in the box. Put 4 washers in the box. Check the amounts. Close the box.",
    finished: de ? "Die geschlossene Schachtel enthält 4 Schrauben und 4 Unterlegscheiben." : "The closed box contains 4 screws and 4 washers.",
    next: de ? "Lege die Schachtel in die Ablage für fertige Sets." : "Put the box in the finished-kits tray.",
    help: de ? "Wenn etwas fehlt oder unklar ist, frage die Fachkraft." : "If anything is missing or unclear, ask your trainer." };
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en"); const t = copy[language];
  const [draft, setDraft] = useState<Draft | null>(null); const current = useRef<Draft | null>(null);
  const [ready, setReady] = useState(false); const [loadError, setLoadError] = useState(false);
  const [started, setStarted] = useState(false); const [area, setArea] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [retry, setRetry] = useState(0); const saveQueue = useRef(Promise.resolve()); const saveVersion = useRef(0);
  const [online, setOnline] = useState(true); const [busy, setBusy] = useState<"generate" | "check" | null>(null); const requestBusy = useRef(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [manual, setManual] = useState(false); const [answersReviewed, setAnswersReviewed] = useState(false);
  const [exporting, setExporting] = useState(false); const [photoBusy, setPhotoBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({}); const [viewPhoto, setViewPhoto] = useState<string | null>(null);

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
    const warn = (event: BeforeUnloadEvent) => { if (saveState !== "saved") event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  function store(next: Draft, content = true) {
    current.current = next; setSaveState("saving"); setDraft(next);
    if (content) { setManual(false); setAnswersReviewed(false); }
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
  async function upload(files: FileList | null, replaceId?: string) {
    if (!files?.length || !current.current) return;
    const snapshot = current.current; setPhotoBusy(true); setMessage(null);
    if (!replaceId && snapshot.photos.length + files.length > LIMITS.photos) { setMessage("photoLimit"); setPhotoBusy(false); return; }
    try {
      const prepared = await Promise.all(Array.from(files).map(file => preparePhoto(file, replaceId)));
      const latest = current.current;
      if (!latest || latest.id !== snapshot.id) return;
      if (!replaceId && latest.photos.length + prepared.length > LIMITS.photos) { setMessage("photoLimit"); return; }
      edit({ photos: replaceId ? latest.photos.map(p => p.id === replaceId ? prepared[0] : p) : [...latest.photos, ...prepared] });
    } catch { setMessage("imageError"); } finally { setPhotoBusy(false); }
  }
  async function ai(mode: "generate" | "check") {
    const snapshot = current.current;
    if (!snapshot || requestBusy.current || !snapshot.photos.length) return;
    if (!navigator.onLine) { setMessage("offlineAI"); return; }
    if (mode === "generate" && snapshot.steps.length && !window.confirm(t.regenerateConfirm)) return;
    requestBusy.current = true; setBusy(mode); setMessage(null);
    try {
      const photoData = await Promise.all(snapshot.photos.map(async p => ({ id: p.id, data: await dataUrl(p.blob) })));
      const { language, title, notes, materials, noMaterials, finished, next, help } = snapshot;
      const body = JSON.stringify({ facts: { language, title, notes, materials, noMaterials, finished, next, help }, photos: photoData, steps: snapshot.steps, questions: snapshot.questions });
      if (new Blob([body]).size > LIMITS.requestBytes) { setMessage("limitError"); return; }
      const response = await fetch(`/api/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(65_000) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error === "configuration" ? "configured" : result.error === "limit" ? "limitError" : "aiError"); return; }
      if (!current.current || !sameRevision(current.current, snapshot)) { setMessage("staleResponse"); return; }
      if (mode === "generate") {
        const generated = generationSchema.parse(result);
        if (generated.steps.some(s => !snapshot.photos.some(p => p.id === s.photoId))) throw new Error("photo");
        store(editDraft(snapshot, { ...generated, steps: generated.steps.map(s => ({ ...s, id: id() })), questions: generated.questions.map(question => ({ question, answer: "" })), review: null }));
        navigate(1);
      } else {
        const checked = reviewSchema.parse(result);
        const questions = [...snapshot.questions];
        for (const question of checked.questions) if (!questions.some(q => q.question === question)) questions.push({ question, answer: "" });
        if (questions.length > 20) throw new Error("questions");
        const next = questions.length !== snapshot.questions.length ? editDraft(snapshot, { questions }) : snapshot;
        store({ ...next, review: { revision: next.revision, suggestions: checked.suggestions.map(s => ({ ...s, dismissed: false })) } }, false);
      }
    } catch { setMessage("aiError"); } finally { requestBusy.current = false; setBusy(null); }
  }
  const issueLabels = { title: t.titleMissing, materials: t.materialsMissing, finished: t.finished, next: t.next, help: t.help, steps: t.noSteps, stepContent: t.stepContent, questions: t.questionsMissing };
  const issues = draft ? approvalIssues(draft) : [];
  const approved = !!draft && draft.approvedRevision === draft.revision;
  const h = headings[draft?.language ?? "en"];
  const hasContent = !!draft && (!!draft.title || !!draft.notes || !!draft.materials.length || !!draft.photos.length || !!draft.steps.length || !!draft.finished || !!draft.next || !!draft.help || draft.noMaterials);
  function completionFields() {
    return <div className="completion-fields">{(["finished", "next", "help"] as const).map(field => <Field key={field} label={t[field]}><textarea maxLength={1000} rows={2} value={draft![field]} onChange={e => edit({ [field]: e.target.value })} /></Field>)}</div>;
  }
  function stepButtons(index: number) {
    return <><button type="button" disabled={index === 0} onClick={() => edit({ steps: move(draft!.steps, index, -1) })} aria-label={`${t.up}: ${t.step} ${index + 1}`}>↑</button><button type="button" disabled={index === draft!.steps.length - 1} onClick={() => edit({ steps: move(draft!.steps, index, 1) })} aria-label={`${t.down}: ${t.step} ${index + 1}`}>↓</button></>;
  }

  const aiDisabled = !online || !!busy || photoBusy || !draft?.photos.length;
  const canApprove = !issues.length && manual && (!draft?.questions.length || answersReviewed) && !photoBusy && !busy;
  const detailsMissing = issues.filter(issue => ["materials", "finished", "next", "help"].includes(issue)).length;
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
        <label className="language-control"><span className="sr-only">{t.uiLanguage}</span><select value={language} onChange={e => setLanguage(e.target.value as Language)}><option value="en">EN</option><option value="de">DE</option></select></label>
      </div>
    </header>
    {!ready ? <main className="welcome"><p role="status">{t.loading}</p></main> : !started || !draft ? <main className="welcome">
      <div className="welcome-symbol" aria-hidden="true">▧<span>1 · 2 · 3</span></div>
      <h1>{t.welcome}</h1><p className="lead">{t.intro}</p>
      {loadError && <div className="alert" role="alert">{t.loadError}<button onClick={() => { setReady(false); setRetry(n => n + 1); }}>{t.retry}</button></div>}
      <div className="welcome-actions">
        {draft && <button className="primary" onClick={() => { setStarted(true); navigate(draft.steps.length ? 1 : 0); }}>{t.resume} <span>→</span></button>}
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
      {draft.example && <details className="example-note"><summary>{t.exampleBadge}</summary><p>{t.exampleNote}</p></details>}
      {area === 0 && <>
        <section className="task-fields"><div className="instruction-language" title={hasContent ? t.languageLocked : undefined}><label htmlFor="instruction-language">{t.language}</label><select id="instruction-language" value={draft.language} disabled={hasContent} onChange={e => edit({ language: e.target.value as Language })}><option value="en">English</option><option value="de">Deutsch</option></select></div>
          <Field label={t.title}><input maxLength={160} placeholder={t.titlePlaceholder} value={draft.title} onChange={e => edit({ title: e.target.value })} /></Field>
          <Field label={t.notes}><textarea maxLength={5000} rows={3} placeholder={t.notesHint} value={draft.notes} onChange={e => edit({ notes: e.target.value })} /></Field>

        </section>
        <section className="photos-section"><div className="section-heading"><h2>{t.photos}</h2><span className="count">{draft.photos.length}/12</span></div>
          <div className="photo-grid">{draft.photos.map((p, index) => <article className="photo-card" key={p.id}>
            <button className="photo-preview" aria-label={`${t.viewPhoto} ${index + 1}`} onClick={() => setViewPhoto(p.id)}><img src={urls[p.id]} alt={`${t.photo} ${index + 1}: ${p.name}`} /></button>
            <div className="photo-card-heading"><span>{t.photo} {index + 1}</span><details className="photo-actions"><summary>{t.editPhoto}</summary><div className="photo-action-list">
              <div className="button-row"><button aria-label={`${t.up}: ${t.photo} ${index + 1}`} disabled={index === 0} onClick={() => edit({ photos: move(draft.photos, index, -1) })}>↑</button><button aria-label={`${t.down}: ${t.photo} ${index + 1}`} disabled={index === draft.photos.length - 1} onClick={() => edit({ photos: move(draft.photos, index, 1) })}>↓</button></div>
              <label className="file-button secondary">{t.replace}<input aria-label={`${t.replace}: ${t.photo} ${index + 1}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={e => { void upload(e.target.files, p.id); e.target.value = ""; }} /></label>
              <button className="text-button danger" onClick={() => { if (window.confirm(t.deletePhoto)) edit({ photos: draft.photos.filter(x => x.id !== p.id), steps: draft.steps.map(s => s.photoId === p.id ? { ...s, photoId: "" } : s) }); }}>{t.remove}</button>
            </div></details></div>
          </article>)}</div>
          <div className={`photo-upload ${draft.photos.length ? "has-photos" : ""}`}>
            {!draft.photos.length && <span className="capture-symbol" aria-hidden="true">▧</span>}
            <div className="upload-buttons"><label className="file-button primary">＋ {t.camera}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={photoBusy || draft.photos.length >= 12} onChange={e => { void upload(e.target.files); e.target.value = ""; }} /></label><label className="file-button secondary">{t.choose}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photoBusy || draft.photos.length >= 12} onChange={e => { void upload(e.target.files); e.target.value = ""; }} /></label></div>
            {!draft.photos.length && <p className="hint">{t.privacy}</p>}
          </div>
          <details className="help-details"><summary>{t.photoHelp}</summary><p>{t.photosHint} {t.cameraHint}</p></details>
        </section>
        <details className="task-details"><summary><span>{t.taskDetails}</span><span className="detail-status">{detailsMissing ? `${detailsMissing} ${t.toComplete}` : "✓"}</span></summary><div className="details-content">
          <div className="subheading"><h3>{t.materials}</h3><label className="checkbox-label"><input type="checkbox" checked={draft.noMaterials} onChange={e => edit({ noMaterials: e.target.checked })} />{t.noMaterials}</label></div>
          {!draft.noMaterials && <><div className="materials-list">{draft.materials.map((m, index) => <div className="material-row" key={m.id}>
            <Field label={`${t.material} ${index + 1}`}><input value={m.name} maxLength={100} onChange={e => edit({ materials: draft.materials.map(x => x.id === m.id ? { ...x, name: e.target.value } : x) })} /></Field>
            <button className="icon-button danger" aria-label={`${t.remove}: ${t.material} ${index + 1}`} onClick={() => edit({ materials: draft.materials.filter(x => x.id !== m.id) })}>×</button>
            <Field label={t.quantity}><input value={m.quantity} maxLength={40} onChange={e => edit({ materials: draft.materials.map(x => x.id === m.id ? { ...x, quantity: e.target.value } : x) })} /></Field>
            <Field label={t.unit}><input value={m.unit} maxLength={40} onChange={e => edit({ materials: draft.materials.map(x => x.id === m.id ? { ...x, unit: e.target.value } : x) })} /></Field>
          </div>)}</div><button className="secondary compact" disabled={draft.materials.length >= 24} onClick={() => edit({ materials: [...draft.materials, { id: id(), name: "", quantity: "", unit: "" }] })}>＋ {t.addMaterial}</button></>}
          {completionFields()}
        </div></details>

      </>}
      {area === 1 && <>
        <div className="section-heading"><h2>{t.steps}</h2><span className="count">{draft.steps.length}</span></div>
        {!draft.steps.length && <p className="empty-state">{t.emptySteps}</p>}
        {draft.steps.map((s, index) => <article className="step-editor" key={s.id}>
          <div className="step-editor-heading"><h3><span className="step-number">{index + 1}</span>{t.step} {index + 1}</h3><div className="button-row">{stepButtons(index)}</div></div>
          {s.photoId && urls[s.photoId] && <button className="step-thumb" onClick={() => setViewPhoto(s.photoId)} aria-label={`${t.viewPhoto}: ${t.step} ${index + 1}`}><img src={urls[s.photoId]} alt={`${t.step} ${index + 1}`} /></button>}
          <Field label={`${t.photo} · ${t.step} ${index + 1}`}><select value={s.photoId} onChange={e => edit({ steps: draft.steps.map(x => x.id === s.id ? { ...x, photoId: e.target.value } : x) })}><option value="">{t.noPhoto}</option>{draft.photos.map((p, pi) => <option value={p.id} key={p.id}>{t.photo} {pi + 1} · {p.name}</option>)}</select></Field>
          <Field label={`${t.action} · ${t.step} ${index + 1}`}><textarea maxLength={600} rows={3} placeholder={t.actionPlaceholder} value={s.text} onChange={e => edit({ steps: draft.steps.map(x => x.id === s.id ? { ...x, text: e.target.value } : x) })} /></Field>
          <div className="step-footer"><button className="text-button" disabled={draft.steps.length >= LIMITS.steps} onClick={() => { const steps = [...draft.steps]; steps.splice(index + 1, 0, { id: id(), text: "", photoId: s.photoId }); edit({ steps }); }}>＋ {t.split}</button><button className="text-button danger" onClick={() => { if (window.confirm(t.deleteStep)) edit({ steps: draft.steps.filter(x => x.id !== s.id) }); }}>{t.remove}</button></div>
        </article>)}
        <button className="secondary full-width" disabled={draft.steps.length >= LIMITS.steps} onClick={() => edit({ steps: [...draft.steps, { id: id(), text: "", photoId: "" }] })}>＋ {t.addStep}</button>
        <details className="task-details"><summary>{t.completion}</summary><div className="details-content">{completionFields()}</div></details>
        <details className="ai-tools"><summary><span>{t.check}</span><span className="detail-status">{draft.review && draft.review.revision === draft.revision ? "✓" : ""}</span></summary><div className="details-content">
          <p className="hint">{t.qualityHint}</p>
          {!draft.review ? <p className="hint">{t.noCheck}</p> : draft.review.revision !== draft.revision ? <p className="stale-note">{t.staleCheck}</p> : <div className="check-results"><strong className="check-success">✓ {t.checked}</strong>{!draft.review.suggestions.length && <p>{t.noSuggestions}</p>}{draft.review.suggestions.map((s, index) => <div className={`suggestion ${s.dismissed ? "dismissed" : ""}`} key={index}><b>{draft.steps.findIndex(step => step.id === s.target) >= 0 ? `${t.step} ${draft.steps.findIndex(step => step.id === s.target) + 1}` : t[s.target as "title" | "materials" | "finished" | "next" | "help"]}</b><p>{s.issue}</p><button className="text-button" disabled={s.dismissed} onClick={() => store({ ...draft, review: { ...draft.review!, suggestions: draft.review!.suggestions.map((item, i) => i === index ? { ...item, dismissed: true } : item) } }, false)}>{s.dismissed ? t.dismissed : t.dismiss}</button></div>)}</div>}
          <p className="hint">{t.consent}</p><div className="button-row"><button className="secondary" disabled={aiDisabled || !draft.steps.length} onClick={() => void ai("check")}>{busy === "check" ? t.checking : t.check}</button><button className="text-button" disabled={aiDisabled} onClick={() => void ai("generate")}>{t.regenerate}</button></div>
        </div></details>
      </>}
      {draft.questions.length > 0 && area !== 2 && <section className="questions-panel"><h2>{t.questions}</h2>{draft.questions.map((q, index) => <Field label={q.question} key={index}><textarea maxLength={1000} rows={2} placeholder={t.answer} value={q.answer} onChange={e => edit({ questions: draft.questions.map((item, i) => i === index ? { ...item, answer: e.target.value } : item) })} /></Field>)}</section>}
      {busy && <p className="request-status" role="status">{busy === "generate" ? t.generating : t.checking}</p>}
      {area === 2 && <>
        <article className="learner-preview" lang={draft.language}>
          <h2>{draft.title || "—"}</h2><section><h3>{h.materials}</h3>{draft.noMaterials ? <p>{h.none}</p> : <ul className="learner-materials">{draft.materials.map(m => <li key={m.id}><b>{m.quantity} {m.unit}</b> {m.name}</li>)}</ul>}</section>
          <section><h3>{h.steps}</h3>{draft.steps.map((s, index) => <div className="learner-step" key={s.id}><h4><span>{index + 1}</span>{h.step} {index + 1}</h4>{urls[s.photoId] && <img src={urls[s.photoId]} alt={`${h.step} ${index + 1}`} />}<p>{s.text || "—"}</p></div>)}</section>
          <div className="learner-completion">{(["finished", "next", "help"] as const).map(field => <section key={field}><h3>{h[field]}</h3><p>{draft[field] || "—"}</p></section>)}</div>
        </article>
        <section className="approval-panel">
          {issues.length > 0 && <div className="validation"><strong>{t.missing}</strong><ul>{issues.map(issue => <li key={issue}>{issueLabels[issue as keyof typeof issueLabels]}</li>)}</ul><button className="text-button" onClick={() => navigate(issues.some(issue => ["steps", "stepContent", "questions"].includes(issue)) ? 1 : 0)}>{t.fixMissing} →</button></div>}
          {draft.questions.length > 0 && <label className="checkbox-label"><input type="checkbox" checked={answersReviewed} onChange={e => setAnswersReviewed(e.target.checked)} />{t.confirmAnswers}</label>}
          <label className="checkbox-label"><input type="checkbox" checked={manual || approved} disabled={approved} onChange={e => setManual(e.target.checked)} />{t.manual}</label>
          {approved && <p className="approval-status">✓ {t.approved}</p>}
        </section>
      </>}
      <details className="draft-options"><summary>{t.draftOptions}</summary><p>{t.local}</p><button className="text-button danger" disabled={photoBusy} onClick={() => begin()}>{t.new}</button></details>
      <div className="action-dock">
        {area === 0 && <p className="share-note">{t.consent}</p>}
        {area === 0 ? <><button className="text-button" onClick={() => navigate(1)}>{t.manualEdit}</button><button className="primary" disabled={aiDisabled} onClick={() => void ai("generate")}>{busy === "generate" ? t.generating : t.generate}<span aria-hidden="true">→</span></button></> : area === 1 ? <><button className="text-button" onClick={() => navigate(0)}>← {t.back}</button><button className="primary" onClick={() => navigate(2)}>{t.preview} <span aria-hidden="true">→</span></button></> : <><button className="text-button" onClick={() => navigate(1)}>← {t.edit}</button>{approved ? <button className="primary" disabled={exporting || saveState !== "saved"} onClick={() => void exportPDF()}>{exporting ? t.exporting : t.download}<span aria-hidden="true">↓</span></button> : <button className="primary" disabled={!canApprove} onClick={() => { const latest = current.current; if (latest && !approvalIssues(latest).length) store({ ...latest, approvedRevision: latest.revision }, false); }}>{t.approve} <span aria-hidden="true">✓</span></button>}</>}
      </div>
    </main>}
    {viewPhoto && urls[viewPhoto] && <PhotoDialog src={urls[viewPhoto]} alt={draft?.photos.find(p => p.id === viewPhoto)?.name ?? t.photo} label={t.close} close={() => setViewPhoto(null)} />}
  </div>;
}

