// Keeps the newest copy of each duplicated title and removes the rest through delete_document.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['FIGURE_SERVICE_URL','HELIX_TOKEN','ELECTRON_RUN_AS_NODE'].includes(k))) as Record<string,string>;
const client = new Client({ name: 'helix-tidy', version: '1' });
const call = async (name: string, args: any = {}) => {
  const r = await client.callTool({ name, arguments: args }) as any;
  if (r.isError) throw new Error(name + ': ' + r.content?.[0]?.text);
  return JSON.parse(r.content[0].text);
};
const DUPES = ['AAVS1 EGFP knock-in in human iPSCs (primitive composition)',
  'CRISPR-Cas9 EGFP knock-in at the AAVS1 safe-harbour locus in human iPSCs',
  'Naive pluripotency to an 8-cell-like state'];
try {
  await client.connect(new StdioClientTransport({ command: '/Applications/Helix.app/Contents/Resources/bin/helix-mcp', args: [], env }));
  const docs = await call('list_documents') as { id: string; title: string; revision: number; updatedAt: string }[];
  const remove: typeof docs = [];
  for (const title of DUPES) {
    const group = docs.filter(d => d.title === title).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    remove.push(...group.slice(0, -1));
    if (group.length) console.log(`keep  ${group.at(-1)!.updatedAt.slice(0,16)}  ${title.slice(0,54)}`);
  }
  remove.push(...docs.filter(d => d.title === 'Untitled figure'));
  for (const d of remove) { await call('delete_document', { documentId: d.id, expectedRevision: d.revision }); console.log(`removed ${d.updatedAt.slice(0,16)}  ${d.title.slice(0,54)}`); }
  const left = await call('list_documents') as any[];
  console.log(`\nremoved ${remove.length}; ${left.length} documents remain`);
} finally { await client.close(); }
