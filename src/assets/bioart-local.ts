import {readFileSync,mkdirSync,writeFileSync,renameSync,existsSync,readdirSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {Catalog} from './catalog.ts';
import {bioartDownloadManifestSchema,buildBioartManifest,extractBioartSvgMetadata} from './bioart.ts';
import {sanitizeSvg,SVG_SANITIZER_PROFILE} from './sanitize.ts';
import {importDirectory} from './importer.ts';
export async function importBioartLocal(input:string,catalog:Catalog,manifestInput:unknown,onProgress?:(report:unknown)=>void) {
    const root=resolve(input),records=bioartDownloadManifestSchema.parse(manifestInput).assets,manifest=buildBioartManifest(manifestInput);
    if(!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())throw new Error('Input must be a real local directory');
    const stage=join(catalog.directory,'bioart-source');mkdirSync(stage,{recursive:true});
    const cacheFile=join(catalog.directory,'bioart-preflight.json');
    const cache:Record<string,any>=existsSync(cacheFile)?JSON.parse(readFileSync(cacheFile,'utf8')):{};
    const includeFiles=new Set<string>(),rejected:{file:string;error:string}[]=[],sources:Record<string,{sha256:string;status:string}>={};
    for(const record of records){try{
        const file=resolve(root,record.filename);if(!file.startsWith(root+'/'))throw new Error('Source escapes local directory');
        const stat=lstatSync(file);if(!stat.isFile() || stat.isSymbolicLink())throw new Error('Non-regular local SVG');if(stat.size>6000000)throw new Error('SVG exceeds 6 MB limit');
        const bytes=readFileSync(file),hash=createHash('sha256').update(bytes).digest('hex');
        if(record.sha256 && hash!==record.sha256)throw new Error('Official download hash mismatch');
        const cached=cache[file];
        if(!cached || cached.sha256!==hash || cached.profile!==SVG_SANITIZER_PROFILE){
            try{const embedded=extractBioartSvgMetadata(bytes.toString('utf8'));sanitizeSvg(bytes.toString('utf8'));cache[file]={sha256:hash,profile:SVG_SANITIZER_PROFILE,license:embedded.license};}
            catch(error){cache[file]={sha256:hash,profile:SVG_SANITIZER_PROFILE,error:(error as Error).message};throw error;}
        }
        if(cache[file].error)throw new Error(cache[file].error);
        if(cache[file].license && cache[file].license!==record.license)throw new Error('Conflicting embedded and manifest license');
        const target=join(stage,record.filename);mkdirSync(resolve(target,'..'),{recursive:true});
        if(!existsSync(target) || !readFileSync(target).equals(bytes)){const temporary=target+'.'+randomUUID()+'.tmp';writeFileSync(temporary,bytes);renameSync(temporary,target);}
        includeFiles.add(record.filename.split('\\').join('/'));sources[record.filename]={sha256:hash,status:'staged'};
    }catch(error){rejected.push({file:record.filename,error:(error as Error).message});}}
    const cacheTemporary=cacheFile+'.'+randomUUID()+'.tmp';writeFileSync(cacheTemporary,JSON.stringify(cache));renameSync(cacheTemporary,cacheFile);
    const imported=await importDirectory(stage,catalog,manifest,onProgress,{includeFiles});
    for(const [file,state]of Object.entries(sources)){
        const record=catalog.db.prepare('SELECT sourceHash FROM import_sources WHERE sourceFile=?').get(join(stage,file)) as any;
        if(record?.sourceHash===state.sha256)state.status='imported';
    }
    const localSvgs=readdirSync(root).filter(f=>/\.svg$/i.test(f));
    return {provider:'NIH BioArt Source',discoveredLocalSvgs:localSvgs.length,manifestEntries:records.length,unmanifestedSkipped:localSvgs.filter(f=>!records.some(r=>r.filename===f)),compatible:includeFiles.size,rejected,import:imported,sources};
}
