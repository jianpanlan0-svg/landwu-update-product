const { app, BrowserWindow, dialog, shell } = require('electron');

let mainWindow = null;
let serverApi = null;

function waitForServer(server) {
  if (!server || server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

async function createWindow() {
  process.env.LANDWU_RUNTIME_DIR = app.getPath('userData');
  process.env.LANDWU_RUN_INLINE_STEPS = '1';

  global.__LANDWU_PICK_FOLDER__ = async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: '选择图片文件夹',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) {
      throw new Error('未选择文件夹');
    }
    return result.filePaths[0];
  };

  serverApi = require('./uploader-server-v1.js');
  const server = serverApi.startServer();
  server.on('error', (error) => {
    dialog.showErrorBox('领物TEMU上传器启动失败', error.message || String(error));
    app.quit();
  });
  await waitForServer(server);

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://${serverApi.HOST}:${serverApi.PORT}`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow).catch((error) => {
    dialog.showErrorBox('领物TEMU上传器启动失败', error.message || String(error));
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        dialog.showErrorBox('领物TEMU上传器启动失败', error.message || String(error));
      });
    }
  });

  app.on('before-quit', () => {
    if (serverApi && typeof serverApi.stopServer === 'function') {
      serverApi.stopServer();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
