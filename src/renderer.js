const state = {
  source: null,
  downloads: new Map()
};

const el = {
  analyzeView: document.getElementById('analyzeView'),
  selectionView: document.getElementById('selectionView'),
  downloadsView: document.getElementById('downloadsView'),
  urlInput: document.getElementById('urlInput'),
  processButton: document.getElementById('processButton'),
  backButton: document.getElementById('backButton'),
  downloadButton: document.getElementById('downloadButton'),
  downloadsButton: document.getElementById('downloadsButton'),
  analyzeStatus: document.getElementById('analyzeStatus'),
  audioList: document.getElementById('audioList'),
  videoList: document.getElementById('videoList'),
  audioAll: document.getElementById('audioAll'),
  videoAll: document.getElementById('videoAll'),
  downloadsList: document.getElementById('downloadsList'),
  resolutionRange: document.getElementById('resolutionRange'),
  resolutionValue: document.getElementById('resolutionValue'),
  titleLabel: document.getElementById('titleLabel')
};

function show(view) {
  [el.analyzeView, el.selectionView, el.downloadsView].forEach((section) => section.classList.add('hidden'));
  view.classList.remove('hidden');
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
  state.downloads.forEach((info, id) => {
    const node = document.createElement('article');
    node.className = 'download-item';
    const speed = info.speed ? ` | speed: ${info.speed}` : '';
    const eta = info.eta ? ` | eta: ${info.eta}` : '';
    node.innerHTML = `
      <strong>${id}</strong>
      <div>Status: ${info.status || 'pending'} (${info.progress || 0}%)${speed}${eta}</div>
      ${info.file ? `<button data-open="${info.file}">Show File</button>` : ''}
    `;
    el.downloadsList.appendChild(node);
  });
}

el.processButton.addEventListener('click', async () => {
  const url = el.urlInput.value.trim();
  if (!url) return;

  el.analyzeStatus.textContent = 'Processing...';
  try {
    const result = await window.tubeTool.analyze(url);
    state.source = result;

    const allFormats = result.items[0]?.formats || [];
    const audio = allFormats.filter((f) => f.kind === 'audio');
    const video = allFormats.filter((f) => f.kind === 'video');

    renderFormats(el.audioList, audio, 'audio');
    renderFormats(el.videoList, video, 'video');

    const availableResolutions = [...new Set(video.map((v) => v.resolution).filter(Boolean).sort((a, b) => a - b))];
    if (availableResolutions.length > 0) {
      el.resolutionRange.min = availableResolutions[0];
      el.resolutionRange.max = availableResolutions.at(-1);
      el.resolutionRange.value = availableResolutions.at(-1);
      el.resolutionValue.textContent = `${el.resolutionRange.value}p`;
    }

    el.titleLabel.textContent = result.items[0]?.title || 'Untitled';
    show(el.selectionView);
    el.analyzeStatus.textContent = '';
  } catch (error) {
    el.analyzeStatus.textContent = `Failed: ${error.message}`;
  }
});

el.backButton.addEventListener('click', () => show(el.analyzeView));
el.downloadsButton.addEventListener('click', async () => {
  const list = await window.tubeTool.listDownloads();
  list.forEach((item) => state.downloads.set(item.id, item));
  renderDownloads();
  show(el.downloadsView);
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
    await window.tubeTool.startDownload({
      url: item.webpage_url,
      outputDir: `${process.env.HOME || '~'}/Downloads/TubeTool`,
      selected,
      maxResolution
    });
  }

  show(el.downloadsView);
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
  renderDownloads();
});

show(el.analyzeView);
