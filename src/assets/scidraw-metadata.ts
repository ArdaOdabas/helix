// Preserve exactly the contributor names exposed by the official page or gallery.
// A gallery fallback is explicitly partial; never invent additional contributors.
export function sciDrawAuthors(title:string,observed:string[],pageText='',cardText=''){
 const clean=(s:string)=>s.trim();const names=observed.map(clean).filter(Boolean);
 if(names.length)return {authors:[...new Set(names)],authorsSource:'Observed official detail page'};
 const lines=pageText.split('\n').map(clean).filter(Boolean),start=lines.findIndex(s=>s.toUpperCase()==='AUTHORS'),end=lines.indexOf('Category:',start);
 if(start>=0&&end>start+1)return {authors:[...new Set(lines.slice(start+1,end))],authorsSource:'Cached official detail page'};
 const card=cardText.split('\n').map(clean).filter(Boolean),position=card.indexOf(title);
 const primary=position>=0?card.slice(position+1,-1).filter(s=>!['Download','Cite','SVG','PNG','PDF'].includes(s)):[];
 return {authors:[...new Set(primary)],authorsSource:'Official gallery card',fullContributorListVerified:false};
}
