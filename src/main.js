const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let mainWindow;
const activeDownloads = new Map();
let cachedWorkerPath;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function resolvePythonBinary(customPath) {
  const preferred = (customPath || '').trim();
  if (preferred) return preferred;

  if (process.platform === 'win32') return 'python';
  return 'python3';
}

function extractWorkerFromAsar(asarPath) {
  const userDataDir = app.getPath('userData');
  const cacheDir = path.join(userDataDir, 'worker-cache');
  const targetPath = path.join(cacheDir, 'yt_worker.py');

  fs.mkdirSync(cacheDir, { recursive: true });
  const source = fs.readFileSync(asarPath, 'utf8');
  fs.writeFileSync(targetPath, source, 'utf8');
  return targetPath;
}

function resolveWorkerScriptPath() {
  if (cachedWorkerPath && fs.existsSync(cachedWorkerPath)) {
    return cachedWorkerPath;
  }

  const candidates = [
    path.join(__dirname, '..', 'backend', 'yt_worker.py'),
    path.join(process.resourcesPath || '', 'backend', 'yt_worker.py'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'backend', 'yt_worker.py'),
    path.join(app.getAppPath(), 'backend', 'yt_worker.py')
  ].filter(Boolean);

  const asarCandidate = candidates.find((candidate) => candidate.includes('.asar') && fs.existsSync(candidate));

  for (const candidate of candidates) {
    if (!candidate.includes('.asar') && fs.existsSync(candidate)) {
      cachedWorkerPath = candidate;
      return candidate;
    }
  }

  if (asarCandidate) {
    cachedWorkerPath = extractWorkerFromAsar(asarCandidate);
    return cachedWorkerPath;
  }

  throw new Error(`Unable to locate yt_worker.py. Checked: ${candidates.join(', ')}`);
}

function runWorker(payload) {
  return new Promise((resolve, reject) => {
    let scriptPath;
    try {
      scriptPath = resolveWorkerScriptPath();
    } catch (error) {
      reject(error);
      return;
    }

    const pythonBin = resolvePythonBinary(payload.pythonPath);
    const worker = spawn(pythonBin, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        TMPDIR: os.tmpdir()
      }
    });

    let stdout = '';
    let stderr = '';

    worker.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    worker.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    worker.on('error', (error) => {
      reject(new Error(`Failed to start python worker (${pythonBin}): ${error.message}`));
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

  let scriptPath;
  try {
    scriptPath = resolveWorkerScriptPath();
  } catch (error) {
    activeDownloads.set(downloadId, { status: 'error', progress: 0, message: error.message });
    return { downloadId, error: error.message };
  }

  const pythonBin = resolvePythonBinary(request.pythonPath);

  const worker = spawn(pythonBin, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      TMPDIR: os.tmpdir()
    }
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
    const message = chunk.toString();
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: 'error',
      message
    });

    mainWindow.webContents.send('media:progress', {
      downloadId,
      type: 'error',
      message
    });
  });

  worker.on('error', (error) => {
    const message = `Failed to start python worker (${pythonBin}): ${error.message}`;
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: 'error',
      message
    });

    mainWindow.webContents.send('media:progress', {
      downloadId,
      type: 'error',
      message
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
