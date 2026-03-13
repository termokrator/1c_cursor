const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { parseEnumValueByUuid, saveEnumValueInXml } = require('./metadataXmlParser');
const { normalizePath, tryReveal, register } = require('./openPanelsRegistry');

function getEnumValuePropertiesHtml(value) {
  const name = value.name || '';
  const synonym = value.synonym || '';
  const comment = value.comment || '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Свойства: ${escapeHtml(name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; margin: 0; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
    .search-bar { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .search-bar input { flex: 1; padding: 6px 10px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
    .search-bar .clear-btn { padding: 4px 8px; cursor: pointer; background: transparent; border: 1px solid var(--vscode-button-border); color: var(--vscode-button-foreground); }
    .section { margin-bottom: 16px; }
    .section-title { font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 4px; cursor: pointer; display: flex; align-items: center; }
    .section-title::before { content: '▶'; margin-right: 6px; font-size: 0.8em; transition: transform 0.2s; }
    .section.collapsed .section-title::before { transform: rotate(-90deg); }
    .section.collapsed .section-content { display: none; }
    .prop-row { display: flex; align-items: center; margin-bottom: 8px; }
    .prop-row label { width: 220px; font-size: 0.9em; flex-shrink: 0; }
    .prop-row input, .prop-row textarea { flex: 1; max-width: 350px; padding: 4px 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
    .prop-row input[type="checkbox"] { max-width: auto; width: 16px; }
    .prop-row textarea { min-height: 40px; resize: vertical; }
    .header-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-widget-border); }
    .save-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; border-radius: 2px; }
    .save-btn.muted { background: #999; color: #fff; cursor: default; opacity: 0.85; }
    .save-btn.saving { pointer-events: none; opacity: 0.9; }
    .save-btn .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #status { margin-top: 8px; font-size: 0.9em; color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <div class="header-bar">
    <div></div>
    <button type="button" class="save-btn muted" id="saveBtn"><span class="btn-text">Сохранить</span></button>
  </div>
  <div class="search-bar">
    <input type="text" id="searchInput" placeholder="Поиск (Ctrl+Alt+I)" title="Поиск по свойствам">
    <button type="button" class="clear-btn" id="clearSearch" title="Очистить">✕</button>
  </div>
  <div class="section" id="mainSection">
    <div class="section-title">Основные:</div>
    <div class="section-content">
      <div class="prop-row" data-prop="name">
        <label>Имя</label>
        <input type="text" id="Name" value="${escapeHtml(name)}">
      </div>
      <div class="prop-row" data-prop="synonym">
        <label>Синоним</label>
        <input type="text" id="Synonym" value="${escapeHtml(synonym)}">
      </div>
      <div class="prop-row" data-prop="comment">
        <label>Комментарий</label>
        <input type="text" id="Comment" value="${escapeHtml(comment)}">
      </div>
    </div>
  </div>
  <div id="status"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const saveBtn = document.getElementById('saveBtn');
    const getData = () => ({
      name: document.getElementById('Name').value,
      synonym: document.getElementById('Synonym').value,
      comment: document.getElementById('Comment').value
    });
    let initial = JSON.stringify(getData());
    const hasChanges = () => JSON.stringify(getData()) !== initial;
    const updateBtn = () => saveBtn.classList.toggle('muted', !hasChanges());
    ['Name','Synonym','Comment'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.addEventListener('input', updateBtn); el.addEventListener('change', updateBtn); }
    });
    saveBtn.addEventListener('click', () => {
      if (!hasChanges()) return;
      saveBtn.classList.add('saving');
      const txt = saveBtn.querySelector('.btn-text');
      if (txt) txt.textContent = '';
      const sp = document.createElement('span');
      sp.className = 'spinner';
      saveBtn.appendChild(sp);
      vscode.postMessage({ type: 'save', data: getData() });
    });
    document.getElementById('clearSearch').addEventListener('click', () => {
      document.getElementById('searchInput').value = '';
      filterProps('');
    });
    document.getElementById('searchInput').addEventListener('input', (e) => filterProps(e.target.value));
    document.querySelector('.section-title').addEventListener('click', () => {
      document.getElementById('mainSection').classList.toggle('collapsed');
    });
    function filterProps(q) {
      const lower = q.toLowerCase();
      document.querySelectorAll('.prop-row').forEach(row => {
        const label = (row.querySelector('label')?.textContent || '').toLowerCase();
        const val = (row.querySelector('input, textarea')?.value || '').toLowerCase();
        row.style.display = !q || label.includes(lower) || val.includes(lower) ? '' : 'none';
      });
    }
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'saved') {
        initial = JSON.stringify(getData());
        saveBtn.classList.remove('saving');
        const sp = saveBtn.querySelector('.spinner');
        if (sp) sp.remove();
        const txt = saveBtn.querySelector('.btn-text');
        if (txt) txt.textContent = 'Сохранить';
        updateBtn();
      } else if (msg.type === 'error') {
        document.getElementById('status').textContent = 'Ошибка: ' + (msg.message || '');
        saveBtn.classList.remove('saving');
        const sp = saveBtn.querySelector('.spinner');
        if (sp) sp.remove();
        const txt = saveBtn.querySelector('.btn-text');
        if (txt) txt.textContent = 'Сохранить';
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function openEnumValuePropertiesWebview(context, treeItem) {
  if (!treeItem || treeItem.contextValue !== 'enumValueItem') return;

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Откройте папку проекта');
    return;
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const basePath = treeItem.basePath;
  const objectName = treeItem.objectName;
  const valueUuid = treeItem.valueUuid;

  let xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
  if (!fs.existsSync(xmlPath)) {
    xmlPath = path.join(rootPath, 'Enums', objectName + '.xml');
  }

  let value;
  try {
    value = await parseEnumValueByUuid(xmlPath, valueUuid);
  } catch (err) {
    vscode.window.showErrorMessage('Ошибка чтения XML: ' + err.message);
    return;
  }

  if (!value) {
    vscode.window.showErrorMessage('Значение перечисления не найдено');
    return;
  }

  const panelKey = `enumValue:${normalizePath(xmlPath)}:${valueUuid}`;
  const viewColumn = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
  if (tryReveal(panelKey, viewColumn)) return;

  const panel = vscode.window.createWebviewPanel(
    '1cEnumValueProperties',
    `Свойства: ${value.synonym || value.name}`,
    vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getEnumValuePropertiesHtml(value);
  register(panelKey, panel);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'save') {
      try {
        await saveEnumValueInXml(xmlPath, valueUuid, message.data);
        panel.webview.postMessage({ type: 'saved' });
      } catch (err) {
        panel.webview.postMessage({ type: 'error', message: err.message });
      }
    }
  });
}

module.exports = { openEnumValuePropertiesWebview };
