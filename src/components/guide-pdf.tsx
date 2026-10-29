/* eslint-disable jsx-a11y/alt-text -- React PDF Image is not an HTML element. */
import { Document, Page, Text, View, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import { approvalIssues, headings, listedMaterials, showMaterials, type Draft } from "../lib/guide";
import { dataUrl } from "../lib/storage";

const styles = StyleSheet.create({
  page: { padding: 42, paddingBottom: 55, fontFamily: "Helvetica", fontSize: 14, lineHeight: 1.5, color: "#172d27" },
  eyebrow: { fontSize: 10, color: "#50635b", marginBottom: 12 },
  title: { fontSize: 28, fontFamily: "Helvetica-Bold", marginBottom: 28 },
  heading: { fontSize: 17, fontFamily: "Helvetica-Bold", marginBottom: 10, marginTop: 18 },
  material: { marginBottom: 8 }, image: { width: "100%", height: 320, objectFit: "contain", marginBottom: 20 },
  images: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 12 }, gridImage: { width: "49%", height: 160, objectFit: "contain", marginBottom: 8 },
  action: { fontSize: 20, lineHeight: 1.5 }, footer: { position: "absolute", bottom: 25, left: 42, right: 42, fontSize: 10, color: "#50635b" },
});
export function GuideDocument({ draft, images }: { draft: Draft; images: Record<string, string> }) {
  const h = headings[draft.language];
  const completion = (["finished", "next", "help"] as const).filter(field => draft[field].trim());
  const footer = <Text fixed style={styles.footer} render={({ pageNumber, totalPages }) => `${h.page} ${pageNumber} / ${totalPages}`} />;
  return <Document title={draft.title} language={draft.language} author="Visual Guide">
    {(!!draft.title.trim() || showMaterials(draft)) && <Page size="A4" style={styles.page}>
      {!!draft.title.trim() && <><Text style={styles.eyebrow}>{h.goal}</Text><Text style={styles.title}>{draft.title}</Text></>}
      {showMaterials(draft) && <><Text style={styles.heading} minPresenceAhead={50}>{h.materials}</Text>
        {draft.noMaterials ? <Text>{h.none}</Text> : listedMaterials(draft).map(m => <Text key={m.id} style={styles.material}>{m.quantity} {m.unit} · {m.name}</Text>)}</>}{footer}
    </Page>}
    {draft.steps.map((s, index) => <Page key={s.id} size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>{draft.title}</Text><Text style={styles.heading}>{h.step} {index + 1}</Text>
      {s.photoIds.length === 1 ? <Image src={images[s.photoIds[0]]} style={styles.image} />
        : <View style={styles.images}>{s.photoIds.map(pid => <Image key={pid} src={images[pid]} style={styles.gridImage} />)}</View>}
      {!!s.text.trim() && <Text style={styles.action}>{s.text}</Text>}{footer}
    </Page>)}
    {completion.length > 0 && <Page size="A4" style={styles.page}>
      {completion.map(field => <View key={field}><Text style={styles.heading} minPresenceAhead={60}>{h[field]}</Text><Text>{draft[field]}</Text></View>)}{footer}
    </Page>}
  </Document>;
}
export async function downloadGuide(draft: Draft) {
  if (draft.approvedRevision !== draft.revision || approvalIssues(draft).length) throw new Error("approval");
  const images = Object.fromEntries(await Promise.all(draft.photos.map(async p => [p.id, await dataUrl(p.blob)])));
  const blob = await pdf(<GuideDocument draft={draft} images={images} />).toBlob();
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = `${draft.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80) || "guide"}.pdf`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
