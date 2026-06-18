(() => {
  const buttons = Array.from(document.querySelectorAll('[data-view]'));
  const phases = Array.from(document.querySelectorAll('details.phase'));
  const resourceDrawers = Array.from(document.querySelectorAll('details.phase-resources'));
  const summaryBlocks = Array.from(document.querySelectorAll('details.summary-block'));
  const readFirstBlocks = Array.from(document.querySelectorAll('details.read-first-block'));

  const completedOnlyToggle = document.getElementById('completedOnlyToggle');
  const progressSummary = document.getElementById('progressSummary');
  const loadProgressButton = document.getElementById('loadProgressButton');
  const saveProgressButton = document.getElementById('saveProgressButton');
  const progressFileInput = document.getElementById('progressFileInput');
  const progressFileStatus = document.getElementById('progressFileStatus');

  const ROADMAP_VERSION = '8.9.0';
  const PROGRESS_SCHEMA = 'embodied-ai-roadmap-progress';
  let showCompletedOnly = false;
  let progressFileHandle = null;
  let hasUnsavedChanges = false;

  function closeAllCollapsibles() {
    phases.forEach(phase => { phase.open = false; });
    resourceDrawers.forEach(drawer => { drawer.open = false; });
    summaryBlocks.forEach(block => { block.open = false; });
    readFirstBlocks.forEach(block => { block.open = false; });
  }

  function setView(view) {
    document.body.classList.remove('view-overview', 'view-build', 'view-math', 'view-resources', 'view-all');
    document.body.classList.add('view-' + view);
    buttons.forEach(button => button.classList.toggle('active', button.dataset.view === view));
    closeAllCollapsibles();
    if (view === 'resources' || view === 'all') {
      resourceDrawers.forEach(drawer => { drawer.open = true; });
    }
  }

  function normalizeText(text) {
    return text.trim().replace(/\s+/g, ' ');
  }

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function getCleanTitleText(title) {
    if (!title) return '';
    return Array.from(title.childNodes)
      .filter(node => !(node.nodeType === Node.ELEMENT_NODE && node.classList.contains('check-progress')))
      .map(node => node.textContent || '')
      .join(' ')
      .trim();
  }

  function getPhaseLabel(phase) {
    const badge = phase.querySelector('.phase-badge');
    const title = phase.querySelector('.phase-title');
    return normalizeText([(badge && badge.textContent) || phase.id, (title && title.textContent) || ''].join(' — '));
  }

  function isChecklistColumn(col) {
    const title = col.querySelector('.col-title');
    if (!title) return false;
    const value = normalizeText(getCleanTitleText(title)).toLowerCase();
    return value.startsWith('skills') || value.startsWith('tools') || value.startsWith('pass criteria');
  }

  function setStatus(message) {
    if (progressFileStatus) progressFileStatus.textContent = message || '';
  }

  function markUnsaved() {
    hasUnsavedChanges = true;
    if (!progressFileStatus) return;
    const current = progressFileStatus.textContent.trim();
    if (!current) {
      progressFileStatus.textContent = 'Có thay đổi chưa xuất';
    } else if (!current.includes('chưa xuất')) {
      progressFileStatus.textContent = current + ' · có thay đổi chưa xuất';
    }
  }

  function setChecklistItemState(item, checked) {
    item.classList.toggle('completed', checked);
    const input = item.querySelector('.completion-checkbox');
    if (input) input.checked = checked;
  }

  function updateProgress() {
    const allInputs = Array.from(document.querySelectorAll('.completion-checkbox'));
    const completedInputs = allInputs.filter(input => input.checked);

    if (progressSummary) {
      progressSummary.textContent = completedInputs.length + '/' + allInputs.length + ' hoàn thiện';
    }

    document.querySelectorAll('.checklist-col').forEach(col => {
      const inputs = Array.from(col.querySelectorAll('.completion-checkbox'));
      const completed = inputs.filter(input => input.checked).length;
      const progress = col.querySelector('.check-progress');
      if (progress) progress.textContent = completed + '/' + inputs.length;
      col.classList.toggle('no-completed', completed === 0);
    });
  }

  function setupChecklist() {
    document.querySelectorAll('.col').forEach((col, colIndex) => {
      if (!isChecklistColumn(col)) return;

      const list = col.querySelector('ul.skill-list');
      const title = col.querySelector('.col-title');
      const phase = col.closest('details.phase');
      if (!list || !title || !phase) return;

      const category = normalizeText(getCleanTitleText(title));
      col.classList.add('checklist-col');

      if (!title.querySelector('.check-progress')) {
        const progress = document.createElement('span');
        progress.className = 'check-progress';
        progress.textContent = '0/0';
        title.appendChild(progress);
      }

      Array.from(list.children).forEach((item, itemIndex) => {
        if (item.classList.contains('checklist-item')) return;

        const rawText = normalizeText(item.textContent);
        const keySource = [phase.id, colIndex, itemIndex, rawText].join('|');
        const checkId = hashString(keySource);
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        const text = document.createElement('span');

        item.classList.add('checklist-item');
        item.dataset.checkId = checkId;
        item.dataset.phaseId = phase.id;
        item.dataset.phaseLabel = getPhaseLabel(phase);
        item.dataset.category = category;
        item.dataset.itemText = rawText;

        label.className = 'check-label';
        checkbox.type = 'checkbox';
        checkbox.className = 'completion-checkbox';
        checkbox.setAttribute('aria-label', 'Đánh dấu hoàn thiện: ' + rawText);
        text.className = 'check-text';

        while (item.firstChild) {
          text.appendChild(item.firstChild);
        }

        label.appendChild(checkbox);
        label.appendChild(text);
        item.appendChild(label);

        checkbox.addEventListener('change', () => {
          setChecklistItemState(item, checkbox.checked);
          updateProgress();
          markUnsaved();
        });
      });
    });

    updateProgress();
  }

  function setCompletedOnly(enabled) {
    showCompletedOnly = enabled;
    document.body.classList.toggle('show-completed-only', enabled);
    if (completedOnlyToggle) {
      completedOnlyToggle.classList.toggle('active', enabled);
      completedOnlyToggle.setAttribute('aria-pressed', String(enabled));
      completedOnlyToggle.textContent = enabled ? 'Hiện tất cả checklist' : 'Chỉ hiện đã hoàn thiện';
    }
    updateProgress();
  }

  function getCompletedItems() {
    return Array.from(document.querySelectorAll('.checklist-item.completed')).map(item => ({
      id: item.dataset.checkId,
      phaseId: item.dataset.phaseId,
      phase: item.dataset.phaseLabel,
      category: item.dataset.category,
      text: item.dataset.itemText
    }));
  }

  function buildProgressText() {
    const completedItems = getCompletedItems();
    const data = {
      schema: PROGRESS_SCHEMA,
      roadmapVersion: ROADMAP_VERSION,
      savedAt: new Date().toISOString(),
      completedCount: completedItems.length,
      totalCount: document.querySelectorAll('.completion-checkbox').length,
      completedIds: completedItems.map(item => item.id),
      completedItems
    };
    return JSON.stringify(data, null, 2);
  }

  function downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function saveProgress() {
    const text = buildProgressText();
    const suggestedName = 'roadmap_progress.txt';

    try {
      if ('showSaveFilePicker' in window) {
        if (!progressFileHandle) {
          progressFileHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [{
              description: 'Roadmap progress text file',
              accept: { 'text/plain': ['.txt'] }
            }]
          });
        }
        const writable = await progressFileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        hasUnsavedChanges = false;
        setStatus('Đã lưu TXT');
        return;
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      console.warn('Không ghi trực tiếp được, chuyển sang tải file:', error);
    }

    downloadTextFile(text, suggestedName);
    hasUnsavedChanges = false;
    setStatus('Đã tải TXT');
  }

  function parseProgressText(text) {
    const trimmed = text.trim();
    if (!trimmed) return new Set();

    try {
      const data = JSON.parse(trimmed);
      if (Array.isArray(data.completedIds)) return new Set(data.completedIds.map(String));
      if (Array.isArray(data.completed)) return new Set(data.completed.map(String));
      if (Array.isArray(data)) return new Set(data.map(String));
    } catch (error) {
      // Fallback: one checklist id per line.
    }

    return new Set(trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  }

  function applyCompletedIds(completedIds) {
    let matched = 0;
    document.querySelectorAll('.checklist-item').forEach(item => {
      const checked = completedIds.has(item.dataset.checkId);
      if (checked) matched += 1;
      setChecklistItemState(item, checked);
    });
    updateProgress();
    return matched;
  }

  async function loadProgressFile(file) {
    if (!file) return;
    const text = await file.text();
    const ids = parseProgressText(text);
    const matched = applyCompletedIds(ids);
    progressFileHandle = null;
    hasUnsavedChanges = false;
    setStatus('Đã nạp ' + file.name + ' · khớp ' + matched + '/' + ids.size);
  }

  buttons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));

  if (completedOnlyToggle) {
    completedOnlyToggle.addEventListener('click', () => {
      setCompletedOnly(!showCompletedOnly);
    });
  }

  if (loadProgressButton && progressFileInput) {
    loadProgressButton.addEventListener('click', () => progressFileInput.click());
    progressFileInput.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      loadProgressFile(file).catch(error => {
        console.error(error);
        setStatus('Không nạp được TXT');
      });
      progressFileInput.value = '';
    });
  }

  if (saveProgressButton) {
    saveProgressButton.addEventListener('click', () => {
      saveProgress().catch(error => {
        console.error(error);
        setStatus('Không lưu được TXT');
      });
    });
  }

  document.querySelectorAll('a[href^="#ph"]').forEach(link => {
    link.addEventListener('click', (event) => {
      const targetId = link.getAttribute('href').substring(1);
      const targetPhase = document.getElementById(targetId);
      if (targetPhase) {
        event.preventDefault();
        if (document.body.classList.contains('view-overview')) {
          setView('build');
        }
        targetPhase.open = true;
        setTimeout(() => {
          targetPhase.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    });
  });

  const expandAllPhases = document.getElementById('expandAllPhases');
  const collapseAllPhases = document.getElementById('collapseAllPhases');
  if (expandAllPhases) {
    expandAllPhases.addEventListener('click', () => {
      phases.forEach(phase => { phase.open = true; });
    });
  }
  if (collapseAllPhases) {
    collapseAllPhases.addEventListener('click', () => {
      phases.forEach(phase => { phase.open = false; });
    });
  }

  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = '';
  });

  setupChecklist();
  setCompletedOnly(false);
  setView('overview');
})();
