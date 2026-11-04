import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join, relative} from 'node:path';

export const bioiconsLicenses: Record<string,{id:string;url:string}> = {
    'cc-0':{id:'CC0-1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/'},
    'cc-by-3.0':{id:'CC-BY-3.0',url:'https://creativecommons.org/licenses/by/3.0/'},
    'cc-by-4.0':{id:'CC-BY-4.0',url:'https://creativecommons.org/licenses/by/4.0/'},
    'cc-by-sa-3.0':{id:'CC-BY-SA-3.0',url:'https://creativecommons.org/licenses/by-sa/3.0/'},
    'cc-by-sa-4.0':{id:'CC-BY-SA-4.0',url:'https://creativecommons.org/licenses/by-sa/4.0/'},
    mit:{id:'MIT',url:'https://opensource.org/license/mit'},
    bsd:{id:'BSD-3-Clause',url:'https://opensource.org/license/bsd-3-clause'}
};
export function localSvgFiles(root:string):string[] {
    const result:string[]=[];
    function scan(dir:string) {for(const entry of readdirSync(dir,{withFileTypes:true})) {
        if(entry.isSymbolicLink() || entry.name==='.git')continue;
        const path=join(dir,entry.name);
        if(entry.isDirectory())scan(path);
        else if(entry.isFile() && /\.svg$/i.test(entry.name))result.push(relative(root,path).split('\\').join('/'));
    }}
    scan(root);return result.sort();
}
const title=(name:string)=>name.replace(/[_-]+/g,' ').trim();
export function buildBioiconsManifest(repository:string, revision:string) {
    if(!/^[a-f0-9]{40}$/.test(revision))throw new Error('Expected pinned git commit');
    const root=join(repository,'static','icons');
    const authors=JSON.parse(readFileSync(join(root,'authors.json'),'utf8')) as Record<string,string>;
    const index=JSON.parse(readFileSync(join(root,'icons.json'),'utf8')) as {name:string;category:string;license:string;author:string}[];
    const indexed=new Set(index.map(i=>JSON.stringify([i.license,i.category,i.author.replace(/ /g,'_'),i.name+'.svg'])));
    const assets:Record<string,any>={},skipped:{file:string;reason:string}[]=[],unindexed:string[]=[],authorReferencesMissing:string[]=[];
    const licenseDistribution:Record<string,number>={};
    const files=localSvgFiles(root);
    for(const file of files) {
        const parts=file.split('/'),license=bioiconsLicenses[parts[0]];
        licenseDistribution[license?.id || parts[0]]=(licenseDistribution[license?.id || parts[0]] || 0)+1;
        if(parts.length!==4 || !license || !existsSync(join(root,parts[0],'LICENSE'))) {skipped.push({file,reason:'Missing author layout, unknown license or missing license notice'});continue;}
        const [licenseFolder,categoryFolder,authorFolder,filename]=parts;
        const author=authorFolder.replace(/_/g,' '),name=title(filename.slice(0,-4));
        const category=title(categoryFolder),sourceUrl=`https://github.com/duerrsimon/bioicons/blob/${revision}/static/icons/`+parts.map(encodeURIComponent).join('/');
        const licenseReference=`https://github.com/duerrsimon/bioicons/blob/${revision}/static/icons/${licenseFolder}/LICENSE`;
        if(/biorender/i.test(file+' '+author)) {skipped.push({file,reason:'Excluded BioRender-related source'});continue;}
        if(!indexed.has(JSON.stringify(parts)))unindexed.push(file);
        const authorReference=authors[author] || '';
        if(!authorReference)authorReferencesMissing.push(file);
        const keywords=[...new Set(['Bioicons',name,category,...(name+' '+category).match(/[\p{L}\p{N}]+/gu) || []])];
        assets[file]={name,category,subcategory:'Bioicons',keywords,provider:'Bioicons',providerId:file,
            author,authorReference,sourceUrl,repositoryRevision:revision,upstreamPath:'static/icons/'+file,
            license:license.id,licenseUrl:license.url,licenseReference,licenseNotice:`licenses/bioicons/${licenseFolder}.txt`,
            attribution:`${name} by ${author}${authorReference?' ('+authorReference+')':''}. ${license.id}: ${license.url}. Source: ${sourceUrl}. Helix removes non-rendering editor metadata and normalizes safe inline presentation styles; geometry is retained.`,
            description:`Bioicons scientific illustration: ${name}. Category: ${category}. Author: ${author}. Original filename: ${filename}.`};
    }
    return {manifest:{version:1 as const,provider:'Bioicons',license:'Per-asset; see individual metadata',licenseReference:`https://github.com/duerrsimon/bioicons/tree/${revision}/static/icons`,assets},
        inventory:{revision,totalRepositorySvgs:localSvgFiles(repository).length,totalIconSvgs:files.length,eligible: Object.keys(assets).length,skipped,licenseDistribution,indexRecords:index.length,unindexed,authorReferencesMissing}};
}
