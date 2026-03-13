const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const { parseFormXml } = require('./metadataXmlParser');
const { normalizePath, tryReveal, register } = require('./openPanelsRegistry');

function getFormViewerHtml(parsed, formTitle) {
  const itemsHtml = parsed.items.map(item => {
    const isHidden = item.visible === false ? 'display: none;' : '';
    const readOnlyAttr = item.readOnly ? 'readonly' : '';
    let inputHtml = '';
    
    if (item.type === 'InputField' || item.type === 'LabelField') {
      const isMultiLine = item.multiLine;
      const isRef = item.fieldType && item.fieldType.includes('Ref.');
      const showButton = isRef || item.type === 'InputField';
      
      inputHtml = isMultiLine
        ? `<textarea rows="3" readonly></textarea>`
        : `<div class="input-with-button">
             <input type="text" readonly>
             ${showButton ? `<button type="button" class="input-btn">...</button>` : ''}
           </div>`;
           
      return `
        <div class="form-field form-item" style="${isHidden}" data-id="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}">
          <label>${escapeHtml(item.title || item.name)}</label>
          ${inputHtml}
        </div>`;
    }
    if (item.type === 'Button') {
      return `
        <div class="form-field form-item" style="${isHidden}" data-id="${escapeHtml(item.id)}">
          <button type="button" class="form-button" disabled>${escapeHtml(item.title || item.name)}</button>
        </div>`;
    }
    if (item.type === 'Table') {
      const cols = item.columns || [];
      const colHeaders = cols.length > 0
        ? `<tr>${cols.map(c => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr>`
        : '';
      return `
        <div class="form-table-wrapper form-item" style="${isHidden}" data-id="${escapeHtml(item.id)}">
          <div class="form-table-title">${escapeHtml(item.title || item.name)}</div>
          <div class="form-table-placeholder">
            <table class="form-preview-table">
              ${colHeaders}
              <tr><td colspan="${cols.length || 1}" class="table-empty">—</td></tr>
            </table>
          </div>
        </div>`;
    }
    if (item.type === 'UsualGroup') {
      return `
        <div class="form-group form-item" style="${isHidden}" data-id="${escapeHtml(item.id)}">
          <div class="form-group-title">${escapeHtml(item.title || item.name)}</div>
          <div class="form-group-content"></div>
        </div>`;
    }
    return `
      <div class="form-field form-item" style="${isHidden}" data-id="${escapeHtml(item.id)}">
        <label>${escapeHtml(item.name)}</label>
        <input type="text" readonly>
      </div>`;
  }).join('');

  const commandsHtml = parsed.commands.length > 0
    ? `<div class="form-commands">
        ${parsed.commands.map(c => `<button type="button" class="form-cmd-btn" disabled>${escapeHtml(c.title)}</button>`).join('')}
      </div>`
    : '';
    
  const itemsJson = JSON.stringify(parsed.items).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(formTitle)}</title>
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
      height: 100vh;
      overflow: hidden;
    }
    .form-header {
      font-size: 1.2em;
      font-weight: 600;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #ccc;
    }
    .form-commands {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      padding: 8px 0;
      border-bottom: 1px solid #ccc;
    }
    .form-cmd-btn {
      padding: 6px 12px;
      font-family: inherit;
      font-size: inherit;
      background: #fff;
      color: #000;
      border: 1px solid #ccc;
      border-radius: 2px;
      cursor: default;
    }
    .form-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 600px;
      height: calc(100vh - 120px);
      overflow-y: auto;
      padding-right: 16px;
    }
    .form-field {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .form-field label {
      font-weight: 400;
      font-size: 0.9em;
      width: 150px;
      text-align: right;
    }
    .input-with-button {
      display: flex;
      flex: 1;
    }
    .form-field input,
    .form-field textarea {
      padding: 4px 6px;
      font-family: inherit;
      font-size: inherit;
      background: #fff;
      color: #000;
      border: 1px solid #999;
      border-radius: 0;
      flex: 1;
    }
    .input-btn {
      padding: 0 6px;
      background: #eee;
      border: 1px solid #999;
      border-left: none;
      cursor: default;
    }
    .form-field textarea {
      resize: vertical;
      min-height: 60px;
    }
    .form-button {
      padding: 6px 16px;
      font-family: inherit;
      font-size: inherit;
      background: #eee;
      color: #000;
      border: 1px solid #999;
      border-radius: 2px;
      cursor: default;
      width: fit-content;
      margin-left: 166px;
    }
    .form-table-wrapper {
      border: 1px solid #ccc;
      border-radius: 2px;
      padding: 12px;
      margin-top: 8px;
    }
    .form-table-title {
      font-weight: 500;
      margin-bottom: 8px;
    }
    .form-table-placeholder {
      min-height: 120px;
      background: #fff;
      border: 1px solid #999;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }
    .form-preview-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
    }
    .form-preview-table th,
    .form-preview-table td {
      padding: 4px 8px;
      border: 1px solid #ccc;
      text-align: left;
    }
    .form-preview-table th {
      background: #eee;
      font-weight: 400;
    }
    .form-preview-table .table-empty {
      color: #999;
      text-align: center;
      padding: 16px;
    }
    .form-group {
      border: 1px solid #ccc;
      border-radius: 2px;
      padding: 12px;
      margin-top: 8px;
    }
    .form-group-title {
      font-weight: 500;
      margin-bottom: 8px;
    }
    .form-attributes {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #ccc;
      font-size: 0.85em;
      color: #666;
    }
    .form-item:hover {
      outline: 1px dashed blue;
      cursor: pointer;
    }

    /* Modal Palette */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.3);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal-content {
      background: #fdfdf5;
      color: #000;
      width: 450px;
      max-height: 90vh;
      overflow-y: auto;
      border: 1px solid #999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      border-radius: 2px;
      display: flex;
      flex-direction: column;
    }
    .modal-header {
      padding: 8px 12px;
      background: #e2e2d0;
      font-weight: 600;
      border-bottom: 1px solid #ccc;
      display: flex;
      justify-content: space-between;
    }
    .modal-close {
      cursor: pointer;
      font-weight: bold;
    }
    .modal-body {
      padding: 16px;
    }
    .modal-section {
      margin-bottom: 16px;
    }
    .modal-section-title {
      font-weight: 600;
      margin-bottom: 8px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
    }
    .prop-row {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .prop-row label {
      width: 180px;
      font-size: 0.9em;
    }
    .prop-row input[type="text"] {
      flex: 1;
      padding: 4px;
      border: 1px solid #ccc;
    }
    .prop-row input[type="checkbox"] {
      margin-right: auto;
    }
  </style>
</head>
<body>
  <div class="form-header">${escapeHtml(formTitle)}</div>
  ${commandsHtml}
  <div class="form-content">${itemsHtml}</div>
  
  <div class="modal-overlay" id="propModal">
    <div class="modal-content">
      <div class="modal-header">
        <span id="propModalTitle">Свойства: Поле</span>
        <span class="modal-close" id="propModalClose">&times;</span>
      </div>
      <div class="modal-body">
        <input type="hidden" id="prop_id">
        <div class="modal-section">
          <div class="modal-section-title">Основные</div>
          <div class="prop-row">
            <label>Имя</label>
            <input type="text" id="prop_Name">
          </div>
          <div class="prop-row">
            <label>Заголовок</label>
            <input type="text" id="prop_Title">
          </div>
          <div class="prop-row">
            <label>Вид</label>
            <input type="text" id="prop_Type" readonly style="background:#eee;">
          </div>
          <div class="prop-row">
            <label>Путь к данным</label>
            <input type="text" id="prop_DataPath">
          </div>
          <div class="prop-row">
            <label>Положение заголовка</label>
            <input type="text" id="prop_TitleLocation">
          </div>
          <div class="prop-row">
            <label>Видимость</label>
            <input type="checkbox" id="prop_Visible">
          </div>
          <div class="prop-row">
            <label>Только просмотр</label>
            <input type="checkbox" id="prop_ReadOnly">
          </div>
        </div>
        
        <div style="text-align:right; margin-top:16px;">
          <button type="button" id="propModalSaveBtn" style="padding: 6px 16px; background: #ddd; border: 1px solid #999; cursor: pointer;">Применить</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const itemsData = ${itemsJson};
    let modifiedItems = {};

    const modal = document.getElementById('propModal');
    
    document.querySelectorAll('.form-item').forEach(el => {
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        const item = itemsData.find(i => i.id === id);
        if (!item) return;
        
        const mod = modifiedItems[id] || {};
        
        document.getElementById('propModalTitle').textContent = 'Свойства: ' + (mod.Name !== undefined ? mod.Name : item.name);
        document.getElementById('prop_id').value = id;
        document.getElementById('prop_Name').value = mod.Name !== undefined ? mod.Name : item.name;
        document.getElementById('prop_Title').value = mod.Title !== undefined ? mod.Title : (item.title || '');
        document.getElementById('prop_Type').value = item.type;
        document.getElementById('prop_DataPath').value = mod.DataPath !== undefined ? mod.DataPath : (item.dataPath || '');
        document.getElementById('prop_TitleLocation').value = mod.TitleLocation !== undefined ? mod.TitleLocation : (item.titleLocation || 'Авто');
        
        const vis = mod.Visible !== undefined ? mod.Visible : item.visible;
        document.getElementById('prop_Visible').checked = vis !== false;
        
        const ro = mod.ReadOnly !== undefined ? mod.ReadOnly : item.readOnly;
        document.getElementById('prop_ReadOnly').checked = ro === true;
        
        modal.classList.add('active');
      });
    });

    document.getElementById('propModalClose').addEventListener('click', () => {
      modal.classList.remove('active');
    });

    document.getElementById('propModalSaveBtn').addEventListener('click', () => {
      const id = document.getElementById('prop_id').value;
      if (!modifiedItems[id]) modifiedItems[id] = {};
      modifiedItems[id].Name = document.getElementById('prop_Name').value;
      modifiedItems[id].Title = document.getElementById('prop_Title').value;
      modifiedItems[id].DataPath = document.getElementById('prop_DataPath').value;
      modifiedItems[id].TitleLocation = document.getElementById('prop_TitleLocation').value;
      modifiedItems[id].Visible = document.getElementById('prop_Visible').checked;
      modifiedItems[id].ReadOnly = document.getElementById('prop_ReadOnly').checked;
      
      const el = document.querySelector(\`.form-item[data-id="\${id}"]\`);
      if (el) {
        if (!modifiedItems[id].Visible) {
          el.style.display = 'none';
        } else {
          el.style.display = '';
        }
        const label = el.querySelector('label');
        if (label) label.textContent = modifiedItems[id].Title || modifiedItems[id].Name;
      }
      
      modal.classList.remove('active');
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

async function openFormViewerWebview(context, treeItem) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Откройте папку проекта');
    return;
  }
  const rootPath = workspaceFolders[0].uri.fsPath;

  if (treeItem.contextValue !== 'formFolder') {
    vscode.window.showErrorMessage('Выберите форму');
    return;
  }

  const formPath = treeItem.basePath;
  const formName = path.basename(formPath);
  const formXmlPath = path.join(formPath, 'Ext', 'Form.xml');

  let formMetaPath = path.join(path.dirname(formPath), formName + '.xml');
  let formTitle = formName;
  try {
    const metaXml = await fs.readFile(formMetaPath, 'utf8');
    const synonymMatch = metaXml.match(/<v8:content>([\s\S]*?)<\/v8:content>/i);
    if (synonymMatch) formTitle = synonymMatch[1].trim();
  } catch {
    // use formName
  }

  try {
    await fs.access(formXmlPath);
  } catch {
    vscode.window.showErrorMessage(`Файл формы не найден: ${formXmlPath}`);
    return;
  }

  let parsed;
  try {
    parsed = await parseFormXml(formXmlPath);
  } catch (err) {
    vscode.window.showErrorMessage('Ошибка чтения формы: ' + err.message);
    return;
  }

  if (parsed.synonym) formTitle = parsed.synonym;

  const columnToShowIn = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined;

  const panelKey = `formViewer:${normalizePath(formXmlPath)}`;
  if (tryReveal(panelKey, columnToShowIn || vscode.ViewColumn.One)) return;

  const panel = vscode.window.createWebviewPanel(
    '1cFormViewer',
    formTitle,
    columnToShowIn || vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = getFormViewerHtml(parsed, formTitle);
  register(panelKey, panel);
}

module.exports = { openFormViewerWebview };
