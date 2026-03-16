const fs = require('fs').promises;
const path = require('path');
const { getFolderNameFromFullName } = require('./fullNameHelper');
const { parseMetadataForTree, parseEnumForTree, parseRegisterForTree, parseDataProcessorForTree } = require('./metadataXmlParser');

const STORAGE_FILENAME = '.vscode/1c-metadata-storage.json';

async function discoverIndependentChildren(rootPath, fullName) {
  const parts = fullName.split('.');
  if (parts.length < 2) return [];
  const prefix = parts[0];
  const objectName = parts[1];
  const folder = getFolderNameFromFullName(fullName);
  if (!folder) return [];

  const objectPath = path.join(rootPath, folder, objectName);
  const xmlPath = path.join(rootPath, folder, objectName + '.xml');
  const children = [];

  let meta = { forms: [], templates: [], commands: [] };
  try {
    if (folder === 'Catalogs' || folder === 'Documents' || folder === 'DocumentJournals') {
      meta = await parseMetadataForTree(xmlPath);
    } else if (folder === 'Enums') {
      meta = await parseEnumForTree(xmlPath);
    } else if (folder === 'AccumulationRegisters' || folder === 'InformationRegisters') {
      meta = await parseRegisterForTree(xmlPath);
    } else if (folder === 'DataProcessors') {
      meta = await parseDataProcessorForTree(xmlPath);
    }
  } catch {
    meta = { forms: [], templates: [], commands: [] };
  }

  const formsPath = path.join(objectPath, 'Forms');
  const templatesPath = path.join(objectPath, 'Templates');
  const commandsPath = path.join(objectPath, 'Commands');

  const seenForms = new Set(meta.forms || []);
  const seenTemplates = new Set(meta.templates || []);
  const seenCommands = new Set((meta.commands || []).map(c => typeof c === 'string' ? c : c.name));

  try {
    const formEntries = await fs.readdir(formsPath, { withFileTypes: true });
    for (const e of formEntries) {
      if (e.isDirectory() && !seenForms.has(e.name)) seenForms.add(e.name);
    }
  } catch { /* ignore */ }
  try {
    const tplEntries = await fs.readdir(templatesPath, { withFileTypes: true });
    for (const e of tplEntries) {
      if (e.isDirectory() && !seenTemplates.has(e.name)) seenTemplates.add(e.name);
    }
  } catch { /* ignore */ }
  try {
    const cmdEntries = await fs.readdir(commandsPath, { withFileTypes: true });
    for (const e of cmdEntries) {
      if (e.isDirectory() && !seenCommands.has(e.name)) seenCommands.add(e.name);
    }
  } catch { /* ignore */ }

  for (const name of seenForms) {
    children.push({ fullName: `${prefix}.${objectName}.Форма.${name}`, recursive: false });
  }
  for (const name of seenTemplates) {
    children.push({ fullName: `${prefix}.${objectName}.Макет.${name}`, recursive: false });
  }
  for (const name of seenCommands) {
    children.push({ fullName: `${prefix}.${objectName}.Команда.${name}`, recursive: false });
  }

  return children;
}

class StorageStateManager {
  constructor() {
    this.capturedObjects = {};
    this.rootPath = null;
  }

  init(rootPath) {
    this.rootPath = rootPath;
    return this.load();
  }

  getStoragePath() {
    return path.join(this.rootPath, STORAGE_FILENAME);
  }

  async load() {
    if (!this.rootPath) return;
    try {
      const data = await fs.readFile(this.getStoragePath(), 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        // Миграция старого формата
        this.capturedObjects = {};
        parsed.forEach(name => {
          this.capturedObjects[name] = { recursive: false };
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        this.capturedObjects = {};
        for (const [key, val] of Object.entries(parsed)) {
          if (!key.includes('undefined') && val && typeof val.recursive === 'boolean') {
            this.capturedObjects[key] = { recursive: val.recursive };
          }
        }
      }
      // Миграция: для рекурсивно захваченных объектов добавляем недостающие формы, макеты и команды
      let migrated = false;
      for (const [fullName, capture] of Object.entries(this.capturedObjects)) {
        if (capture.recursive && fullName.split('.').length === 2) {
          const children = await discoverIndependentChildren(this.rootPath, fullName);
          for (const child of children) {
            if (!this.capturedObjects[child.fullName]) {
              this.capturedObjects[child.fullName] = { recursive: false };
              migrated = true;
            }
          }
        }
      }
      if (migrated) await this.save();
    } catch (e) {
      this.capturedObjects = {};
    }
  }

  async save() {
    if (!this.rootPath) return;
    try {
      const dir = path.dirname(this.getStoragePath());
      await fs.mkdir(dir, { recursive: true });
      const toSave = {};
      for (const [key, val] of Object.entries(this.capturedObjects)) {
        if (!key.includes('undefined') && val && typeof val.recursive === 'boolean') {
          toSave[key] = { recursive: val.recursive };
        }
      }
      this.capturedObjects = toSave;
      await fs.writeFile(this.getStoragePath(), JSON.stringify(toSave, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving storage state:', e);
    }
  }

  isCaptured(fullName) {
    // Точное совпадение
    if (this.capturedObjects[fullName]) {
      return true;
    }

    // Проверяем, есть ли родительский объект, который был захвачен
    // Формат fullName, например: Справочник.Организации.Форма.ФормаЭлемента
    const parts = fullName.split('.');
    if (parts.length > 2) {
      const parentName = `${parts[0]}.${parts[1]}`;
      const parentCapture = this.capturedObjects[parentName];
      if (parentCapture) {
        if (parentCapture.recursive) {
          // Если родитель захвачен рекурсивно, то все подчиненные тоже захвачены
          return true;
        } else {
          // Если не рекурсивно, то проверяем, является ли подчиненный объект независимым
          // Независимые: Форма, Макет, Команда
          const childType = parts[2];
          const independentTypes = ['Форма', 'Макет', 'Команда', 'Расширение'];
          if (!independentTypes.includes(childType)) {
            // Если это не форма/макет/команда (например Реквизит, ТабличнаяЧасть), значит он захватывается вместе с основным объектом
            return true;
          }
        }
      }
    }

    return false;
  }

  async addCaptured(objectsConfig) {
    // objectsConfig это массив объектов { fullName: string, recursive: boolean }
    // Добавляем только валидные записи (без undefined), по одной на захваченный объект
    let changed = false;
    for (const obj of objectsConfig) {
      if (!obj.fullName || typeof obj.fullName !== 'string' || obj.fullName.includes('undefined')) {
        continue;
      }
      const existing = this.capturedObjects[obj.fullName];
      const recursive = !!obj.recursive;
      if (!existing || existing.recursive !== recursive) {
        this.capturedObjects[obj.fullName] = { recursive };
        changed = true;
      }
      // При рекурсивном захвате добавляем дочерние объекты только для верхнеуровневых объектов
      // (Справочник.БлокиПитания). Для формы/макета/команды recursive не имеет смысла — у них нет «детей»
      const parts = obj.fullName.split('.');
      if (recursive && this.rootPath && parts.length === 2) {
        const children = await discoverIndependentChildren(this.rootPath, obj.fullName);
        for (const child of children) {
          if (!this.capturedObjects[child.fullName]) {
            this.capturedObjects[child.fullName] = { recursive: false };
            changed = true;
          }
        }
      }
    }
    if (changed) {
      await this.save();
    }
  }

  async removeCaptured(objectsConfig) {
    let changed = false;
    for (const obj of objectsConfig) {
      if (obj.recursive) {
        // Если снимаем рекурсивно, удаляем сам объект и все явно захваченные подчиненные
        for (const key of Object.keys(this.capturedObjects)) {
          if (key === obj.fullName || key.startsWith(obj.fullName + '.')) {
            delete this.capturedObjects[key];
            changed = true;
          }
        }
      } else {
        // Если снимаем не рекурсивно
        if (this.capturedObjects[obj.fullName]) {
          const wasRecursive = this.capturedObjects[obj.fullName].recursive;
          delete this.capturedObjects[obj.fullName];
          changed = true;
          if (wasRecursive && this.rootPath) {
            const children = await discoverIndependentChildren(this.rootPath, obj.fullName);
            for (const child of children) {
              if (!this.capturedObjects[child.fullName]) {
                this.capturedObjects[child.fullName] = { recursive: false };
                changed = true;
              }
            }
          }
        }
      }
    }
    if (changed) {
      await this.save();
    }
  }

  getAllCaptured() {
    return this.capturedObjects;
  }
}

module.exports = new StorageStateManager();
