import React, {useEffect, useMemo, useState} from 'react';
import {color} from '../core/model.ts';
import type {FigureNode} from '../core/model.ts';
import type {SvgElementInfo} from '../core/svg-elements.ts';

type Patch={fill?:string|null;stroke?:string|null;strokeWidth?:number|null;opacity?:number|null};
type Props={node:FigureNode;documentId:string;revision:number;busy:boolean;editing:boolean;selectedKeys:string[];
    onSelectionInfo:(text:string)=>void;enter:()=>void;selectKey:(key:string,shift?:boolean)=>void;preview:(styles:FigureNode['elementStyles'])=>void;
    api:(name:string,args:unknown)=>Promise<any>;command:(name:string,args:Record<string,unknown>)=>Promise<unknown>;onError:(message:string)=>void};
const pickerColor=(paint:string)=>{const rgb=/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(paint);return rgb?'#'+rgb.slice(1).map(v=>Number(v).toString(16).padStart(2,'0')).join(''):paint;};
const swatch=(color:string|null)=><span className="element-swatch" style={{background:color && color!=='none'?color:'repeating-linear-gradient(135deg,#fff 0 4px,#ddd 4px 5px)'}} title={color || 'inherit'}/>;
export function SvgAssetEditor({node,documentId,revision,busy,editing,selectedKeys,enter,selectKey,preview,onSelectionInfo,api,command,onError}:Props){
    const [palette,setPalette]=useState<string[]>([]),[elements,setElements]=useState<SvgElementInfo[]>([]),[loading,setLoading]=useState(true);
    const [paletteOpen,setPaletteOpen]=useState(false),[source,setSource]=useState(''),[replacement,setReplacement]=useState('#ff0000');
    const [fillDraft,setFillDraft]=useState<{token:string;value:string}|null>(null),[strokeDraft,setStrokeDraft]=useState<{token:string;value:string}|null>(null);
    useEffect(()=>{let active=true;api('get_asset',{iconId:node.iconId}).then(asset=>{if(active){const colors=(asset.palette || []).filter((v:string)=>!/^url\(|^none$/i.test(v));setPalette(colors);setSource(colors[0] || '');}}).catch(e=>onError(e.message));return()=>{active=false;};},[node.iconId]);
    useEffect(()=>{let active=true;setLoading(true);(async()=>{const all:SvgElementInfo[]=[];let offset:number|null=0;do{const r=await api('list_icon_elements',{documentId,objectId:node.id,limit:1000,offset});if(!active)return;all.push(...r.items);offset=r.nextOffset;}while(offset!==null);setElements(all);setLoading(false);})().catch(e=>{if(active){setLoading(false);onError(e.message);}});return()=>{active=false;};},[documentId,node.id,revision]);
    const selected=useMemo(()=>elements.filter(e=>selectedKeys.includes(e.key)),[elements,selectedKeys]);
    const element=selected[0];
    const [computed,setComputed]=useState<Record<string,Record<string,string>>>({});
    useEffect(()=>{const styles:Record<string,Record<string,string>>={};for(const e of selected){const dom=document.querySelector(`[data-object-id="${node.id}"] [data-svg-element-key="${e.key}"]`);if(dom){const s=getComputedStyle(dom);styles[e.key]={fill:pickerColor(s.fill),stroke:pickerColor(s.stroke),strokeWidth:s.strokeWidth.replace(/px$/,''),opacity:s.opacity};}}setComputed(styles);},[elements,revision,selectedKeys.join('|')]);
    useEffect(()=>{onSelectionInfo(selected.length===1?`Element ${elements.indexOf(element)+1} · ${element.tag} · ${element.elementId}`:`${selected.length} elements selected`);},[elements,selectedKeys.join('|')]);
    // Drafts belong to a document revision and selection. Asynchronous metadata /
    // computed-paint reads must never overwrite a color the user has begun typing.
    const token=node.id+':'+revision+':'+selectedKeys.join('|');
    const fill=fillDraft?.token===token?fillDraft.value:computed[element?.key]?.fill || element?.fill || 'none';
    const stroke=strokeDraft?.token===token?strokeDraft.value:computed[element?.key]?.stroke || element?.stroke || 'none';
    const setFill=(value:string)=>setFillDraft({token,value}),setStroke=(value:string)=>setStrokeDraft({token,value});
    const disabled=busy || loading;
    async function edit(patch:Patch){if(disabled || !selected.length)return;
        if(Object.entries(patch).some(([key,value])=>value!==null && (key==='fill'||key==='stroke'? !color.safeParse(value).success: typeof value!=='number'||!Number.isFinite(value)||value<0||value>(key==='opacity'?1:1000)))){onError('Use a hex color or none, stroke width 0–1000, and opacity 0–1.');return;}
        preview(Object.fromEntries(selected.map(e=>{const style={...node.elementStyles?.[e.key]};for(const[key,value]of Object.entries(patch)){if(value===null)delete (style as any)[key];else (style as any)[key]=value;}return [e.key,style];})));
        try{await command('update_icon_elements',{objectId:node.id,changes:selected.map(e=>({elementId:e.elementId,patch}))});}finally{preview(undefined);}}
    const common=(prop:'fill'|'stroke'|'strokeWidth'|'opacity')=>selected.every(e=>(computed[e.key]?.[prop] || e[prop])===(computed[element?.key]?.[prop] || element?.[prop]))?computed[element?.key]?.[prop] || element?.[prop] || 'inherit':'Mixed';
    return <section className="svg-asset-editor">
        <button disabled={busy} onClick={enter}>{editing?'Element Mode active':'Edit SVG Elements'}</button>
        <button disabled={disabled} onClick={()=>setPaletteOpen(v=>!v)}>Recolor SVG palette</button>
        {paletteOpen && <form aria-label="SVG palette recoloring" onSubmit={e=>{e.preventDefault();command('recolor_asset',{objectId:node.id,colorMap:{...node.colorMap,[source]:replacement}});}}>
            <label>Palette color<select aria-label="Palette color" disabled={disabled} value={source} onChange={e=>setSource(e.target.value)}>{palette.map(c=><option key={c}>{c}</option>)}</select></label>
            <label>Replacement color<input aria-label="Replacement color" value={replacement} onChange={e=>setReplacement(e.target.value)} disabled={disabled}/></label><button disabled={disabled || !source}>Apply palette color</button>
        </form>}
        <label>SVG element<select aria-label="SVG element" disabled={disabled} value={element?.key || ''} onChange={e=>{if(e.target.value)selectKey(e.target.value);}}><option value="">Select a path or group</option>{elements.map(e=><option key={e.key} value={e.key}>{e.tag} {e.id || e.key}</option>)}</select></label>
        <details className="svg-elements-list" open={editing}><summary>SVG Elements ({elements.length})</summary><p>Drawing order · Shift-click for multiple</p><div role="listbox" aria-label="SVG Elements" aria-multiselectable="true">{elements.map((e,i)=><button type="button" role="option" aria-selected={editing && selectedKeys.includes(e.key)} data-element-id={e.elementId} key={e.key} onClick={event=>selectKey(e.key,event.shiftKey)}><span>{i+1}. {e.tag}</span><code>{e.elementId}</code>{swatch(e.fill)}{swatch(e.stroke)}</button>)}</div></details>
        {editing && element && <div className="svg-element-properties">
            <p data-testid="element-selection-info">{selected.length===1?`Element ${elements.indexOf(element)+1} · ${element.tag} · ${element.elementId}`:`${selected.length} SVG elements selected`}</p>
            <p>Parent: {element.parentKey===null?'SVG root':elements.find(e=>e.key===element.parentKey)?.elementId || element.parentKey}</p>
            <p>Current fill: {common('fill')} · stroke: {common('stroke')}</p><p>Stroke width: {common('strokeWidth')} · opacity: {common('opacity')}</p>
            <label>Fill color picker<input type="color" aria-label="Element fill color picker" disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(fill)?fill:'#000000'} onChange={e=>{setFill(e.target.value);void edit({fill:e.target.value});}}/></label>
            <label>Element fill<input aria-label="Element fill" value={fill} onChange={e=>setFill(e.target.value)} disabled={disabled}/></label><button disabled={disabled} onClick={()=>edit({fill})}>Apply element fill</button><button disabled={disabled} onClick={()=>edit({fill:null})}>Reset element fill</button>
            <label>Stroke color picker<input type="color" aria-label="Element stroke color picker" disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(stroke)?stroke:'#000000'} onChange={e=>{setStroke(e.target.value);void edit({stroke:e.target.value});}}/></label>
            <label>Element stroke<input aria-label="Element stroke" value={stroke} onChange={e=>setStroke(e.target.value)} disabled={disabled}/></label><button disabled={disabled} onClick={()=>edit({stroke})}>Apply element stroke</button><button disabled={disabled} onClick={()=>edit({stroke:null})}>Reset element stroke</button>
            <label>Element stroke width<input aria-label="Element stroke width" key={'width'+revision+selectedKeys.join()} type="number" min="0" max="1000" step="any" defaultValue={computed[element.key]?.strokeWidth || element.strokeWidth || ''} disabled={disabled} onBlur={e=>{if(e.target.value!=='' && Number(e.target.value)!==Number(computed[element.key]?.strokeWidth ?? element.strokeWidth))void edit({strokeWidth:Number(e.target.value)});}}/></label>
            <label>Element opacity<input aria-label="Element opacity" key={'opacity'+revision+selectedKeys.join()} type="number" min="0" max="1" step="0.05" defaultValue={computed[element.key]?.opacity || element.opacity || ''} disabled={disabled} onBlur={e=>{if(e.target.value!=='' && Number(e.target.value)!==Number(computed[element.key]?.opacity ?? element.opacity))void edit({opacity:Number(e.target.value)});}}/></label>
            <button disabled={disabled} onClick={()=>edit({fill:null,stroke:null,strokeWidth:null,opacity:null})}>Reset element overrides</button>
        </div>}
    </section>;
}
