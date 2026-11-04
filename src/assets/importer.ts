import { opendir, readFile, lstat } from 'node:fs/promises';
import { resolve, join, relative, extname, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sanitizeSvg, SVG_SANITIZER_PROFILE } from './sanitize.ts';
import { Catalog } from './catalog.ts';
import {geometryFingerprint} from './science.ts';
import {embeddedAttribution,licenseIdentity} from './svg-attribution.ts';
const metadata = z.object({ scientificCategory:z.string().max(200).optional(),scientificName:z.string().max(1000).optional(),taxonomyIds:z.array(z.string().max(2000)).max(500).optional(),providerMetadata:z.record(z.string(),z.unknown()).optional(), originalFilename:z.string().max(2000).optional(), officialCategories:z.array(z.string().max(300)).max(100).optional(), officialSubcategories:z.array(z.string().max(300)).max(100).optional(), collection:z.string().max(500).optional(), credit:z.string().max(1000).optional(), doi:z.string().max(1000).optional(), creationDate:z.string().max(100).optional(), submissionDate:z.string().max(100).optional(), modificationDate:z.string().max(100).optional(), author:z.string().max(300).optional(), authorReference:z.string().max(2000).optional(), sourceUrl:z.string().max(2000).optional(), licenseUrl:z.string().max(2000).optional(), licenseNotice:z.string().max(2000).optional(), repositoryRevision:z.string().max(100).optional(), upstreamPath:z.string().max(2000).optional(), provider:z.string().max(300).optional(), license:z.string().max(300).optional(), licenseReference:z.string().max(1000).optional(), subcategory:z.string().max(200).optional(), keywords:z.array(z.string().max(2000)).max(500).optional(), title:z.string().max(300).optional(), name: z.string().max(300).optional(), category: z.string().max(200).optional(), tags: z.array(z.string().max(2000)).max(500).optional(), description: z.string().max(20000).optional(), providerId: z.string().max(2000).optional(), attribution: z.string().max(1000).optional() }).strict();
export const manifestSchema = z.object({ version: z.literal(1), provider: z.string().min(1).max(300), license: z.string().min(1).max(300), licenseReference: z.string().min(1).max(1000), attribution: z.string().max(1000).optional(), defaults: metadata.optional(), assets: z.record(z.string(), metadata).default({}) }).strict();
export async function importDirectory(input: string, catalog: Catalog, manifestInput: unknown = undefined, onProgress?: (report: unknown) => void, options: {includeFiles?:ReadonlySet<string>;deduplicateGeometry?:boolean;preserveCanonical?:boolean;protectedAssetIds?:ReadonlySet<string>;extractAttribution?:boolean;maxFailures?:number} = {}) {
    const manifest = manifestSchema.parse(manifestInput ?? {version:1,provider:'Local collection',license:'Unspecified',licenseReference:'Not supplied'}), root = resolve(input);
    if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink())
        throw new Error('Input must be a real local directory');
    const report = { scanned: 0, imported: 0, updated:0, skipped:0, failed:0, duplicates: 0, rejected: 0, failures: [] as {
            file: string;
            error: string;
        }[] };
    const runId=randomUUID(), startedAt=new Date().toISOString();
    catalog.db.prepare('INSERT INTO import_history VALUES(?,?,?,?,?)').run(runId,startedAt,null,root,JSON.stringify(report));
    async function* files(dir: string): AsyncGenerator<string> { for await (const ent of await opendir(dir)) {
        if (ent.isSymbolicLink())
            continue;
        const p = join(dir, ent.name);
        if (ent.isDirectory())
            yield* files(p);
        else if (ent.isFile() && extname(p).toLowerCase() === '.svg' && (!options.includeFiles || options.includeFiles.has(relative(root,p).split('\\').join('/'))))
            yield p;
    } }
    try { for await (const file of files(root)) {
        report.scanned++;
        const key = relative(root, file).split('\\').join('/');
        try {
            const stat = await lstat(file);
            if (!stat.isFile() || stat.isSymbolicLink())
                throw new Error('Non-regular source file');
            // Matches the sanitizer's own cap; the complexity limits there are the real guard.
            if (stat.size > 6000000)
                throw new Error('SVG exceeds 6 MB limit');
            const source = await readFile(file, 'utf8'), m = { ...manifest.defaults, ...manifest.assets[key] };
            if(options.extractAttribution){const embedded=embeddedAttribution(source);if(embedded){const declared=licenseIdentity(m.license || manifest.license);for(const value of embedded.licenses){const specific=licenseIdentity(value);if(specific&&declared&&specific!==declared)throw new Error('Embedded and declared licenses conflict; manual review required');}if(!m.author&&embedded.creators.length){m.author=embedded.creators.join('; ');m.attribution=[m.attribution || manifest.attribution,...embedded.creators].filter(Boolean).join('; ');}m.providerMetadata={...m.providerMetadata,originalSvgAttribution:embedded};}}
            const sourceHash=createHash('sha256').update(source).digest('hex'), metadataHash=createHash('sha256').update(JSON.stringify({sanitizerProfile:SVG_SANITIZER_PROFILE,provider:manifest.provider,license:manifest.license,licenseReference:manifest.licenseReference,attribution:manifest.attribution,m})).digest('hex');
            const previous=catalog.db.prepare('SELECT * FROM import_sources WHERE sourceFile=?').get(file) as any;
            if (previous?.sourceHash===sourceHash && previous?.metadataHash===metadataHash) { report.skipped++; report.duplicates++; continue; }
            const clean = sanitizeSvg(source);
            const title = m.name || m.title || clean.title || basename(file, '.svg').replace(/[-_]/g, ' ');
            const sameGeometry=options.deduplicateGeometry?catalog.db.prepare('SELECT assetId FROM asset_science WHERE geometryHash=? ORDER BY assetId LIMIT 1').get(geometryFingerprint(clean.svg)) as {assetId:string}|undefined:undefined;
            const storedSvg=sameGeometry?catalog.get(sameGeometry.assetId).svg:clean.svg;
            const result = catalog.add(storedSvg, { scientificCategory:m.scientificCategory,scientificName:m.scientificName,taxonomyIds:m.taxonomyIds,providerMetadata:m.providerMetadata, officialCategories:m.officialCategories, officialSubcategories:m.officialSubcategories, collection:m.collection, credit:m.credit, doi:m.doi, creationDate:m.creationDate, submissionDate:m.submissionDate, modificationDate:m.modificationDate, author:m.author, authorReference:m.authorReference, sourceUrl:m.sourceUrl, licenseUrl:m.licenseUrl, licenseNotice:m.licenseNotice, repositoryRevision:m.repositoryRevision, upstreamPath:m.upstreamPath, name: title, subcategory:m.subcategory || key.split('/').slice(1,-1).join('/'), width:clean.width, height:clean.height, palette:clean.palette, elements:clean.elements, vectorElements:clean.vectorElements, originalFilename:m.originalFilename || basename(file), source:root, category: m.category || key.split('/').slice(0, -1)[0] || 'Uncategorized', tags: m.tags || m.keywords || title.toLowerCase().split(/\W+/).filter(Boolean), description: m.description || clean.description, viewBox: clean.viewBox, provider: m.provider || manifest.provider, license: m.license || manifest.license, licenseReference: m.licenseReference || manifest.licenseReference, attribution: m.attribution || manifest.attribution, providerId: m.providerId, sourceFile: file, relativeFilename:key, sourceHash }, !!previous && previous.assetId === `asset-${createHash('sha256').update(clean.svg).digest('hex')}` && previous.metadataHash !== metadataHash,options.preserveCanonical && (!options.protectedAssetIds || options.protectedAssetIds.has(sameGeometry?.assetId || `asset-${createHash('sha256').update(clean.svg).digest('hex')}`)));
            catalog.db.prepare('INSERT OR REPLACE INTO import_sources VALUES(?,?,?,?,?)').run(file,sourceHash,metadataHash,result.id,new Date().toISOString());
            if (previous && (previous.assetId !== result.id || previous.metadataHash !== metadataHash)) report.updated++;
            else if (result.duplicate)
                { report.duplicates++; report.skipped++; }
            else
                report.imported++;
        }
        catch (e) {
            report.rejected++; report.failed++;
            if (report.failures.length < (options.maxFailures ?? 1000))
                report.failures.push({ file: key, error: (e as Error).message });
        } finally { catalog.db.prepare('UPDATE import_history SET report=? WHERE id=?').run(JSON.stringify(report),runId); onProgress?.(structuredClone(report)); }
    }
    } catch(e) { report.failed++;report.rejected++;if(report.failures.length<(options.maxFailures ?? 1000))report.failures.push({file:root,error:(e as Error).message}); } finally {
    catalog.db.prepare('UPDATE import_history SET finishedAt=?,report=? WHERE id=?').run(new Date().toISOString(),JSON.stringify(report),runId);
    }
    return report;
}

// RFC 4180 quoting, including embedded commas and newlines.
export function parseManifest(text: string, filename: string): unknown {
    text=text.replace(/^\uFEFF/,'');
    if (!filename.toLowerCase().endsWith('.csv')) return JSON.parse(text);
    const rows:string[][]=[]; let row:string[]=[], field='', quoted=false;
    for (let i=0;i<text.length;i++) { const c=text[i]; if(c==='"') { if(quoted && text[i+1]==='"') {field+='"';i++;} else quoted=!quoted; }
      else if(!quoted && (c===',' || c==='\n')) { row.push(field.replace(/\r$/, ''));field=''; if(c==='\n'){rows.push(row);row=[];} } else field+=c; }
    if(quoted) throw new Error('Unclosed CSV quote');
    if(field || row.length){row.push(field.replace(/\r$/, ''));rows.push(row);}
    const headers=rows.shift() || [], assets:Record<string,unknown>={};
    let provider='Local collection',license='Unspecified',licenseReference='Not supplied';
    for(const cells of rows.filter(r=>r.some(Boolean))) {const r=Object.fromEntries(headers.map((h,i)=>[h.trim(),cells[i] || '']));
      if(!r.filename) throw new Error('CSV requires filename');
      if(Object.hasOwn(assets,r.filename)) throw new Error('Duplicate CSV filename: '+r.filename);
      
      assets[r.filename]={provider:r.provider || undefined,license:r.license || undefined,licenseReference:r.licenseReference || undefined,name:r.title || r.name || undefined,category:r.category || undefined,subcategory:r.subcategory || undefined,tags:(r.keywords || r.tags || '').split(';').filter(Boolean),attribution:r.attribution || undefined}; }
    return {version:1,provider,license,licenseReference,assets};
}
