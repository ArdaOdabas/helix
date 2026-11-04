import {it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {createMcpServer} from '../src/mcp/server.ts';
import {executeTool} from '../src/server/tools.ts';
import {Catalog} from '../src/assets/catalog.ts';
import {Store} from '../src/server/store.ts';
import {editSvgElements} from '../src/core/svg-elements.ts';
it('exposes stable IDs for anonymous elements and applies numeric SVG properties without altering geometry',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><g id="named"><path d="M0 0L20 20"/></g></svg>';
 const a=editSvgElements(svg),b=editSvgElements(svg,{'0/0':{fill:'#123456',strokeWidth:3,opacity:.4}});
 assert.deepEqual(a.elements.map(e=>e.elementId),['named','@svg:0/0']);assert.deepEqual(a.elements.map(e=>e.elementId),b.elements.map(e=>e.elementId));assert.ok(b.svg.includes('stroke-width="3"'));assert.ok(b.svg.includes('opacity="0.4"'));assert.ok(b.svg.includes('d="M0 0L20 20"'));assert.ok(b.elements.every(e=>e.editable));
});
it('accepts actual new and legacy MCP schemas, rejects partial batches and persists/reset/undo/redo through the shared engine',async()=>{
 const root=mkdtempSync(join(tmpdir(),'helix-mcp-v2-')),c=new Catalog(root),store=new Store(root);
 const server=createMcpServer((n,a)=>executeTool(n,a,store,c)),client=new Client({name:'actual-schema-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
 const call=async(name:string,args:any)=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse((r.content as any)[0].text);};
 try{await server.connect(st);await client.connect(ct);const tools=await client.listTools();assert.equal(tools.tools.length,40);for(const name of ['list_icon_elements','update_icon_element','update_icon_elements'])assert.ok(tools.tools.some(t=>t.name===name));
 let d=await call('create_document',{title:'Isolated MCP patch regression'});d=await call('add_icon',{documentId:d.id,iconId:'mitochondrion'});const objectId=d.roots[0],documentId=d.id;const list=await call('list_icon_elements',{documentId,objectId});const target=list.items[0];assert.ok(target.elementId.startsWith('@svg:'));
 const ref=()=>({documentId,objectId,expectedRevision:d.revision});
 d=await call('update_icon_element',{...ref(),elementId:target.elementId,patch:{fill:'#4389C7',stroke:'#123456',strokeWidth:4,opacity:.6}});const saved=structuredClone(d);
 assert.deepEqual(new Store(root).read(documentId).document,d);const output=await call('export_svg',{documentId});for(const text of ['#4389C7','stroke-width="4"','opacity="0.6"'])assert.ok(output.svg.includes(text));
 let r=await client.callTool({name:'update_icon_elements',arguments:{...ref(),changes:[{elementId:target.elementId,patch:{fill:'#fff'}},{elementId:'missing',patch:{stroke:'#000'}}]}});assert.equal(r.isError,true);assert.deepEqual(store.read(documentId).document,saved);
 for(const patch of [{opacity:2},{strokeWidth:-1},{fill:'url(https://evil.invalid)'},{}]){r=await client.callTool({name:'update_icon_element',arguments:{...ref(),elementId:target.elementId,patch}});assert.equal(r.isError,true);}
 d=await call('undo',{documentId,expectedRevision:d.revision});assert.ok(!d.nodes[objectId].elementStyles);d=await call('redo',{documentId,expectedRevision:d.revision});assert.deepEqual(d.nodes,saved.nodes);
 const before=d.revision;d=await call('update_icon_elements',{...ref(),changes:[{elementId:target.elementId,patch:{opacity:null,strokeWidth:null}},{elementKey:list.items[1].key,fill:'#E89B43'}]});assert.equal(d.revision,before+1);assert.equal(d.nodes[objectId].elementStyles[target.key].strokeWidth,undefined);assert.equal(d.nodes[objectId].elementStyles[target.key].opacity,undefined);
 d=await call('update_icon_element',{...ref(),change:{elementKey:target.key,fill:'#abcdef'}});assert.equal(d.nodes[objectId].elementStyles[target.key].fill,'#abcdef');
 }finally{await client.close();await server.close();c.close();}
});
