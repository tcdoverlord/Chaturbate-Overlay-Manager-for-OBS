const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let serverStarted = false;
function waitForBridge(url, attempts = 50) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = async () => {
      tries++;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return resolve(true);
      } catch (_) {}
      if (tries >= attempts) return reject(new Error('The local bridge did not start on port 8788. Close any older bridge and try again.'));
      setTimeout(check, 250);
    };
    check();
  });
}
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 900, minWidth: 900, minHeight: 650,
    title: 'Chaturbate 20-Overlay Studio',
    backgroundColor: '#080d18',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:8788/')) return { action: 'allow' };
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  try {
    await waitForBridge('http://127.0.0.1:8788/health');
    await mainWindow.loadURL('http://127.0.0.1:8788/');
  } catch (error) {
    await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Bridge could not start', message: error.message, detail: 'Make sure another copy is not already running. Your settings are stored locally.' });
    app.quit();
  }
}
app.whenReady().then(async () => {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.APP_DATA_DIR = dataDir;
  process.env.PORT = '8788';
  try {
    require(path.join(app.getAppPath(), 'Bridge', 'server.js'));
    serverStarted = true;
  } catch (error) {
    await dialog.showMessageBox({ type: 'error', title: 'Startup error', message: 'The local bridge could not start.', detail: error.stack || String(error) });
    app.quit(); return;
  }
  await createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (!serverStarted) return; });
