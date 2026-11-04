// Build-time helper run with Electron: rasterizes desktop/icon.svg to a 1024 px transparent PNG.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const [input, output] = process.argv.slice(-2);
app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const svg = readFileSync(input, 'utf8');
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}</style>${svg}`));
  await new Promise(r => setTimeout(r, 300));
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  if (image.getSize().width !== 1024) image = image.resize({ width: 1024, height: 1024, quality: 'best' });
  writeFileSync(output, image.toPNG());
  console.log('icon', image.getSize());
  app.quit();
});
