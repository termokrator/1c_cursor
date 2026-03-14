const vscode = require('vscode');
const path = require('path');

function getWebviewContent() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Настройки 1С Метаданные</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 16px;
      margin: 0;
      line-height: 1.5;
    }
    .field-group {
      margin-bottom: 16px;
    }
    .field-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .field-comment {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
      margin-bottom: 8px;
    }
    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 6px 10px;
      font-family: inherit;
      font-size: inherit;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }
    input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }
    input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    select {
      width: 100%;
      padding: 6px 10px;
      font-family: inherit;
      font-size: inherit;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }
    .checkbox-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checkbox-wrapper input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
    .section-frame {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      padding: 16px;
      margin-top: 24px;
      margin-bottom: 16px;
    }
    .section-title {
      font-weight: 600;
      font-size: 1em;
      margin: -16px -16px 16px -16px;
      padding: 12px 16px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 6px 6px 0 0;
    }
    .hidden { display: none !important; }
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .header-title { font-weight: 600; font-size: 1.1em; }
    #saveBtn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 20px;
      font-family: inherit;
      font-size: inherit;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
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
      margin-top: 12px;
      font-size: 0.9em;
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-title">Настройки 1С Метаданные</div>
    <button type="button" id="saveBtn" class="muted"><span class="btn-text">Сохранить</span></button>
  </div>
  <form id="settingsForm">
    <div class="field-group">
      <label for="workMode">Режим работы</label>
      <div class="field-comment">Локальный - означает, что Cursor сразу будет запускать команды на загрузку данных в базу 1с или захват в хранилище. Удаленный - эти команды будут формироваться и выгружаться в указанную вами папку. Там, где находится база данных 1С необходимо будет запускать файл 1c_watcher.ps1 для выполнения этих команд</div>
      <select id="workMode" name="workMode">
        <option value="local">Локальный</option>
        <option value="remote">Удаленный</option>
      </select>
    </div>

    <div class="field-group">
      <label for="databaseType">Тип базы 1С</label>
      <div class="field-comment">Выберите тип базы данных</div>
      <select id="databaseType" name="databaseType">
        <option value="file">Файловая база</option>
        <option value="server">Серверная база</option>
      </select>
    </div>

    <div class="field-group" id="filePathGroup">
      <label for="filePath">Путь</label>
      <div class="field-comment">путь к файловой базе данных</div>
      <input type="text" id="filePath" name="filePath" placeholder="C:\\path\\to\\database">
    </div>

    <div class="field-group" id="serverGroup">
      <label for="serverDatabase">Имя</label>
      <div class="field-comment">имя базы на сервере 1С</div>
      <input type="text" id="serverDatabase" name="serverDatabase" placeholder="Имя информационной базы">
    </div>

    <div class="field-group" id="serverAddrGroup">
      <label for="serverAddr">Адрес</label>
      <div class="field-comment">адрес сервера 1С</div>
      <input type="text" id="serverAddr" name="serverAddr" placeholder="localhost или 192.168.1.1">
    </div>

    <div class="field-group">
      <label for="serverUser">Пользователь</label>
      <div class="field-comment">имя пользователя 1С</div>
      <input type="text" id="serverUser" name="serverUser" placeholder="Имя пользователя">
    </div>

    <div class="field-group">
      <label for="serverPassword">Пароль</label>
      <div class="field-comment">пароль пользователя 1С</div>
      <input type="password" id="serverPassword" name="serverPassword" placeholder="Пароль">
    </div>

    <div class="field-group">
      <label class="checkbox-wrapper">
        <input type="checkbox" id="disableStartupDialogs" name="disableStartupDialogs">
        <span>Скрывать окно выполнения команды 1С</span>
      </label>
      <div class="field-comment">Если флаг установлен, то окно платформы не будет отображаться при загрузке объектов, захвате объектов в хранилище и других команд платформы 1С</div>
    </div>

    <div class="section-frame">
      <div class="section-title">Параметры хранилища</div>

      <div class="field-group">
        <label class="checkbox-wrapper">
          <input type="checkbox" id="storageEnabled" name="storageEnabled">
          <span>Хранилище</span>
        </label>
        <div class="field-comment">выберите, если база подключена к хранилищу</div>
      </div>

      <div class="field-group" id="storagePathGroup">
        <label for="storagePath">Путь</label>
        <div class="field-comment">путь к хранилищу 1С</div>
        <input type="text" id="storagePath" name="storagePath" placeholder="Путь к хранилищу">
      </div>

      <div class="field-group" id="storageUserGroup">
        <label for="storageUser">Пользователь</label>
        <div class="field-comment">пользователь хранилища 1С</div>
        <input type="text" id="storageUser" name="storageUser" placeholder="Пользователь хранилища">
      </div>

      <div class="field-group" id="storagePasswordGroup">
        <label for="storagePassword">Пароль</label>
        <div class="field-comment">пароль хранилища 1С</div>
        <input type="password" id="storagePassword" name="storagePassword" placeholder="Пароль">
      </div>
    </div>
  </form>
  <div class="status" id="status"></div>

  <script>
    const vscode = acquireVsCodeApi();

    function updateVisibility() {
      const dbType = document.getElementById('databaseType').value;
      const storageEnabled = document.getElementById('storageEnabled').checked;

      document.getElementById('filePathGroup').classList.toggle('hidden', dbType !== 'file');
      document.getElementById('serverGroup').classList.toggle('hidden', dbType !== 'server');
      document.getElementById('serverAddrGroup').classList.toggle('hidden', dbType !== 'server');

      document.getElementById('storagePathGroup').classList.toggle('hidden', !storageEnabled);
      document.getElementById('storageUserGroup').classList.toggle('hidden', !storageEnabled);
      document.getElementById('storagePasswordGroup').classList.toggle('hidden', !storageEnabled);
    }

    document.getElementById('databaseType').addEventListener('change', () => { updateVisibility(); updateBtn(); });
    document.getElementById('storageEnabled').addEventListener('change', () => { updateVisibility(); updateBtn(); });

    const saveBtn = document.getElementById('saveBtn');
    const getData = () => ({
      workMode: document.getElementById('workMode').value,
      databaseType: document.getElementById('databaseType').value,
      filePath: document.getElementById('filePath').value,
      serverDatabase: document.getElementById('serverDatabase').value,
      serverAddr: document.getElementById('serverAddr').value,
      serverUser: document.getElementById('serverUser').value,
      serverPassword: document.getElementById('serverPassword').value,
      disableStartupDialogs: document.getElementById('disableStartupDialogs').checked,
      storageEnabled: document.getElementById('storageEnabled').checked,
      storagePath: document.getElementById('storagePath').value,
      storageUser: document.getElementById('storageUser').value,
      storagePassword: document.getElementById('storagePassword').value
    });
    let initialData = null;
    const hasChanges = () => initialData !== null && JSON.stringify(getData()) !== initialData;
    const updateBtn = () => {
      saveBtn.classList.toggle('muted', !hasChanges());
    };
    ['workMode','databaseType','filePath','serverDatabase','serverAddr','serverUser','serverPassword','disableStartupDialogs','storageEnabled','storagePath','storageUser','storagePassword'].forEach(id => {
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
      if (msg.type === 'init') {
        const d = msg.data;
        document.getElementById('workMode').value = d.workMode || 'local';
        document.getElementById('databaseType').value = d.databaseType || 'file';
        document.getElementById('filePath').value = d.filePath || '';
        document.getElementById('serverDatabase').value = d.serverDatabase || '';
        document.getElementById('serverAddr').value = d.serverAddr || '';
        document.getElementById('serverUser').value = d.serverUser || '';
        document.getElementById('serverPassword').value = d.serverPassword || '';
        document.getElementById('disableStartupDialogs').checked = d.disableStartupDialogs || false;
        document.getElementById('storageEnabled').checked = d.storageEnabled || false;
        document.getElementById('storagePath').value = d.storagePath || '';
        document.getElementById('storageUser').value = d.storageUser || '';
        document.getElementById('storagePassword').value = d.storagePassword || '';
        updateVisibility();
        initialData = JSON.stringify(getData());
        updateBtn();
      } else if (msg.type === 'saved') {
        initialData = JSON.stringify(getData());
        saveBtn.classList.remove('saving');
        const sp = saveBtn.querySelector('.spinner');
        if (sp) sp.remove();
        const txt = saveBtn.querySelector('.btn-text');
        if (txt) txt.textContent = 'Сохранить';
        updateBtn();
      } else if (msg.type === 'error') {
        document.getElementById('status').textContent = 'Ошибка: ' + (msg.message || 'неизвестная');
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

let currentPanel = null;

function openSettingsWebview(context) {
  const columnToShowIn = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined;

  if (currentPanel) {
    currentPanel.reveal(columnToShowIn);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    '1cMetadataSettings',
    'Настройки 1С Метаданные',
    columnToShowIn || vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  currentPanel.webview.html = getWebviewContent();

  const config = vscode.workspace.getConfiguration('1cMetadata');
  const data = {
    workMode: config.get('workMode', 'local'),
    databaseType: config.get('databaseType', 'file'),
    filePath: config.get('file.path', ''),
    serverDatabase: config.get('server.database', ''),
    serverAddr: config.get('server.server', ''),
    serverUser: config.get('server.user', ''),
    serverPassword: config.get('server.password', ''),
    disableStartupDialogs: config.get('disableStartupDialogs', false),
    storageEnabled: config.get('storage.enabled', false),
    storagePath: config.get('storage.path', ''),
    storageUser: config.get('storage.user', ''),
    storagePassword: config.get('storage.password', '')
  };

  currentPanel.webview.postMessage({ type: 'init', data });

  currentPanel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'save') {
      try {
        const cfg = vscode.workspace.getConfiguration('1cMetadata');
        const d = message.data;
        await cfg.update('workMode', d.workMode, vscode.ConfigurationTarget.Workspace);
        await cfg.update('databaseType', d.databaseType, vscode.ConfigurationTarget.Workspace);
        await cfg.update('file.path', d.filePath, vscode.ConfigurationTarget.Workspace);
        await cfg.update('server.database', d.serverDatabase, vscode.ConfigurationTarget.Workspace);
        await cfg.update('server.server', d.serverAddr, vscode.ConfigurationTarget.Workspace);
        await cfg.update('server.user', d.serverUser, vscode.ConfigurationTarget.Workspace);
        await cfg.update('server.password', d.serverPassword, vscode.ConfigurationTarget.Workspace);
        await cfg.update('disableStartupDialogs', d.disableStartupDialogs, vscode.ConfigurationTarget.Workspace);
        await cfg.update('storage.enabled', d.storageEnabled, vscode.ConfigurationTarget.Workspace);
        await cfg.update('storage.path', d.storagePath, vscode.ConfigurationTarget.Workspace);
        await cfg.update('storage.user', d.storageUser, vscode.ConfigurationTarget.Workspace);
        await cfg.update('storage.password', d.storagePassword, vscode.ConfigurationTarget.Workspace);
        currentPanel.webview.postMessage({ type: 'saved' });
      } catch (err) {
        currentPanel.webview.postMessage({ type: 'error', message: err.message });
      }
    }
  });

  currentPanel.onDidDispose(() => {
    currentPanel = null;
  });
}

module.exports = { openSettingsWebview };
