const vscode = require('vscode');
const stateManager = require('./stateManager');

class StorageDecorationProvider {
  constructor() {
    this._onDidChangeFileDecorations = new vscode.EventEmitter();
    this.onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
  }

  refresh() {
    this._onDidChangeFileDecorations.fire();
  }

  provideFileDecoration(uri, token) {
    if (uri.scheme !== '1c-metadata') return undefined;
    
    // Получаем fullName из URI.
    // URI: 1c-metadata://storage/Справочник.Организации — authority=storage, path=/Справочник.Организации
    const fullName = decodeURIComponent(uri.path.replace(/^\//, ''));
    if (!fullName) return undefined;

    // Читаем настройки
    const config = vscode.workspace.getConfiguration('1cMetadata');
    const storageEnabled = config.get('storage.enabled');
    
    if (!storageEnabled) return undefined;

    if (stateManager.isCaptured(fullName)) {
      return {
        badge: '✓',
        tooltip: 'Захвачен в хранилище',
        color: new vscode.ThemeColor('editor.foreground') // Тот же цвет, что и у остальных элементов
      };
    } else {
      return {
        badge: '🔒',
        tooltip: 'В хранилище',
        color: new vscode.ThemeColor('editor.foreground')
      };
    }
  }
}

module.exports = new StorageDecorationProvider();
