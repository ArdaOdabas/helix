// Creates a NEW document through the live stdio MCP -> HTTP service adapter.
// Never edits existing documents or writes document JSON directly.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const manifest=JSON.parse(readFileSync('samples/scientific-test-collection/manifest.json','utf8'));
const category=manifest.defaults.category;
const client=new Client({name:'helix-original-collection-verifier',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:['src/mcp/main.ts'],cwd:process.cwd()});
const call=async(name:string,args:Record<string,unknown>={})=>{
    const result=await client.callTool({name,arguments:args});
    assert.ok(!result.isError,JSON.stringify({name,result}));
    return JSON.parse((result.content as any)[0].text);
};
const checkXml=(svg:string)=>{
    const errors:string[]=[];
    const doc=new DOMParser({onError:(_level:string,message:string)=>errors.push(message)} as never).parseFromString(svg,'image/svg+xml');
    assert.deepEqual(errors,[]);assert.ok(doc.documentElement);return doc;
};
try {
    await client.connect(transport);
    const tools=await client.listTools();
    for(const name of ['list_svg_elements','recolor_svg_element','export_svg','search_icons','add_icon'])assert.ok(tools.tools.some(t=>t.name===name));
    const before=await call('list_documents');
    const library=await call('search_icons',{category,limit:100});
    assert.equal(library.items.length,10);assert.equal(library.nextOffset,null);
    let doc=await call('create_document',{title:'Helix — original SVG collection verification',width:1500,height:850});
    assert.ok(!before.some((d:any)=>d.id===doc.id));
    const documentId=doc.id;
    const ref=()=>({documentId,expectedRevision:doc.revision});
    doc=await call('add_text',{...ref(),text:'Original scientific SVG collection',x:45,y:30,width:1400,height:50,style:{fill:'#244c42',fontSize:32}});
    doc=await call('add_text',{...ref(),text:'10 local CC0 schematics · independently styled paths · MCP recoloring verification',x:45,y:82,width:1400,height:35,style:{fill:'#647a72',fontSize:17}});
    const results:any[]=[];
    for(const [i,[filename,metadata]] of Object.entries(manifest.assets).entries()){
        const meta=metadata as any;
        const search=await call('search_icons',{query:meta.name,category,limit:100});
        const icon=search.items.find((a:any)=>a.name===meta.name);
        assert.ok(icon,'Search did not return '+meta.name);
        const asset=await call('get_asset',{iconId:icon.id});
        assert.equal(asset.provider,manifest.provider);assert.equal(asset.license,'CC0-1.0');
        assert.ok(asset.vectorElements>=3);
        const source=readFileSync(resolve('samples/scientific-test-collection/svg',filename),'utf8');
        const originalXml=checkXml(source);
        const originalPaths=Array.from(originalXml.getElementsByTagName('path'));
        assert.ok(originalPaths.length>=3);
        const x=45+(i%5)*285,y=140+Math.floor(i/5)*310;
        doc=await call('add_icon',{...ref(),iconId:icon.id,name:meta.name,x,y,width:240,height:180});
        const instanceId=doc.roots.find((id:string)=>doc.nodes[id].type==='icon'&&doc.nodes[id].iconId===icon.id);
        assert.ok(instanceId);
        const elements=await call('list_svg_elements',{documentId,objectId:instanceId});
        assert.ok(elements.items.some((e:any)=>e.tag==='g'));
        const paths=elements.items.filter((e:any)=>e.tag==='path');
        const target=paths.find((e:any)=>e.fill&&e.fill!=='none') || paths[0];
        const control=paths.find((e:any)=>e.key!==target.key);
        assert.ok(target && control);
        doc=await call('recolor_svg_element',{...ref(),objectId:instanceId,elementKey:target.key,style:{fill:'#1b9e77'}});
        const afterFill=await call('list_svg_elements',{documentId,objectId:instanceId});
        assert.equal(afterFill.items.find((e:any)=>e.key===target.key).stroke,target.stroke);
        doc=await call('recolor_svg_element',{...ref(),objectId:instanceId,elementKey:target.key,style:{stroke:'#be3c65'}});
        const edited=await call('list_svg_elements',{documentId,objectId:instanceId});
        const changed=edited.items.find((e:any)=>e.key===target.key);
        assert.equal(changed.fill,'#1b9e77');assert.equal(changed.stroke,'#be3c65');
        assert.deepEqual(edited.items.find((e:any)=>e.key===control.key),control);
        doc=await call('add_text',{...ref(),text:meta.name,x,y:y+195,width:265,height:45,style:{fill:'#244c42',fontSize:18}});
        results.push({name:meta.name,filename,assetId:icon.id,instanceId,editablePaths:paths.length,editedElementKey:target.key,editedElementId:target.id,library:true,search:true,insertion:true,mcpFill:true,mcpStroke:true,unrelatedElementUnchanged:true});
    }
    const snapshot=doc;
    const undone=await call('undo',ref());assert.equal(undone.revision,doc.revision+1);
    doc=await call('redo',{documentId,expectedRevision:undone.revision});assert.deepEqual(doc.nodes,snapshot.nodes);
    const exported=await call('export_svg',{documentId});
    assert.equal(exported.revision,doc.revision);
    const xml=checkXml(exported.svg);
    for(const result of results){
        const changed=xml.getElementById(`${result.instanceId}-${result.editedElementId}`);
        assert.ok(changed);assert.equal(changed.getAttribute('fill'),'#1b9e77');assert.equal(changed.getAttribute('stroke'),'#be3c65');
        const original=checkXml(readFileSync(resolve('samples/scientific-test-collection/svg',result.filename),'utf8'));
        for(const element of Array.from(original.getElementsByTagName('*'))){
            const id=element.getAttribute('id');if(!id)continue;
            const rendered=xml.getElementById(`${result.instanceId}-${id}`);assert.ok(rendered);
            for(const attr of ['d','transform'])assert.equal(rendered.getAttribute(attr),element.getAttribute(attr));
        }
        result.export=true;result.geometryPreserved=true;
    }
    assert.equal(xml.getElementsByTagName('image').length,0);
    const persisted=await call('get_document',{documentId});assert.deepEqual(persisted,doc);
    assert.equal(Object.values(persisted.nodes).filter((n:any)=>n.type==='icon').length,10);
    for(const old of before){const current=await call('get_document',{documentId:old.id});assert.equal(current.revision,old.revision);}
    const report={verifiedAt:new Date().toISOString(),service:process.env.FIGURE_SERVICE_URL || 'http://127.0.0.1:4317',documentId,revision:doc.revision,title:doc.title,libraryCount:10,results,summary:{library:10,search:10,insertion:10,mcpFill:10,mcpStroke:10,unchangedControl:10,export:10,geometryPreserved:10,failures:0},existingDocumentRevisionsUnchanged:true};
    writeFileSync('examples/helix-test-collection.svg',exported.svg);
    writeFileSync('examples/helix-test-collection-report.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
}finally{await client.close();}
