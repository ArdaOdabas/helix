import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {SvgCanvasContent} from '../src/ui/SvgCanvasContent.tsx';
import {nodeSchema,documentSchema} from '../src/core/model.ts';
import {exportSvg} from '../src/core/render.ts';
import {editSvgElements} from '../src/core/svg-elements.ts';
import type {IconAsset} from '../src/core/icons.ts';
const asset:IconAsset={id:'complex',name:'Clipped stroke geometry',category:'Cells',tags:[],provider:'Local test',license:'CC0',viewBox:'0 0 100 100',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="clip"><rect width="50" height="50"/></clipPath></defs><g transform="translate(2 3)" clip-path="url(#clip)"><path id="edge" fill="none" stroke="#123456" d="M0 0L40 40"/><path d="M0 40L40 0" fill="none" stroke="#654321"/></g></svg>'};
const node=nodeSchema.parse({id:'instance',type:'icon',name:'Clipped',iconId:'complex',width:100,height:100});
describe('interactive SVG rendering',()=>{
 it('annotates stable source keys outside clip definitions while preserving stroke-only paths and transforms',()=>{
  const info=editSvgElements(asset.svg).elements;expect(info.map(e=>e.elementId)).toEqual(['@svg:1','edge','@svg:1/1']);expect(info[2].parentKey).toBe('1');
  const markup=renderToStaticMarkup(<SvgCanvasContent node={node} asset={asset} keys={['1/0']} hover="1/1" editing/>);
  expect(markup).toContain('data-svg-element-key="1/0"');expect(markup).toContain('fill="none"');expect(markup).toContain('transform="translate(2 3)"');expect(markup).toContain('url(#instance-clip)');expect(markup).toContain('drop-shadow');expect(markup).not.toContain('data-svg-element-key="0/0/0"');
 });
 it('keeps transient highlights out of object-mode markup and persistent SVG exports',()=>{
  const objectMarkup=renderToStaticMarkup(<SvgCanvasContent node={node} asset={asset} keys={['1/0']} hover="1/1" editing={false}/>);expect(objectMarkup).not.toContain('<style>');
  const doc=documentSchema.parse({schemaVersion:1,revision:0,width:500,height:500,background:'#ffffff',updatedAt:new Date().toISOString(),id:'doc',title:'Isolated',roots:[node.id],nodes:{[node.id]:{...node,elementStyles:{'1/0':{stroke:'#abcdef',strokeWidth:3,opacity:.5}}}}});const svg=exportSvg(doc,()=>asset);
  expect(svg).toContain('stroke="#abcdef"');expect(svg).toContain('stroke-width="3"');expect(svg).toContain('opacity="0.5"');expect(svg).not.toContain('data-svg-element');expect(svg).not.toContain('drop-shadow');expect(asset.svg).toContain('stroke="#123456"');
 });
});
