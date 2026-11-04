import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, existsSync, renameSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { sanitizeSvg } from './sanitize.ts';
import { builtinIcons, searchBuiltin } from '../core/icons.ts';
import type { IconAsset } from '../core/icons.ts';
import {assessScience} from './science.ts';
export class Catalog {
    db: DatabaseSync;
    directory: string;
    /** Optional read-only library (e.g. inside Helix.app) consulted when an asset file is absent from `directory`. */
    libraryDirectory?: string;
    private categoryCache=new Map<string,{version:number;rows:any[]}>();
    private providerCache?:{version:number;rows:any[]};
    constructor(directory: string, libraryDirectory: string | undefined = process.env.HELIX_LIBRARY_DIR || undefined) { this.directory = resolve(directory); this.libraryDirectory = libraryDirectory ? resolve(libraryDirectory) : undefined; mkdirSync(join(this.directory, 'assets'), { recursive: true }); mkdirSync(join(this.directory, 'thumbnails'), { recursive: true }); this.db = new DatabaseSync(join(this.directory, 'catalog.sqlite')); this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,tags TEXT NOT NULL,description TEXT NOT NULL,viewBox TEXT NOT NULL,license TEXT NOT NULL,provider TEXT NOT NULL,createdAt TEXT NOT NULL); CREATE VIRTUAL TABLE IF NOT EXISTS asset_search USING fts5(id UNINDEXED,name,category,tags,description,tokenize='unicode61'); CREATE TABLE IF NOT EXISTS provenance(assetId TEXT NOT NULL,sourceHash TEXT NOT NULL,sourceFile TEXT NOT NULL,metadata TEXT NOT NULL,UNIQUE(assetId,sourceHash,sourceFile));`); this.migrate(); }
    migrate() {
        const version = (this.db.prepare('PRAGMA user_version').get() as any).user_version;
        if (version > 2) throw new Error('Unsupported asset database version');
        this.db.exec(`CREATE TABLE IF NOT EXISTS asset_details(assetId TEXT PRIMARY KEY,metadata TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS import_sources(sourceFile TEXT PRIMARY KEY,sourceHash TEXT NOT NULL,metadataHash TEXT NOT NULL,assetId TEXT NOT NULL,importedAt TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS import_history(id TEXT PRIMARY KEY,startedAt TEXT NOT NULL,finishedAt TEXT,source TEXT NOT NULL,report TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS asset_science(assetId TEXT PRIMARY KEY,geometryHash TEXT NOT NULL,quality TEXT NOT NULL,scientificCategory TEXT NOT NULL,metadata TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS science_geometry ON asset_science(geometryHash);
          CREATE INDEX IF NOT EXISTS science_quality_category ON asset_science(quality,scientificCategory,assetId);
          CREATE INDEX IF NOT EXISTS science_category ON asset_science(scientificCategory,assetId);
          CREATE INDEX IF NOT EXISTS assets_category ON assets(category);
          CREATE INDEX IF NOT EXISTS assets_provider_category ON assets(provider,category,id);
          CREATE INDEX IF NOT EXISTS provenance_provider_asset ON provenance(json_extract(metadata,'$.provider'),assetId);
          CREATE INDEX IF NOT EXISTS details_subcategory ON asset_details(json_extract(metadata,'$.subcategory'));
          CREATE INDEX IF NOT EXISTS history_started ON import_history(startedAt);
          PRAGMA user_version=2;`);
    }
    annotate(id:string,svg:string,meta:any) {const r=assessScience(svg,meta);this.db.prepare('INSERT OR REPLACE INTO asset_science VALUES(?,?,?,?,?)').run(id,r.geometryHash,r.quality,r.scientificCategory,JSON.stringify(r.metadata));return r;}
    science(id:string) {const r=this.db.prepare('SELECT * FROM asset_science WHERE assetId=?').get(id) as any;return r?{geometryHash:r.geometryHash,quality:r.quality,scientificCategory:r.scientificCategory,qualityAssessment:JSON.parse(r.metadata)}:{};}
    /** Writable data directory first, then the bundled read-only library. */
    file(...parts:string[]) { const own=join(this.directory,...parts); return this.libraryDirectory && !existsSync(own) && existsSync(join(this.libraryDirectory,...parts)) ? join(this.libraryDirectory,...parts) : own; }
    thumbnail(id:string) {
        const builtin=builtinIcons.find(i=>i.id===id);if(builtin)return builtin.svg;
        if(!/^asset-[a-f0-9]{64}$/.test(id) || !this.db.prepare('SELECT 1 FROM assets WHERE id=?').get(id))throw new Error('Unknown icon');
        return readFileSync(this.file('thumbnails',id.slice(6)+'.svg'),'utf8');
    }
    details(id: string) {
        const {svg, ...asset} = this.get(id);
        const geometry=sanitizeSvg(svg);
        const row = this.db.prepare('SELECT metadata FROM asset_details WHERE assetId=?').get(id) as any;
        return {...asset, width:geometry.width,height:geometry.height,elements:geometry.elements,vectorElements:geometry.vectorElements,palette:geometry.palette, ...(row ? JSON.parse(row.metadata) : {}), provenance: this.provenance(id),...this.science(id)};
    }
    providers() {
        const version=Number((this.db.prepare('PRAGMA data_version').get() as any).data_version);if(this.providerCache?.version===version)return structuredClone(this.providerCache.rows);
        const rows=this.db.prepare(`SELECT provider,count(DISTINCT id) AS count FROM (SELECT id,provider FROM assets UNION SELECT assetId,json_extract(metadata,'$.provider') FROM provenance) WHERE provider IS NOT NULL GROUP BY provider`).all() as {provider:string;count:number}[];
        for(const icon of builtinIcons){const row=rows.find(r=>r.provider===icon.provider);if(row)row.count++;else rows.push({provider:icon.provider,count:1});}
        rows.sort((a,b)=>a.provider.localeCompare(b.provider));this.providerCache={version,rows};return structuredClone(rows);
    }
    categories(provider?:string) {
        const version=Number((this.db.prepare('PRAGMA data_version').get() as any).data_version),key=provider || '';const cached=this.categoryCache.get(key);if(cached?.version===version)return structuredClone(cached.rows);
        const sql=`WITH sources AS (SELECT a.id,a.category,coalesce(json_extract(d.metadata,'$.subcategory'),'') AS subcategory,a.provider,coalesce(d.metadata,'{}') AS metadata FROM assets a LEFT JOIN asset_details d ON d.assetId=a.id UNION ALL SELECT assetId,json_extract(metadata,'$.category'),coalesce(json_extract(metadata,'$.subcategory'),''),json_extract(metadata,'$.provider'),metadata FROM provenance), entries AS (SELECT sources.id,coalesce(c.value,sources.category) AS category,coalesce(s.value,sources.subcategory) AS subcategory,sources.provider FROM sources LEFT JOIN json_each(sources.metadata,'$.officialCategories') c LEFT JOIN json_each(sources.metadata,'$.officialSubcategories') s) SELECT category,count(DISTINCT id) AS count,json_group_array(DISTINCT subcategory) AS subcategories FROM entries WHERE category IS NOT NULL ${provider?'AND provider=?':''} GROUP BY category`;
        const rows=this.db.prepare(sql).all(...(provider?[provider]:[])) as any[];
        const categories=new Map<string,{category:string;count:number;subcategories:string[]}>();
        for(const row of rows)categories.set(row.category,{category:row.category,count:Number(row.count),subcategories:JSON.parse(row.subcategories).filter(Boolean).sort()});
        for(const icon of builtinIcons.filter(i=>!provider || i.provider===provider)){const entry=categories.get(icon.category) || {category:icon.category,count:0,subcategories:[]};entry.count++;categories.set(icon.category,entry);}
        const result=[...categories.values()].sort((a,b)=>a.category.localeCompare(b.category));this.categoryCache.set(key,{version,rows:result});return structuredClone(result);
    }
    history() { return this.db.prepare('SELECT * FROM import_history ORDER BY startedAt DESC,rowid DESC LIMIT 50').all().map((r:any)=>({...r,report:JSON.parse(r.report)})); }
    close() { this.db.close(); }
    add(svg: string, meta: {
        name: string;
        category: string;
        tags: string[];
        description: string;
        viewBox: string;
        license: string;
        provider: string;
        sourceFile: string;
        sourceHash: string;
        licenseReference?: string;
        attribution?: string;
        providerId?: string;
        [key: string]: unknown;
    }, refreshMetadata = false, preserveCanonical = false) { const hash = createHash('sha256').update(svg).digest('hex'), id = `asset-${hash}`; const file = join(this.directory, 'assets', `${hash}.svg`); if (!existsSync(this.file('assets', `${hash}.svg`))) {
        const tmp = file + '.' + randomUUID() + '.tmp';
        writeFileSync(tmp, svg);
        renameSync(tmp, file);
    } const thumb = svg.replace('<svg ', '<svg width="128" height="128" '); const thumbPath = join(this.directory, 'thumbnails', `${hash}.svg`); if (!existsSync(this.file('thumbnails', `${hash}.svg`)))
        writeFileSync(thumbPath, thumb); this.db.exec('BEGIN IMMEDIATE'); try {
        const existingAsset = this.db.prepare('SELECT * FROM assets WHERE id=?').get(id) as any;
        const exists = !!existingAsset;
        const previous = this.db.prepare('SELECT metadata FROM provenance WHERE assetId=? AND sourceHash=? AND sourceFile=?').get(id,meta.sourceHash,meta.sourceFile) as {metadata:string} | undefined;
        const previousDetails = this.db.prepare('SELECT metadata FROM asset_details WHERE assetId=?').get(id) as {metadata:string} | undefined;
        const sourceMetadata = previous ? JSON.parse(previous.metadata) : {};
        const details = previousDetails ? JSON.parse(previousDetails.metadata) : {
            ...sourceMetadata,
            ...(existingAsset ? {name:existingAsset.name,category:existingAsset.category,tags:JSON.parse(existingAsset.tags),description:existingAsset.description,viewBox:existingAsset.viewBox,license:existingAsset.license,provider:existingAsset.provider,importedAt:existingAsset.createdAt} : {})
        };
        // A duplicate source may have different inferred names/filenames. Refresh only
        // fields that actually changed at this source, rather than replacing canonical metadata.
        const changes = Object.fromEntries(Object.entries(meta).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(sourceMetadata[key])));
        const canonicalMeta = exists && refreshMetadata && previous ? {...details,...changes} : meta;
        if (!exists || refreshMetadata && !preserveCanonical) {
            this.db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,tags=excluded.tags,description=excluded.description,viewBox=excluded.viewBox,license=excluded.license,provider=excluded.provider').run(id, canonicalMeta.name, canonicalMeta.category, JSON.stringify(canonicalMeta.tags), canonicalMeta.description, canonicalMeta.viewBox, canonicalMeta.license, canonicalMeta.provider, new Date().toISOString());
        }
        if (!exists || refreshMetadata && !preserveCanonical) {
            this.db.prepare('INSERT OR REPLACE INTO asset_details VALUES(?,?)').run(id, JSON.stringify({...details, ...canonicalMeta, importedAt:details.importedAt ?? new Date().toISOString()}));
        }
        if (!previous) {
            this.db.prepare('INSERT INTO provenance VALUES(?,?,?,?)').run(id,meta.sourceHash,meta.sourceFile,JSON.stringify({...meta,importedAt:new Date().toISOString()}));
        } else if (refreshMetadata) {
            // Update only this source's supplied metadata; retain its original timestamp and any extra fields.
            const provenance = JSON.parse(previous.metadata);
            this.db.prepare('UPDATE provenance SET metadata=? WHERE assetId=? AND sourceHash=? AND sourceFile=?').run(JSON.stringify({...provenance,...meta,importedAt:provenance.importedAt}),id,meta.sourceHash,meta.sourceFile);
        }
        if(!exists || refreshMetadata || !previous)this.reindex(id);
        this.categoryCache.clear();this.providerCache=undefined;
        if(!exists)this.annotate(id,svg,meta);
        this.db.exec('COMMIT');
        return { id, duplicate: exists };
    }
    catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
    } }
    reindex(id:string) {
        const row=this.db.prepare('SELECT * FROM assets WHERE id=?').get(id) as any;
        const sources=this.provenance(id);
        const text=(values:unknown[])=>[...new Set(values.filter(v=>typeof v==='string' && v))].join(' ');
        this.db.prepare('DELETE FROM asset_search WHERE id=?').run(id);
        this.db.prepare('INSERT INTO asset_search VALUES(?,?,?,?,?)').run(id,text([row.name,...sources.map(m=>m.name)]),text([row.category,...sources.flatMap(m=>[m.category,...(m.officialCategories || [])])]),text([...JSON.parse(row.tags),...sources.flatMap(m=>[...(m.tags || []),m.subcategory,m.scientificName,m.scientificCategory,...(m.taxonomyIds || []),...(m.officialSubcategories || [])])]),text([row.description,...sources.flatMap(m=>[m.description,m.author])]));
    }
    search(query = '', limit = 30, offset = 0, category?: string, subcategory?: string, provider?:string, scientificCategory?:string, quality?:string, uniqueGeometry=false) {
        const terms=query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
        const synonyms:Record<string,string>={mitochondria:'mitochondrion',mitochondrion:'mitochondria',nuclear:'nucleus',genetic:'dna',signalling:'receptor',signaling:'receptor'};
        const expanded=[...new Set(terms.flatMap(t=>[t,...(synonyms[t]?[synonyms[t]]:[])]))];
        const phrases:string[]=[];
        if(/\bipscs?\b/i.test(query) || /induced pluripotent stem cell/i.test(query))phrases.push('induced pluripotent stem cell','ipsc');
        const stemContext=scientificCategory==='Stem cells and development' || /stem cell/i.test(query);
        if(stemContext && /\bESC\b/.test(query))phrases.push('embryonic stem cell');
        const cellContext=scientificCategory==='Cell biology' || /organelle|endoplasmic|reticulum/i.test(query);
        if(cellContext && /\bER\b/.test(query))phrases.push('endoplasmic reticulum');
        const match=[...expanded.map(t=>'"'+t+'"*'),...phrases.map(p=>'"'+p+'"*')].join(' OR ');
        let sql=match?'SELECT assets.* FROM asset_search JOIN assets ON assets.id=asset_search.id WHERE asset_search MATCH ?':'SELECT assets.* FROM assets WHERE 1=1';
        const args:(string|number)[]=match?[match]:[];
        const filters=[['provider',provider],['category',category],['subcategory',subcategory]].filter(([,v])=>!!v) as [string,string][];
        if(filters.length){
            const canonical=filters.map(([key,value])=>{
                args.push(value);
                if(key==='provider')return 'assets.provider=?';
                const array=key==='category'?'officialCategories':'officialSubcategories';
                args.push(value);
                const direct=key==='subcategory'?"assets.id IN (SELECT assetId FROM asset_details WHERE json_extract(metadata,'$.subcategory')=?)":'assets.category=?';
                return `(${direct} OR assets.id IN (SELECT assetId FROM asset_details d,json_each(d.metadata,'$.${array}') j WHERE j.value=?))`;
            }).join(' AND ');
            const aliases=filters.map(([key,value])=>{
                args.push(value);if(key==='provider')return "json_extract(metadata,'$.provider')=?";
                args.push(value);const array=key==='category'?'officialCategories':'officialSubcategories';
                return `(json_extract(metadata,'$.${key}')=? OR EXISTS(SELECT 1 FROM json_each(provenance.metadata,'$.${array}') j WHERE j.value=?))`;
            }).join(' AND ');
            sql+=` AND ((${canonical}) OR assets.id IN (SELECT assetId FROM provenance WHERE ${aliases}))`;
        }
        if(scientificCategory){sql+=' AND assets.id IN (SELECT assetId FROM asset_science WHERE scientificCategory=?)';args.push(scientificCategory);}
        if(quality){sql+=' AND assets.id IN (SELECT assetId FROM asset_science WHERE quality=?)';args.push(quality);}
        if(uniqueGeometry){const matched=sql.replace('SELECT assets.*','SELECT assets.*, '+(match?'bm25(asset_search)':'0')+' AS helixRank');sql='WITH matches AS MATERIALIZED ('+matched+') SELECT * FROM matches WHERE id IN (SELECT min(m.id) FROM matches m LEFT JOIN asset_science s ON s.assetId=m.id GROUP BY coalesce(s.geometryHash,m.id))';sql+=match?' ORDER BY helixRank,id':' ORDER BY name,id';}
        else sql+=match?' ORDER BY bm25(asset_search),assets.id':' ORDER BY assets.name,assets.id';
        const built=searchBuiltin(query).filter(i=>!scientificCategory && !quality && (!category||i.category===category)&&!subcategory&&(!provider||i.provider===provider));
        const builtPage=built.slice(offset,offset+limit),remaining=limit-builtPage.length;
        sql+=' LIMIT ? OFFSET ?';args.push(remaining+1,Math.max(0,offset-built.length));
        const rows=this.db.prepare(sql).all(...args) as any[];
        const items=[...builtPage,...rows.slice(0,remaining).map(r=>{
            const base={...this.row(r),...this.science(r.id)};
            if(!filters.length)return base;
            const matches=(m:any)=>filters.every(([k,v])=>m[k]===v || (k==='category' && (m.officialCategories || []).includes(v)) || (k==='subcategory' && (m.officialSubcategories || []).includes(v)));
            return {...base,...(matches(base)?base:this.provenance(r.id).find(matches)),id:r.id};
        })];
        return {items:items.map(({svg,providerMetadata,...r}:any)=>r),nextOffset:rows.length>remaining || offset+limit<built.length?offset+limit:null,searchMode:'taxonomy-synonym-full-text',note:'Deterministic lexical/synonym ranking; no embedding model or external API.'};
    }
    row(r: any): IconAsset { return { name: r.name, category: r.category, tags: JSON.parse(r.tags), viewBox: r.viewBox, license: r.license, provider: r.provider, ...(JSON.parse((this.db.prepare('SELECT metadata FROM asset_details WHERE assetId=?').get(r.id) as any)?.metadata || '{}')), id:r.id, svg: '' }; }
    get(id: string): IconAsset { const builtin = builtinIcons.find(i => i.id === id); if (builtin)
        return builtin; if (!/^asset-[a-f0-9]{64}$/.test(id))
        throw new Error('Unknown icon'); const row = this.db.prepare('SELECT * FROM assets WHERE id=?').get(id); if (!row)
        throw new Error('Unknown icon'); return { ...this.row(row), svg: readFileSync(this.file('assets', id.slice(6) + '.svg'), 'utf8') }; }
    provenance(id: string) { return this.db.prepare('SELECT metadata FROM provenance WHERE assetId=?').all(id).map((r: any) => JSON.parse(r.metadata)); }
    attributions(id:string) {
        return this.provenance(id).map(meta=>{
            const {name,provider,author,authorReference,attribution,license,licenseReference,licenseUrl,sourceUrl,repositoryRevision,sourceHash,licenseNotice,credit,collection,doi}=meta;
            const notice=typeof licenseNotice==='string' && /^licenses\/[a-z0-9-]+\/[a-z0-9.-]+\.txt$/.test(licenseNotice) ? this.file(licenseNotice) : null;
            return {name,provider,author,authorReference,attribution,license,licenseReference,licenseUrl,sourceUrl,repositoryRevision,sourceHash,credit,collection,doi,
                ...(notice && existsSync(notice) ? {licenseNoticeText:readFileSync(notice,'utf8')} : {})};
        });
    }
    count() { return Number((this.db.prepare('SELECT count(*) AS n FROM assets').get() as any).n) + builtinIcons.length; }
}
