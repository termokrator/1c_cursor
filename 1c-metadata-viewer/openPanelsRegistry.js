const path = require('path');

/**
 * Реестр открытых webview-панелей для предотвращения дублирования окон.
 * При повторном клике на объект метаданных — показываем уже открытую панель вместо создания новой.
 */
const openPanels = new Map();

/**
 * Нормализует путь для использования в качестве ключа (унификация на разных ОС).
 * @param {string} filePath - абсолютный путь к файлу
 * @returns {string} нормализованный путь
 */
function normalizePath(filePath) {
  if (!filePath) return '';
  return path.resolve(filePath).replace(/\\/g, '/');
}

/**
 * Пытается показать уже открытую панель по ключу.
 * @param {string} panelKey - уникальный ключ панели
 * @param {vscode.ViewColumn} [viewColumn] - колонка для отображения
 * @returns {boolean} true, если панель найдена и показана; false — нужно создать новую
 */
function tryReveal(panelKey, viewColumn) {
  const entry = openPanels.get(panelKey);
  if (!entry || !entry.panel) {
    openPanels.delete(panelKey);
    return false;
  }
  try {
    entry.panel.reveal(viewColumn);
    return true;
  } catch {
    openPanels.delete(panelKey);
    return false;
  }
}

/**
 * Регистрирует панель в реестре и подписывается на её закрытие.
 * @param {string} panelKey - уникальный ключ панели
 * @param {vscode.WebviewPanel} panel - панель
 * @param {object} [extra] - дополнительные данные (для отладки)
 */
function register(panelKey, panel, extra = {}) {
  const dispose = () => {
    openPanels.delete(panelKey);
  };
  panel.onDidDispose(dispose);
  openPanels.set(panelKey, { panel, ...extra });
}

/**
 * Возвращает запись о панели по ключу (для обновления контента при reveal).
 * @param {string} panelKey - уникальный ключ панели
 * @returns {{ panel: vscode.WebviewPanel, ... } | undefined}
 */
function get(panelKey) {
  return openPanels.get(panelKey);
}

/**
 * Удаляет панель из реестра (вызывается при dispose).
 * @param {string} panelKey - уникальный ключ панели
 */
function unregister(panelKey) {
  openPanels.delete(panelKey);
}

module.exports = {
  normalizePath,
  tryReveal,
  register,
  get,
  unregister
};
