const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const { parseMetadataObjectXml, saveMetadataObjectXml } = require('./metadataXmlParser');
const { normalizePath, get, register } = require('./openPanelsRegistry');

function getObjectEditorHtml(parsed) {
  const tabsHtml = parsed.tabs.map((tab, idx) => {
    if (tab.id === 'data') {
      return `
        <div class="tab-pane ${idx === 0 ? 'active' : ''}" data-tab="${tab.id}">
          <div class="tab-title">${tab.title}</div>
          <div class="attributes-list-container">
            <div style="margin-bottom: 8px; font-weight: 500;">Реквизиты:</div>
            <table class="attributes-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Синоним</th>
                  <th>Тип</th>
                </tr>
              </thead>
              <tbody>
                ${parsed.attributes.map(a => `
                  <tr class="attribute-row" data-uuid="${a.uuid}">
                    <td>${escapeHtml(a.name)}</td>
                    <td>${escapeHtml(a.synonym)}</td>
                    <td>${escapeHtml(a.type)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="table-hint">Дважды кликните по реквизиту — откроется форма свойств в соседней вкладке</div>
          </div>
        </div>`;
    }
    
    return `
    <div class="tab-pane ${idx === 0 ? 'active' : ''}" data-tab="${tab.id}">
      <div class="tab-title">${tab.title}</div>
      <div class="tab-fields">
        ${tab.fields.map(f => {
          const id = `field_${f.key}`;
          if (f.type === 'boolean') {
            return `
              <div class="field-group">
                <label class="checkbox-wrapper">
                  <input type="checkbox" id="${id}" data-key="${f.key}" ${f.value === 'true' ? 'checked' : ''}>
                  <span>${f.label}</span>
                </label>
              </div>`;
          }
          return `
            <div class="field-group">
              <label for="${id}">${f.label}</label>
              <input type="text" id="${id}" data-key="${f.key}" value="${escapeHtml(f.value)}">
            </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const tabsNav = parsed.tabs.map((tab, idx) => `
    <button class="tab-btn ${idx === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.title}</button>`).join('');

  const attributesJson = JSON.stringify(parsed.attributes).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(parsed.objectName)} - Свойства</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 16px;
      margin: 0;
      line-height: 1.5;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .object-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border);
      flex-shrink: 0;
    }
    .object-header {
      font-size: 1.2em;
      font-weight: 600;
    }
    .main-container {
      display: flex;
      flex: 1;
      min-height: 0;
      border: 1px solid var(--vscode-widget-border);
      background: var(--vscode-editor-background);
    }
    .tabs-nav {
      display: flex;
      flex-direction: column;
      width: 200px;
      border-right: 1px solid var(--vscode-widget-border);
      background: var(--vscode-sideBar-background);
      overflow-y: auto;
    }
    .tab-btn {
      padding: 8px 16px;
      font-family: inherit;
      font-size: inherit;
      background: transparent;
      color: var(--vscode-sideBar-foreground);
      border: none;
      text-align: left;
      cursor: pointer;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .tab-btn:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .tab-btn.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      font-weight: 500;
    }
    .tab-content-wrapper {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      background: #fdfdf5; /* slightly yellow as in 1C */
      color: #000;
    }
    .tab-pane {
      display: none;
    }
    .tab-pane.active {
      display: block;
    }
    .tab-title {
      font-weight: 600;
      margin-bottom: 16px;
      color: #000;
    }
    .field-group {
      margin-bottom: 12px;
      display: flex;
      align-items: center;
    }
    .field-group label {
      width: 200px;
      font-weight: 400;
    }
    .checkbox-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checkbox-wrapper input {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    input[type="text"], select {
      flex: 1;
      max-width: 400px;
      padding: 4px 8px;
      font-family: inherit;
      font-size: inherit;
      background: #fff;
      color: #000;
      border: 1px solid #ccc;
      border-radius: 2px;
    }
    input[type="text"]:focus, select:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: transparent;
    }
    
    /* Table for attributes */
    .attributes-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
    }
    .attributes-table th, .attributes-table td {
      border: 1px solid #ccc;
      padding: 4px 8px;
      text-align: left;
    }
    .attributes-table th {
      background: #eee;
      font-weight: 500;
    }
    .attributes-table tr.attribute-row:hover {
      background: #eef;
      cursor: pointer;
    }
    .table-hint {
      font-size: 0.85em;
      color: #666;
      margin-top: 8px;
    }

    #saveBtn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      font-family: inherit;
      font-size: inherit;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }
    #saveBtn:hover:not(.muted):not(.saving) {
      background: var(--vscode-button-hoverBackground);
    }
    #saveBtn.muted {
      background: #999;
      color: #fff;
      cursor: default;
      opacity: 0.85;
    }
    #saveBtn.saving {
      pointer-events: none;
      opacity: 0.9;
    }
    #saveBtn .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status {
      font-size: 0.9em;
    }
    .status.error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <div class="object-header-bar">
    <div class="object-header">${escapeHtml(parsed.objectName)} (${parsed.type})</div>
    <button type="button" id="saveBtn" class="muted"><span class="btn-text">Сохранить</span></button>
  </div>
  <div class="main-container">
    <div class="tabs-nav">${tabsNav}</div>
    <div class="tab-content-wrapper">${tabsHtml}</div>
  </div>
  <div class="status" id="status"></div>

  <script>
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector('.tab-pane[data-tab="' + btn.dataset.tab + '"]').classList.add('active');
      });
    });

    document.querySelectorAll('.attribute-row').forEach(row => {
      row.addEventListener('dblclick', () => {
        vscode.postMessage({ type: 'openRequisite', uuid: row.dataset.uuid });
      });
    });

    const saveBtn = document.getElementById('saveBtn');
    const getChanges = () => {
      const changes = {};
      document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        const val = el.type === 'checkbox' ? el.checked : el.value;
        changes[key] = typeof val === 'boolean' ? (val ? 'true' : 'false') : val;
      });
      return changes;
    };
    let initialChanges = getChanges();
    const hasChanges = () => {
      const cur = getChanges();
      const keys = new Set([...Object.keys(cur), ...Object.keys(initialChanges)]);
      for (const k of keys) {
        if (String(cur[k] || '') !== String(initialChanges[k] || '')) return true;
      }
      return false;
    };
    const updateBtn = () => {
      saveBtn.classList.toggle('muted', !hasChanges());
    };
    document.querySelectorAll('[data-key]').forEach(el => {
      el.addEventListener('input', updateBtn);
      el.addEventListener('change', updateBtn);
    });
    saveBtn.addEventListener('click', () => {
      if (!hasChanges()) return;
      saveBtn.classList.add('saving');
      const txt = saveBtn.querySelector('.btn-text');
      if (txt) txt.textContent = '';
      const sp = document.createElement('span');
      sp.className = 'spinner';
      saveBtn.appendChild(sp);
      vscode.postMessage({ type: 'save', data: getChanges() });
    });

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'saved') {
        initialChanges = getChanges();
        saveBtn.classList.remove('saving');
        const sp = saveBtn.querySelector('.spinner');
        if (sp) sp.remove();
        const txt = saveBtn.querySelector('.btn-text');
        if (txt) txt.textContent = 'Сохранить';
        updateBtn();
      } else if (msg.type === 'error') {
        const s = document.getElementById('status');
        s.textContent = 'Ошибка: ' + (msg.message || 'неизвестная');
        s.className = 'status error';
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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let objectEditorPanel = null;

async function openObjectMetadataWebview(context, treeItem) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Откройте папку проекта');
    return;
  }
  const rootPath = workspaceFolders[0].uri.fsPath;

  if (treeItem.contextValue !== 'metadataObject') {
    vscode.window.showErrorMessage('Выберите объект метаданных');
    return;
  }

  const basePath = treeItem.basePath;
  const objectName = treeItem.objectName;
  const folderName = treeItem.folderName;
  const xmlPath = path.join(path.dirname(basePath), objectName + '.xml');

  try {
    await fs.access(xmlPath);
  } catch {
    vscode.window.showErrorMessage(`Файл не найден: ${xmlPath}`);
    return;
  }

  let parsed;
  try {
    parsed = await parseMetadataObjectXml(xmlPath);
  } catch (err) {
    vscode.window.showErrorMessage('Ошибка чтения XML: ' + err.message);
    return;
  }

  if (!parsed.type || !parsed.tabs.length) {
    vscode.window.showErrorMessage('Не удалось распознать тип объекта метаданных');
    return;
  }

  const columnToShowIn = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined;

  const panelKey = `objectMetadata:${normalizePath(xmlPath)}`;
  const existing = get(panelKey);
  if (existing && existing.panel) {
    existing.panel.reveal(columnToShowIn);
    existing.panel.webview.html = getObjectEditorHtml(parsed);
    existing.panel.webview.postMessage({ type: 'init' });
    objectEditorPanel = { panel: existing.panel, xmlPath, parsed, basePath, objectName, folderName, rootPath };
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    '1cObjectMetadataEditor',
    `${objectName} - Свойства`,
    columnToShowIn || vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  objectEditorPanel = { panel, xmlPath, parsed, basePath, objectName, folderName, rootPath };
  register(panelKey, panel, { xmlPath, parsed, basePath, objectName, folderName, rootPath });
  panel.webview.html = getObjectEditorHtml(parsed);

  const { openRequisitePropertiesWebview } = require('./requisitePropertiesWebview');

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'openRequisite') {
      const virtualTreeItem = {
        contextValue: 'attrItem',
        attrUuid: message.uuid,
        basePath,
        objectName,
        folderName
      };
      await openRequisitePropertiesWebview(context, virtualTreeItem, { asSubordinate: true, viewColumn: panel.viewColumn || columnToShowIn });
    } else if (message.type === 'save') {
      try {
        parsed.rawXml = await fs.readFile(xmlPath, 'utf8');
        await saveMetadataObjectXml(xmlPath, message.data, parsed);
        parsed.rawXml = await fs.readFile(xmlPath, 'utf8');
        objectEditorPanel.parsed = parsed;
        panel.webview.html = getObjectEditorHtml(parsed);
        panel.webview.postMessage({ type: 'saved' });
      } catch (err) {
        panel.webview.postMessage({ type: 'error', message: err.message });
      }
    }
  });

  panel.onDidDispose(() => {
    if (objectEditorPanel && objectEditorPanel.xmlPath === xmlPath) {
      objectEditorPanel = null;
    }
  });
}

async function refreshObjectEditorIfNeeded(xmlPath) {
  if (objectEditorPanel && objectEditorPanel.xmlPath === xmlPath) {
    try {
      const parsed = await parseMetadataObjectXml(xmlPath);
      objectEditorPanel.parsed = parsed;
      objectEditorPanel.panel.webview.html = getObjectEditorHtml(parsed);
    } catch {
      // ignore
    }
  }
}

module.exports = { openObjectMetadataWebview, refreshObjectEditorIfNeeded };
