// Text that teaches an assistant how to drive the engine. Returned by list_figure_vocabulary and
// summarised in the generate_figure tool description.
import { allGlyphs } from './glyphs/index.ts';
import { HUES } from './color.ts';

export const GENERATE_DESCRIPTION = `Generate a COMPLETE, publication-quality scientific illustration (BioRender-style) from a structured description. You never give coordinates: you describe WHAT is in the figure and the engine handles layout, illustration, typography, arrows, colour harmony and spacing. Output: a preview PNG you can inspect, high-resolution SVG + PNG files on disk, and (by default) an editable Helix document where every illustration/label/arrow is a separate object.

Pick ONE layout via "type" (or combine several with "panels"):
• workflow — experimental protocol / pipeline: steps[] each with visual(s), label, detail, and "action" (text on the arrow to the next step). Optional stages[] (tinted groups like "In vivo"/"In vitro"), numbered:true, perRow, arrowStyle "line"|"block". Branching: give steps ids + edges[{from,to,label}].
• pathway — cell-signalling mechanism: nodes[{id,label,kind,location,color,mods}] + edges[{from,to,type,label}]. location: extracellular | membrane | cytoplasm | nucleus. kind: ligand, receptor, gpcr, rtk, channel, transporter, protein, kinase, gprotein, tf, gene, mrna, drug, ion, antibody, complex. type: activates | inhibits | binds | translocates | produces | releases. A ligand that binds a membrane receptor is docked on it automatically; drugs that inhibit one target sit beside it. outputs[] = phenotypes below the cell.
• comparison — side-by-side conditions (Healthy vs Disease, WT vs KO): columns[{title,subtitle,color}], rows[{label, cells:[{visual,label,detail}]}], optional transition (arrow label between columns).
• cycle — circular process (cell cycle, viral life cycle): stages[] like workflow steps, optional center{visual,label}.
• zoom — multiscale magnification (organism → organ → cell → molecule): levels[{visual,label,detail,focus:[x,y]}]; focus is the fractional point magnified into the next circle.
• panels — multi-panel figure: panels[] of any of the above (each panel's title becomes "a  Title"), columns.
Common: title, subtitle, footnote, legend[{label,color|visual|line}].

VISUALS are plain names. A plain name takes the best **drawn illustration** from the licensed library whenever one clearly matches and is genuinely detailed; otherwise it falls back to a procedural glyph. Structural things (membrane receptors, nucleic acids, charts) are always generated, because they have to line up with the scene around them. Asking for parametric control — a colour, variant, label or modification badge — also selects the procedural glyph. Use find_visual to see which one a name resolves to and to pick a different library match.

Plain names include: "mouse", "patient", "liver", "T cell", "macrophage", "neuron", "GPCR", "antibody", "DNA", "mRNA", "plasmid", "AAV", "petri dish", "96-well plate", "pipette", "syringe", "sequencer", "microscope", "UMAP", "heatmap", "western blot", "volcano plot", "flow cytometry", "survival curve"… ~70 procedural glyphs are drawn in one consistent style; anything else is found in a 23k-illustration licensed library (NIH BioArt, Servier/Bioicons, Reactome, Togo). Use an object for control: {"glyph":"protein","variant":"kinase","label":"AKT","mods":["P"],"color":"teal"} or {"search":"kidney","hue":"red","pick":1}. Call list_figure_vocabulary for the full vocabulary and find_visual to preview what a name resolves to.

WORKFLOW: 1) write the spec, 2) call generate_figure, 3) LOOK at the returned image critically (labels, scientific accuracy, balance), 4) adjust the spec (wording, visuals, colours, perRow, pick) and call again with replaceDocumentId to update the same document. Keep labels short (≤4 words) and put explanations in detail.`;

export function vocabulary() {
    const byCat: Record<string, Array<{ name: string; aliases: string[]; variants?: string[]; description: string; defaultColor: string }>> = {};
    for (const d of allGlyphs()) (byCat[d.category] ??= []).push({ name: d.name, aliases: d.aliases.slice(0, 12), variants: d.variants, description: d.description, defaultColor: d.color });
    return {
        layouts: ['workflow', 'pathway', 'comparison', 'cycle', 'zoom', 'panels'],
        glyphs: byCat,
        colors: Object.keys(HUES),
        library: 'Any other noun is searched in the licensed library (organisms, organs, tissues, cell types, equipment). Prefer simple nouns: "lab mouse", "heart", "kidney", "zebrafish", "hepatocyte", "blood vessel". Use find_visual to preview.',
        textMarkup: 'Inline markup in labels: *italic* (gene names), ^sup^ (Ca^2+^), _sub_ (CO_2_).',
        examples: EXAMPLES,
    };
}

export const EXAMPLES: Record<string, unknown> = {
    workflow: {
        type: 'workflow', title: 'Single-cell profiling of tumour-infiltrating T cells', numbered: true,
        stages: [{ label: 'In vivo', from: 0, to: 1 }, { label: 'Ex vivo', from: 2, to: 3 }, { label: 'Analysis', from: 4, to: 5 }],
        steps: [
            { label: 'Tumour model', detail: 'MC38, s.c.', visual: 'lab mouse', action: 'Anti-PD-1, day 7' },
            { label: 'Tumour resection', visual: 'tumor', action: 'Dissociation' },
            { label: 'Single-cell suspension', visual: { glyph: 'tube', color: 'red' }, action: 'FACS CD45⁺' },
            { label: 'Sorted T cells', visual: 't cell', action: '10x Chromium' },
            { label: 'scRNA-seq', visual: 'sequencer', action: 'Clustering' },
            { label: 'Clonotype analysis', visuals: ['umap', 'heatmap'] },
        ],
    },
    pathway: {
        type: 'pathway', title: 'Canonical NF-κB activation',
        nodes: [
            { id: 'tnf', label: 'TNF-α', kind: 'ligand' }, { id: 'tnfr', label: 'TNFR1', kind: 'receptor' },
            { id: 'ikk', label: 'IKK', kind: 'kinase', color: 'orange' }, { id: 'ikb', label: 'IκBα', color: 'gray', mods: ['P', 'Ub'] },
            { id: 'nfkb', label: 'NF-κB', kind: 'dimer', color: 'teal' }, { id: 'nfkbn', label: 'NF-κB', kind: 'tf', location: 'nucleus', color: 'teal' },
            { id: 'genes', label: '*IL6*, *TNF*', kind: 'gene', location: 'nucleus' },
        ],
        edges: [
            { from: 'tnf', to: 'tnfr', type: 'binds' }, { from: 'tnfr', to: 'ikk' }, { from: 'ikk', to: 'ikb', label: 'P' },
            { from: 'ikb', to: 'nfkb', type: 'inhibits' }, { from: 'nfkb', to: 'nfkbn', type: 'translocates' }, { from: 'nfkbn', to: 'genes', type: 'produces' },
        ],
        outputs: ['Inflammation'],
    },
    comparison: {
        type: 'comparison', title: 'Wild type vs knockout', transition: 'Cre deletion',
        columns: [{ title: 'Wild type', color: 'blue' }, { title: '*Tsc1* KO', color: 'red' }],
        rows: [{ label: 'Neuron', cells: [{ visual: 'neuron', label: 'Normal soma' }, { visual: { glyph: 'neuron', color: 'orange' }, label: 'Hypertrophic soma' }] }],
    },
    zoom: { type: 'zoom', levels: [{ visual: 'lab mouse', label: 'Mouse', focus: [0.3, 0.4] }, { visual: 'liver', label: 'Liver' }, { visual: 'hepatocyte', label: 'Hepatocyte' }] },
};
