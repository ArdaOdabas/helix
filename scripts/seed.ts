import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { demoPlan } from '../src/core/plan.ts';
await mkdir('examples', { recursive: true });
await writeFile('examples/prbjn-plan.json', JSON.stringify(demoPlan, null, 2));
const response = await fetch('http://127.0.0.1:4317/api/tools/create_document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: demoPlan.title, plan: demoPlan }) });
const d = await response.json();
if (!response.ok)
    throw new Error(JSON.stringify(d));
await writeFile('examples/prbjn-document.json', JSON.stringify(d, null, 2));
console.log(d.id);
