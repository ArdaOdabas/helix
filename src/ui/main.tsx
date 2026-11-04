import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FigureDocument, FigureNode, Matrix, Operation } from '../core/model.ts';
import { bounds, inverse, multiply, point, world, isLocked } from '../core/model.ts';
import { builtinIcons } from '../core/icons.ts';
import type { IconAsset } from '../core/icons.ts';
import { renderNode } from '../core/render.ts';
import {SvgCanvasContent} from './SvgCanvasContent.tsx';
import { demoPlan } from '../core/plan.ts';
import { SvgAssetEditor } from './SvgAssetEditor.tsx';
import { IconPreview } from './IconPreview.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import './style.css';
import {scientificCategories} from '../core/scientific-categories.ts';
async function api(name: string, args: unknown = {}) { const response = await fetch('/api/tools/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); const result = await response.json(); if (!response.ok)
    throw new Error(result.error); return result; }
type DesktopBridge = { platform: string; saveFile(o: { defaultName: string; data: Uint8Array | string; filters: { name: string; extensions: string[] }[] }): Promise<{ saved: boolean }>; openFigure(): Promise<{ name: string; text: string } | null>; onCommand(callback: (command: string) => void): () => void };
/** Present only inside Helix.app (desktop/preload.ts). */
const desktop = (window as unknown as { helixDesktop?: DesktopBridge }).helixDesktop;
if (desktop) document.documentElement.classList.add('desktop');
/** When the page itself handled a shortcut, ignore the menu echo of the same keystroke. */
let shortcutHandledAt = -1e9;
const menuEcho = () => performance.now() - shortcutHandledAt < 250;
const isTextEditing = () => { const el = document.activeElement as HTMLElement | null; return !!el && (['INPUT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable); };
function TextPrompt({ title, value, onDone }: { title: string; value: string; onDone: (v: string | null) => void }) {
    const [text, setText] = useState(value);
    return <div className="modal-backdrop" onMouseDown={() => onDone(null)}><form className="text-prompt" onMouseDown={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); onDone(text); }}><label>{title}<input autoFocus value={text} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Escape') onDone(null); }}/></label><div className="modal-footer"><button type="button" onClick={() => onDone(null)}>Cancel</button><button className="primary" type="submit">OK</button></div></form></div>;
}
async function download(name: string, data: Blob, filter: { name: string; extensions: string[] }) { if (desktop) {
    await desktop.saveFile({ defaultName: name, data: new Uint8Array(await data.arrayBuffer()), filters: [filter] });
    return;
} const u = URL.createObjectURL(data), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
const noElementKeys:string[]=[];
function App() {
    const [doc, setDoc] = useState<FigureDocument | null>(null), [documents, setDocuments] = useState<any[]>([]), [selected, setSelected] = useState<string[]>([]), [query, setQuery] = useState(''), [icons, setIcons] = useState<IconAsset[]>(builtinIcons), [iconMap, setIconMap] = useState<Record<string, IconAsset>>(Object.fromEntries(builtinIcons.map(i => [i.id, i]))), [error, setError] = useState(''), [busy, setBusy] = useState(false), [zoom, setZoom] = useState(.76), [pan, setPan] = useState({ x: 65, y: 50 }), [planOpen, setPlanOpen] = useState(false), [planText, setPlanText] = useState(JSON.stringify(demoPlan, null, 2)), [mode, setMode] = useState<'select' | 'pan'>('select'), [catalogOffset, setCatalogOffset] = useState<number | null>(null);
    const [scientificCategory,setScientificCategory]=useState(''),[quality,setQuality]=useState('');
    const [provider,setProvider]=useState(''),[providers,setProviders]=useState<any[]>([]),[pageOffset,setPageOffset]=useState(0);
    const [category,setCategory]=useState(''),[subcategory,setSubcategory]=useState(''),[categories,setCategories]=useState<any[]>([]),[detail,setDetail]=useState<any>(null),[imports,setImports]=useState<any[]>([]);
    useEffect(()=>{let active=true;const refresh=()=>Promise.all([api('list_categories',{provider:provider || undefined}),api('list_imports'),api('list_providers')]).then(([c,h,p])=>{if(active){setCategories(c);setImports(h);setProviders(p);}}).catch(e=>setError(e.message));refresh();const timer=setInterval(refresh,2000);return()=>{active=false;clearInterval(timer);};},[provider]);
    const [elementObject,setElementObject]=useState<string|null>(null),[elementKeys,setElementKeys]=useState<string[]>([]),[hoverKey,setHoverKey]=useState<string|null>(null),[elementStatus,setElementStatus]=useState('');
    const [elementPreview,setElementPreview]=useState<FigureNode['elementStyles']>();
    function exitElements(){setElementObject(null);setElementKeys([]);setHoverKey(null);setElementStatus('');setElementPreview(undefined);}
    function selectElement(objectId:string,key:string,shift=false){setElementObject(objectId);setSelected([objectId]);setElementKeys(keys=>shift && elementObject===objectId?(keys.includes(key)?keys.filter(k=>k!==key):[...keys,key]):[key]);}
    function enterElements(id:string){if(doc && !isLocked(doc,id)){setSelected([id]);setElementObject(id);setElementKeys([]);}}
    useEffect(()=>{exitElements();},[doc?.id]);
    useEffect(()=>{if(elementObject && (selected.length!==1 || selected[0]!==elementObject || !doc?.nodes[elementObject]))exitElements();},[selected,elementObject,doc?.nodes]);
    const svg = useRef<SVGSVGElement>(null), gesture = useRef<any>(null), docRef = useRef(doc), busyRef = useRef(false);
    docRef.current = doc;
    const refreshList = async () => setDocuments(await api('list_documents'));
    useEffect(() => { refreshList().then(async () => { const ds = await api('list_documents'); const saved = localStorage.getItem('helix-document'); const choice = ds.find((d: any) => d.id === saved) ?? ds[0]; if (choice)
        setDoc(await api('get_document', { documentId: choice.id })); }).catch(e => setError(e.message)); }, []);
    useEffect(() => { if (doc) {
        localStorage.setItem('helix-document', doc.id);
        const t = setTimeout(fit, 50);
        return () => clearTimeout(t);
    } }, [doc?.id]);
    useEffect(() => { let active = true; const timer = setTimeout(() => api('search_icons', { query, category:category || undefined, subcategory:subcategory || undefined,provider:provider || undefined,scientificCategory:scientificCategory || undefined,quality:quality || undefined,uniqueGeometry:true }).then(r => { if (active) {
        setIcons(r.items);
        setPageOffset(0);
        setCatalogOffset(r.nextOffset);
    } }).catch(e => setError(e.message)), 200); return () => { active = false; clearTimeout(timer); }; }, [query,category,subcategory,provider,scientificCategory,quality,imports[0]?.id,imports[0]?.report.imported,imports[0]?.report.updated]);
    useEffect(() => { const timer = setInterval(async () => { if (!docRef.current || gesture.current || busyRef.current || document.activeElement?.matches('.plan-modal textarea'))
        return; try {
        const requestedId=docRef.current.id;
        const fresh = await api('get_document', { documentId: requestedId });
        if(docRef.current?.id!==requestedId || busyRef.current || gesture.current)return;
        if (fresh.revision > docRef.current.revision) {
            setDoc(fresh);
            setSelected(s => s.filter(id => fresh.nodes[id]));
            refreshList();
        }
    }
    catch (e) {
        setError((e as Error).message);
    } }, 1100); return () => clearInterval(timer); }, []);
    useEffect(() => { if (!doc)
        return; const missing = [...new Set(Object.values(doc.nodes).filter(n => n.type === 'icon' && !iconMap[n.iconId!]).map(n => n.iconId!))]; for (const id of missing)
        fetch('/api/icons/' + encodeURIComponent(id)).then(r => { if (!r.ok)
            throw new Error('Icon asset unavailable'); return r.text(); }).then(text => setIconMap(m => ({ ...m, [id]: { id, name: id, svg: text, viewBox: '0 0 100 100', category: 'Imported', tags: [], license: 'See catalog', provider: 'Local import' } }))).catch(e => setError(e.message)); }, [doc, iconMap]);
    async function command(name: string, args: Record<string, unknown> = {}) { if (!docRef.current || busyRef.current || gesture.current)
        return; busyRef.current = true; setBusy(true); setError(''); try {
        const fresh = await api(name, { documentId: docRef.current.id, expectedRevision: docRef.current.revision, ...args });
        setDoc(fresh);
        setSelected(s => s.filter(id => fresh.nodes[id]));
        await refreshList();
        return fresh;
    }
    catch (e) {
        setError((e as Error).message);
        setDoc(await api('get_document', { documentId: docRef.current.id }));
    }
    finally {
        busyRef.current = false;
        setBusy(false);
    } }
    const update = (id: string, patch: unknown) => command('update_object', { objectId: id, patch });
    const topSelection = (ids: string[], d: FigureDocument) => ids.filter(id => { let p = d.nodes[id]?.parentId; while (p) {
        if (ids.includes(p))
            return false;
        p = d.nodes[p]?.parentId;
    } return !!d.nodes[id]; });
    async function remove() { if (!doc)
        return; await command('apply_operations', { operations: topSelection(selected, doc).map(id => ({ type: 'delete', id })) }); setSelected([]); }
    async function group() { if (selected.length < 2)
        return; const before = new Set(Object.keys(doc!.nodes)); const next = await command('group_objects', { objectIds: selected }); if (next)
        setSelected(Object.keys(next.nodes).filter(id => !before.has(id))); }
    useEffect(() => { const handler = (e: KeyboardEvent) => { if(e.key==='Escape' && elementObject){e.preventDefault();exitElements();return;} if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName))
        return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        shortcutHandledAt = performance.now();
        command(e.shiftKey ? 'redo' : 'undo');
    }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        shortcutHandledAt = performance.now();
        group();
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selected.length && !elementObject)
            remove();
    }
    else if (e.key === 'Escape') {
        if (gesture.current?.snapshot)
            setDoc(gesture.current.snapshot);
        gesture.current = null;
        setSelected([]);
    }
    else if (e.key === ' ') {
        e.preventDefault();
        setMode('pan');
    } }; const up = (e: KeyboardEvent) => { if (e.key === ' ')
        setMode('select'); }; window.addEventListener('keydown', handler); window.addEventListener('keyup', up); return () => { window.removeEventListener('keydown', handler); window.removeEventListener('keyup', up); }; }, [doc, selected, elementObject]);
    function screen(e: {
        clientX: number;
        clientY: number;
    }) { const r = svg.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function start(e: React.PointerEvent, id?: string, kind = 'drag') { if(elementObject)exitElements(); if (!doc || busyRef.current || e.button > 1)
        return; e.stopPropagation(); const s = screen(e), p = { x: (s.x - pan.x) / zoom, y: (s.y - pan.y) / zoom }; if (mode === 'pan' || e.button === 1) {
        gesture.current = { kind: 'pan', start: s, pan: { ...pan }, snapshot: doc };
        return;
    } if (!id) {
        setSelected([]);
        return;
    } if (isLocked(doc, id))
        return; let ids = selected.includes(id) ? selected : [id]; if (e.shiftKey && kind === 'drag') {
        ids = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
        setSelected(ids);
        return;
    } setSelected(ids); ids = topSelection(ids, doc); gesture.current = { kind, start: p, ids, snapshot: structuredClone(doc), bounds: bounds(doc, id), id }; }
    function move(e: React.PointerEvent) { const g = gesture.current; if (!g)
        return; const s = screen(e);
        if(!g.captured && Math.hypot(s.x-(g.kind==='pan'?g.start.x:g.start.x*zoom+pan.x),s.y-(g.kind==='pan'?g.start.y:g.start.y*zoom+pan.y))>2){svg.current?.setPointerCapture(e.pointerId);g.captured=true;}
        if(!g.captured)return;
        if (g.kind === 'pan') {
        setPan({ x: g.pan.x + s.x - g.start.x, y: g.pan.y + s.y - g.start.y });
        return;
    } const p = { x: (s.x - pan.x) / zoom, y: (s.y - pan.y) / zoom }, d = structuredClone(g.snapshot) as FigureDocument; for (const id of g.ids) {
        const n = d.nodes[id], original = g.snapshot.nodes[id], parent = original.parentId ? world(g.snapshot, original.parentId) : [1, 0, 0, 1, 0, 0] as Matrix;
        let w = world(g.snapshot, id);
        if (g.kind === 'drag') {
            w = [...w];
            w[4] += p.x - g.start.x;
            w[5] += p.y - g.start.y;
        }
        else {
            const b = g.bounds, sx = Math.max(.05, (p.x - b.x) / Math.max(1, b.width)), sy = Math.max(.05, (p.y - b.y) / Math.max(1, b.height));
            w = multiply([sx, 0, 0, e.shiftKey ? sx : sy, b.x * (1 - sx), b.y * (1 - (e.shiftKey ? sx : sy))], w);
        }
        n.transform = multiply(inverse(parent), w);
    } setDoc(d); }
    async function finish(e: React.PointerEvent) { const g = gesture.current; if (!g)
        return; if(svg.current?.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId);gesture.current = null; if (g.kind === 'pan')
        return; const current = docRef.current!; const operations = g.ids.filter((id: string) => JSON.stringify(current.nodes[id].transform) !== JSON.stringify(g.snapshot.nodes[id].transform)).map((id: string) => ({ type: 'update', id, patch: { transform: current.nodes[id].transform } })); setDoc(g.snapshot); docRef.current = g.snapshot; if (operations.length)
        await command('apply_operations', { operations }); }
    function wheel(e: React.WheelEvent) { if (e.ctrlKey || e.metaKey) {
        const p = screen(e), next = Math.min(2.5, Math.max(.2, zoom * Math.exp(-e.deltaY * .006)));
        setPan({ x: p.x - (p.x - pan.x) * next / zoom, y: p.y - (p.y - pan.y) * next / zoom });
        setZoom(next);
    }
    else
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY })); }
    const [ask, setAsk] = useState<{ title: string; value: string; resolve: (v: string | null) => void } | null>(null);
    const askText = (title: string, value: string) => new Promise<string | null>(resolve => setAsk({ title, value, resolve }));
    async function newDocument() { const title = await askText('New figure title', 'Untitled figure'); if (title) {
        setDoc(await api('create_document', { title }));
        refreshList();
        setSelected([]);
    } }
    async function importFigure() { if (!desktop)
        return; try {
        const file = await desktop.openFigure();
        if (!file)
            return;
        const response = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: file.text }), result = await response.json();
        if (!response.ok)
            throw new Error(result.error);
        setDoc(result);
        setSelected([]);
        refreshList();
    }
    catch (e) {
        setError(`Import failed: ${(e as Error).message}`);
    } }
    function fit() { if (!doc || !svg.current)
        return; const r = svg.current.getBoundingClientRect(), z = Math.min((r.width - 100) / doc.width, (r.height - 90) / doc.height); setZoom(Math.max(.15, Math.min(1.2, z))); setPan({ x: (r.width - doc.width * z) / 2, y: (r.height - doc.height * z) / 2 }); }
    async function exportFile(kind: 'svg' | 'png' | 'json', scale = 2) { if (!doc)
        return; try {
        if (kind === 'json') {
            await download(doc.title + '.json', new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), { name: 'Helix figure (JSON)', extensions: ['json'] });
            return;
        }
        const result = await api('export_svg', { documentId: doc.id }), blob = new Blob([result.svg], { type: 'image/svg+xml' });
        if (kind === 'svg') {
            await download(doc.title + '.svg', blob, { name: 'SVG image', extensions: ['svg'] });
            return;
        }
        const url = URL.createObjectURL(blob), image = new Image();
        try {
            await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('SVG rasterization failed')); image.src = url; });
            const c = document.createElement('canvas');
            // Chromium canvas limits: 16384 px per side and ~268 MP in total.
            const factor = Math.min(scale, 16384 / doc.width, 16384 / doc.height, Math.sqrt(268e6 / (doc.width * doc.height)));
            if (factor < scale) setError(`PNG scale reduced from ${scale}× to ${factor.toFixed(2)}× by the canvas size limit.`);
            c.width = Math.round(doc.width * factor);
            c.height = Math.round(doc.height * factor);
            c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height);
            const png = await new Promise<Blob>((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed')), 'image/png'));
            await download(doc.title + (factor === 1 ? '' : `@${+factor.toFixed(2)}x`) + '.png', png, { name: 'PNG image', extensions: ['png'] });
        }
        finally {
            URL.revokeObjectURL(url);
        }
    }
    catch (e) {
        setError((e as Error).message);
    } }
    async function addIcon(icon: IconAsset) { const id = doc?.id; await command('add_icon', { iconId: icon.id, x: 150, y: 150, width: 110, height: 110, name: icon.name, style: { fill: '#4f8b76' } }); }
    function object(id: string): React.ReactNode { const n = doc!.nodes[id]; if (!n.visible)return null;
        const editing=elementObject===id;
        const targetKey=(target:EventTarget)=>{const element=(target as Element).closest('[data-svg-element-key]');return element?.closest('[data-object-id]')?.getAttribute('data-object-id')===id?element.getAttribute('data-svg-element-key'):null;};
        const previewNode=editing && elementPreview?{...n,elementStyles:{...n.elementStyles,...elementPreview}}:n;
        return <g key={id} data-object-id={id} data-element-mode={editing || undefined} transform={`matrix(${n.transform.join(' ')})`} opacity={n.style.opacity}
            onPointerOver={e=>{if(editing){e.stopPropagation();setHoverKey(targetKey(e.target));}}} onPointerLeave={()=>{if(editing)setHoverKey(null);}}
            onPointerDown={e=>{
                if((editing || e.altKey) && n.type==='icon' && mode!=='pan' && e.button===0 && !isLocked(doc!,id)){
                    e.stopPropagation();const key=targetKey(e.target);if(key)selectElement(id,key,e.shiftKey);else enterElements(id);return;
                }
                let target=id;if(!e.altKey){while(doc!.nodes[target].parentId)target=doc!.nodes[target].parentId!;}start(e,target);
            }}
            onDoubleClick={e=>{e.stopPropagation();if(n.type==='icon'){enterElements(id);const key=targetKey(e.target);if(key)selectElement(id,key);}else if(n.type==='text'){askText('Edit label',n.text??'').then(text=>{if(text!==null)update(id,{text});});}else if(n.type==='group'&&n.children.length)setSelected([n.children[0]]);}}
            style={{cursor:n.locked?'not-allowed':editing?'crosshair':'move'}}>
            {n.type==='group'?n.children.map(object):n.type==='icon'?<SvgCanvasContent node={previewNode} asset={iconMap[n.iconId!]} keys={editing?elementKeys:noElementKeys} hover={editing?hoverKey:null} editing={editing}/>:<g dangerouslySetInnerHTML={{__html:renderNode(n,id=>iconMap[id])}}/>}
            {n.type==='text'&&<rect width={n.width} height={n.height} fill="transparent"/>}
        </g>;
    }
    function layer(id: string, depth = 0): React.ReactNode { const n = doc!.nodes[id]; return <React.Fragment key={id}><div className={'layer ' + (selected.includes(id) ? 'active' : '')} style={{ paddingLeft: 12 + depth * 13 }}><button className="layer-name" onClick={e => setSelected(e.shiftKey ? [...new Set([...selected, id])] : [id])}><span className="layer-symbol">{n.type === 'group' ? '▱' : n.type === 'text' ? 'T' : n.type === 'arrow' ? '↗' : '◇'}</span>{n.name.replace(/\n/g, ' ')}</button><button title={n.visible ? 'Hide' : 'Show'} aria-label={(n.visible ? 'Hide ' : 'Show ') + n.name} onClick={() => update(id, { visible: !n.visible })}>{n.visible ? '◉' : '○'}</button><button title="Toggle lock" aria-label={'Toggle lock ' + n.name} onClick={() => update(id, { locked: !n.locked })}>{n.locked ? '▣' : '▫'}</button></div>{n.children.map(c => layer(c, depth + 1))}</React.Fragment>; }
    const active = selected.length === 1 && doc ? doc.nodes[selected[0]] : null;
    const numeric = (label: string, value: number, onCommit: (v: number) => void, min?: number) => <label className="field">{label}<input key={active?.id + '-' + doc?.revision + '-' + label} type="number" min={min} step={label === 'Rotation' ? '1' : 'any'} defaultValue={Math.round(value * 100) / 100} onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== value)
        onCommit(v); }} onKeyDown={e => { if (e.key === 'Enter')
        e.currentTarget.blur(); }}/></label>;
    const commands = useRef<Record<string, () => unknown>>({});
    commands.current = {
        new: newDocument, import: importFigure, plan: () => setPlanOpen(true),
        'export-svg': () => exportFile('svg'), 'export-png-2': () => exportFile('png', 2), 'export-png-4': () => exportFile('png', 4), 'export-json': () => exportFile('json'),
        undo: () => isTextEditing() ? document.execCommand('undo') : !menuEcho() && command('undo'),
        redo: () => isTextEditing() ? document.execCommand('redo') : !menuEcho() && command('redo'),
        group: () => !isTextEditing() && !menuEcho() && group(),
        ungroup: () => active?.type === 'group' && command('ungroup_objects', { objectId: active.id }),
        delete: () => selected.length && !elementObject && !isTextEditing() && remove(),
        'zoom-in': () => setZoom(z => Math.min(3, z * 1.25)), 'zoom-out': () => setZoom(z => Math.max(.15, z / 1.25)), 'zoom-fit': fit,
    };
    useEffect(() => desktop?.onCommand(c => { commands.current[c]?.(); }), []);
    return <div className="app">{ask && <TextPrompt title={ask.title} value={ask.value} onDone={v => { ask.resolve(v); setAsk(null); }}/>}<header className="topbar"><div className="brand"><span className="brand-mark">h<span>∿</span></span><div>helix<span className="brand-sub">SCIENTIFIC FIGURE STUDIO</span></div></div><div className="document-picker"><select aria-label="Document" value={doc?.id ?? ''} onChange={async (e) => { setDoc(await api('get_document', { documentId: e.target.value })); setSelected([]); }}>{documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select><button title="Create document" onClick={newDocument}>＋</button></div><div className="save-state"><i />{busy ? 'Saving…' : 'Saved locally'}<span className="revision">r{doc?.revision ?? 0}</span></div><button className="quiet" onClick={() => setPlanOpen(true)}>✧ Figure plan</button><div className="export-menu"><button className="primary" onClick={() => exportFile('svg')}>Export SVG ↗</button><button title="PNG at 2× document size" onClick={() => exportFile('png', 2)}>PNG</button><button title="PNG at 4× document size, for print" onClick={() => exportFile('png', 4)}>4×</button><button onClick={() => exportFile('json')}>JSON</button></div></header>
 <div className="workspace"><aside className="library"><div className="sidebar-heading"><span>ASSET LIBRARY</span><span className="tiny-tag">SVG</span></div><h2>Make science visible.</h2><p className="muted">Editable illustrations, built for ideas.</p><div className="search-box"><span>⌕</span><input aria-label="Search scientific icons" placeholder="Search cells, DNA, proteins…" value={query} onChange={e => setQuery(e.target.value)}/></div><label>Provider<select aria-label="Asset provider" value={provider} onChange={e=>{setProvider(e.target.value);setCategory('');setSubcategory('');}}><option value="">All providers</option>{providers.map(p=><option key={p.provider} value={p.provider}>{p.provider} ({p.count})</option>)}</select></label><label>Scientific category<select aria-label="Scientific category" value={scientificCategory} onChange={e=>setScientificCategory(e.target.value)}><option value="">All scientific categories</option>{scientificCategories.map(c=><option key={c}>{c}</option>)}</select></label><label>Quality<select aria-label="Asset quality" value={quality} onChange={e=>setQuality(e.target.value)}><option value="">All supported assets</option><option value="A">A — Detailed editable illustrations</option><option value="B">B — Editable scientific icons</option><option value="C">C — Simple icons and silhouettes</option></select></label><label>Category<select aria-label="Asset category" value={category} onChange={e=>{setCategory(e.target.value);setSubcategory('');}}><option value="">All categories</option>{categories.map(c=><option key={c.category}>{c.category}</option>)}</select></label><label>Subcategory<select aria-label="Asset subcategory" value={subcategory} onChange={e=>setSubcategory(e.target.value)}><option value="">All subcategories</option>{categories.find(c=>c.category===category)?.subcategories.map((s:string)=><option key={s}>{s}</option>)}</select></label>{imports[0] && <details><summary>{imports[0].finishedAt ? 'Last import' : 'Import in progress'}: {imports[0].report.scanned} scanned</summary><p>{imports[0].report.imported} imported · {imports[0].report.updated} updated · {imports[0].report.skipped} skipped · {imports[0].report.failed} failed</p>{imports[0].report.failures.slice(0,20).map((f:any)=><p key={f.file}>{f.file}: {f.error}</p>)}</details>}{detail && <section className="asset-detail"><button onClick={()=>setDetail(null)}>Close details</button><h3>{detail.name}</h3><IconPreview icon={detail}/><p>{detail.category} / {detail.subcategory}</p><p>{detail.tags?.join(', ')}</p><p>{detail.provider} · {detail.license}</p><p>{detail.scientificCategory} · Quality {detail.quality}</p>{detail.scientificName && <p>{detail.scientificName}</p>}{detail.taxonomyIds?.length>0 && <p>{detail.taxonomyIds.join(", ")}</p>}<p>{detail.author} {detail.credit}</p>{detail.sourceUrl && /^https?:\/\//i.test(detail.sourceUrl) && <a href={detail.sourceUrl} target="_blank" rel="noreferrer">Original source</a>}<p>{detail.width} × {detail.height} · {detail.elements} elements</p><p>{detail.licenseReference}</p><p>{detail.attribution}</p><p>{detail.originalFilename} · {detail.importedAt}</p><details><summary>Source attribution</summary>{detail.provenance?.map((p:any,i:number)=><p key={i}>{p.sourceFile} · {p.provider} · {p.license} · {p.licenseReference}</p>)}</details><p>{detail.palette?.join(', ')}</p></section>}<div className="library-label">SCIENTIFIC ICONS <span>{icons.length}</span></div><div className="icon-grid">{icons.map(icon => <div className="asset-card" key={icon.id}><button draggable onDragStart={e=>{e.dataTransfer.setData('application/x-helix-asset',icon.id);e.dataTransfer.effectAllowed='copy';}} onContextMenu={e=>{e.preventDefault();api('get_asset',{iconId:icon.id}).then(setDetail).catch(e=>setError(e.message));}} className="icon-card" key={icon.id} onClick={() => addIcon(icon)} title={'Insert ' + icon.name}><div className="icon-preview"><IconPreview icon={icon}/><span className="add-badge">＋</span></div><span>{icon.name}</span><small>{icon.category}</small></button><button className="asset-details-button" onClick={e=>{e.stopPropagation();api('get_asset',{iconId:icon.id}).then(setDetail).catch(e=>setError(e.message));}} onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();api('get_asset',{iconId:icon.id}).then(setDetail);}}}>Details</button></div>)}</div>{pageOffset>0 && <button onClick={async()=>{try{const offset=Math.max(0,pageOffset-30),r=await api('search_icons',{query,category:category || undefined,subcategory:subcategory || undefined,provider:provider || undefined,scientificCategory:scientificCategory || undefined,quality:quality || undefined,uniqueGeometry:true,offset});setIcons(r.items);setPageOffset(offset);setCatalogOffset(r.nextOffset);}catch(e){setError((e as Error).message);}}}>Previous icons</button>}{catalogOffset !== null && <button onClick={async () => { try { const r = await api('search_icons', { query, category:category || undefined, subcategory:subcategory || undefined,provider:provider || undefined,scientificCategory:scientificCategory || undefined,quality:quality || undefined,uniqueGeometry:true, offset: catalogOffset }); setIcons(r.items); setPageOffset(catalogOffset); setCatalogOffset(r.nextOffset); } catch(e) { setError((e as Error).message); } }}>Next icons</button>}<div className="library-note"><span className="note-icon">✧</span><strong>Vectors all the way down</strong><p>Every icon stays editable. Change its color, size, and place in your story.</p></div><div className="library-footer"><span className="status-dot"/> Local workspace <span>MCP ready</span></div></aside>
 <main className="editor"><div className="canvas-toolbar"><div className="tool-group"><button className={mode === 'select' ? 'chosen' : ''} title="Select" aria-label="Select tool" onClick={() => setMode('select')}>↖</button><button className={mode === 'pan' ? 'chosen' : ''} title="Pan (hold Space)" aria-label="Pan tool" onClick={() => setMode('pan')}>✥</button></div><span className="divider"/><button title="Add text" onClick={() => command('add_text', { text: 'New label', width: 240, height: 55, style: { fill: '#243d33', fontSize: 24 } })}>T <span>Text</span></button><button onClick={() => command('add_shape', { shape: 'roundrect', width: 160, height: 100 })}>▢ <span>Shape</span></button><button onClick={() => command('add_shape', { shape: 'ellipse', width: 120, height: 90 })}>◯</button><button onClick={() => command('add_arrow', { width: 160, height: 24 })}>⟶ <span>Arrow</span></button><span className="divider"/><button disabled={busy} aria-label="Undo" onClick={() => command('undo')}>↶</button><button disabled={busy} aria-label="Redo" onClick={() => command('redo')}>↷</button><div className="toolbar-spacer"/><button disabled={selected.length < 2} onClick={group}>Group</button><button disabled={!active || active.type !== 'group'} onClick={() => command('ungroup_objects', { objectId: active!.id })}>Ungroup</button></div>
 {elementObject && <div className="element-mode-banner" role="status"><strong>Element Mode</strong> Click a path · Shift-click to add · Escape to exit <button onClick={exitElements}>Exit Element Mode</button></div>}
 {error && <div className="error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
 <div className="canvas-area"><svg ref={svg} onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-helix-asset'))e.preventDefault();}} onDrop={e=>{const id=e.dataTransfer.getData('application/x-helix-asset');if(id && svg.current){e.preventDefault();const rect=svg.current.getBoundingClientRect();command('add_icon',{iconId:id,x:(e.clientX-rect.left-pan.x)/zoom,y:(e.clientY-rect.top-pan.y)/zoom});}}} className={'canvas ' + (mode === 'pan' ? 'panning' : '')} aria-label="Scientific figure canvas" onPointerDown={e => start(e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { if (gesture.current?.snapshot)
        setDoc(gesture.current.snapshot); gesture.current = null; }} onWheel={wheel}><defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#d5ddd5"/></pattern><filter id="paper-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="14" floodColor="#233b2e" floodOpacity=".08"/></filter></defs><rect width="100%" height="100%" fill="url(#grid)"/>{doc && <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}><rect data-testid="artboard" width={doc.width} height={doc.height} fill={doc.background} filter="url(#paper-shadow)" onPointerDown={e => start(e)}/>{doc.roots.map(object)}{selected.filter(id => doc.nodes[id]).map(id => { const b = bounds(doc, id); return <g key={id} className={'selection-outline'+(elementObject===id?' element-mode-outline':'')}><rect x={b.x - 3 / zoom} y={b.y - 3 / zoom} width={b.width + 6 / zoom} height={b.height + 6 / zoom} fill="none" stroke="#3b8c73" strokeWidth={1.5 / zoom} strokeDasharray={selected.length > 1 ? `${4 / zoom} ${3 / zoom}` : undefined} pointerEvents="none"/>{selected.length === 1 && !elementObject && !isLocked(doc, id) && <rect data-testid="resize-handle" x={b.x + b.width - 5 / zoom} y={b.y + b.height - 5 / zoom} width={10 / zoom} height={10 / zoom} fill="white" stroke="#3b8c73" strokeWidth={1.5 / zoom} style={{ cursor: 'nwse-resize' }} onPointerDown={e => start(e, id, 'resize')}/>}</g>; })}</g>}</svg><div className="canvas-top-label"><span className="page-dot"/> FIGURE 01 <span>{doc?.width} × {doc?.height} px</span></div><div className="zoom-control"><button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.15, z - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z + .1))}>＋</button><span className="divider"/><button onClick={fit}>Fit</button></div><div className="canvas-help">Shift + click to select multiple · Space to pan · ⌘ Z to undo</div></div><footer className="bottom-bar"><span>{doc ? Object.keys(doc.nodes).length : 0} objects <span className="footer-sep">/</span> {elementObject ? `Element Mode · ${elementStatus || elementKeys.length+' elements selected'}` : selected.length ? `${selected.length} selected` : 'Nothing selected'}</span><span>SVG canvas <span className="status-dot"/> Live document sync</span></footer></main>
 <aside className="inspector"><div className="inspector-section"><div className="sidebar-heading">PROPERTIES <span>{active?.type ?? 'Document'}</span></div>{active ? <div key={active.id}><label className="field wide">Object name<input key={active.id + doc?.revision} defaultValue={active.name} onBlur={e => { if (e.target.value !== active.name)
        update(active.id, { name: e.target.value }); }}/></label><div className="field-grid">{numeric('X', active.transform[4], v => update(active.id, { transform: active.transform.map((x, i) => i === 4 ? v : x) }))}{numeric('Y', active.transform[5], v => update(active.id, { transform: active.transform.map((x, i) => i === 5 ? v : x) }))}{active.type !== 'group' && numeric('Width', active.width, v => update(active.id, { width: v }), 1)}{active.type !== 'group' && numeric('Height', active.height, v => update(active.id, { height: v }), 1)}{numeric('Rotation', Math.atan2(active.transform[1], active.transform[0]) * 180 / Math.PI, v => { const sx = Math.hypot(active.transform[0], active.transform[1]), sy = Math.hypot(active.transform[2], active.transform[3]), a = v * Math.PI / 180; update(active.id, { transform: [Math.cos(a) * sx, Math.sin(a) * sx, -Math.sin(a) * sy, Math.cos(a) * sy, active.transform[4], active.transform[5]] }); })}{numeric('Opacity', active.style.opacity, v => update(active.id, { style: { opacity: v } }), 0)}</div><div className="colors"><label>Fill <input type="color" value={/^#[0-9a-f]{6}$/i.test(active.style.fill) ? active.style.fill : '#ffffff'} onChange={e => update(active.id, { style: { fill: e.target.value } })}/></label><label>Stroke <input type="color" value={/^#[0-9a-f]{6}$/i.test(active.style.stroke) ? active.style.stroke : '#000000'} onChange={e => update(active.id, { style: { stroke: e.target.value } })}/></label></div>{numeric('Stroke width', active.style.strokeWidth, v => update(active.id, { style: { strokeWidth: v } }), 0)}{active.type === 'text' && <><label className="field wide">Text<textarea aria-label="Edit text" key={active.id + 'text' + doc?.revision} defaultValue={active.text} onBlur={e => { if (e.target.value !== active.text)
        update(active.id, { text: e.target.value }); }}/></label>{numeric('Font size', active.style.fontSize, v => update(active.id, { style: { fontSize: v } }), 6)}</>}{active.type==='icon' && <SvgAssetEditor key={doc!.id+active.id} node={active} documentId={doc!.id} revision={doc!.revision} busy={busy || isLocked(doc!,active.id)} editing={elementObject===active.id} selectedKeys={elementObject===active.id?elementKeys:[]} enter={()=>enterElements(active.id)} selectKey={(key,shift)=>selectElement(active.id,key,shift)} preview={setElementPreview} onSelectionInfo={setElementStatus} api={api} command={command} onError={setError}/>}<div className="object-actions"><button onClick={() => { const siblings = active.parentId ? doc!.nodes[active.parentId].children : doc!.roots; command('apply_operations', { operations: [{ type: 'reorder', id: active.id, index: siblings.length - 1 }] }); }}>Bring front</button><button onClick={() => command('apply_operations', { operations: [{ type: 'reorder', id: active.id, index: 0 }] })}>Send back</button></div><button className="delete" onClick={remove}>Delete object</button></div> : <div className="empty-properties"><span>↖</span><p>Select an object to refine its appearance.</p><small>Or choose an illustration from the library to begin.</small></div>}</div><div className="layers-heading"><span>LAYERS</span><span>{doc?.roots.length ?? 0}</span></div><div className="layers">{doc && [...doc.roots].reverse().map(id => layer(id))}</div><div className="inspector-bottom"><span>◇</span> Your science. Your composition.</div></aside></div>
 {planOpen && <div className="modal-backdrop"><section className="plan-modal"><div className="modal-heading"><div><span className="eyebrow">AI-NATIVE WORKFLOW</span><h2>From intent to illustration.</h2></div><button onClick={() => setPlanOpen(false)}>×</button></div><p>Paste a structured figure plan from Claude or Codex. Helix handles placement, labels, and relationships. Applying replaces this figure in one undoable step.</p><textarea aria-label="Structured figure plan" value={planText} onChange={e => setPlanText(e.target.value)}/><div className="modal-footer"><button onClick={() => setPlanText(JSON.stringify(demoPlan, null, 2))}>Load stem-cell example</button><button className="primary" onClick={async () => { try {
        const plan = JSON.parse(planText);
        const d = await command('apply_figure_plan', { plan });
        if (d) {
            setSelected([]);
            setPlanOpen(false);
        }
    }
    catch (e) {
        setError((e as Error).message);
    } }}>Build editable figure →</button></div></section></div>}</div>;
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
