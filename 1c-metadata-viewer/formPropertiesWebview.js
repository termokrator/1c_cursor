const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const { parseFormMetadataXml, saveFormMetadataXml } = require('./metadataXmlParser');
const { normalizePath, tryReveal, register } = require('./openPanelsRegistry');

function getFormPropertiesHtml(parsed, formTitle, formMetaPath) {
  const name = parsed.name || '';
  const synonym = parsed.synonym || '';
  const comment = parsed.comment || '';
  const includeHelp = parsed.includeHelpInContents || false;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Свойства: ${escapeHtml(formTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 16px;
      margin: 0;
      line-height: 1.5;
      background: #fdfdf5;
      color: #000;
    }
    .props-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #ccc;
    }
    .props-header {
      font-size: 1.1em;
      font-weight: 600;
    }
    .props-section {
      margin-bottom: 16px;
    }
    .props-section-title {
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 0.95em;
    }
    .prop-row {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .prop-row label {
      width: 200px;
      font-weight: 400;
      font-size: 0.9em;
    }
    .prop-row input[type="text"],
    .prop-row input[type="checkbox"],
    .prop-row textarea {
      flex: 1;
      max-width: 300px;
      padding: 4px 6px;
      border: 1px solid #999;
      background: #fff;
      color: #000;
    }
    .prop-row textarea {
      min-height: 60px;
      resize: vertical;
    }
    .save-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      border-radius: 2px;
    }
    .save-btn.muted {
      background: #999;
      color: #fff;
      cursor: default;
      opacity: 0.85;
    }
    .save-btn.saving {
      pointer-events: none;
      opacity: 0.9;
    }
    .save-btn .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .prop-row input[type="checkbox"] {
      max-width: auto;
      width: 16px;
      height: 16px;
    }
    .prop-link {
      color: #0066cc;
      cursor: pointer;
      text-decoration: underline;
    }
    .prop-link:hover {
      color: #004499;
    }
  </style>
</head>
<body>
  <div class="props-header-bar">
    <div class="props-header">Свойства: ${escapeHtml(formTitle)}</div>
    <button type="button" class="save-btn muted" id="saveBtn"><span class="btn-text">Сохранить</span></button>
  </div>
  
  <div class="props-section">
    <div class="props-section-title">Основные</div>
    <div class="prop-row">
      <label>Имя</label>
      <input type="text" id="propName" value="${escapeHtml(name)}">
    </div>
    <div class="prop-row">
      <label>Синоним</label>
      <input type="text" id="propSynonym" value="${escapeHtml(synonym)}">
    </div>
    <div class="prop-row">
      <label>Комментарий</label>
      <textarea id="propComment">${escapeHtml(comment)}</textarea>
    </div>
    <div class="prop-row">
      <label>Форма</label>
      <span class="prop-link" id="openFormLink">Открыть</span>
    </div>
  </div>
  
  <div class="props-section">
    <div class="props-section-title">Справочная информация</div>
    <div class="prop-row">
      <label>Включать в содержание справки</label>
      <input type="checkbox" id="propIncludeHelp" ${includeHelp ? 'checked' : ''}>
    </div>
    <div class="prop-row">
      <label>Справочная информация</label>
      <span class="prop-link" style="color:#999;">Открыть</span>
    </div>
  </div>
  <div id="status" style="margin-top:8px;font-size:0.9em;color:var(--vscode-errorForeground);"></div>
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      const saveBtn = document.getElementById('saveBtn');
      const getData = () => ({
        name: document.getElementById('propName').value,
        synonym: document.getElementById('propSynonym').value,
        comment: document.getElementById('propComment').value,
        includeHelpInContents: document.getElementById('propIncludeHelp').checked
      });
      let initial = getData();
      const hasChanges = () => {
        const d = getData();
        return d.name !== initial.name || d.synonym !== initial.synonym || d.comment !== initial.comment || d.includeHelpInContents !== initial.includeHelpInContents;
      };
      const updateBtn = () => {
        const changed = hasChanges();
        saveBtn.classList.toggle('muted', !changed);
        saveBtn.disabled = !changed;
      };
      ['propName','propSynonym','propComment','propIncludeHelp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateBtn);
        if (el) el.addEventListener('change', updateBtn);
      });
      document.getElementById('openFormLink').addEventListener('click', () => {
        vscode.postMessage({ type: 'openForm' });
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
      window.addEventListener('message', (e) => {
        const msg = e.data;
        if (msg.type === 'saved') {
          initial = getData();
          saveBtn.classList.remove('saving');
          const sp = saveBtn.querySelector('.spinner');
          if (sp) sp.remove();
          const txt = saveBtn.querySelector('.btn-text');
          if (txt) txt.textContent = 'Сохранить';
          updateBtn();
        } else if (msg.type === 'error') {
          saveBtn.classList.remove('saving');
          const sp = saveBtn.querySelector('.spinner');
          if (sp) sp.remove();
          const txt = saveBtn.querySelector('.btn-text');
          if (txt) txt.textContent = 'Сохранить';
          document.getElementById('status').textContent = 'Ошибка: ' + (msg.message || '');
        }
      });
    })();
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

async function openFormPropertiesWebview(context, treeItem) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Откройте папку проекта');
    return;
  }

  if (treeItem.contextValue !== 'formFolder') {
    vscode.window.showErrorMessage('Выберите форму');
    return;
  }

  const formPath = treeItem.basePath;
  const formName = path.basename(formPath);
  const formsPath = path.dirname(formPath);
  const formMetaPath = path.join(formsPath, formName + '.xml');

  let parsed = await parseFormMetadataXml(formMetaPath);
  if (!parsed) {
    parsed = { name: formName, synonym: formName, comment: '', includeHelpInContents: false };
  }

  const formTitle = parsed.synonym || formName;

  const panelKey = `formProperties:${normalizePath(formMetaPath)}`;
  const viewColumn = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
  if (tryReveal(panelKey, viewColumn)) return;

  const panel = vscode.window.createWebviewPanel(
    '1cFormProperties',
    `Свойства: ${formTitle}`,
    viewColumn,
    { enableScripts: true }
  );

  panel.webview.html = getFormPropertiesHtml(parsed, formTitle, formMetaPath);
  register(panelKey, panel);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'openForm') {
      const { openFormViewerWebview } = require('./formViewerWebview');
      await openFormViewerWebview(context, treeItem);
    } else if (message.type === 'save') {
      try {
        await saveFormMetadataXml(formMetaPath, message.data);
        panel.webview.postMessage({ type: 'saved' });
      } catch (err) {
        panel.webview.postMessage({ type: 'error', message: err.message });
      }
    }
  });
}

module.exports = { openFormPropertiesWebview };
