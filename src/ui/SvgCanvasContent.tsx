import React, {memo, useMemo} from 'react';
import type {FigureNode} from '../core/model.ts';
import type {IconAsset} from '../core/icons.ts';
import {renderNode} from '../core/render.ts';

// Pointer hover/selection changes only replace this small stylesheet. SVG parsing
// and serialization are memoized independently of those transient UI states.
export const SvgCanvasContent=memo(function SvgCanvasContent({node,asset,keys,hover,editing}: {
    node:FigureNode;asset?:IconAsset;keys:string[];hover:string|null;editing:boolean;
}) {
    const renderKey=JSON.stringify([node.iconId,node.width,node.height,node.style,node.colorMap,node.elementStyles]);
    const content=useMemo(()=>asset?renderNode(node,()=>asset,{editable:true}):'<rect width="100" height="100" fill="#eee"/>',[renderKey,asset]);
    const scope=`[data-object-id="${node.id}"]`;
    const rule=(key:string,color:string)=>`${scope} [data-svg-element-key="${key}"]{filter:drop-shadow(0 0 2px ${color});outline:1px solid ${color};outline-offset:2px;}`;
    return <g className={editing?'svg-element-surface editing':'svg-element-surface'}>
        {editing && <style>{keys.map(k=>rule(k,'#126ce5')).join('')+(hover&&!keys.includes(hover)?rule(hover,'#d57512'):'')}</style>}
        <g dangerouslySetInnerHTML={{__html:content}}/>
    </g>;
});
