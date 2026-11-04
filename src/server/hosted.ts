import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { Store } from './store.ts';

const cookieName = '__Host-helix';
const cookiePattern = /^([a-f0-9]{48})\.([a-f0-9]{64})$/;

export const hostedTools = new Set([
    'list_documents', 'get_document', 'create_document', 'apply_operations',
    'apply_figure_plan', 'undo', 'redo', 'export_svg', 'search_icons',
    'list_categories', 'list_imports', 'list_providers', 'get_asset',
    'list_icon_elements', 'update_icon_elements',
    'add_icon', 'add_shape', 'add_text', 'add_arrow', 'update_object',
    'group_objects', 'ungroup_objects',
]);

class HostedStore extends Store {
    override write(record: Parameters<Store['write']>[0]) {
        const target = this.path(record.document.id);
        const files = readdirSync(this.directory).filter(name => name.endsWith('.json'));
        const otherFiles = files.filter(name => join(this.directory, name) !== target);
        if (otherFiles.length >= 30) throw new Error('Workspace limit is 30 documents');
        const size = otherFiles.reduce((sum, name) => sum + statSync(join(this.directory, name)).size, 0);
        if (size + Buffer.byteLength(JSON.stringify(record, null, 2)) > 25 * 1024 * 1024)
            throw new Error('Workspace storage limit reached');
        super.write(record);
    }
}

export function createHostedMode(directory: string, publicUrl: string, secret: string | undefined) {
    const url = new URL(publicUrl);
    if (url.protocol !== 'https:' || url.origin !== publicUrl || !secret || secret.length < 32)
        throw new Error('Hosted mode requires an HTTPS origin and HELIX_SESSION_SECRET of at least 32 characters');
    const sign = (id: string) => createHmac('sha256', secret).update(id).digest();
    return {
        url,
        workspace(req: IncomingMessage, res: ServerResponse, issueCookie: boolean) {
            const cookie = req.headers.cookie?.split(';').map(value => value.trim())
                .find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
            const match = cookie?.match(cookiePattern);
            if (match && timingSafeEqual(sign(match[1]), Buffer.from(match[2], 'hex'))) return match[1];
            if (!issueCookie) return undefined;
            const id = randomBytes(24).toString('hex');
            res.setHeader('Set-Cookie', cookieName + '=' + id + '.' + sign(id).toString('hex')
                + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000');
            return id;
        },
        store(id: string) { return new HostedStore(join(directory, 'workspaces', id)); },
    };
}
