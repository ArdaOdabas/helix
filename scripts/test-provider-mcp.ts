// Real SQLite assets copied into an isolated service; actual stdio MCP handlers/schemas.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {Catalog} from '../src/assets/catalog.ts';
import {geometryFingerprint} from '../src/assets/science.ts';
const providers=['Reactome','Togo Picture Gallery','PhyloPic','Health Icons','SciDraw','SciSVG'];
const db=new DatabaseSync('data/catalog.sqlite',{readOnly:true}),root=mkdtempSync(join(tmpdir(),'helix-real-provider-mcp-')),catalog=new Catalog(root),samples:any[]=[];
for(const provider of providers){const row=db.prepare("SELECT a.*,d.metadata FROM assets a JOIN asset_details d ON d.assetId=a.id JOIN asset_science s ON s.assetId=a.id WHERE a.provider=? AND json_extract(s.metadata,'$.vectors')>0 ORDER BY a.id LIMIT 1").get(provider) as any;assert.ok(row,'Missing actual imported provider '+provider);const metadata=JSON.parse(row.metadata),svg=readFileSync('data/assets/'+row.id.slice(6)+'.svg','utf8');const added=catalog.add(svg,{...metadata,provider,name:row.name,category:row.category,tags:JSON.parse(row.tags),description:row.description,viewBox:row.viewBox,license:row.license,sourceFile:metadata.sourceFile,sourceHash:metadata.sourceHash});assert.equal(added.id,row.id);samples.push({id:row.id,provider,sourceUrl:metadata.sourceUrl,license:row.license,svg});}
db.close();catalog.close();
const port='14319',service=spawn(process.execPath,['src/server/main.ts'],{env:{...process.env,FIGURE_PORT:port,FIGURE_DATA_DIR:root},stdio:['ignore','pipe','pipe']});let log='';service.stdout.on('data',d=>log+=d);service.stderr.on('data',d=>log+=d);
const client=new Client({name:'real-provider-mcp-test',version:'1'});
const call=async(name:string,args:any={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify({name,r}));return JSON.parse((r.content as any)[0].text);};
try{let ready=false;for(let n=0;n<100;n++){try{const r=await fetch('http://127.0.0.1:'+port+'/api/health');if(r.ok){ready=true;break;}}catch{}if(service.exitCode!==null)throw new Error(log);await new Promise(r=>setTimeout(r,100));}assert.ok(ready,log);
 await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('src/mcp/main.ts')],env:{...process.env,FIGURE_SERVICE_URL:'http://127.0.0.1:'+port} as Record<string,string>}));const tools=await client.listTools();assert.equal(tools.tools.length,33);
 let doc=await call('create_document',{title:'Isolated real multi-provider vector verification'});const cases=[];
 for(const sample of samples){const search=await call('search_icons',{provider:sample.provider,limit:30,uniqueGeometry:true});assert.ok(search.items.some((r:any)=>r.id===sample.id));const details=await call('get_asset',{iconId:sample.id});assert.equal(details.license,sample.license);assert.equal(details.sourceUrl,sample.sourceUrl);assert.ok(details.provenance.some((r:any)=>r.provider===sample.provider&&r.attribution));
  doc=await call('add_icon',{documentId:doc.id,expectedRevision:doc.revision,iconId:sample.id,name:details.name});const objectId=doc.roots.at(-1),list=await call('list_icon_elements',{documentId:doc.id,objectId,limit:1000}),target=list.items.filter((r:any)=>r.tag!=='g').slice(-2);assert.ok(target.length);
  const changes=target.map((r:any,i:number)=>({elementId:r.elementId,patch:{fill:i?'#E89B43':'#4389C7',stroke:'#123456',strokeWidth:1,opacity:.9}}));const before=doc.revision;doc=await call('update_icon_elements',{documentId:doc.id,objectId,expectedRevision:doc.revision,changes});assert.equal(doc.revision,before+1);
  const after=await call('list_icon_elements',{documentId:doc.id,objectId,limit:1000});for(const [i,t]of target.entries()){const got=after.items.find((r:any)=>r.elementId===t.elementId);assert.equal(got.fill,i?'#E89B43':'#4389C7');assert.equal(got.strokeWidth,'1');}
  const output=await call('export_svg',{documentId:doc.id}),xml=new DOMParser().parseFromString(output.svg,'image/svg+xml');const group=Array.from(xml.getElementsByTagName('g')).find(e=>e.getAttribute('data-object-id')===objectId)!;const inner=group.getElementsByTagName('svg')[0];inner.removeAttribute('width');inner.removeAttribute('height');assert.equal(geometryFingerprint(new XMLSerializer().serializeToString(inner)),geometryFingerprint(sample.svg));assert.ok(!inner.getElementsByTagName('image').length);
  cases.push({provider:sample.provider,assetId:sample.id,sourceUrl:sample.sourceUrl,license:sample.license,search:true,metadata:true,insertion:true,subElements:true,recolor:true,vectorExport:true});
 }
 const result={actualImportedProviderCases:cases.length,passed:cases.length,failed:0,transport:'stdio MCP -> isolated HTTP service',temporaryDataDirectory:root,cases};writeFileSync('reports/library-expansion/provider-mcp.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await client.close();service.kill('SIGTERM');}
