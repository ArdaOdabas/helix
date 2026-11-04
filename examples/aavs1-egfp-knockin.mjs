// Composes the AAVS1 EGFP knock-in figure with the parametric scientific primitives.
// Demonstration and regression fixture for panel cards, genomic tracks, insets, brackets and typed connectors.
//   node examples/aavs1-egfp-knockin.mjs
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const runtime = JSON.parse(readFileSync(process.env.HELIX_RUNTIME_FILE ?? join(homedir(), 'Library/Application Support/Helix/runtime.json'), 'utf8'));
async function call(name, args) {
    const response = await fetch(`${runtime.url}/api/tools/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Helix-Token': runtime.token }, body: JSON.stringify(args) });
    const data = await response.json();
    if (!response.ok) throw new Error(`${name}: ${data.error}`);
    return data;
}

const C = { ink: '#1f2d27', muted: '#5d6b63', dna: '#b9c6d8', dnaDark: '#8ea3bd', exon: '#6d8099',
    insert: '#3f9d7a', insertSoft: '#cdeadd', arm: '#8c7fbe', armSoft: '#e2dcf4', enzyme: '#e4866a', accent: '#2f6f5e', warn: '#c1683f' };
const W = 1800, H = 985, PANEL_Y = 112, PANEL_H = 596, PANEL_W = 388, GAP = 56;
const px = i => 40 + i * (PANEL_W + GAP);
const trackX = i => px(i) + 28, TRACK_W = PANEL_W - 56;

const doc = await call('create_document', { title: 'AAVS1 EGFP knock-in in human iPSCs (primitive composition)', width: W, height: H });
let revision = doc.revision;
const apply = async primitives => { revision = (await call('add_primitives', { documentId: doc.id, expectedRevision: revision, primitives })).revision; };
const add = async (tool, args) => { revision = (await call(tool, { documentId: doc.id, expectedRevision: revision, ...args })).revision; };
const text = (t, x, y, fontSize, fill, width = 900) => add('add_text', { text: t, x, y, width, height: fontSize * 1.5, style: { fill, fontSize, stroke: 'none', strokeWidth: 0 } });

await text('CRISPR-Cas9 EGFP knock-in at the AAVS1 safe-harbour locus in human iPSCs', 40, 34, 27, C.ink, 1200);
await text('Homology-directed repair integrates a promoterless EGFP reporter in frame at the endogenous locus', 40, 74, 15, C.muted, 1200);

// Panel cards
await apply([0, 1, 2, 3].map((i) => ({ kind: 'panel', x: px(i), y: PANEL_Y, width: PANEL_W, height: PANEL_H,
    letter: 'abcd'[i], tint: ['#f2f6f3', '#f3f1f8', '#f1f7f4', '#eef4f7'][i],
    title: ['Target locus and Cas9 cut', 'HDR donor template', 'Edited allele', 'Reporter expression'][i] })));

// ── a. Target locus, cut site and a zoomed protospacer/PAM inset
const cutAt = 0.47;
await apply([
    { kind: 'genomic_track', x: trackX(0), y: 232, width: TRACK_W, title: 'AAVS1 (PPP1R12C intron 1)',
        segments: [{ label: 'exon 1', span: 1, fill: C.exon }, { label: 'intron 1 — target site', span: 2.6, fill: C.dna }, { label: 'exon 2', span: 1, fill: C.exon }],
        marks: [{ at: cutAt, label: 'Cas9 blunt DSB', kind: 'cut', color: C.warn }],
        caption: 'sgRNA directs Cas9 to a unique intronic target' },
    { kind: 'callout', x: trackX(0), y: 360, width: TRACK_W, height: 152, title: 'Protospacer and PAM',
        source: { x: trackX(0) + cutAt * TRACK_W - 26, y: 258, width: 52, height: 40 } },
    { kind: 'genomic_track', x: trackX(0) + 18, y: 408, width: TRACK_W - 36, barHeight: 20,
        segments: [{ label: 'protospacer (20 nt)', span: 20, fill: C.dnaDark }, { label: 'PAM (NGG)', span: 4, fill: C.accent }],
        marks: [{ at: 17 / 24, kind: 'cut', color: C.warn }],
        caption: 'Blunt cut 3 bp 5′ of the PAM' },
]);
await add('add_icon', { iconId: 'asset-df6ed35fe232649e6e78f26486fb530f5f869cd37c9f1013c7fb9fc24f6da1bd', x: px(0) + 116, y: 142, width: 156, height: 84, name: 'Cas9 RNP' });
await text('Cas9 ribonucleoprotein', px(0) + 120, 206, 12, C.muted, 200);

// ── b. Donor with homology arms flanking the reporter cassette
await apply([
    { kind: 'genomic_track', x: trackX(1), y: 232, width: TRACK_W, title: 'Donor plasmid insert',
        segments: [{ label: "5′ homology arm", span: 1.6, fill: C.arm }, { label: 'EGFP', span: 1.5, fill: C.insert }, { label: 'polyA', span: 0.5, fill: C.insertSoft }, { label: "3′ homology arm", span: 1.6, fill: C.arm }],
        caption: 'Promoterless cassette; no selection marker shown' },
    { kind: 'bracket', x: trackX(1), y: 312, width: TRACK_W * (1.6 / 5.2), label: '~800 bp', side: 'below', depth: 12, color: C.arm },
    { kind: 'bracket', x: trackX(1) + TRACK_W * (3.6 / 5.2), y: 312, width: TRACK_W * (1.6 / 5.2), label: '~800 bp', side: 'below', depth: 12, color: C.arm },
    { kind: 'callout', x: trackX(1), y: 380, width: TRACK_W, height: 132, title: 'Arms match the cut locus',
        source: { x: trackX(1), y: 258, width: TRACK_W, height: 40 } },
    { kind: 'genomic_track', x: trackX(1) + 18, y: 428, width: TRACK_W - 36, barHeight: 18,
        segments: [{ label: 'homology to left of cut', span: 1, fill: C.armSoft }, { label: 'homology to right', span: 1, fill: C.armSoft }],
        caption: 'Sequence identity flanking the DSB directs HDR' },
]);

// ── c. Repaired allele with the reporter integrated in place
await apply([
    { kind: 'genomic_track', x: trackX(2), y: 232, width: TRACK_W, title: 'Knock-in allele after HDR',
        segments: [{ label: 'exon 1', span: 1, fill: C.exon }, { label: 'intron 1', span: 0.8, fill: C.dna }, { label: 'EGFP', span: 1.5, fill: C.insert }, { label: 'polyA', span: 0.5, fill: C.insertSoft }, { label: 'intron 1', span: 0.8, fill: C.dna }, { label: 'exon 2', span: 1, fill: C.exon }],
        caption: 'Cassette integrated at the cut site; arms restored' },
    { kind: 'bracket', x: trackX(2) + TRACK_W * (1.8 / 5.6), y: 312, width: TRACK_W * (2 / 5.6), label: 'integrated reporter', side: 'below', depth: 12, color: C.insert },
    { kind: 'genomic_track', x: trackX(2), y: 392, width: TRACK_W, title: 'Unedited allele, for comparison',
        segments: [{ label: 'exon 1', span: 1, fill: C.exon }, { label: 'intron 1', span: 2.6, fill: C.dna }, { label: 'exon 2', span: 1, fill: C.exon }],
        segmentLabels: false, barHeight: 20, caption: 'No cassette; locus unchanged' },
    { kind: 'genomic_track', x: trackX(2), y: 470, width: TRACK_W, barHeight: 18,
        segments: [{ label: 'PCR across the 5′ junction', span: 1, fill: 'none', ghost: true }],
        caption: 'Junction PCR and sequencing confirm integration' },
]);

// ── d. Cells expressing the reporter
await add('add_icon', { iconId: 'asset-09c594b58cf65dabf16fb5dd01b4953accc96fbdc67b1fc8df83abaae792e57c', x: px(3) + 92, y: 212, width: 204, height: 164, name: 'iPSC colony' });
await apply([
    { kind: 'genomic_track', x: trackX(3), y: 404, width: TRACK_W, barHeight: 20, title: 'Expression readout',
        segments: [{ label: 'EGFP⁺ cells', span: 1, fill: C.insert }, { label: 'EGFP⁻ cells', span: 1.1, fill: '#d8ded9' }],
        caption: 'Fluorescence reports activity of the targeted locus' },
    { kind: 'callout', x: trackX(3), y: 482, width: TRACK_W, height: 86, title: 'Clonal validation',
        source: { x: trackX(3), y: 430, width: TRACK_W, height: 26 } },
]);
await text('Karyotype, off-target and copy-number checks are performed per clone.', trackX(3) + 16, 524, 12, C.muted, 300);

// ── Typed connectors between stages
const midY = 300;
await apply([
    { kind: 'connector', from: { x: px(0) + PANEL_W + 6, y: midY }, to: { x: px(1) - 6, y: midY }, relation: 'converts', label: 'design donor' },
    { kind: 'connector', from: { x: px(1) + PANEL_W + 6, y: midY }, to: { x: px(2) - 6, y: midY }, relation: 'converts', label: 'HDR' },
    { kind: 'connector', from: { x: px(2) + PANEL_W + 6, y: midY }, to: { x: px(3) - 6, y: midY }, relation: 'produces', label: 'expression' },
    { kind: 'legend', x: 40, y: 744, columns: 4, items: [
        { label: 'Genomic DNA', color: C.dna }, { label: 'Exon', color: C.exon },
        { label: 'Homology arm', color: C.arm }, { label: 'EGFP reporter', color: C.insert },
        { label: 'Cas9 cut site', color: C.warn }, { label: 'PAM', color: C.accent },
    ] },
]);

await text('Schematic; not to scale. Promoterless design relies on the endogenous promoter. Selection, single-cell cloning, off-target assessment and karyotyping are omitted for clarity.', 40, 812, 12, C.muted, 1500);
await text('CRISPR-Cas9 illustration by DBCLS, Bioicons, CC-BY-4.0 (creativecommons.org/licenses/by/4.0/). iPSC illustration courtesy of NIAID Visual & Medical Arts, NIH BIOART Source, Public Domain. Tracks, panels and connectors: Helix original artwork, CC0-1.0.', 40, 838, 11, '#8a968b', 1600);

console.log(JSON.stringify({ documentId: doc.id, revision }));
