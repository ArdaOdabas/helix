// Shared by vector rendering and layout inspection; never changes source artwork.
export function arrowLocalGeometry(width:number,height:number){const head=Math.min(14,Math.max(5,width*.2));return{head,start:{x:0,y:height/2},shaftEnd:{x:width-head,y:height/2},tip:{x:width,y:height/2},headPoints:[{x:width-head,y:height/2-head/2},{x:width,y:height/2},{x:width-head,y:height/2+head/2}]};}
