import {DOMParser} from '@xmldom/xmldom';
import {normalizeSvgProlog} from './sanitize.ts';
export function licenseIdentity(value:string){
 const url=value.match(/creativecommons\.org\/licenses\/([a-z-]+)\/(\d\.\d)/i);if(url)return url[1].toLowerCase()+'-'+url[2];
 if(/creativecommons\.org\/publicdomain\/zero\/1\.0|^cc0(?:[- ]1\.0)?$/i.test(value))return 'zero-1.0';
 const label=value.match(/^CC[- ](BY(?:[- ](?:NC|ND|SA))*)[- ](\d\.\d)$/i);return label?label[1].toLowerCase().replaceAll(' ','-')+'-'+label[2]:undefined;
}
export function embeddedAttribution(source:string){
 if(!/<(?:[\w-]+:)?(?:creator|author|rights|license)\b/i.test(source))return undefined;
 source=normalizeSvgProlog(source);if(/<!DOCTYPE|<!ENTITY|<\?/i.test(source.replace(/^\s*<\?xml[^?]*\?>/,'')))throw new Error('Unsafe XML attribution declarations');
 const errors:string[]=[];const doc=new DOMParser({onError:(_level:string,message:string)=>errors.push(message)} as never).parseFromString(source,'image/svg+xml');if(errors.length)throw new Error('Malformed SVG metadata');
 const creators:string[]=[],rights:string[]=[],licenses:string[]=[];
 function walk(e:any,inMetadata=false){inMetadata ||= e.localName==='metadata';if(inMetadata){if(['creator','author'].includes(e.localName)&&e.textContent.trim())creators.push(e.textContent.trim());if(e.localName==='rights'&&e.textContent.trim())rights.push(e.textContent.trim());if(e.localName==='license'){const uri=e.getAttributeNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#','resource') || e.textContent.trim();if(uri)licenses.push(uri);}}for(const c of Array.from(e.childNodes) as any[])if(c.nodeType===1)walk(c,inMetadata);}walk(doc.documentElement);
 if(!creators.length&&!rights.length&&!licenses.length)return undefined;return {creators:[...new Set(creators)],rights:[...new Set(rights)],licenses:[...new Set(licenses)]};
}
