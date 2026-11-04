// Live official SDK -> stdio MCP -> HTTP verification. Only a NEW document is changed.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {DOMParser} from '@xmldom/xmldom';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const imported=JSON.parse(readFileSync('reports/bioicons/import-report.json','utf8'));
const expectedAssets=(Object.values(imported.licenses.importedUnique) as number[]).reduce((sum,n)=>sum+n,0);
const client=new Client({name:'helix-bioicons-verification',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:['src/mcp/main.ts'],cwd:process.cwd()});
const call=async(name:string,args:Record<string,unknown>={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify({name,result:r}));return JSON.parse((r.content as any)[0].text);};
try{
    await client.connect(transport);
    const before=await call('list_documents'),all:any[]=[];
    for(let offset:number|null=0;offset!==null;){const result=await call('search_icons',{query:'Bioicons',limit:100,offset});all.push(...result.items.filter((i:any)=>i.provider==='Bioicons'));offset=result.nextOffset;}
    assert.equal(new Set(all.map(i=>i.id)).size,expectedAssets);
    const selected:any[]=[];
    for(const license of ['CC0-1.0','CC-BY-3.0','CC-BY-4.0','CC-BY-SA-3.0','CC-BY-SA-4.0','MIT','BSD-3-Clause']){
        const candidates=all.filter(i=>i.license===license).sort((a,b)=>a.elements-b.elements);
        let found=false;
        for(const item of candidates){if(selected.some(i=>i.id===item.id))continue;
            const detail=await call('get_asset',{iconId:item.id});if(detail.vectorElements>0){selected.push(item);found=true;break;}}
        assert.ok(found,'No compatible example for '+license);
    }
    for(const word of ['mitochond','nucleus','receptor','cell','protein','dna','bacter']){
        const candidate=all.find(i=>i.name.toLowerCase().includes(word)&&i.elements<300&&!selected.some(s=>s.id===i.id));if(candidate)selected.push(candidate);
    }
    let doc=await call('create_document',{title:'Bioicons — licensed vector import verification',width:1350,height:1450});const documentId=doc.id;
    assert.ok(!before.some((d:any)=>d.id===documentId));const ref=()=>({documentId,expectedRevision:doc.revision});
    doc=await call('add_text',{...ref(),text:'Bioicons: licensed vector verification',x:35,y:25,width:1250,height:55,style:{fontSize:30,fill:'#244c42'}});
    doc=await call('add_text',{...ref(),text:'Original author / per-icon license retained · highlighted paths modified through MCP',x:35,y:85,width:1250,height:45,style:{fontSize:15,fill:'#60796e'}});
    const results:any[]=[];
    for(const [i,item]of selected.entries()){
        const details=await call('get_asset',{iconId:item.id});assert.ok(details.author);assert.ok(details.attribution.includes(details.author));assert.ok(details.sourceUrl.includes(imported.revision));
        const x=35+(i%4)*325,y=160+Math.floor(i/4)*300;
        doc=await call('add_icon',{...ref(),iconId:item.id,name:item.name,x,y,width:250,height:180});
        const instanceId=doc.roots.find((id:string)=>doc.nodes[id].type==='icon'&&doc.nodes[id].iconId===item.id);
        const list=await call('list_svg_elements',{documentId,objectId:instanceId});
        const element=list.items.find((e:any)=>e.tag==='path') || list.items.find((e:any)=>e.tag==='g');assert.ok(element,'No editable subelement in '+item.name);
        const control=list.items.find((e:any)=>e.key!==element.key);
        doc=await call('recolor_svg_element',{...ref(),objectId:instanceId,elementKey:element.key,style:{fill:'#e19b56',stroke:'#315a83'}});
        const edited=await call('list_svg_elements',{documentId,objectId:instanceId});const path=edited.items.find((e:any)=>e.key===element.key);
        assert.equal(path.fill,'#e19b56');assert.equal(path.stroke,'#315a83');if(control)assert.deepEqual(edited.items.find((e:any)=>e.key===control.key),control);
        doc=await call('add_text',{...ref(),text:item.name.slice(0,38)+'\n'+details.author+' · '+item.license,x,y:y+195,width:305,height:70,style:{fontSize:13,fill:'#244c42'}});
        results.push({assetId:item.id,name:item.name,author:details.author,license:item.license,instanceId,elementKey:element.key,originalElementId:element.id,inserted:true,recolored:true,metadataPreserved:true});
    }
    const exported=await call('export_svg',{documentId});const parsed=new DOMParser().parseFromString(exported.svg,'image/svg+xml');
    const metadata=Array.from(parsed.getElementsByTagName('metadata')).map(m=>JSON.parse(m.textContent || '{}'));
    assert.equal(metadata.length,selected.length);
    for(const result of results){
        const record=metadata.find(m=>m.assetId===result.assetId);assert.ok(record);assert.ok(record.attributions.some((a:any)=>a.author===result.author && a.license===result.license));
        assert.ok(record.attributions.every((a:any)=>a.licenseNoticeText?.length>100));
        assert.deepEqual(record.modifications.elements[result.elementKey],{fill:'#e19b56',stroke:'#315a83'});
        const group=parsed.getElementsByTagName('g');const instance=Array.from(group).find(g=>g.getAttribute('data-object-id')===result.instanceId)!;assert.ok(instance);
        assert.ok(Array.from(instance.getElementsByTagName('*')).some(el=>el.getAttribute('fill')==='#e19b56' && el.getAttribute('stroke')==='#315a83'));
        result.exportPreserved=true;result.licenseNoticeEmbedded=true;
    }
    for(const old of before){const current=await call('get_document',{documentId:old.id});assert.equal(current.revision,old.revision);}
    const timings:number[]=[];for(let i=0;i<60;i++){const t=performance.now();await call('search_icons',{query:['mitochondria','nucleus','DNA','receptor','microscope'][i%5],limit:30});timings.push(performance.now()-t);}timings.sort((a,b)=>a-b);
    const report={documentId,revision:doc.revision,title:doc.title,allImportedAssetsListed:all.length,licensesCovered:[...new Set(results.map(r=>r.license))],cases:results,passed:results.length,failed:0,exportAttributionRecords:metadata.length,existingRevisionsUnchanged:true,mcpSearchPerformance:{queries:timings.length,medianMs:timings[30],p95Ms:timings[57],maxMs:timings[59]}};
    writeFileSync('reports/bioicons/mcp-verification.json',JSON.stringify(report,null,2)+'\n');writeFileSync('reports/bioicons/verification.svg',exported.svg);
    console.log(JSON.stringify({...report,cases:undefined},null,2));
}finally{await client.close();}
