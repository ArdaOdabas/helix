import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDocument, applyCommands, validateDocument, idSchema } from '../core/model.ts';
import type { FigureDocument } from '../core/model.ts';
type Stored = {
    document: FigureDocument;
    past: FigureDocument[];
    future: FigureDocument[];
};
export class Store {
    directory: string;
    constructor(directory: string) { this.directory = join(directory, 'documents'); mkdirSync(this.directory, { recursive: true }); }
    path(id: string) { return join(this.directory, idSchema.parse(id) + '.json'); }
    read(id: string): Stored { if (!existsSync(this.path(id)))
        throw new Error('Document not found'); const r = JSON.parse(readFileSync(this.path(id), 'utf8')); validateDocument(r.document); return r; }
    write(record: Stored) { const path = this.path(record.document.id), tmp = path + '.' + randomUUID() + '.tmp'; const fd = openSync(tmp, 'w'); try { writeFileSync(fd, JSON.stringify(record, null, 2)); fsyncSync(fd); } finally { closeSync(fd); } renameSync(tmp, path); }
    /** Removes a document. The revision guard prevents deleting work that changed since it was read. */
    delete(id: string, expected?: number) { const r = this.read(id); this.check(r, expected); const { title, revision } = r.document; renameSync(this.path(id), this.path(id) + '.deleted-' + Date.now()); return { id, title, revision, deleted: true }; }
    list() { return readdirSync(this.directory).filter(f => f.endsWith('.json')).map(f => { const d = this.read(f.slice(0, -5)).document; return { id: d.id, title: d.title, revision: d.revision, updatedAt: d.updatedAt }; }); }
    create(title: string, width: number, height: number, id: string = randomUUID()) { if (existsSync(this.path(id)))
        throw new Error('Document already exists'); const document = createDocument(id, title, width, height); this.write({ document, past: [], future: [] }); return document; }
    mutate(id: string, ops: unknown, expected?: number) { const r = this.read(id); this.check(r, expected); const next = applyCommands(r.document, ops); this.write({ document: next, past: [...r.past, r.document].slice(-100), future: [] }); return next; }
    replace(id: string, document: FigureDocument, expected?: number) { const r = this.read(id); this.check(r, expected); const next = validateDocument({ ...document, id, revision: r.document.revision + 1, updatedAt: new Date().toISOString() }); this.write({ document: next, past: [...r.past, r.document].slice(-100), future: [] }); return next; }
    /** Adds a document exported as JSON (bare document or stored record) under a new id; never overwrites. */
    importDocument(raw: unknown) { const source = (raw as any)?.document ?? raw; const id = randomUUID(); const document = validateDocument({ ...(source as object), id, revision: 1, updatedAt: new Date().toISOString() }); this.write({ document, past: [], future: [] }); return document; }
    check(r: Stored, expected?: number) { if (expected !== undefined && expected !== r.document.revision)
        throw new Error(`Revision conflict: expected ${expected}, current ${r.document.revision}. Reload document.`); }
    history(id: string, direction: 'undo' | 'redo', expected?: number) { const r = this.read(id); this.check(r, expected); const source = direction === 'undo' ? r.past : r.future; if (!source.length)
        throw new Error(`Nothing to ${direction}`); const snapshot = source.pop()!; const destination = direction === 'undo' ? r.future : r.past; destination.push(r.document); r.document = { ...snapshot, revision: r.document.revision + 1, updatedAt: new Date().toISOString() }; this.write(r); return r.document; }
}
