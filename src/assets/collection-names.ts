import {createHash} from 'node:crypto';
// Stable remote-source filenames on case-insensitive and Unicode-normalizing filesystems.
export function collectionNames<T extends {filename:string;downloadUrl:string}>(records:T[]){
 const key=(s:string)=>s.normalize('NFC').toLowerCase(),counts=new Map<string,number>();
 for(const r of records){if(!r.filename || /[\\/\x00]/.test(r.filename)||['.','..'].includes(r.filename))throw new Error('Unsafe collection filename');counts.set(key(r.filename),(counts.get(key(r.filename)) || 0)+1);}
 return records.map(r=>{const hash=createHash('sha256').update(r.downloadUrl).digest('hex');let filename=(counts.get(key(r.filename))!>1?hash.slice(0,12)+'-':'')+r.filename;if(Buffer.byteLength(filename)>240)filename=hash+'.svg';return {...r,originalFilename:r.filename,filename};});
}
