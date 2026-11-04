export interface IconAsset {
    id: string;
    name: string;
    category: string;
    tags: string[];
    svg: string;
    viewBox: string;
    license: string;
    provider: string;
    author?: string;
    authorReference?: string;
    attribution?: string;
    licenseReference?: string;
    sourceUrl?: string;
    licenseUrl?: string;
    quality?:string;
    scientificCategory?:string;
    geometryHash?:string;
    sourceAttributions?: Record<string, unknown>[];
}
const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const cell = wrap('<path d="M86 29C103 52 84 88 59 93 31 98 8 77 7 53 6 29 25 7 49 8 66 9 76 12 86 29Z" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="3"/><ellipse cx="49" cy="49" rx="22" ry="24" fill="currentColor" fill-opacity=".5" stroke="currentColor" stroke-width="2"/><circle cx="54" cy="46" r="7" fill="currentColor"/><path d="M18 57q6-12 10 0t9 0M64 74q5-12 10 0" fill="none" stroke="currentColor" stroke-width="3"/>');
export const builtinIcons: IconAsset[] = [
    { id: 'mammalian-cell', name: 'Mammalian cell', category: 'Cell types', tags: ['cell', 'human', 'mammalian', 'stem', 'pluripotent', 'naive', 'cytoplasm'], svg: cell, viewBox: '0 0 100 100', provider: 'Helix original artwork', license: 'CC0-1.0' },
    { id: 'cell-nucleus', name: 'Cell nucleus', category: 'Cell structures', tags: ['nucleus', 'nuclear', 'organelle', 'expression', 'transcription', 'TPRX1'], svg: wrap('<ellipse cx="50" cy="50" rx="40" ry="43" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="3"/><path d="M28 38q15-18 31 4t13 25M26 65q20-20 36 5" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="56" cy="43" r="10" fill="currentColor" fill-opacity=".7"/>'), viewBox: '0 0 100 100', provider: 'Helix original artwork', license: 'CC0-1.0' },
    { id: 'mitochondrion', name: 'Mitochondrion', category: 'Cell structures', tags: ['mitochondria', 'mitochondrion', 'ATP', 'energy', 'organelle'], svg: wrap('<path d="M14 35C30 8 73 12 88 38S71 88 42 83 0 61 14 35Z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="3"/><path d="M22 39q15-18 16 0t16 0 15 5-10 17-17 0-16 2" fill="none" stroke="currentColor" stroke-width="4"/>'), viewBox: '0 0 100 100', provider: 'Helix original artwork', license: 'CC0-1.0' },
    { id: 'dna-double-helix', name: 'DNA double helix', category: 'Nucleic acids', tags: ['DNA', 'double', 'helix', 'gene', 'genetic', 'nucleic', 'acid', 'genome'], svg: wrap('<path d="M25 5C95 35 5 65 75 95M75 5C5 35 95 65 25 95" fill="none" stroke="currentColor" stroke-width="5"/><path d="M36 12h28M43 24h14M37 36h26M26 49h48M36 62h28M43 74h14M36 86h28" stroke="currentColor" stroke-width="3"/>'), viewBox: '0 0 100 100', provider: 'Helix original artwork', license: 'CC0-1.0' },
    { id: 'protein', name: 'Protein', category: 'Proteins', tags: ['protein', 'polypeptide', 'enzyme', 'expression', 'TPRX1', 'transcription factor'], svg: wrap('<path d="M16 29Q14 9 36 16 49 0 60 20 88 10 83 39 106 54 81 67 83 95 55 82 32 105 24 77-3 73 13 52-4 37 16 29Z" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="3"/><path d="M25 38q15-23 25 0t25 5M28 65q17-16 32 3" fill="none" stroke="currentColor" stroke-width="3"/>'), viewBox: '0 0 100 100', provider: 'Helix original artwork', license: 'CC0-1.0' },
    { id: 'membrane-receptor', name: 'Membrane receptor', category: 'Membranes', tags: ['membrane', 'receptor', 'signalling', 'signaling', 'surface', 'ligand'], svg: wrap('<path d="M6 50h88M6 66h88" stroke="currentColor" stroke-width="5" opacity=".3"/><path d="M35 10v18l15 15v42M65 10v18L50 43" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><circle cx="50" cy="86" r="5" fill="currentColor"/>'), viewBox: '0 0 100 100', provider: 'Helix original artwork', license: 'CC0-1.0' }
];
export function searchBuiltin(query: string) { const terms = query.toLowerCase().split(/\W+/).filter(Boolean); return builtinIcons.map(icon => ({ icon, score: terms.reduce((s, t) => s + ([icon.name, ...icon.tags].join(' ').toLowerCase().includes(t) ? 1 : 0), 0) })).filter(r => !terms.length || r.score).sort((a, b) => b.score - a.score).map(r => r.icon); }
