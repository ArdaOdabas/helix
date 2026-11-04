import { McpServer } from '@modelcontextprotocol/server';
import { toolDefinitions } from '../server/tools.ts';
export function createMcpServer(execute: (name: string, input: unknown) => Promise<unknown> | unknown) { const server = new McpServer({ name: 'helix-scientific-editor', version: '0.7.0' }); for (const [name, definition] of Object.entries(toolDefinitions)) {
    server.registerTool(name, { description: definition.description, inputSchema: definition.schema, annotations: { readOnlyHint: definition.readOnly, destructiveHint: !definition.readOnly, openWorldHint: false } }, async (raw: any) => { try {
        const args = definition.schema.parse(raw), data = await execute(name, args);
        if(data && typeof data==='object' && 'image' in data){
            const {image,...metadata}=data as {image:{type:'image';mimeType:'image/png';data:string};[key:string]:unknown};
            return {content:[{type:'text' as const,text:JSON.stringify(metadata)},image]};
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    }
    catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: (e as Error).message }] };
    } });
}
server.server.oninitialized=()=>server.sendToolListChanged();
return server; }
