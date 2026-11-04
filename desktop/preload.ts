// Narrow, explicit bridge for the sandboxed editor page. No Node or Electron objects are exposed.
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('helixDesktop', {
    platform: process.platform,
    saveFile: (options: { defaultName: string; data: Uint8Array | string; filters: { name: string; extensions: string[] }[] }) => ipcRenderer.invoke('helix:save-file', options),
    openFigure: () => ipcRenderer.invoke('helix:open-figure'),
    onCommand: (callback: (command: string) => void) => {
        const listener = (_event: unknown, command: string) => callback(command);
        ipcRenderer.on('helix:command', listener);
        return () => { ipcRenderer.removeListener('helix:command', listener); };
    },
});
