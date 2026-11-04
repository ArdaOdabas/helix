import {DOMParser} from '@xmldom/xmldom';
import {z} from 'zod';
export const BIOART_PROVIDER='NIH BioArt Source';
export const bioartRecordSchema=z.object({
    originalFilename:z.string().max(2000).optional(),
    filename:z.string().min(1).refine(s=>!s.startsWith('/') && !s.split(/[\\/]/).some(p=>p==='..'),'Use a relative filename'),
    sourceUrl:z.string().regex(/^https:\/\/bioart\.niaid\.nih\.gov\/bioart\/\d+$/),
    title:z.string().min(1).max(300),description:z.string().max(20000).optional(),license:z.string().min(1).max(300),
    licenseReference:z.string().min(1).max(1000),licenseUrl:z.string().max(2000).optional(),
    creator:z.string().max(300).optional(),credit:z.string().max(1000).optional(),citation:z.string().max(1000).optional(),collection:z.string().max(500).optional(),
    categories:z.array(z.string().max(300)).max(100).default([]),subcategories:z.array(z.string().max(300)).max(100).default([]),keywords:z.array(z.string().max(2000)).max(500).default([]),
    creationDate:z.string().max(100).optional(),submissionDate:z.string().max(100).optional(),modificationDate:z.string().max(100).optional(),doi:z.string().max(1000).optional(),
    sha256:z.string().regex(/^[a-f0-9]{64}$/).optional()
}).strict();
export const bioartDownloadManifestSchema=z.object({version:z.literal(1),assets:z.array(bioartRecordSchema)}).strict();
export function extractBioartSvgMetadata(svg:string) {
    if(Buffer.byteLength(svg)>6000000)throw new Error('SVG exceeds 6 MB limit');
    if(/<!DOCTYPE|<!ENTITY|<\?/i.test(svg.replace(/^\s*<\?xml[^?]*\?>/,'')))throw new Error('Unsafe XML declarations');
    const errors:string[]=[];
    const document=new DOMParser({onError:(_level:string,message:string)=>errors.push(message)} as never).parseFromString(svg,'image/svg+xml');
    if(errors.length || !document.documentElement)throw new Error('Malformed SVG XML');
    if(document.documentElement.namespaceURI!=='http://www.w3.org/2000/svg')throw new Error('Expected SVG root');
    const metadata=Array.from(document.documentElement.childNodes).find((n:any)=>n.nodeType===1 && n.localName==='metadata') as any;
    const fields:Record<string,string>={};
    if(metadata)for(const child of Array.from(metadata.childNodes) as any[])if(child.nodeType===1)fields[child.localName]=child.textContent;
    return fields;
}
export function buildBioartManifest(input:unknown) {
    const records=bioartDownloadManifestSchema.parse(input).assets;
    const assets:Record<string,any>={};
    for(const record of records){
        if(Object.hasOwn(assets,record.filename))throw new Error('Duplicate BioArt manifest filename');
        assets[record.filename]={originalFilename:record.originalFilename || record.filename,name:record.title,description:record.description,category:record.categories[0] || 'Uncategorized',subcategory:record.subcategories[0] || undefined,
            officialCategories:record.categories,officialSubcategories:record.subcategories,tags:record.keywords,provider:BIOART_PROVIDER,
            providerId:record.sourceUrl.split('/').pop()+'/'+record.filename,sourceUrl:record.sourceUrl,author:record.creator,credit:record.credit,collection:record.collection,
            license:record.license,licenseReference:record.licenseReference,licenseUrl:record.licenseUrl,doi:record.doi,creationDate:record.creationDate,submissionDate:record.submissionDate,modificationDate:record.modificationDate,
            attribution:record.citation || [record.creator,record.credit,record.sourceUrl].filter(Boolean).join('. ')};
    }
    return {version:1 as const,provider:BIOART_PROVIDER,license:'Per-entry; see individual metadata',licenseReference:'https://bioart.niaid.nih.gov/terms',assets};
}

export function extractBioartEntryText(text:string) {
    const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
    const headers=new Set(['KEYWORDS','COLLECTION','CREATOR','CREDIT','IMAGE TYPE','IMAGE STYLE','SCIENTIFIC DISCIPLINES AND RESEARCH AREAS','DOI','ILLUSTRATION SOFTWARE/VERSION','CATEGORY','ANATOMY','CELLS AND ORGANELLES','MOLECULES','SEX','AGE GROUP','Website Policies & Notices']);
    function field(label:string){const start=lines.indexOf(label);if(start<0 || start+1>=lines.length || headers.has(lines[start+1]))return undefined;return lines[start+1];}
    const identifier=lines.findIndex(s=>/^BIOART-\d+$/.test(s));
    const categories=(field('CATEGORY') || '').split(',').map(s=>s.trim()).filter(Boolean);
    const subcategories=categories.flatMap(category=>(field(category.toUpperCase()) || '').split(',').map(s=>s.trim()).filter(Boolean));
    const citationStart=lines.indexOf('Cite This Entry'),descriptionStart=lines.indexOf('Description'),descriptionEnd=lines.indexOf('Representation',descriptionStart);
    return {title:identifier>=0?lines[identifier+1]:undefined,description:descriptionStart>=0&&descriptionEnd>descriptionStart?lines.slice(descriptionStart+1,descriptionEnd).join(' '):undefined,
        license:lines.find(s=>s.startsWith('Licensing:'))?.replace(/^Licensing:\s*/,''),creator:field('CREATOR'),credit:field('CREDIT'),citation:citationStart>=0?lines[citationStart+1]:undefined,collection:field('COLLECTION'),categories,subcategories,
        doi:field('DOI'),creationDate:lines.find(s=>s.startsWith('Creation Date:'))?.slice(14).trim(),keywords:(field('KEYWORDS') || '').split(',').map(s=>s.trim()).filter(Boolean),submissionDate:lines.find(s=>s.startsWith('Submission Date:'))?.slice(16).trim(),modificationDate:lines.find(s=>s.startsWith('Modify Date:'))?.slice(12).trim()};
}
