/* eslint-disable jsx-a11y/alt-text -- React PDF Image is not an HTML element. */
import { Document, Page, Text, View, Image, Svg, Path, StyleSheet, pdf } from "@react-pdf/renderer";
import { approvalIssues, headings, listedMaterials, showMaterials, type Draft } from "../lib/guide";
import { dataUrl } from "../lib/storage";
import { focusImageData, stepPhotoKey } from "../lib/focus";

/*
  Calm, TEACCH-style A4 guide built from the trainer's own photos:
  - Start page: the task, "What you need" with tick boxes, and an overview of all steps.
  - One page per step: progress pegs, the step's photo(s), one short sentence and a "Done" tick box.
  Soft pale blue and white with dark navy text: no pure black, no red, no bright colours.
*/
const C = { ink: "#14304a", muted: "#3e5366", band: "#dcebf7", soft: "#eef5fb", blue: "#cfe3f5", strong: "#9ec3e3", ring: "#8fb4d6", line: "#d5e2ec" };
const labels = {
  en: { done: "Done", of: "of", plan: "Your steps", tick: "Tick each box when it is ready." },
  de: { done: "Fertig", of: "von", plan: "Deine Schritte", tick: "Hake jedes Kästchen ab, wenn es bereit ist." },
};

const styles = StyleSheet.create({
  page: { paddingBottom: 56, fontFamily: "Helvetica", fontSize: 14, lineHeight: 1.45, color: C.ink, backgroundColor: "#ffffff" },
  band: { backgroundColor: C.band, paddingVertical: 30, paddingHorizontal: 42 },
  bandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  body: { paddingHorizontal: 42, paddingTop: 26 },
  eyebrow: { fontSize: 12, color: C.muted, marginBottom: 6 },
  title: { fontSize: 30, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  stepCount: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  heading: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 18, marginBottom: 16 },
  softCard: { backgroundColor: C.soft, borderRadius: 14, padding: 18, marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  box: { width: 22, height: 22, borderWidth: 2, borderColor: C.ring, borderRadius: 5, marginRight: 12, backgroundColor: "#ffffff" },
  qty: { fontFamily: "Helvetica-Bold", marginRight: 6 },
  tick: { fontSize: 11, color: C.muted, marginTop: 4 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.blue, borderWidth: 1.5, borderColor: C.strong, marginRight: 12, alignItems: "center", justifyContent: "center" },
  numText: { fontSize: 13, fontFamily: "Helvetica-Bold", lineHeight: 1 },
  pegs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", backgroundColor: "#ffffff", borderRadius: 18, paddingVertical: 6, paddingHorizontal: 8, maxWidth: 280 },
  photoBox: { backgroundColor: C.soft, borderRadius: 18, padding: 10, marginBottom: 24 },
  image: { width: "100%", height: 360, objectFit: "contain", borderRadius: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  gridImage: { width: "49%", height: 170, objectFit: "contain", borderRadius: 10, marginBottom: 8 },
  action: { fontSize: 30, fontFamily: "Helvetica-Bold", lineHeight: 1.3, marginBottom: 28 },
  doneRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1.5, borderColor: C.strong, backgroundColor: C.soft, borderRadius: 24, paddingVertical: 10, paddingLeft: 12, paddingRight: 24 },
  bigBox: { width: 34, height: 34, borderWidth: 2.5, borderColor: C.ring, borderRadius: 8, marginRight: 14, backgroundColor: "#ffffff" },
  doneText: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", fontSize: 10, color: C.muted },
});

function Check({ size = 10 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5 12l5 5L20 7" stroke={C.ink} strokeWidth={3.5} fill="none" /></Svg>;
}
/** Progress pegs: done = blue with a tick, current = dark with its number, still to do = empty ring. */
function Pegs({ total, current }: { total: number; current: number }) {
  return <View style={styles.pegs}>
    {Array.from({ length: total }, (_, k) => {
      const size = k === current ? 26 : 18;
      const base = { width: size, height: size, borderRadius: size / 2, margin: 3, alignItems: "center" as const, justifyContent: "center" as const };
      if (k < current) return <View key={k} style={{ ...base, backgroundColor: C.strong }}><Check /></View>;
      if (k === current) return <View key={k} style={{ ...base, backgroundColor: C.ink }}><Text style={{ color: "#ffffff", fontSize: 11, fontFamily: "Helvetica-Bold", lineHeight: 1 }}>{k + 1}</Text></View>;
      return <View key={k} style={{ ...base, borderWidth: 2, borderColor: C.ring, backgroundColor: "#ffffff" }} />;
    })}
  </View>;
}

export function GuideDocument({ draft, images }: { draft: Draft; images: Record<string, string> }) {
  const h = headings[draft.language]; const l = labels[draft.language];
  const total = draft.steps.length; const title = draft.title.trim();
  const footer = <View fixed style={styles.footer}><Text>{title}</Text><Text render={({ pageNumber, totalPages }) => `${h.page} ${pageNumber} / ${totalPages}`} /></View>;
  return <Document title={draft.title} language={draft.language} author="Visual Guide">
    <Page size="A4" style={styles.page}>
      {!!title && <View style={styles.band}><Text style={styles.eyebrow}>{h.goal}</Text><Text style={styles.title}>{title}</Text></View>}
      <View style={styles.body}>
        {showMaterials(draft) && <View style={styles.card}>
          <Text style={styles.heading}>{h.materials}</Text>
          {draft.noMaterials ? <Text>{h.none}</Text> : <>
            {listedMaterials(draft).map(m => <View key={m.id} style={styles.row} wrap={false}><View style={styles.box} /><Text style={styles.qty}>{m.quantity} {m.unit}</Text><Text>{m.name}</Text></View>)}
            <Text style={styles.tick}>{l.tick}</Text>
          </>}
        </View>}
        <View style={styles.softCard}>
          <Text style={styles.heading}>{l.plan} · {total}</Text>
          {draft.steps.map((s, index) => <View key={s.id} style={styles.row} wrap={false}>
            <View style={styles.num}><Text style={styles.numText}>{index + 1}</Text></View><Text style={{ flex: 1 }}>{s.text.trim()}</Text>
          </View>)}
        </View>
      </View>
      {footer}
    </Page>
    {draft.steps.map((s, index) => <Page key={s.id} size="A4" style={styles.page}>
      <View style={styles.band}><View style={styles.bandRow}>
        <View>{!!title && <Text style={styles.eyebrow}>{title}</Text>}<Text style={styles.stepCount}>{h.step} {index + 1} {l.of} {total}</Text></View>
        <Pegs total={total} current={index} />
      </View></View>
      <View style={styles.body}>
        {s.photoIds.length > 0 && <View style={styles.photoBox}>
          {s.photoIds.length === 1 ? <Image src={images[stepPhotoKey(s.id, s.photoIds[0])]} style={styles.image} />
            : <View style={styles.grid}>{s.photoIds.map(pid => <Image key={pid} src={images[stepPhotoKey(s.id, pid)]} style={styles.gridImage} />)}</View>}
        </View>}
        {!!s.text.trim() && <Text style={styles.action}>{s.text}</Text>}
        <View style={styles.doneRow} wrap={false}><View style={styles.bigBox} /><Text style={styles.doneText}>{l.done}</Text></View>
      </View>
      {footer}
    </Page>)}
  </Document>;
}
export async function downloadGuide(draft: Draft) {
  if (draft.approvedRevision !== draft.revision || approvalIssues(draft).length) throw new Error("approval");
  const originals = Object.fromEntries(await Promise.all(draft.photos.map(async p => [p.id, await dataUrl(p.blob)])));
  const images: Record<string, string> = {};
  for (const step of draft.steps) for (const pid of step.photoIds) {
    const region = step.focusByPhoto?.[pid];
    images[stepPhotoKey(step.id, pid)] = region ? await focusImageData(originals[pid], region) : originals[pid];
  }
  const blob = await pdf(<GuideDocument draft={draft} images={images} />).toBlob();
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `${draft.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80) || "guide"}.pdf`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}