const vscode = require('vscode');

function openStorageActionWebview(context, actionType, treeItem, onSubmit) {
  const panel = vscode.window.createWebviewPanel(
    'storageAction',
    actionType === 'lock' ? 'Захватить в хранилище' : 'Поместить в хранилище',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true
    }
  );

  panel.webview.html = getWebviewContent(actionType, treeItem);

  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.command) {
        case 'submit':
          onSubmit(message.data);
          panel.dispose();
          return;
        case 'cancel':
          panel.dispose();
          return;
      }
    },
    undefined,
    context.subscriptions
  );
}

function getWebviewContent(actionType, treeItem) {
  const isLock = actionType === 'lock';
  const title = isLock ? 'Захват в хранилище' : 'Помещение в хранилище';

  return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-editor-foreground);
          background-color: var(--vscode-editor-background);
        }
        .form-container {
          max-width: 320px;
          width: 100%;
          padding: 16px;
          box-sizing: border-box;
        }
        .form-group {
          margin-bottom: 12px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input[type="text"], textarea {
          width: 100%;
          padding: 6px;
          box-sizing: border-box;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
        }
        textarea {
          resize: vertical;
          min-height: 60px;
        }
        .checkbox-group {
          display: flex;
          align-items: center;
        }
        .checkbox-group input {
          margin-right: 10px;
          width: auto;
        }
        .buttons {
          margin-top: 16px;
          display: flex;
          gap: 8px;
        }
        button {
          padding: 6px 14px;
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          cursor: pointer;
        }
        button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
          background-color: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
          background-color: var(--vscode-button-secondaryHoverBackground);
        }
      </style>
    </head>
    <body>
      <div class="form-container">
        <h2 style="margin: 0 0 12px 0; font-size: 1.1em;">${title}</h2>
        <p style="margin: 0 0 12px 0; font-size: 0.9em;">Объект: <strong>${treeItem.label || treeItem.objectName}</strong></p>

      <form id="actionForm">
        ${!isLock ? `
        <div class="form-group">
          <label for="label">Метка:</label>
          <input type="text" id="label" name="label">
        </div>
        <div class="form-group">
          <label for="comment">Комментарий:</label>
          <textarea id="comment" name="comment"></textarea>
        </div>
        ` : ''}

        <div class="form-group checkbox-group">
          <input type="checkbox" id="recursive" name="recursive" ${isLock ? 'checked' : ''}>
          <label for="recursive">Выполнять рекурсивно</label>
        </div>

        <div class="buttons">
          <button type="button" id="submitBtn">ОК</button>
          <button type="button" id="cancelBtn" class="secondary">Отмена</button>
        </div>
      </form>
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('submitBtn').addEventListener('click', () => {
          const recursive = document.getElementById('recursive').checked;
          const commentEl = document.getElementById('comment');
          const comment = commentEl ? commentEl.value : '';
          const labelEl = document.getElementById('label');
          const label = labelEl ? labelEl.value : '';

          vscode.postMessage({
            command: 'submit',
            data: {
              recursive,
              comment,
              label
            }
          });
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
          vscode.postMessage({ command: 'cancel' });
        });
      </script>
    </body>
    </html>
  `;
}

module.exports = { openStorageActionWebview };
