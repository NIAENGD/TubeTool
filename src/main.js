const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
const activeDownloads = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function runWorker(payload) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'backend', 'yt_worker.py');
    const worker = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    worker.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    worker.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    worker.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python worker exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse worker output: ${error.message}`));
      }
    });

    worker.stdin.write(JSON.stringify(payload));
    worker.stdin.end();
  });
}

ipcMain.handle('media:analyze', async (_event, request) => {
  return runWorker({ action: 'analyze', ...request });
});

ipcMain.handle('media:download', async (_event, request) => {
  const downloadId = `dl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  activeDownloads.set(downloadId, { status: 'starting', progress: 0 });

  const scriptPath = path.join(__dirname, '..', 'backend', 'yt_worker.py');
  const worker = spawn('python3', [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  worker.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n').filter(Boolean);

    lines.forEach((line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'progress') {
          activeDownloads.set(downloadId, {
            status: event.status,
            progress: event.progress,
            speed: event.speed,
            eta: event.eta
          });
          mainWindow.webContents.send('media:progress', { downloadId, ...event });
        }

        if (event.type === 'done') {
          activeDownloads.set(downloadId, {
            status: 'done',
            progress: 100,
            file: event.file
          });
          mainWindow.webContents.send('media:progress', { downloadId, ...event });
        }
      } catch {
        // ignore non-JSON log lines
      }
    });
  });

  worker.stderr.on('data', (chunk) => {
    mainWindow.webContents.send('media:progress', {
      downloadId,
      type: 'error',
      message: chunk.toString()
    });
  });

  worker.stdin.write(JSON.stringify({ action: 'download', ...request }));
  worker.stdin.end();

  return { downloadId };
});

ipcMain.handle('media:downloads', () => {
  return Array.from(activeDownloads.entries()).map(([id, info]) => ({ id, ...info }));
});

ipcMain.handle('app:open-file', async (_event, targetPath) => {
  if (!targetPath) return false;
  await shell.showItemInFolder(targetPath);
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
