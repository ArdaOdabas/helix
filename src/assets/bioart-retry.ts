export class BioartHttpError extends Error {
    status:number;
    retryAfterMs:number;
    constructor(status:number,retryAfterMs=0){super('NIH BioArt HTTP '+status);this.status=status;this.retryAfterMs=retryAfterMs;}
}
// Sequential UI transfers only. Long server-requested delays stop for a later resume.
export async function withBioartRetry<T>(action:()=>Promise<T>,sleep:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms)),attempts=3):Promise<T> {
    for(let attempt=0;;attempt++)try{return await action();}catch(error){
        if(!(error instanceof BioartHttpError) || ![408,429,500,502,503,504].includes(error.status) || attempt>=attempts-1)throw error;
        const delay=Math.max(error.retryAfterMs,1000*2**attempt);
        if(delay>60000)throw new Error('Server requested a long retry delay; stop and resume after '+delay+' ms');
        await sleep(delay);
    }
}
export function bioartRetryDelay(value:string|null,now=Date.now()){
    if(!value)return 0;
    const seconds=Number(value);return Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,(Date.parse(value)||now)-now);
}
