const defaultSettings = {
  outputDir: `${(globalThis.process?.env?.HOME || '~')}/Downloads/TubeTool`,
  pythonPath: '',
  defaultResolution: 1080,
  autoOpenOnComplete: false
};

const state = {
  source: null,
  downloads: new Map(),
  lastView: 'analyze',
  settings: loadSettings()
};

const el = {
  analyzeView: document.getElementById('analyzeView'),
  selectionView: document.getElementById('selectionView'),
  downloadsView: document.getElementById('downloadsView'),
  settingsView: document.getElementById('settingsView'),
  urlInput: document.getElementById('urlInput'),
  processButton: document.getElementById('processButton'),
  backButton: document.getElementById('backButton'),
  downloadsBackButton: document.getElementById('downloadsBackButton'),
  homeNavButton: document.getElementById('homeNavButton'),
  downloadButton: document.getElementById('downloadButton'),
  downloadsButton: document.getElementById('downloadsButton'),
  settingsButton: document.getElementById('settingsButton'),
  settingsSaveButton: document.getElementById('settingsSaveButton'),
  analyzeStatus: document.getElementById('analyzeStatus'),
  settingsStatus: document.getElementById('settingsStatus'),
  audioList: document.getElementById('audioList'),
  videoList: document.getElementById('videoList'),
  audioAll: document.getElementById('audioAll'),
  videoAll: document.getElementById('videoAll'),
  downloadsList: document.getElementById('downloadsList'),
  resolutionRange: document.getElementById('resolutionRange'),
  resolutionValue: document.getElementById('resolutionValue'),
  titleLabel: document.getElementById('titleLabel'),
  outputDirInput: document.getElementById('outputDirInput'),
  pythonPathInput: document.getElementById('pythonPathInput'),
  defaultResolutionInput: document.getElementById('defaultResolutionInput'),
  autoOpenToggle: document.getElementById('autoOpenToggle')
};

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem('tubeTool.settings') || '{}') };
  } catch {
    return { ...defaultSettings };
  }
}

function persistSettings() {
  localStorage.setItem('tubeTool.settings', JSON.stringify(state.settings));
}

function hydrateSettingsForm() {
  el.outputDirInput.value = state.settings.outputDir;
  el.pythonPathInput.value = state.settings.pythonPath;
  el.defaultResolutionInput.value = state.settings.defaultResolution;
  el.autoOpenToggle.checked = Boolean(state.settings.autoOpenOnComplete);
}

function show(viewName) {
  const views = {
    analyze: el.analyzeView,
    selection: el.selectionView,
    downloads: el.downloadsView,
    settings: el.settingsView
  };

  Object.values(views).forEach((section) => section.classList.add('hidden'));
  views[viewName].classList.remove('hidden');

  if (viewName !== 'downloads' && viewName !== 'settings') {
    state.lastView = viewName;
  }
}

function renderFormats(target, formats, kind) {
  target.innerHTML = '';
  formats.forEach((format) => {
    const row = document.createElement('label');
    row.className = 'format-row';
    row.innerHTML = `<input type="checkbox" data-kind="${kind}" value="${format.id}" /> ${format.label}`;
    target.appendChild(row);
  });
}

function selectedFormats(kind) {
  return [...document.querySelectorAll(`input[data-kind="${kind}"]:checked`)].map((node) => node.value);
}

function setAll(kind, checked) {
  document.querySelectorAll(`input[data-kind="${kind}"]`).forEach((node) => {
    node.checked = checked;
  });
}

function renderDownloads() {
  el.downloadsList.innerHTML = '';
  if (state.downloads.size === 0) {
    el.downloadsList.innerHTML = '<p class="status">No downloads yet. Start from Home.</p>';
    return;
  }

  state.downloads.forEach((info, id) => {
    const node = document.createElement('article');
    node.className = 'download-item';
    const speed = info.speed ? ` | speed: ${info.speed}` : '';
    const eta = info.eta ? ` | eta: ${info.eta}` : '';
    const message = info.message ? `<div class="status">${info.message}</div>` : '';
    node.innerHTML = `
      <strong>${id}</strong>
      <div>Status: ${info.status || 'pending'} (${info.progress || 0}%)${speed}${eta}</div>
      ${message}
      ${info.file ? `<button data-open="${info.file}">Show File</button>` : ''}
    `;
    el.downloadsList.appendChild(node);
  });
}

function applyResolutionBounds(videoFormats) {
  const availableResolutions = [...new Set(videoFormats.map((v) => v.resolution).filter(Boolean).sort((a, b) => a - b))];

  if (availableResolutions.length > 0) {
    el.resolutionRange.min = availableResolutions[0];
    el.resolutionRange.max = availableResolutions.at(-1);
    el.resolutionRange.value = Math.min(state.settings.defaultResolution, availableResolutions.at(-1));
    el.resolutionValue.textContent = `${el.resolutionRange.value}p`;
  } else {
    el.resolutionRange.value = state.settings.defaultResolution;
    el.resolutionValue.textContent = `${state.settings.defaultResolution}p`;
  }
}

el.processButton.addEventListener('click', async () => {
  const url = el.urlInput.value.trim();
  if (!url) return;

  el.analyzeStatus.textContent = 'Analyzing...';
  try {
    const result = await window.tubeTool.analyze({ url, pythonPath: state.settings.pythonPath });
    state.source = result;

    const allFormats = result.items[0]?.formats || [];
    const audio = allFormats.filter((f) => f.kind === 'audio');
    const video = allFormats.filter((f) => f.kind === 'video');

    renderFormats(el.audioList, audio, 'audio');
    renderFormats(el.videoList, video, 'video');
    applyResolutionBounds(video);

    el.titleLabel.textContent = result.items[0]?.title || 'Untitled';
    show('selection');
    el.analyzeStatus.textContent = '';
  } catch (error) {
    el.analyzeStatus.textContent = `Failed: ${error.message}`;
  }
});

el.backButton.addEventListener('click', () => show('analyze'));
el.homeNavButton.addEventListener('click', () => show('analyze'));

el.downloadsButton.addEventListener('click', async () => {
  const list = await window.tubeTool.listDownloads();
  list.forEach((item) => state.downloads.set(item.id, item));
  renderDownloads();
  show('downloads');
});

el.downloadsBackButton.addEventListener('click', () => show(state.lastView));

el.settingsButton.addEventListener('click', () => {
  hydrateSettingsForm();
  el.settingsStatus.textContent = '';
  show('settings');
});

el.settingsSaveButton.addEventListener('click', () => {
  const defaultResolution = Number(el.defaultResolutionInput.value) || 1080;
  state.settings = {
    outputDir: el.outputDirInput.value.trim() || defaultSettings.outputDir,
    pythonPath: el.pythonPathInput.value.trim(),
    defaultResolution,
    autoOpenOnComplete: Boolean(el.autoOpenToggle.checked)
  };

  persistSettings();
  el.settingsStatus.textContent = 'Saved. These settings will be used for all new downloads.';
});

el.audioAll.addEventListener('change', (event) => setAll('audio', event.target.checked));
el.videoAll.addEventListener('change', (event) => setAll('video', event.target.checked));

el.resolutionRange.addEventListener('input', (event) => {
  el.resolutionValue.textContent = `${event.target.value}p`;
});

el.downloadButton.addEventListener('click', async () => {
  if (!state.source) return;
  const selected = {
    audio: selectedFormats('audio'),
    video: selectedFormats('video')
  };

  const maxResolution = Number(el.resolutionRange.value);

  for (const item of state.source.items) {
    const started = await window.tubeTool.startDownload({
      url: item.webpage_url,
      outputDir: state.settings.outputDir,
      selected,
      maxResolution,
      pythonPath: state.settings.pythonPath
    });

    if (started?.error) {
      state.downloads.set(started.downloadId, { status: 'error', progress: 0, message: started.error });
    }
  }

  renderDownloads();
  show('downloads');
});

document.addEventListener('click', async (event) => {
  const file = event.target?.dataset?.open;
  if (file) await window.tubeTool.openFile(file);
});

window.tubeTool.onProgress((event) => {
  state.downloads.set(event.downloadId, {
    ...state.downloads.get(event.downloadId),
    ...event
  });

  if (state.settings.autoOpenOnComplete && event.type === 'done' && event.file) {
    window.tubeTool.openFile(event.file);
  }

  renderDownloads();
});

hydrateSettingsForm();
show('analyze');
