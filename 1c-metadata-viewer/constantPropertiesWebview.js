const vscode = require('vscode');
const path = require('path');
const { parseConstantXml, saveConstantXml } = require('./metadataXmlParser');
const { normalizePath, tryReveal, register } = require('./openPanelsRegistry');

function getConstantPropertiesHtml(parsed) {
  const name = parsed.name || '';
  const synonym = parsed.synonym || '';
  const comment = parsed.comment || '';
  const useStandardCommands = parsed.useStandardCommands || false;
  const defaultForm = parsed.defaultForm || '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Свойства: ${escapeHtml(name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; margin: 0; background: #fdfdf5; color: #000; }
    .section { margin-bottom: 16px; }
    .section-title { font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .prop-row { display: flex; align-items: center; margin-bottom: 8px; }
    .prop-row label { width: 220px; font-size: 0.9em; }
    .prop-row input, .prop-row select { flex: 1; max-width: 350px; padding: 4px 6px; border: 1px solid #999; background: #fff; }
    .prop-row input[type="checkbox"] { max-width: auto; width: 16px; }
    .header-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #ccc; }
    .header-title { font-weight: 600; font-size: 1.1em; }
    .save-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; border-radius: 2px; }
    .save-btn.muted { background: #999; color: #fff; cursor: default; opacity: 0.85; }
    .save-btn.saving { pointer-events: none; opacity: 0.9; }
    .save-btn .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-title">Свойства: ${escapeHtml(name)}</div>
    <button type="button" class="save-btn muted" id="saveBtn"><span class="btn-text">Сохранить</span></button>
  </div>
  <div class="section">
    <div class="section-title">Основные</div>
    <div class="prop-row"><label>Имя</label><input type="text" id="Name" value="${escapeHtml(name)}"></div>
    <div class="prop-row"><label>Синоним</label><input type="text" id="Synonym" value="${escapeHtml(synonym)}"></div>
    <div class="prop-row"><label>Комментарий</label><input type="text" id="Comment" value="${escapeHtml(comment)}"></div>
    <div class="prop-row"><label><input type="checkbox" id="UseStandardCommands" ${useStandardCommands ? 'checked' : ''}> Использовать стандартные команды</label></div>
    <div class="prop-row"><label>Основная форма</label><input type="text" id="DefaultForm" value="${escapeHtml(defaultForm)}"></div>
  </div>
  <div id="status" style="margin-top:8px;font-size:0.9em;color:var(--vscode-errorForeground);"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const saveBtn = document.getElementById('saveBtn');
    const getData = () => ({
      name: document.getElementById('Name').value,
      synonym: document.getElementById('Synonym').value,
      comment: document.getElementById('Comment').value,
      useStandardCommands: document.getElementById('UseStandardCommands').checked,
      defaultForm: document.getElementById('DefaultForm').value
    });
    let initial = JSON.stringify(getData());
    const hasChanges = () => JSON.stringify(getData()) !== initial;
    const updateBtn = () => saveBtn.classList.toggle('muted', !hasChanges());
    ['Name','Synonym','Comment','UseStandardCommands','DefaultForm'].forEach(id => {
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

async function openConstantPropertiesWebview(context, treeItem) {
  if (!treeItem || treeItem.contextValue !== 'constantObject') return;

  const basePath = treeItem.basePath;
  const objectName = treeItem.objectName;
  const xmlPath = path.join(path.dirname(basePath), objectName + '.xml');

  let parsed;
  try {
    parsed = await parseConstantXml(xmlPath);
  } catch (err) {
    vscode.window.showErrorMessage('Ошибка чтения XML: ' + err.message);
    return;
  }

  if (!parsed) {
    vscode.window.showErrorMessage('Не удалось распознать константу');
    return;
  }

  const panelKey = `constant:${normalizePath(xmlPath)}`;
  const viewColumn = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
  if (tryReveal(panelKey, viewColumn)) return;

  const panel = vscode.window.createWebviewPanel(
    '1cConstantProperties',
    `Свойства: ${parsed.synonym || parsed.name}`,
    vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getConstantPropertiesHtml(parsed);
  register(panelKey, panel);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'save') {
      try {
        await saveConstantXml(xmlPath, message.data);
        panel.webview.postMessage({ type: 'saved' });
      } catch (err) {
        panel.webview.postMessage({ type: 'error', message: err.message });
      }
    }
  });
}

module.exports = { openConstantPropertiesWebview };
