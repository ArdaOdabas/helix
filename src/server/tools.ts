import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { relationshipSchema, color, svgElementKeySchema, colorMapSchema, idSchema, nodeSchema, patchSchema, matrixSchema, styleSchema, operationSchema, applyCommands } from '../core/model.ts';
import {renderFigure,browserExecutable} from './figure-renderer.ts';
import {inspectFigure,resizeArtboard} from './figure-feedback.ts';
import { planSchema, layoutPlan } from '../core/plan.ts';
import { primitiveSchema, buildPrimitive } from '../core/primitives.ts';
import { composeSpecSchema, composeFigureLayout } from '../core/compose.ts';
import { harmonizeColorMap, extractAssetPalette } from '../core/style.ts';
import { applySvgPalette, editSvgElements, updateSvgElementStyles } from '../core/svg-elements.ts';
import { exportSvg } from '../core/render.ts';
import type { Store } from './store.ts';
import { engineToolDefinitions, executeEngineTool } from './engine-tools.ts';
import type { Catalog } from '../assets/catalog.ts';
const ref = { documentId: idSchema, expectedRevision: z.number().int().nonnegative().optional() };
const placement = { x: z.number().finite().min(-10000).max(10000).default(100), y: z.number().finite().min(-10000).max(10000).default(100), width: z.number().positive().max(10000).default(100), height: z.number().positive().max(10000).default(100), parentId: idSchema.optional(), style: styleSchema.partial().optional(), name: z.string().max(300).optional(),layoutRole:z.enum(['content','decoration']).optional() };
const elementPatch=z.object({fill:color.nullable().optional(),stroke:color.nullable().optional(),strokeWidth:z.number().finite().min(0).max(1000).nullable().optional(),opacity:z.number().finite().min(0).max(1).nullable().optional()}).strict().refine(v=>Object.values(v).some(x=>x!==undefined),'Provide at least one style property');
const elementChange = z.object({elementId:z.string().min(1).max(500).optional(),elementKey:svgElementKeySchema.optional(),fill:color.nullable().optional(),stroke:color.nullable().optional(),strokeWidth:z.number().finite().min(0).max(1000).nullable().optional(),opacity:z.number().finite().min(0).max(1).nullable().optional()}).strict().refine(v=>(v.elementId!==undefined)!==(v.elementKey!==undefined),'Provide exactly one elementId or elementKey').refine(v=>v.fill!==undefined || v.stroke!==undefined || v.strokeWidth!==undefined || v.opacity!==undefined,'Provide a style property');
const elementModification=z.object({elementId:z.string().min(1).max(500),patch:elementPatch}).strict();
const visualOptions={strictScale:z.boolean().default(false),clearance:z.number().finite().min(0).max(40).default(8),scale:z.number().finite().min(.1).max(3).default(1),margin:z.number().finite().min(0).max(100).default(12),minFontSize:z.number().finite().min(6).max(24).default(12)};
export const toolDefinitions = {
    ...engineToolDefinitions,
    resize_artboard:{description:'Resize THIS existing document artboard in place; never creates a replacement. Required documentId, width/height (100–10000), expectedRevision from get_document. preserveContent defaults true: reject cropping visible scientific content, labels or attribution using existing measured bounds. false explicitly permits viewport clipping; all objects, coordinates and relationships remain stored. Uses existing undo/redo and live React sync. Full-bleed unlocked decorative backgrounds adapt to the new dimensions. Protected nonempty figures require installed Chromium. Call render_figure afterward to inspect PNG dimensions.',schema:z.object({documentId:idSchema,width:z.number().finite().min(100).max(10000),height:z.number().finite().min(100).max(10000),expectedRevision:z.number().int().nonnegative(),preserveContent:z.boolean().default(true)}).strict(),readOnly:false},
    render_figure:{description:'Render an immutable saved document revision to PNG image content visible to Claude/Codex. Uses the existing vector exporter and installed Chromium; no UI overlays. Inspect the image, then analyze_figure_layout and apply_operations for visual refinement. Read-only. Returns requestedScale, actualScale, actualWidth/actualHeight, maxDimension and warnings when capped at 2048px; strictScale=true rejects capped/fractional requests. Use resize_artboard to change document dimensions, not scale.',schema:z.object({...ref,scale:visualOptions.scale,strictScale:visualOptions.strictScale}).strict(),readOnly:true},
    analyze_figure_layout:{description:'Read-only browser-measured layout inspection: transformed arrow collisions/clearance, explicit versus ambiguous arrow labels, whitespace/artboard suggestions, glyph overflow, canvas margins, overlap and contrast. Returns diagnostics, safe proposed commands and a PNG for visual reasoning. Whitespace may be intentional. Call resize_artboard explicitly to apply chosen dimensions. Not a scientific/semantic image judgment; no mutations.',schema:z.object({...ref,...visualOptions}).strict(),readOnly:true},
    refine_figure_layout:{description:'Bounded render-inspect-correct loop through the shared undoable command engine. Default inspection-only; apply=true requires expectedRevision. Fit text, translate fitting roots, move proven unrelated labels and trim explicitly linked arrow endpoints. For an explicit artboard change, prefer the discoverable resize_artboard tool. The legacy resizeArtboard parameter remains supported with apply=true and expectedRevision and never crops content. Ambiguous relationships/complex intersections remain warnings; biological content is never inferred. Each pass is one undo step; returns remaining issues and PNG.',schema:z.object({...ref,...visualOptions,resizeArtboard:z.object({width:z.number().finite().min(100).max(10000),height:z.number().finite().min(100).max(10000)}).strict().optional(),apply:z.boolean().default(false),maxIterations:z.number().int().min(1).max(3).default(2)}).strict().refine(a=>!a.apply||a.expectedRevision!==undefined,'Applying corrections requires expectedRevision').refine(a=>!a.resizeArtboard||a.apply,'Resizing requires apply=true'),readOnly:false},
    compose_figure:{description:'Compose a NEW editable document from the existing validated scientific figure-plan schema, render PNG, inspect and optionally correct conservative layout problems in at most 3 passes. Never replaces an existing figure. Use search_icons/get_asset first to choose licensed scientific icons. Claude supplies the scientific plan and interprets the returned image; no external AI API or scientific inference is performed.',schema:z.object({title:z.string().min(1).max(300),plan:planSchema,...visualOptions,maxIterations:z.number().int().min(0).max(3).default(2)}).strict(),readOnly:false},
    harmonize_asset: { description: 'Recolour one placed illustration into a single target hue, keeping its internal lightness order so structure stays readable. Use this to make assets from different providers (NIH BioArt, Bioicons, Reactome, PhyloPic) read as one coherent set — mixed source palettes are the main reason a figure looks assembled rather than designed. Near-white highlights and near-black outlines are preserved by default. Returns the document; the computed colorMap stays editable and can be cleared with recolor_asset.', schema: z.object({ ...ref, objectId: idSchema, hue: color, saturation: z.number().min(0).max(1).default(0.85), preserveExtremes: z.boolean().default(true) }).strict(), readOnly: false },
    compose_layout: { description: 'Compose a COMPLETE new publication-style figure from structure alone — no coordinates. You describe panels and the blocks inside them (track, icon, note, chips, inset, spacer); the engine measures every block with real text metrics, wraps labels, stacks blocks, sizes each panel to its content, equalises panel heights, aligns the inter-panel connectors to the first DNA track, and places the legend, footnotes and artboard. Track brackets attach to segment index ranges and marks to segment boundaries (afterSegment), so homology arms and cut sites stay correct when spans change. Prefer this over add_text/add_shape/add_primitives for a whole figure: hand-placed coordinates are what make figures look misaligned. Creates a new document and never replaces an existing one. Everything stays editable.', schema: composeSpecSchema, readOnly: false },
    add_primitives: { description: 'Draw parametric scientific primitives as editable grouped shapes in ONE undoable transaction: panel cards (tinted background, letter badge, title), genomic_track (proportional segments such as homology arms, exons, insert cassette, plus cut-site/PAM/tick marks), callout (magnified inset frame with guide lines back to the source region), connector (typed edge: activates/inhibits/converts/translocates/produces, with arrowhead or inhibition crossbar), bracket (labelled span annotation) and legend (colour key). Use these instead of hand-placing rectangles when a figure must show molecular structure, panels, insets or typed relationships; icons alone cannot show homology arms, cut sites or scale changes. Every element stays selectable, movable, recolourable and ungroupable. Coordinates are absolute artboard pixels.', schema: z.object({ ...ref, primitives: z.array(primitiveSchema).min(1).max(60) }).strict(), readOnly: false },
    create_document: { description: 'Create a persistent editable scientific document. Optional plan lays out an entire figure without coordinates. No external AI API is used.', schema: z.object({ title: z.string().min(1).max(300), width: z.number().min(100).max(10000).default(1100), height: z.number().min(100).max(10000).default(800), plan: planSchema.optional() }).strict(), readOnly: false },
    get_document: { description: 'Read the versioned document and its complete editable scene graph.', schema: z.object({ documentId: idSchema }).strict(), readOnly: true },
    list_documents: { description: 'List locally stored documents with IDs and revisions.', schema: z.object({}).strict(), readOnly: true },
    delete_document: { description: 'Remove a document from the local library. The file is renamed aside rather than erased, so it can be restored from the data directory, but it disappears from the editor and from list_documents. Supply expectedRevision from get_document to avoid removing work that changed since you read it. Use it to clear figures you no longer want and disposable documents left by tests.', schema: z.object({ documentId: idSchema, expectedRevision: z.number().int().nonnegative().optional() }).strict(), readOnly: false },
    search_icons: { description: 'Semantic catalog search using scientific tags, taxonomy and curated synonyms plus full-text ranking. Returns paginated metadata; no assets downloaded from external providers.', schema: z.object({ query: z.string().max(300).default(''), category: z.string().max(200).optional(), subcategory:z.string().max(200).optional(), provider:z.string().max(300).optional(), scientificCategory:z.string().max(200).optional(),quality:z.enum(['A','B','C','D']).optional(),uniqueGeometry:z.boolean().default(false), limit: z.number().int().min(1).max(100).default(30), offset: z.number().int().min(0).default(0) }).strict(), readOnly: true },
    get_asset: {description:'Inspect scientific asset metadata and provenance.',schema:z.object({iconId:z.string().max(150)}).strict(),readOnly:true},
    list_categories: {description:'List scientific asset categories and subcategories.',schema:z.object({provider:z.string().max(300).optional()}).strict(),readOnly:true},
    list_providers: {description:'List asset providers and distinct asset counts.',schema:z.object({}).strict(),readOnly:true},
    list_imports: {description:'Read recent local import progress and errors.',schema:z.object({}).strict(),readOnly:true},
    list_icon_elements: {description:'List editable SVG elements by original ID/key, fill, stroke, parent and transform. Read this before update_icon_element(s). Returns document revision and pagination.',schema:z.object({documentId:idSchema,objectId:idSchema,limit:z.number().int().min(1).max(1000).default(100),offset:z.number().int().nonnegative().default(0)}).strict(),readOnly:true},
    update_icon_element: {description:'Update one SVG element. Preferred: documentId, objectId, elementId from list_icon_elements, patch {fill,stroke,strokeWidth,opacity}, optional expectedRevision. Null resets an override. Legacy change input remains supported. Source SVG stays immutable; supports undo/redo.',schema:z.union([z.object({...ref,objectId:idSchema,elementId:z.string().min(1).max(500),patch:elementPatch}).strict(),z.object({...ref,objectId:idSchema,change:elementChange}).strict()]),readOnly:false},
    update_icon_elements: {description:'Atomically update SVG elements using changes [{elementId,patch:{fill,stroke,strokeWidth,opacity}}]. Legacy flat changes remain supported. One revision and undo transaction; invalid IDs reject the entire batch.',schema:z.object({...ref,objectId:idSchema,changes:z.array(z.union([elementModification,elementChange])).min(1).max(1000)}).strict(),readOnly:false},
    list_svg_elements: {description:'Inspect editable paths/groups on one SVG instance. Definition/use contents are excluded; keys are stable within the immutable asset.',schema:z.object({documentId:idSchema,objectId:idSchema}).strict(),readOnly:true},
    recolor_svg_element: {description:'Set fill/stroke independently on an SVG path or group instance. Null removes that override. Preserves geometry; supports undo/redo.',schema:z.object({...ref,objectId:idSchema,elementKey:svgElementKeySchema,style:z.object({fill:color.nullable().optional(),stroke:color.nullable().optional()}).strict().refine(s=>Object.keys(s).length>0,'Provide fill or stroke')}).strict(),readOnly:false},
    recolor_asset: {description:'Recolor one SVG instance using exact palette values; library originals remain intact.',schema:z.object({...ref,objectId:idSchema,colorMap:colorMapSchema}).strict(),readOnly:false},
    add_icon: { description: 'Insert a catalog SVG as an editable transformable icon instance. Use search_icons to obtain iconId.', schema: z.object({ ...ref, ...placement, iconId: z.string().max(150) }).strict(), readOnly: false },
    add_shape: { description: 'Add an editable rectangle, rounded rectangle or ellipse.', schema: z.object({ ...ref, ...placement, shape: z.enum(['rect', 'ellipse', 'roundrect']).default('rect') }).strict(), readOnly: false },
    add_text: { description: 'Add editable text; newlines are preserved.', schema: z.object({ ...ref, ...placement, text: z.string().max(10000) }).strict(), readOnly: false },
    add_arrow: { description: 'Add an editable arrow. Optional relationship records sourceId, targetId and labelIds for safe layout correction; points along local +X.', schema: z.object({ ...ref, ...placement,relationship:relationshipSchema.optional() }).strict(), readOnly: false },
    update_object: { description: 'Update validated object properties or an invertible six-value affine transform; cannot change identity or parent. Style fields merge.', schema: z.object({ ...ref, objectId: idSchema, patch: patchSchema }).strict(), readOnly: false },
    delete_object: { description: 'Delete an object and all descendants in a single undoable transaction.', schema: z.object({ ...ref, objectId: idSchema }).strict(), readOnly: false },
    group_objects: { description: 'Group sibling objects, preserving their current world placement.', schema: z.object({ ...ref, objectIds: z.array(idSchema).min(2).max(500), name: z.string().max(300).default('Group') }).strict(), readOnly: false },
    ungroup_objects: { description: 'Remove a group, preserving child world transforms.', schema: z.object({ ...ref, objectId: idSchema }).strict(), readOnly: false },
    list_objects: { description: 'List a bounded page of objects, including hierarchy, transform, and style.', schema: z.object({ documentId: idSchema, limit: z.number().int().min(1).max(500).default(100), offset: z.number().int().nonnegative().default(0) }).strict(), readOnly: true },
    export_svg: { description: 'Return standalone vector SVG for the saved document revision. Does not write an external file.', schema: z.object({ documentId: idSchema }).strict(), readOnly: true },
    apply_operations: { description: 'Apply an atomic batch through the shared document engine; useful for layout, multiple transforms and layer reordering.', schema: z.object({ ...ref, operations: z.array(operationSchema).min(1).max(5000) }).strict(), readOnly: false },
    apply_figure_plan: { description: 'Replace document content from a structured scientific plan; deterministic topological layout needs no pixel coordinates. One undoable transaction.', schema: z.object({ ...ref, plan: planSchema }).strict(), readOnly: false },
    undo: { description: 'Undo the last document transaction, including edits made by MCP or the UI.', schema: z.object(ref).strict(), readOnly: false },
    redo: { description: 'Redo the last undone transaction.', schema: z.object(ref).strict(), readOnly: false }
} as const;
export type ToolName = keyof typeof toolDefinitions;
export function executeTool(name: string, input: unknown, store: Store, catalog: Catalog): unknown {
    if (!Object.hasOwn(toolDefinitions, name))
        throw new Error('Unknown tool');
    const args = toolDefinitions[name as ToolName].schema.parse(input) as any;
    if (Object.hasOwn(engineToolDefinitions, name)) return executeEngineTool(name, args, store, catalog);
    const d = () => store.read(args.documentId).document;
    const mutate = (ops: unknown) => store.mutate(args.documentId, ops, args.expectedRevision);
    if(name==='resize_artboard')return resizeArtboard(store,catalog,args);
    if(name==='render_figure'){const doc=d();store.check({document:doc,past:[],future:[]},args.expectedRevision);return renderFigure(doc,catalog,args.scale,args.strictScale).then(({measurements,...result})=>({...result,snapshotCurrent:store.read(doc.id).document.revision===doc.revision}));}
    if(name==='analyze_figure_layout'||name==='refine_figure_layout')return inspectFigure(store,catalog,{...args,apply:name==='refine_figure_layout'&&args.apply,maxIterations:args.maxIterations || 1});
    if(name==='compose_figure'){
        browserExecutable(); // Fail before creating anything if rendering is unavailable.
        const doc=executeTool('create_document',{title:args.title,plan:args.plan},store,catalog) as ReturnType<Store['create']>;
        return inspectFigure(store,catalog,{...args,documentId:doc.id,expectedRevision:doc.revision,apply:args.maxIterations>0,maxIterations:Math.max(1,args.maxIterations)}).catch((e:Error)=>{throw Error(`Composer created new document ${doc.id}; visual feedback failed: ${e.message}. Read that document before retrying; do not create a duplicate blindly.`);});
    }
    if (name === 'create_document') {
        const l = args.plan ? layoutPlan(args.plan, id => catalog.get(id)) : null;
        let created = store.create(args.title, l?.width ?? args.width, l?.height ?? args.height);
        if (l) {
            const next = applyCommands(created, l.operations);
            created = store.replace(created.id, { ...next, title: args.title }, created.revision);
        }
        return created;
    }
    if (name === 'harmonize_asset') {
        const node = d().nodes[args.objectId];
        if (!node || node.type !== 'icon') throw new Error('Select an icon instance');
        const asset = catalog.get(node.iconId!);
        const colorMap = harmonizeColorMap(asset.svg, args.hue, { saturation: args.saturation, preserveExtremes: args.preserveExtremes });
        if (!Object.keys(colorMap).length) throw new Error(`${asset.name} has no configurable paint values; its colours are fixed or gradient-based`);
        return mutate([{ type: 'update', id: node.id, patch: { colorMap } }]);
    }
    if (name === 'compose_layout') {
        const used = new Set<string>();
        const nextId = () => { let id = randomUUID(); while (used.has(id)) id = randomUUID(); used.add(id); return id; };
        const layout = composeFigureLayout(args, nextId, (id: string) => catalog.get(id));
        const created = store.create(args.title, layout.width, layout.height);
        return store.replace(created.id, applyCommands(created, layout.operations), created.revision);
    }
    if (name === 'add_primitives') {
        const used = new Set(Object.keys(d().nodes));
        const nextId = () => { let id = randomUUID(); while (used.has(id)) id = randomUUID(); used.add(id); return id; };
        return mutate(args.primitives.flatMap((primitive: unknown) => buildPrimitive(primitive, nextId).operations));
    }
    if (name === 'delete_document')
        return store.delete(args.documentId, args.expectedRevision);
    if (name === 'list_documents')
        return store.list();
    if (name === 'get_document')
        return d();
    if (name === 'search_icons')
        return catalog.search(args.query, args.limit, args.offset, args.category, args.subcategory, args.provider,args.scientificCategory,args.quality,args.uniqueGeometry);
    if (name === 'get_asset') return catalog.details(args.iconId);
    if (name === 'list_categories') return catalog.categories(args.provider);
    if (name === 'list_providers') return catalog.providers();
    if (name === 'list_imports') return catalog.history();
    if (['list_svg_elements','list_icon_elements','recolor_svg_element','update_icon_element','update_icon_elements'].includes(name)) {
        const doc=d(),node=doc.nodes[args.objectId];
        if(!node || node.type!=='icon') throw new Error('Select an icon instance');
        const asset=catalog.get(node.iconId!);
        const {elements}=editSvgElements(applySvgPalette(asset.svg,node.colorMap),node.elementStyles);
        if(name==='list_svg_elements') return {iconId:node.iconId,items:elements};
        if(name==='list_icon_elements')return {documentId:doc.id,revision:doc.revision,objectId:node.id,iconId:node.iconId,total:elements.length,items:elements.slice(args.offset,args.offset+args.limit),nextOffset:args.offset+args.limit<elements.length?args.offset+args.limit:null};
        const rawChanges=name==='recolor_svg_element' ? [{elementKey:args.elementKey,...args.style}] : name==='update_icon_element' ? [args.change || {elementId:args.elementId,patch:args.patch}] : args.changes;
        const changes=rawChanges.map((c:any)=>c.patch?{elementId:c.elementId,...c.patch}:c);
        const elementStyles=updateSvgElementStyles(elements,node.elementStyles,changes);
        return mutate([{type:'update',id:node.id,patch:{elementStyles}}]);
    }
    if (name === 'recolor_asset') {
        const node=d().nodes[args.objectId];
        if (!node || node.type!=='icon') throw new Error('Select an icon instance');
        const asset=catalog.get(node.iconId!);
        const palette=new Set([...asset.svg.matchAll(/\b(?:fill|stroke|stop-color|color)="([^"]+)"/g)].map(m=>m[1]));
        for(const value of Object.keys(args.colorMap)) if(!palette.has(value) || /^(none|url\()/i.test(value)) throw new Error('Color is not configurable');
        return mutate([{type:'update',id:node.id,patch:{colorMap:args.colorMap}}]);
    }
    if (name === 'list_objects') {
        const nodes = Object.values(d().nodes);
        return { items: nodes.slice(args.offset, args.offset + args.limit), total: nodes.length, nextOffset: args.offset + args.limit < nodes.length ? args.offset + args.limit : null };
    }
    if (name === 'export_svg') {
        const doc = d();
        return { documentId: doc.id, revision: doc.revision, svg: exportSvg(doc, id => ({...catalog.get(id),sourceAttributions:catalog.attributions(id)})) };
    }
    if (name === 'apply_operations') {
        for (const op of args.operations)
            if (op.type === 'add' && op.node.type === 'icon')
                catalog.get(op.node.iconId);
        return mutate(args.operations);
    }
    if (name === 'apply_figure_plan') {
        const l = layoutPlan(args.plan, id => catalog.get(id)), doc = d();
        return store.replace(doc.id, applyCommands({ ...doc, roots: [], nodes: {}, width: l.width, height: l.height }, l.operations), args.expectedRevision);
    }
    if (name === 'undo' || name === 'redo')
        return store.history(args.documentId, name, args.expectedRevision);
    if (name === 'update_object') {
        if (args.patch.iconId)
            catalog.get(args.patch.iconId);
        return mutate([{ type: 'update', id: args.objectId, patch: args.patch }]);
    }
    if (name === 'delete_object')
        return mutate([{ type: 'delete', id: args.objectId }]);
    if (name === 'group_objects')
        return mutate([{ type: 'group', ids: args.objectIds, id: randomUUID(), name: args.name }]);
    if (name === 'ungroup_objects')
        return mutate([{ type: 'ungroup', id: args.objectId }]);
    const type = name.replace('add_', '');
    if (type === 'icon')
        catalog.get(args.iconId);
    const n = nodeSchema.parse({ id: randomUUID(), type, name: args.name ?? args.text ?? args.iconId ?? args.shape ?? 'Arrow', parentId: args.parentId ?? null, transform: [1, 0, 0, 1, args.x, args.y], width: args.width, height: args.height, style: type === 'text' ? { fill: '#1f2d27', ...args.style } : args.style, iconId: args.iconId, text: args.text, shape: args.shape,relationship:args.relationship,layoutRole:args.layoutRole });
    return mutate([{ type: 'add', node: n }]);
}
