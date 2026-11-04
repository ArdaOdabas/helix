// Only the explicitly authorized mitochondrion fixture and a NEW NIH test document are edited.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {chromium} from 'playwright-core';
const client=new Client({name:'helix-claude-discovery-verification',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:['src/mcp/main.ts'],cwd:process.cwd()});
const call=async(name:string,args:Record<string,unknown>={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify({name,result:r}));return JSON.parse((r.content as any)[0].text);};
const hash=(id:string)=>createHash('sha256').update(readFileSync('data/assets/'+id.slice(6)+'.svg')).digest('hex');
const parse=(svg:string)=>new DOMParser().parseFromString(svg,'image/svg+xml');
function geometry(root:any){const result:any[]=[];function visit(el:any){if(el.localName==='metadata')return;if(['g','path','rect','circle','ellipse','polygon','polyline','line'].includes(el.localName))result.push([el.localName,...['d','transform','cx','cy','x','y','r','rx','ry','points','x1','x2','y1','y2'].map(a=>el.getAttribute(a))]);for(const child of Array.from(el.childNodes) as any[])if(child.nodeType===1)visit(child);}visit(root);return result;}
function elementAt(root:any,key:string){let el=root;for(const part of key.split('/'))el=Array.from(el.childNodes).filter((n:any)=>n.nodeType===1)[Number(part)];return el;}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
    await client.connect(transport);const tools=await client.listTools();for(const name of ['list_icon_elements','update_icon_element','update_icon_elements','list_providers'])assert.ok(tools.tools.some(t=>t.name===name));
    const documentId='22e4ffb0-cc28-4226-b024-2056d9916923',objectId='62bc9dd2-9dc1-4238-b0ed-82e56154e59a';
    const before=await call('get_document',{documentId}),list=await call('list_icon_elements',{documentId,objectId}),iconId=before.nodes[objectId].iconId,sourceHash=hash(iconId);
    const page=await browser.newPage({viewport:{width:1600,height:1050}});const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.addInitScript(id=>localStorage.setItem('helix-document',id),documentId);await page.goto('http://127.0.0.1:5173');await page.getByTestId('artboard').waitFor();await page.getByLabel('Search scientific icons',{exact:true}).fill('mitochondrion');
    const alreadySet=list.items.find((e:any)=>e.id==='outer-membrane')?.fill==='#4389C7' && list.items.find((e:any)=>e.id==='inner-membrane')?.fill==='#E89B43';
    const undoExpected=alreadySet?JSON.parse(readFileSync('data/documents/'+documentId+'.json','utf8')).past.at(-1).nodes:before.nodes;
    let doc=alreadySet?before:await call('update_icon_elements',{documentId,objectId,expectedRevision:before.revision,changes:[{elementId:'outer-membrane',fill:'#4389C7'},{elementId:'inner-membrane',fill:'#E89B43'}]});if(!alreadySet)assert.equal(doc.revision,before.revision+1);
    const waitColors=()=>page.waitForFunction(({id,outer,inner})=>document.getElementById(id+'-outer-membrane')?.getAttribute('fill')===outer&&document.getElementById(id+'-inner-membrane')?.getAttribute('fill')===inner,{id:objectId,outer:'#4389C7',inner:'#E89B43'});
    await waitColors();const liveSync=true;await page.reload();await waitColors();
    const after=await call('list_icon_elements',{documentId,objectId});
    for(const id of ['cristae-upper','cristae-lower','matrix-granule'])assert.deepEqual(after.items.find((e:any)=>e.id===id),list.items.find((e:any)=>e.id===id));
    const exported=await call('export_svg',{documentId});const xml=parse(exported.svg);
    assert.equal(xml.getElementById(objectId+'-outer-membrane')!.getAttribute('fill'),'#4389C7');assert.equal(xml.getElementById(objectId+'-inner-membrane')!.getAttribute('fill'),'#E89B43');
    doc=await call('undo',{documentId,expectedRevision:doc.revision});assert.deepEqual(doc.nodes,undoExpected);
    await page.waitForFunction(({id,fill})=>document.getElementById(id+'-outer-membrane')?.getAttribute('fill')===fill,{id:objectId,fill:doc.nodes[objectId].elementStyles?.[list.items.find((e:any)=>e.id==='outer-membrane').key]?.fill || '#f8dfbf'});
    doc=await call('redo',{documentId,expectedRevision:doc.revision});await waitColors();assert.equal(hash(iconId),sourceHash);
    await page.locator('svg.canvas').screenshot({path:'reports/bioart/mitochondrion-after.png'});writeFileSync('reports/bioart/mitochondrion.svg',exported.svg);
    const mito={documentId,objectId,revisionBefore:before.revision,revisionAfter:doc.revision,atomicRevision:true,liveSync,pageRefresh:true,undo:true,redo:true,export:true,unrelatedElementsUnchanged:true,assetHashUnchanged:true};
    const items=(await call('search_icons',{provider:'NIH BioArt Source',limit:100})).items;assert.equal(items.length,4);
    const nucleus=items.find((i:any)=>i.name==='Cell Nucleus');assert.ok(nucleus);
    const checkpoint='reports/bioart/active-nih-document.json';
    let nih=existsSync(checkpoint)?await call('get_document',JSON.parse(readFileSync(checkpoint,'utf8'))):await call('create_document',{title:'NIH BioArt SVG Integration Test',width:1100,height:1150});const nihId=nih.id;
    writeFileSync(checkpoint,JSON.stringify({documentId:nihId}));
    const ref=()=>({documentId:nihId,expectedRevision:nih.revision});
    const labelSeen=new Set<string>(),duplicateLabels:any[]=[];
    for(const n of Object.values(nih.nodes) as any[]){if(n.type!=='text' || !items.some((item:any)=>n.text?.startsWith(item.name+'\n')))continue;if(labelSeen.has(n.text))duplicateLabels.push({type:'delete',id:n.id});else labelSeen.add(n.text);}
    if(duplicateLabels.length)nih=await call('apply_operations',{...ref(),operations:duplicateLabels});
    if(!Object.values(nih.nodes).some((n:any)=>n.text==='NIH BioArt SVG Integration Test'))nih=await call('add_text',{...ref(),text:'NIH BioArt SVG Integration Test',x:40,y:25,width:1000,height:50,style:{fill:'#244c42',fontSize:30}});
    const cases:any[]=[];
    for(const [i,item]of [nucleus,...items.filter((i:any)=>i.id!==nucleus.id)].entries()){
        const official=await call('get_asset',{iconId:item.id});
        const original=readFileSync('data/assets/'+item.id.slice(6)+'.svg','utf8'),assetHash=hash(item.id);
        const x=40+(i%2)*530,y=120+Math.floor(i/2)*510;
        if(!Object.values(nih.nodes).some((n:any)=>n.iconId===item.id))nih=await call('add_icon',{...ref(),iconId:item.id,name:item.name,x,y,width:440,height:400});const instanceId=nih.roots.find((id:string)=>nih.nodes[id].iconId===item.id);
        const elements=await call('list_icon_elements',{documentId:nihId,objectId:instanceId,limit:1000});
        const targets=elements.items.filter((e:any)=>e.tag!=='g'&&e.fill!=='none').slice(0,2);assert.equal(targets.length,2);
        const changes=targets.map((e:any,index:number)=>({elementKey:e.key,fill:index?'#E89B43':'#4389C7'}));
        nih=await call('update_icon_elements',{...ref(),objectId:instanceId,changes});
        if(!Object.values(nih.nodes).some((n:any)=>n.type==='text'&&n.text?.startsWith(item.name+'\n')))nih=await call('add_text',{...ref(),text:item.name+'\n'+[official.author,official.credit,official.license].filter(Boolean).join(' · '),x,y:y+410,width:500,height:65,style:{fill:'#244c42',fontSize:16}});
        assert.equal(hash(item.id),assetHash);cases.push({assetId:item.id,name:item.name,instanceId,targets:changes,original,assetHash,totalElements:elements.total});
    }
    assert.equal(Object.values(nih.nodes).filter((n:any)=>n.type==='icon').length,4);
    assert.equal(Object.values(nih.nodes).filter((n:any)=>n.type==='text').length,5);
    const result=await call('export_svg',{documentId:nihId}),nihXml=parse(result.svg);
    for(const item of cases){const group=Array.from(nihXml.getElementsByTagName('g')).find(e=>e.getAttribute('data-object-id')===item.instanceId)!;const svg=group.getElementsByTagName('svg')[0];assert.deepEqual(geometry(svg),geometry(parse(item.original).documentElement));for(const change of item.targets)assert.equal(elementAt(svg,change.elementKey).getAttribute('fill'),change.fill);assert.equal(hash(item.assetId),item.assetHash);}
    writeFileSync('reports/bioart/integration-test.svg',result.svg);
    const nihPage=await browser.newPage({viewport:{width:1800,height:1350}});nihPage.on('pageerror',e=>pageErrors.push(e.message));await nihPage.addInitScript(id=>localStorage.setItem('helix-document',id),nihId);await nihPage.goto('http://127.0.0.1:5173');await nihPage.getByTestId('artboard').waitFor();
    await nihPage.getByLabel('Asset provider',{exact:true}).selectOption('NIH BioArt Source');await nihPage.waitForFunction(()=>document.querySelectorAll('.icon-card').length===4);
    for(const img of await nihPage.locator('.icon-card img').all())await img.evaluate((el:HTMLImageElement)=>el.decode());
    await nihPage.getByLabel('Asset category',{exact:true}).selectOption('Cells and Organelles');await nihPage.waitForFunction(()=>document.querySelectorAll('.icon-card').length===3);
    await nihPage.getByLabel('Asset category',{exact:true}).selectOption('');await nihPage.getByLabel('Search scientific icons',{exact:true}).fill('nucleus');await nihPage.waitForFunction(()=>document.querySelectorAll('.icon-card').length===1);
    await nihPage.getByRole('button',{name:'Details',exact:true}).click();await nihPage.locator('.asset-detail').getByRole('heading',{name:'Cell Nucleus'}).waitFor();assert.ok((await nihPage.locator('.asset-detail').innerText()).includes('Public Domain'));
    await nihPage.waitForFunction(()=>document.querySelectorAll('svg.canvas [fill="#4389C7"]').length>=4 && document.querySelectorAll('svg.canvas [fill="#E89B43"]').length>=4);
    await nihPage.reload();await nihPage.waitForFunction(()=>document.querySelectorAll('svg.canvas [fill="#4389C7"]').length>=4);await nihPage.getByRole('button',{name:'Fit',exact:true}).click();await nihPage.locator('svg.canvas').screenshot({path:'reports/bioart/integration-test.png'});
    const cached=await nihPage.request.get('http://127.0.0.1:4317/api/icons/'+nucleus.id+'?thumbnail=1');assert.ok(cached.headers()['cache-control']?.includes('immutable'));const notModified=await nihPage.request.get('http://127.0.0.1:4317/api/icons/'+nucleus.id+'?thumbnail=1',{headers:{'If-None-Match':cached.headers().etag}});assert.equal(notModified.status(),304);
    assert.deepEqual(pageErrors,[]);
    writeFileSync('reports/bioart/verification.json',JSON.stringify({toolsDiscovered:tools.tools.map(t=>t.name),mitochondrion:mito,bioart:{documentId:nihId,title:nih.title,revision:nih.revision,cases:cases.map(({original,...item})=>item),providerFilter:true,categoryFilter:true,search:true,thumbnailCaching:true,pageRefresh:true,geometryPreserved:true,export:true,assetHashesUnchanged:true},pageErrors},null,2)+'\n');
    console.log(JSON.stringify({mitochondrion:mito,nihDocumentId:nihId,nihRevision:nih.revision,nihAssets:cases.length,pageErrors}));
}finally{await browser.close();await client.close();}
