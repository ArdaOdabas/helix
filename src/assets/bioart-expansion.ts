import {readFileSync,writeFileSync,renameSync,existsSync,copyFileSync,mkdirSync,statSync} from 'node:fs';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {bioartRecordSchema,extractBioartSvgMetadata,extractBioartEntryText} from './bioart.ts';
export function atomicBioartJson(path:string,value:unknown){writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(path+'.tmp',path);}
export function bioartFileHash(path:string){return createHash('sha256').update(readFileSync(path)).digest('hex');}
export function bioartLinkedLicense(url?:string) {
    if(!url)return undefined;
    const match=/^https:\/\/creativecommons\.org\/licenses\/(by(?:-(?:nc|nd|sa)){0,2})\/(\d\.\d)\/?$/.exec(url);
    if(match)return {license:'CC '+match[1].toUpperCase()+' '+match[2],licenseUrl:url};
    if(/^https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?$/.test(url))return {license:'CC0 1.0',licenseUrl:url};
    throw new Error('Unrecognized visible license link; manual review required');
}
export function recordBioartDownload(root:string,path:string,originalFilename:string,sourceUrl:string,pageText:string,licenseLink?:string) {
    const page=extractBioartEntryText(pageText);let embedded:Record<string,string>={};
    const linked=bioartLinkedLicense(licenseLink);
    if(!page.license && linked)Object.assign(page,linked);
    if(statSync(path).size<=6000000)try{embedded=extractBioartSvgMetadata(readFileSync(path,'utf8'));}catch{/* The shared importer records malformed/unsupported XML; use the observed page metadata. */}
    const license=embedded.license || page.license;
    if(!license || embedded.license && page.license && embedded.license.trim()!==page.license.trim())throw new Error('Missing/conflicting individual license; manual review required');
    const id=sourceUrl.split('/').pop()!,official=basename(originalFilename);
    if(!official || /[\\/\x00]/.test(official))throw new Error('Invalid official filename');
    const hash=bioartFileHash(path);let filename=id+'-'+official;
    if(existsSync(join(root,filename)) && bioartFileHash(join(root,filename))!==hash)filename=id+'-'+hash.slice(0,12)+'-'+official;
    if(!existsSync(join(root,filename)))copyFileSync(path,join(root,filename));
    const record=bioartRecordSchema.parse({...page,filename,originalFilename:official,sourceUrl,title:embedded.title || page.title || '',description:embedded.description || page.description,license,licenseUrl:linked?.licenseUrl,licenseReference:sourceUrl,creator:embedded.creator || page.creator,credit:embedded.credit || page.credit,creationDate:embedded.creationDate || page.creationDate,sha256:hash});
    return record;
}
