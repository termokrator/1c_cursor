const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const { openSettingsWebview } = require('./settingsWebview');
const { openObjectMetadataWebview } = require('./objectMetadataWebview');
const { openFormViewerWebview } = require('./formViewerWebview');
const { openFormPropertiesWebview } = require('./formPropertiesWebview');
const { openRequisitePropertiesWebview } = require('./requisitePropertiesWebview');
const { parseMetadataForTree, parseEnumForTree, parseRegisterForTree, parseDataProcessorForTree } = require('./metadataXmlParser');

const { getFullName, getFolderNameFromFullName } = require('./fullNameHelper');

const CACHE_FILENAME = '.vscode/1c-metadata-cache.json';

const METADATA_NAMES = {
  'AccumulationRegisters': 'Регистры накопления',
  'Catalogs': 'Справочники',
  'CommonForms': 'Общие формы',
  'CommonPictures': 'Общие картинки',
  'Constants': 'Константы',
  'DataProcessors': 'Обработки',
  'Documents': 'Документы',
  'Enums': 'Перечисления',
  'FilterCriteria': 'Критерии отбора',
  'Languages': 'Языки',
  'Roles': 'Роли',
  'Subsystems': 'Подсистемы',
  'Ext': 'Расширения конфигурации',
  'InformationRegisters': 'Регистры сведений',
  'Reports': 'Отчёты',
  'ChartsOfCalculationTypes': 'Планы видов расчёта',
  'ChartsOfAccounts': 'Планы счетов',
  'ChartsOfCharacteristicTypes': 'Планы видов характеристик',
  'BusinessProcesses': 'Бизнес-процессы',
  'Tasks': 'Задачи',
  'ExchangePlans': 'Планы обмена',
  'SettingsStorages': 'Хранилища настроек',
  'Commands': 'Команды',
  'CommonAttributes': 'Общие реквизиты',
  'CommonModules': 'Общие модули',
  'SessionParameters': 'Параметры сеанса',
  'Subsystems': 'Подсистемы',
  'WebServices': 'Веб-сервисы',
  'HTTPServices': 'HTTP-сервисы',
  'WSReferences': 'Публикации WS',
  'Workflows': 'Регламентные задания'
};

const METADATA_PRIORITY = [
  'Subsystems', 'Catalogs', 'Documents', 'DataProcessors', 'Reports',
  'Enums', 'Constants', 'CommonForms', 'CommonPictures', 'CommonModules',
  'AccumulationRegisters', 'InformationRegisters', 'ChartsOfAccounts',
  'ChartsOfCalculationTypes', 'ChartsOfCharacteristicTypes',
  'BusinessProcesses', 'Tasks', 'FilterCriteria', 'Roles', 'Languages',
  'Ext', 'ExchangePlans', 'SettingsStorages', 'Commands', 'CommonAttributes',
  'SessionParameters', 'WebServices', 'HTTPServices', 'WSReferences', 'Workflows'
];

const KNOWN_METADATA_FOLDERS = new Set(Object.keys(METADATA_NAMES));

function getMetadataLabel(folderName) {
  return METADATA_NAMES[folderName] || folderName;
}

const METADATA_ICONS = {
  'Catalogs': 'database',
  'Documents': 'file-text',
  'DataProcessors': 'gear',
  'Reports': 'pie-chart',
  'Enums': 'symbol-enum',
  'Constants': 'symbol-constant',
  'CommonForms': 'window',
  'CommonPictures': 'file-media',
  'CommonModules': 'file-code',
  'AccumulationRegisters': 'table',
  'InformationRegisters': 'table',
  'ChartsOfAccounts': 'symbol-structure',
  'ChartsOfCalculationTypes': 'symbol-numeric',
  'ChartsOfCharacteristicTypes': 'symbol-structure',
  'BusinessProcesses': 'circuit-board',
  'Tasks': 'tasklist',
  'ExchangePlans': 'repo-pull',
  'FilterCriteria': 'filter',
  'Roles': 'key',
  'Subsystems': 'symbol-namespace',
  'Languages': 'symbol-string',
  'WebServices': 'globe',
  'HTTPServices': 'globe',
  'WSReferences': 'link',
  'SettingsStorages': 'database',
  'Commands': 'play',
  'CommonAttributes': 'symbol-property',
  'SessionParameters': 'symbol-parameter',
  'Ext': 'extensions'
};

function getMetadataIcon(folderName) {
  return METADATA_ICONS[folderName] || 'folder';
}

function sortMetadataFolders(folders) {
  const order = {};
  METADATA_PRIORITY.forEach((name, i) => { order[name] = i; });
  return folders.sort((a, b) => {
    const ai = order[a] ?? 999;
    const bi = order[b] ?? 999;
    return ai - bi;
  });
}

function createTreeItem(label, collapsibleState, uri) {
  const item = new vscode.TreeItem(label, collapsibleState);
  if (uri) {
    item.resourceUri = uri;
    item.command = {
      command: 'vscode.open',
      title: 'Открыть',
      arguments: [uri]
    };
  }
  return item;
}

function getFileIcon(fileName) {
  if (fileName.endsWith('.xml')) return 'file';
  if (fileName.endsWith('.bsl')) return 'file-code';
  if (fileName.endsWith('.html')) return 'file-code';
  return 'file';
}

function getCachePath(rootPath) {
  return path.join(rootPath, CACHE_FILENAME);
}

async function readCacheFile(rootPath) {
  try {
    const data = await fs.readFile(getCachePath(rootPath), 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function writeCacheFile(rootPath, cacheData) {
  try {
    const cachePath = getCachePath(rootPath);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(cacheData), 'utf8');
  } catch (err) {
    console.warn('1c-metadata-viewer: не удалось сохранить кэш', err);
  }
}

async function clearCacheFile(rootPath) {
  try {
    await fs.rm(getCachePath(rootPath), { force: true });
  } catch (err) {
    console.warn('1c-metadata-viewer: не удалось удалить кэш', err);
  }
}

class MetadataTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._memCache = null;
    this._memCachePromise = null;
    this._dirCache = new Map();
    this._existsCache = new Map();
    this._saveTimer = null;
    this.searchQuery = '';
    this._lastMatched = null;
    this.capturedOnlyFilter = false;
    
    // Создаем канал вывода для логов
    this._outputChannel = vscode.window.createOutputChannel('1C Metadata Viewer Logs');
    this.log('Provider initialized');
  }

  log(message) {
    const time = new Date().toISOString();
    this._outputChannel.appendLine(`[${time}] ${message}`);
  }

  _ensureCacheShape() {
    if (!this._memCache) {
      this._memCache = { root: [], metadata: {}, fsDir: {}, fsAccess: {}, children: {} };
      return;
    }

    this._memCache.root = Array.isArray(this._memCache.root) ? this._memCache.root : [];
    this._memCache.metadata = this._memCache.metadata || {};
    this._memCache.fsDir = this._memCache.fsDir || {};
    this._memCache.fsAccess = this._memCache.fsAccess || {};
    this._memCache.children = this._memCache.children || {};
  }

  _fileDescriptor(label, fullPath, icon = 'file') {
    return { kind: 'file', label, fullPath, icon };
  }

  _nodeDescriptor({
    label,
    contextValue,
    basePath,
    icon,
    folderName,
    objectName,
    tooltip,
    collapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
    parentFolderName,
    tabularSection
  }) {
    const d = {
      kind: 'node',
      label,
      contextValue,
      basePath,
      icon,
      folderName,
      objectName,
      tooltip: tooltip || label,
      collapsibleState
    };
    if (parentFolderName !== undefined) d.parentFolderName = parentFolderName;
    if (tabularSection !== undefined) d.tabularSection = tabularSection;
    return d;
  }

  _applyResourceUri(item) {
    const fullName = getFullName(item);
    if (fullName) {
      item.resourceUri = vscode.Uri.parse(`1c-metadata://storage/${encodeURIComponent(fullName)}`);
    }
    return item;
  }

  _createItemFromDescriptor(descriptor) {
    if (descriptor.kind === 'file') {
      const item = createTreeItem(
        descriptor.label,
        vscode.TreeItemCollapsibleState.None,
        vscode.Uri.file(descriptor.fullPath)
      );
      item.iconPath = new vscode.ThemeIcon(descriptor.icon || 'file');
      
      // Имитируем часть свойств для getFullName
      item.contextValue = descriptor.contextValue || 'templateFolder';
      item.label = descriptor.label.replace(/\.xml$/, '');
      item.parentFolderName = descriptor.parentFolderName;
      item.folderName = descriptor.folderName;
      item.objectName = descriptor.objectName;
      
      return this._applyResourceUri(item);
    }

    const item = new vscode.TreeItem(
      descriptor.label,
      descriptor.collapsibleState ?? vscode.TreeItemCollapsibleState.Collapsed
    );
    item.contextValue = descriptor.contextValue;
    item.basePath = descriptor.basePath;
    item.folderName = descriptor.folderName;
    item.objectName = descriptor.objectName;
    if (descriptor.parentFolderName !== undefined) item.parentFolderName = descriptor.parentFolderName;
    if (descriptor.tabularSection !== undefined) item.tabularSection = descriptor.tabularSection;
    item.iconPath = new vscode.ThemeIcon(descriptor.icon || 'folder');
    item.tooltip = descriptor.tooltip || descriptor.label;
    if (descriptor.contextValue === 'formFolder') {
      item.command = { command: '1cMetadata.openObject', title: 'Открыть', arguments: [item] };
    }
    
    return this._applyResourceUri(item);
  }

  _restoreChildrenFromCache(cacheKey) {
    this._ensureCacheShape();
    const cached = this._memCache.children[cacheKey];
    if (!Array.isArray(cached)) {
      return null;
    }
    return cached.map(descriptor => this._createItemFromDescriptor(descriptor));
  }

  _storeChildrenInCache(rootPath, cacheKey, descriptors) {
    this._ensureCacheShape();
    this._memCache.children[cacheKey] = descriptors;
    this._scheduleCacheSave(rootPath);
  }

  _scheduleCacheSave(rootPath) {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      if (this._memCache) {
        this.log('Saving cache to disk...');
        const start = performance.now();
        writeCacheFile(rootPath, this._memCache).then(() => {
          this.log(`Cache saved in ${(performance.now() - start).toFixed(2)}ms`);
        });
      }
    }, 1000);
  }

  async _safeReaddir(rootPath, dirPath) {
    const start = performance.now();
    await this._ensureCacheLoaded(rootPath);
    this._ensureCacheShape();
    const relPath = path.relative(rootPath, dirPath);

    if (this._dirCache.has(dirPath)) {
      const res = await this._dirCache.get(dirPath);
      this.log(`[Readdir MEM] ${relPath} (${(performance.now() - start).toFixed(2)}ms)`);
      return res;
    }

    if (this._memCache.fsDir[relPath]) {
      const cached = this._memCache.fsDir[relPath];
      const result = cached.map(c => ({
        name: c.name,
        isFile: () => c.isFile,
        isDirectory: () => c.isDirectory
      }));
      this._dirCache.set(dirPath, Promise.resolve(result));
      this.log(`[Readdir DISK-CACHE] ${relPath} (${(performance.now() - start).toFixed(2)}ms)`);
      return result;
    }

    this.log(`[Readdir FS START] ${relPath}`);
    const promise = fs.readdir(dirPath, { withFileTypes: true })
      .then(entries => {
        const plain = entries.map(e => ({
          name: e.name,
          isFile: e.isFile(),
          isDirectory: e.isDirectory()
        }));
        this._memCache.fsDir[relPath] = plain;
        this._scheduleCacheSave(rootPath);
        this.log(`[Readdir FS END] ${relPath} (${(performance.now() - start).toFixed(2)}ms)`);
        return plain.map(c => ({
          name: c.name,
          isFile: () => c.isFile,
          isDirectory: () => c.isDirectory
        }));
      })
      .catch(() => {
        this._memCache.fsDir[relPath] = [];
        this._scheduleCacheSave(rootPath);
        this.log(`[Readdir FS ERROR] ${relPath} (${(performance.now() - start).toFixed(2)}ms)`);
        return [];
      });

    this._dirCache.set(dirPath, promise);
    return await promise;
  }

  async _safeAccess(rootPath, itemPath) {
    const start = performance.now();
    await this._ensureCacheLoaded(rootPath);
    this._ensureCacheShape();
    const relPath = path.relative(rootPath, itemPath);

    if (this._existsCache.has(itemPath)) {
      const res = await this._existsCache.get(itemPath);
      this.log(`[Access MEM] ${relPath} = ${res} (${(performance.now() - start).toFixed(2)}ms)`);
      return res;
    }

    if (this._memCache.fsAccess[relPath] !== undefined) {
      const res = this._memCache.fsAccess[relPath];
      this._existsCache.set(itemPath, Promise.resolve(res));
      this.log(`[Access DISK-CACHE] ${relPath} = ${res} (${(performance.now() - start).toFixed(2)}ms)`);
      return res;
    }

    this.log(`[Access FS START] ${relPath}`);
    const promise = fs.access(itemPath)
      .then(() => {
        this._memCache.fsAccess[relPath] = true;
        this._scheduleCacheSave(rootPath);
        this.log(`[Access FS END] ${relPath} = true (${(performance.now() - start).toFixed(2)}ms)`);
        return true;
      })
      .catch(() => {
        this._memCache.fsAccess[relPath] = false;
        this._scheduleCacheSave(rootPath);
        this.log(`[Access FS END] ${relPath} = false (${(performance.now() - start).toFixed(2)}ms)`);
        return false;
      });

    this._existsCache.set(itemPath, promise);
    return await promise;
  }

  async _ensureCacheLoaded(rootPath) {
    if (this._memCachePromise) {
      this._memCache = await this._memCachePromise;
      return;
    }
    this.log('Loading cache from file...');
    const start = performance.now();
    this._memCachePromise = readCacheFile(rootPath);
    this._memCache = await this._memCachePromise;
    if (!this._memCache) {
      this.log('Cache file not found or invalid, initializing empty cache');
      this._memCache = { root: [], metadata: {}, fsDir: {}, fsAccess: {}, children: {} };
    } else {
      this.log(`Cache file loaded successfully in ${(performance.now() - start).toFixed(2)}ms`);
    }
    this._ensureCacheShape();
  }

  async invalidateCache({ clearDisk = false, rootPath } = {}) {
    this.log('Invalidating cache...');
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._memCache = null;
    this._memCachePromise = null;
    this._dirCache.clear();
    this._existsCache.clear();
    if (clearDisk && rootPath) {
      await clearCacheFile(rootPath);
    }
  }

  async forceRefresh() {
    this.log('Force refreshing tree...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const rootPath = workspaceFolders && workspaceFolders[0]
      ? workspaceFolders[0].uri.fsPath
      : null;
    await this.invalidateCache({ clearDisk: Boolean(rootPath), rootPath });
    this._onDidChangeTreeData.fire();
  }

  /** Очищает только in-memory кэш (без очистки диска), затем обновляет дерево. Исправляет отображение декораций после перезагрузки. */
  async softRefresh() {
    this.log('Soft refreshing tree (in-memory cache only)...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const rootPath = workspaceFolders && workspaceFolders[0]
      ? workspaceFolders[0].uri.fsPath
      : null;
    await this.invalidateCache({ clearDisk: false, rootPath });
    this._onDidChangeTreeData.fire();
  }

  refresh() {
    this.log('Refreshing tree (without full invalidation)...');
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  _getCapturedFilterData() {
    const stateManager = require('./stateManager');
    const captured = stateManager.getAllCaptured();
    const folders = new Set();
    const objectsByFolder = new Map();
    const formsByObject = new Map();
    const templatesByObject = new Map();
    const commandsByObject = new Map();
    for (const fullName of Object.keys(captured)) {
      const folder = getFolderNameFromFullName(fullName);
      if (!folder) continue;
      folders.add(folder);
      const parts = fullName.split('.');
      const objName = parts[1];
      if (!objName) continue;
      if (!objectsByFolder.has(folder)) objectsByFolder.set(folder, new Set());
      objectsByFolder.get(folder).add(objName);
      if (parts.length >= 4) {
        const key = `${folder}.${objName}`;
        if (parts[2] === 'Форма') {
          if (!formsByObject.has(key)) formsByObject.set(key, new Set());
          formsByObject.get(key).add(parts[3]);
        } else if (parts[2] === 'Макет') {
          if (!templatesByObject.has(key)) templatesByObject.set(key, new Set());
          templatesByObject.get(key).add(parts[3]);
        } else if (parts[2] === 'Команда') {
          if (!commandsByObject.has(key)) commandsByObject.set(key, new Set());
          commandsByObject.get(key).add(parts[3]);
        }
      }
    }
    return { folders, objectsByFolder, formsByObject, templatesByObject, commandsByObject };
  }

  async getChildren(element) {
    const start = performance.now();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return [];

    const rootPath = workspaceFolders[0].uri.fsPath;
    
    let result = [];
    let logMsg = '';

    if (!element) {
      logMsg = 'Root';
      result = await this.buildRootChildren(rootPath);
    } else {
      const item = element;
      if (item.contextValue === 'metadataFolder' || item.contextValue === 'metadataFolderSearch') {
        logMsg = `Folder: ${item.folderName}`;
        result = await this.buildMetadataChildren(rootPath, item.folderName, item.contextValue === 'metadataFolderSearch');
      } else if (item.contextValue === 'metadataObject' || item.contextValue === 'enumObject' || item.contextValue === 'constantObject') {
        logMsg = `Object: ${item.objectName}`;
        result = await this.buildObjectChildren(rootPath, item.basePath, item.objectName, item.folderName);
      } else if (item.contextValue === 'formsFolder') {
        logMsg = `Forms Folder: ${path.basename(item.basePath)}`;
        result = await this.buildFormsChildren(rootPath, item.basePath, item.parentFolderName, item.objectName);
      } else if (item.contextValue === 'formFolder') {
        logMsg = `Form: ${path.basename(item.basePath)}`;
        result = await this.buildFormChildren(rootPath, item.basePath, item.parentFolderName);
      } else if (item.contextValue === 'extFolder') {
        logMsg = `Ext Folder: ${path.basename(item.basePath)}`;
        result = await this.buildExtChildren(rootPath, item.basePath);
      } else if (item.contextValue === 'templatesFolder') {
        logMsg = `Templates Folder: ${path.basename(item.basePath)}`;
        result = await this.buildTemplatesChildren(rootPath, item.basePath);
      } else if (item.contextValue === 'templateFolder') {
        logMsg = `Template: ${path.basename(item.basePath)}`;
        result = await this.buildTemplateChildren(rootPath, item.basePath);
      } else if (item.contextValue === 'attributesFolder') {
        logMsg = `Attributes: ${item.objectName}`;
        result = await this.buildAttributesChildren(rootPath, item.basePath, item.objectName, item.folderName);
      } else if (item.contextValue === 'tabularSectionsFolder') {
        logMsg = `Tabular sections: ${item.objectName}`;
        result = await this.buildTabularSectionsChildren(rootPath, item.basePath, item.objectName, item.folderName);
      } else if (item.contextValue === 'tabularSectionFolder') {
        logMsg = `Tabular section: ${item.objectName}`;
        result = await this.buildTabularSectionAttributesChildren(rootPath, item.basePath, item.objectName, item.tabularSection);
      } else if (item.contextValue === 'commandsFolder') {
        logMsg = `Commands: ${item.objectName}`;
        result = await this.buildCommandsChildren(rootPath, item.basePath, item.objectName, item.folderName);
      } else if (item.contextValue === 'enumValuesFolder') {
        logMsg = `Enum values: ${item.objectName}`;
        result = await this.buildEnumValuesChildren(rootPath, item.basePath, item.objectName);
      } else if (item.contextValue === 'dimensionsFolder' || item.contextValue === 'resourcesFolder') {
        logMsg = `Register: ${item.objectName}`;
        result = await this.buildRegisterDimensionOrResourceChildren(rootPath, item.basePath, item.objectName, item.contextValue, item.folderName);
      }
    }

    if (this.capturedOnlyFilter && result.length > 0) {
      const filterData = this._getCapturedFilterData();
      if (!element) {
        result = result.filter(item => {
          if (item.contextValue === 'searchField') return true;
          return (item.contextValue === 'metadataFolder' || item.contextValue === 'metadataFolderSearch') &&
            filterData.folders.has(item.folderName);
        });
      } else {
        const item = element;
        if (item.contextValue === 'metadataFolder' || item.contextValue === 'metadataFolderSearch') {
          const objSet = filterData.objectsByFolder.get(item.folderName);
          result = result.filter(child => objSet && objSet.has(child.objectName));
        } else if (item.contextValue === 'metadataObject' || item.contextValue === 'enumObject' || item.contextValue === 'constantObject') {
          const stateManager = require('./stateManager');
          const objFullName = getFullName(item);
          const objCaptured = objFullName && stateManager.isCaptured(objFullName);
          const key = `${item.folderName}.${item.objectName}`;
          const capturedForms = filterData.formsByObject.get(key);
          const capturedTemplates = filterData.templatesByObject.get(key);
          const capturedCommands = filterData.commandsByObject.get(key);
          result = result.filter(child => {
            if (child.contextValue === 'formsFolder') return capturedForms && capturedForms.size > 0;
            if (child.contextValue === 'templatesFolder') return capturedTemplates && capturedTemplates.size > 0;
            if (child.contextValue === 'commandsFolder') return capturedCommands && capturedCommands.size > 0;
            return objCaptured;
          });
        } else if (item.contextValue === 'formsFolder') {
          const key = `${item.parentFolderName}.${item.objectName}`;
          const capturedForms = filterData.formsByObject.get(key);
          result = result.filter(child =>
            child.contextValue !== 'formFolder' || (capturedForms && capturedForms.has(child.label))
          );
        } else if (item.contextValue === 'templatesFolder') {
          const key = `${item.parentFolderName || item.folderName}.${item.objectName}`;
          const capturedTemplates = filterData.templatesByObject.get(key);
          result = result.filter(child =>
            child.contextValue !== 'templateFolder' || (capturedTemplates && capturedTemplates.has(child.label))
          );
        } else if (item.contextValue === 'commandsFolder') {
          const key = `${item.folderName}.${item.objectName}`;
          const capturedCommands = filterData.commandsByObject.get(key);
          result = result.filter(child =>
            child.contextValue !== 'commandItem' || (capturedCommands && capturedCommands.has(child.label))
          );
        }
      }
    }

    this.log(`[getChildren] ${logMsg} completed in ${(performance.now() - start).toFixed(2)}ms (returned ${result.length} items)`);
    return result;
  }

  async getMatchingObjects(rootPath, query) {
    const lowerQuery = query.toLowerCase();
    const rootEntries = await this._safeReaddir(rootPath, rootPath);
    const folders = rootEntries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .filter(e => e.name !== '1c-metadata-viewer')
      .map(e => e.name);

    const results = {};

    await Promise.all(folders.map(async folder => {
      const folderPath = path.join(rootPath, folder);
      const entries = await this._safeReaddir(rootPath, folderPath);
      
      const matched = new Set();
      for (const e of entries) {
        const baseName = e.name.replace(/\.xml$/, '');
        if (baseName.toLowerCase().includes(lowerQuery)) {
          matched.add(baseName);
        }
      }
      
      if (matched.size > 0) {
        results[folder] = Array.from(matched).sort((a, b) => a.localeCompare(b));
      }
    }));
    
    return results;
  }

  async buildRootChildren(rootPath) {
    await this._ensureCacheLoaded(rootPath);

    const children = [];
    
    const searchLabel = this.searchQuery ? `🔍 Поиск: ${this.searchQuery}` : `🔍 Поле поиска`;
    const searchItem = new vscode.TreeItem(searchLabel, vscode.TreeItemCollapsibleState.None);
    searchItem.contextValue = 'searchField';
    searchItem.command = {
      command: '1cMetadata.setSearchQuery',
      title: 'Поиск по метаданным'
    };
    children.push(searchItem);

    if (this.searchQuery) {
      const matched = await this.getMatchingObjects(rootPath, this.searchQuery);
      this._lastMatched = matched;

      const sortedFolders = sortMetadataFolders(Object.keys(matched));
      for (const folder of sortedFolders) {
        const item = new vscode.TreeItem(getMetadataLabel(folder), vscode.TreeItemCollapsibleState.Expanded);
        item.contextValue = 'metadataFolderSearch';
        item.folderName = folder;
        item.iconPath = new vscode.ThemeIcon(getMetadataIcon(folder));
        item.tooltip = folder;
        children.push(item);
      }
      return children;
    }

    if (this._memCache && Array.isArray(this._memCache.root) && this._memCache.root.length > 0) {
      for (const folder of this._memCache.root) {
        const item = new vscode.TreeItem(getMetadataLabel(folder), vscode.TreeItemCollapsibleState.Collapsed);
        item.contextValue = 'metadataFolder';
        item.folderName = folder;
        item.iconPath = new vscode.ThemeIcon(getMetadataIcon(folder));
        item.tooltip = folder;
        children.push(item);
      }
      return children;
    }

    const entries = await this._safeReaddir(rootPath, rootPath);
    const folders = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .filter(e => e.name !== '1c-metadata-viewer')
      .map(e => e.name);

    const sorted = sortMetadataFolders(folders);

    for (const folder of sorted) {
      const item = new vscode.TreeItem(getMetadataLabel(folder), vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'metadataFolder';
      item.folderName = folder;
      item.iconPath = new vscode.ThemeIcon(getMetadataIcon(folder));
      item.tooltip = folder;
      children.push(item);
    }

    this._ensureCacheShape();
    this._memCache.root = sorted;
    this._scheduleCacheSave(rootPath);

    return children;
  }

  async buildMetadataChildren(rootPath, folderName, isSearch) {
    if (isSearch && this._lastMatched && this._lastMatched[folderName]) {
      const children = [];
      const folderPath = path.join(rootPath, folderName);
      for (const objName of this._lastMatched[folderName]) {
        const item = new vscode.TreeItem(objName, vscode.TreeItemCollapsibleState.Collapsed);
        item.contextValue = 'metadataObject';
        item.basePath = path.join(folderPath, objName);
        item.objectName = objName;
        item.folderName = folderName;
        item.iconPath = new vscode.ThemeIcon(getMetadataIcon(folderName));
        item.tooltip = objName;
        children.push(this._applyResourceUri(item));
      }
      return children;
    }

    await this._ensureCacheLoaded(rootPath);

    const cacheKey = folderName;
    if (this._memCache && this._memCache.metadata && Array.isArray(this._memCache.metadata[cacheKey])) {
      const folderPath = path.join(rootPath, folderName);
      const children = [];
      for (const obj of this._memCache.metadata[cacheKey]) {
        const item = new vscode.TreeItem(obj.name, vscode.TreeItemCollapsibleState.Collapsed);
        item.contextValue = 'metadataObject';
        item.basePath = path.join(folderPath, obj.name);
        item.objectName = obj.name;
        item.folderName = folderName;
        item.iconPath = new vscode.ThemeIcon(getMetadataIcon(folderName));
        item.tooltip = obj.name;
        children.push(this._applyResourceUri(item));
      }
      return children;
    }

    const folderPath = path.join(rootPath, folderName);
    const entries = await this._safeReaddir(rootPath, folderPath);

    const objectMap = new Map();

    for (const e of entries) {
      const baseName = e.name.replace(/\.xml$/, '');
      if (e.isDirectory()) {
        objectMap.set(baseName, { name: baseName, hasDir: true });
      } else if (e.isFile() && e.name.endsWith('.xml')) {
        if (!objectMap.has(baseName)) {
          objectMap.set(baseName, { name: baseName, hasDir: false });
        }
      }
    }

    const sorted = Array.from(objectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const children = [];

    const isConstants = folderName === 'Constants';
    const isEnums = folderName === 'Enums';

    for (const obj of sorted) {
      const ctxVal = isConstants ? 'constantObject' : (isEnums ? 'enumObject' : 'metadataObject');
      const collapsible = isConstants ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;
      const item = new vscode.TreeItem(obj.name, collapsible);
      item.contextValue = ctxVal;
      item.basePath = path.join(folderPath, obj.name);
      item.objectName = obj.name;
      item.folderName = folderName;
      item.iconPath = new vscode.ThemeIcon(getMetadataIcon(folderName));
      item.tooltip = obj.name;
      if (isConstants || isEnums) {
        item.command = { command: '1cMetadata.openObject', title: 'Открыть', arguments: [item] };
      }
      children.push(this._applyResourceUri(item));
    }

    this._ensureCacheShape();
    this._memCache.metadata[cacheKey] = sorted;
    this._scheduleCacheSave(rootPath);

    return children;
  }

  async buildAttributesChildren(rootPath, basePath, objectName, folderName) {
    const fs = require('fs');
    let xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    if (!fs.existsSync(xmlPath) && folderName) {
      xmlPath = path.join(rootPath, folderName, objectName + '.xml');
    }
    let meta = { attributes: [] };
    try {
      if (folderName === 'DataProcessors') {
        meta = await parseDataProcessorForTree(xmlPath);
      } else if (folderName === 'AccumulationRegisters' || folderName === 'InformationRegisters') {
        meta = await parseRegisterForTree(xmlPath);
      } else {
        meta = await parseMetadataForTree(xmlPath);
      }
    } catch {
      // keep empty
    }
    return meta.attributes.map(attr => {
      const item = new vscode.TreeItem(attr.name, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'attrItem';
      item.attrUuid = attr.uuid;
      item.basePath = basePath;
      item.objectName = objectName;
      item.folderName = path.basename(path.dirname(basePath));
      item.iconPath = new vscode.ThemeIcon('symbol-property');
      item.tooltip = attr.synonym || attr.name;
      item.command = { command: '1cMetadata.openRequisiteProperties', title: 'Свойства', arguments: [item] };
      return this._applyResourceUri(item);
    });
  }

  async buildTabularSectionsChildren(rootPath, basePath, objectName, folderName) {
    const xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    let meta = { tabularSections: [] };
    try {
      if (folderName === 'DataProcessors') {
        meta = await parseDataProcessorForTree(xmlPath);
      } else {
        meta = await parseMetadataForTree(xmlPath);
      }
    } catch {
      // keep empty
    }
    return meta.tabularSections.map(ts => {
      const item = new vscode.TreeItem(ts.name, ts.attributes.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'tabularSectionFolder';
      item.basePath = basePath;
      item.objectName = objectName;
      item.tabularSection = ts;
      item.folderName = folderName;
      item.iconPath = new vscode.ThemeIcon('symbol-array');
      item.tooltip = ts.synonym || ts.name;
      return this._applyResourceUri(item);
    });
  }

  async buildTabularSectionAttributesChildren(rootPath, basePath, objectName, tabularSection) {
    return (tabularSection.attributes || []).map(attr => {
      const item = new vscode.TreeItem(attr.name, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'attrItem';
      item.attrUuid = attr.uuid;
      item.basePath = basePath;
      item.objectName = objectName;
      item.tabularSectionName = tabularSection.name;
      // Для подчиненных реквизитов ТЧ нам нужен folderName (префикс), но он берется из parentFolderName или folderName.
      // Добавим objectName или folderName, чтобы fullName работал
      item.folderName = path.basename(path.dirname(basePath));
      item.iconPath = new vscode.ThemeIcon('symbol-property');
      item.tooltip = attr.synonym || attr.name;
      item.command = { command: '1cMetadata.openRequisiteProperties', title: 'Свойства', arguments: [item] };
      return this._applyResourceUri(item);
    });
  }

  async buildCommandsChildren(rootPath, basePath, objectName, folderName) {
    const xmlPath = path.join(rootPath, folderName, objectName + '.xml');
    let meta = { commands: [] };
    try {
      if (folderName === 'Enums') {
        meta = await parseEnumForTree(xmlPath);
      } else if (folderName === 'DataProcessors' || folderName === 'AccumulationRegisters' || folderName === 'InformationRegisters') {
        meta = folderName === 'DataProcessors' ? await parseDataProcessorForTree(xmlPath) : await parseRegisterForTree(xmlPath);
      } else {
        meta = await parseMetadataForTree(xmlPath);
      }
    } catch {
      // keep empty
    }
    const commandsPath = path.join(rootPath, folderName, objectName, 'Commands');
    try {
      const entries = await fs.readdir(commandsPath, { withFileTypes: true });
      const seen = new Set(meta.commands.map(c => c.name));
      for (const e of entries) {
        if (e.isDirectory() && !seen.has(e.name)) {
          meta.commands.push({ name: e.name, synonym: e.name });
          seen.add(e.name);
        }
      }
    } catch {
      // ignore
    }
    return meta.commands.map(cmd => {
      const item = new vscode.TreeItem(cmd.name, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'commandItem';
      item.folderName = folderName;
      item.objectName = objectName;
      item.iconPath = new vscode.ThemeIcon('play');
      item.tooltip = cmd.synonym || cmd.name;
      return this._applyResourceUri(item);
    });
  }

  async buildEnumPredefinedChildren(rootPath, basePath, objectName) {
    const fs = require('fs');
    let xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    if (!fs.existsSync(xmlPath)) {
      xmlPath = path.join(rootPath, 'Enums', objectName + '.xml');
    }
    let meta = { values: [], forms: [], commands: [], templates: [] };
    try {
      meta = await parseEnumForTree(xmlPath);
    } catch (err) {
      this.log('parseEnumForTree error: ' + err.message);
    }

    const children = [];
    children.push(this._nodeDescriptor({
      label: 'Значения',
      contextValue: 'enumValuesFolder',
      basePath,
      icon: 'symbol-enum-member',
      objectName,
      collapsibleState: meta.values.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Формы',
      contextValue: 'formsFolder',
      basePath: path.join(basePath, 'Forms'),
      icon: 'file-submodule',
      parentFolderName: 'Enums',
      objectName,
      collapsibleState: (meta.forms && meta.forms.length > 0) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Команды',
      contextValue: 'commandsFolder',
      basePath,
      icon: 'play',
      objectName,
      folderName: 'Enums',
      parentFolderName: 'Enums',
      collapsibleState: meta.commands.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Макеты',
      contextValue: 'templatesFolder',
      basePath: path.join(basePath, 'Templates'),
      icon: 'file-media',
      objectName,
      folderName: 'Enums',
      collapsibleState: (meta.templates && meta.templates.length > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    }));

    return children.map(d => this._createItemFromDescriptor(d));
  }

  async buildEnumValuesChildren(rootPath, basePath, objectName) {
    const fs = require('fs');
    let xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    if (!fs.existsSync(xmlPath)) {
      xmlPath = path.join(rootPath, 'Enums', objectName + '.xml');
    }
    let meta;
    try {
      meta = await parseEnumForTree(xmlPath);
    } catch {
      meta = { values: [] };
    }
    return meta.values.map(v => {
      const item = new vscode.TreeItem(v.name, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'enumValueItem';
      item.valueUuid = v.uuid;
      item.basePath = basePath;
      item.objectName = objectName;
      item.folderName = 'Enums';
      item.iconPath = new vscode.ThemeIcon('symbol-enum-member');
      item.tooltip = (v.synonym || v.name) + ' (предопределённый)';
      item.command = { command: '1cMetadata.openEnumValueProperties', title: 'Свойства', arguments: [item] };
      return this._applyResourceUri(item);
    });
  }

  async buildRegisterPredefinedChildren(rootPath, basePath, objectName, folderName) {
    const fs = require('fs');
    let xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    if (!fs.existsSync(xmlPath) && folderName) {
      xmlPath = path.join(rootPath, folderName, objectName + '.xml');
    }
    const formsPath = path.join(basePath, 'Forms');
    const templatesPath = path.join(basePath, 'Templates');

    let meta = { dimensions: [], resources: [], attributes: [], forms: [], commands: [], templates: [] };
    try {
      meta = await parseRegisterForTree(xmlPath);
    } catch (err) {
      this.log('parseRegisterForTree error: ' + err.message);
    }

    const children = [];
    children.push(this._nodeDescriptor({
      label: 'Измерения',
      contextValue: 'dimensionsFolder',
      basePath,
      icon: 'symbol-parameter',
      objectName,
      folderName,
      collapsibleState: meta.dimensions.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Ресурсы',
      contextValue: 'resourcesFolder',
      basePath,
      icon: 'symbol-field',
      objectName,
      folderName,
      collapsibleState: meta.resources.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Реквизиты',
      contextValue: 'attributesFolder',
      basePath,
      icon: 'symbol-property',
      objectName,
      folderName,
      collapsibleState: meta.attributes.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Формы',
      contextValue: 'formsFolder',
      basePath: formsPath,
      icon: 'file-submodule',
      parentFolderName: folderName,
      objectName,
      collapsibleState: (meta.forms && meta.forms.length > 0) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Команды',
      contextValue: 'commandsFolder',
      basePath,
      icon: 'play',
      objectName,
      folderName,
      collapsibleState: meta.commands.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Макеты',
      contextValue: 'templatesFolder',
      basePath: templatesPath,
      icon: 'file-media',
      objectName,
      folderName,
      collapsibleState: (meta.templates && meta.templates.length > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    }));

    return children.map(d => this._createItemFromDescriptor(d));
  }

  async buildDataProcessorPredefinedChildren(rootPath, basePath, objectName) {
    const xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    const formsPath = path.join(basePath, 'Forms');
    const templatesPath = path.join(basePath, 'Templates');

    let meta = { attributes: [], tabularSections: [], forms: [], commands: [], templates: [] };
    try {
      meta = await parseDataProcessorForTree(xmlPath);
    } catch (err) {
      this.log('parseDataProcessorForTree error: ' + err.message);
    }

    const children = [];
    children.push(this._nodeDescriptor({
      label: 'Реквизиты',
      contextValue: 'attributesFolder',
      basePath,
      icon: 'symbol-property',
      objectName,
      folderName: 'DataProcessors',
      collapsibleState: meta.attributes.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Табличные части',
      contextValue: 'tabularSectionsFolder',
      basePath,
      icon: 'symbol-array',
      objectName,
      folderName: 'DataProcessors',
      collapsibleState: meta.tabularSections.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Формы',
      contextValue: 'formsFolder',
      basePath: formsPath,
      icon: 'file-submodule',
      parentFolderName: 'DataProcessors',
      objectName,
      collapsibleState: (meta.forms && meta.forms.length > 0) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Команды',
      contextValue: 'commandsFolder',
      basePath,
      icon: 'play',
      objectName,
      folderName: 'DataProcessors',
      collapsibleState: meta.commands.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));
    children.push(this._nodeDescriptor({
      label: 'Макеты',
      contextValue: 'templatesFolder',
      basePath: templatesPath,
      icon: 'file-media',
      objectName,
      folderName: 'DataProcessors',
      collapsibleState: (meta.templates && meta.templates.length > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    }));

    return children.map(d => this._createItemFromDescriptor(d));
  }

  async buildRegisterDimensionOrResourceChildren(rootPath, basePath, objectName, contextValue, folderName) {
    let xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    if (folderName && !require('fs').existsSync(xmlPath)) {
      xmlPath = path.join(rootPath, folderName, objectName + '.xml');
    }
    let meta;
    try {
      meta = await parseRegisterForTree(xmlPath);
    } catch {
      meta = { dimensions: [], resources: [] };
    }
    const items = contextValue === 'dimensionsFolder' ? meta.dimensions : meta.resources;
    const tagName = contextValue === 'dimensionsFolder' ? 'Dimension' : 'Resource';
    return items.map(it => {
      const item = new vscode.TreeItem(it.name, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'dimensionOrResourceItem';
      item.attrUuid = it.uuid;
      item.attrTagName = tagName;
      item.basePath = basePath;
      item.objectName = objectName;
      item.folderName = folderName;
      item.iconPath = new vscode.ThemeIcon(contextValue === 'dimensionsFolder' ? 'symbol-parameter' : 'symbol-field');
      item.tooltip = it.synonym || it.name;
      item.command = { command: '1cMetadata.openRequisiteProperties', title: 'Свойства', arguments: [item] };
      return this._applyResourceUri(item);
    });
  }

  async buildObjectChildren(rootPath, basePath, objectName, folderName) {
    const isCatalogOrDocument = folderName === 'Catalogs' || folderName === 'Documents';
    const isConstants = folderName === 'Constants';
    const isEnums = folderName === 'Enums';
    const isRegister = folderName === 'AccumulationRegisters' || folderName === 'InformationRegisters';
    const isDataProcessor = folderName === 'DataProcessors';

    if (isCatalogOrDocument) {
      return this.buildCatalogOrDocumentChildren(rootPath, basePath, objectName, folderName);
    }
    if (isConstants) {
      return [];
    }
    if (isEnums) {
      return this.buildEnumPredefinedChildren(rootPath, basePath, objectName);
    }
    if (isRegister) {
      return this.buildRegisterPredefinedChildren(rootPath, basePath, objectName, folderName);
    }
    if (isDataProcessor) {
      return this.buildDataProcessorPredefinedChildren(rootPath, basePath, objectName);
    }

    await this._ensureCacheLoaded(rootPath);
    const cacheKey = `object:${path.relative(rootPath, basePath)}`;
    const cachedChildren = this._restoreChildrenFromCache(cacheKey);
    if (cachedChildren) {
      return cachedChildren;
    }

    const descriptors = [];

    const entries = await this._safeReaddir(rootPath, basePath);
    if (entries.length === 0) {
      const xmlPath = basePath + '.xml';
      if (await this._safeAccess(rootPath, xmlPath)) {
        descriptors.push(this._fileDescriptor(objectName + '.xml', xmlPath));
      }
      this._storeChildrenInCache(rootPath, cacheKey, descriptors);
      return descriptors.map(descriptor => this._createItemFromDescriptor(descriptor));
    }

    const xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    const extPath = path.join(basePath, 'Ext');
    const formsPath = path.join(basePath, 'Forms');
    const templatesPath = path.join(basePath, 'Templates');
    const [hasXml, hasExt, hasForms, hasTemplates] = await Promise.all([
      this._safeAccess(rootPath, xmlPath),
      this._safeAccess(rootPath, extPath),
      this._safeAccess(rootPath, formsPath),
      this._safeAccess(rootPath, templatesPath)
    ]);

    if (hasXml) {
      descriptors.push(this._fileDescriptor(objectName + '.xml', xmlPath));
    }
    if (hasExt) {
      descriptors.push(this._nodeDescriptor({
        label: 'Ext',
        contextValue: 'extFolder',
        basePath: extPath,
        icon: 'folder'
      }));
    }
    if (hasForms) {
      descriptors.push(this._nodeDescriptor({
        label: 'Формы',
        contextValue: 'formsFolder',
        basePath: formsPath,
        icon: 'file-submodule',
        parentFolderName: folderName,
        objectName
      }));
    }
    if (hasTemplates) {
      descriptors.push(this._nodeDescriptor({
        label: 'Макеты',
        contextValue: 'templatesFolder',
        basePath: templatesPath,
        icon: 'file-media',
        parentFolderName: folderName,
        objectName
      }));
    }

    this._storeChildrenInCache(rootPath, cacheKey, descriptors);
    return descriptors.map(descriptor => this._createItemFromDescriptor(descriptor));
  }

  async buildCatalogOrDocumentChildren(rootPath, basePath, objectName, folderName) {
    const xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
    const formsPath = path.join(basePath, 'Forms');
    const templatesPath = path.join(basePath, 'Templates');

    let meta = { attributes: [], tabularSections: [], commands: [], forms: [], templates: [] };
    try {
      meta = await parseMetadataForTree(xmlPath);
    } catch (err) {
      this.log('parseMetadataForTree error: ' + err.message);
    }

    const children = [];

    // Реквизиты - всегда показываем
    children.push(this._nodeDescriptor({
      label: 'Реквизиты',
      contextValue: 'attributesFolder',
      basePath,
      icon: 'symbol-property',
      objectName,
      folderName,
      collapsibleState: meta.attributes.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));

    // Табличные части
    children.push(this._nodeDescriptor({
      label: 'Табличные части',
      contextValue: 'tabularSectionsFolder',
      basePath,
      icon: 'symbol-array',
      objectName,
      folderName,
      collapsibleState: meta.tabularSections.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));

    // Формы
    children.push(this._nodeDescriptor({
      label: 'Формы',
      contextValue: 'formsFolder',
      basePath: formsPath,
      icon: 'file-submodule',
      parentFolderName: folderName,
      objectName,
      collapsibleState: (meta.forms && meta.forms.length > 0) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));

    // Команды
    children.push(this._nodeDescriptor({
      label: 'Команды',
      contextValue: 'commandsFolder',
      basePath,
      icon: 'play',
      objectName,
      folderName,
      collapsibleState: meta.commands.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    }));

    // Макеты
    children.push(this._nodeDescriptor({
      label: 'Макеты',
      contextValue: 'templatesFolder',
      basePath: templatesPath,
      icon: 'file-media',
      objectName,
      folderName,
      collapsibleState: (meta.templates && meta.templates.length > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    }));

    return children.map(descriptor => this._createItemFromDescriptor(descriptor));
  }

  async buildExtChildren(rootPath, extPath) {
    await this._ensureCacheLoaded(rootPath);
    const cacheKey = `ext:${path.relative(rootPath, extPath)}`;
    const cachedChildren = this._restoreChildrenFromCache(cacheKey);
    if (cachedChildren) {
      return cachedChildren;
    }

    const entries = await this._safeReaddir(rootPath, extPath);
    const descriptors = [];

    for (const e of entries) {
      const fullPath = path.join(extPath, e.name);
      if (e.isFile()) {
        descriptors.push(this._fileDescriptor(e.name, fullPath, getFileIcon(e.name)));
      }
    }

    descriptors.sort((a, b) => a.label.localeCompare(b.label));
    this._storeChildrenInCache(rootPath, cacheKey, descriptors);
    return descriptors.map(descriptor => this._createItemFromDescriptor(descriptor));
  }

  async buildFormsChildren(rootPath, formsPath, parentFolderName, objectName) {
    const hideFormChildren = ['Catalogs', 'Documents', 'AccumulationRegisters', 'InformationRegisters', 'DataProcessors'].includes(parentFolderName);
    const parentName = parentFolderName || path.basename(path.dirname(path.dirname(formsPath)));
    const objName = objectName || path.basename(path.dirname(formsPath));

    if (hideFormChildren) {
      const entries = await this._safeReaddir(rootPath, formsPath);
      const descriptors = [];
      for (const e of entries) {
        if (e.isDirectory()) {
          const formItem = this._createItemFromDescriptor(this._nodeDescriptor({
            label: e.name,
            contextValue: 'formFolder',
            basePath: path.join(formsPath, e.name),
            icon: 'file-submodule',
            parentFolderName: parentName,
            objectName: objName,
            collapsibleState: vscode.TreeItemCollapsibleState.None
          }));
          descriptors.push(formItem);
        }
      }
      descriptors.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
      return descriptors;
    }

    await this._ensureCacheLoaded(rootPath);
    const cacheKey = `forms:${path.relative(rootPath, formsPath)}`;
    const cachedChildren = this._restoreChildrenFromCache(cacheKey);
    if (cachedChildren) {
      cachedChildren.forEach(item => {
        if (item.contextValue === 'formFolder' && !item.objectName) {
          item.objectName = objName;
          item.parentFolderName = parentName;
        }
      });
      return cachedChildren;
    }

    const entries = await this._safeReaddir(rootPath, formsPath);
    const descriptors = [];
    const seen = new Set();

    for (const e of entries) {
      const baseName = e.name.replace(/\.xml$/, '');
      if (seen.has(baseName)) continue;
      seen.add(baseName);

      if (e.isDirectory()) {
        descriptors.push(this._nodeDescriptor({
          label: e.name,
          contextValue: 'formFolder',
          basePath: path.join(formsPath, e.name),
          icon: 'file-submodule',
          parentFolderName: parentName,
          objectName: objName
        }));
      } else if (e.isFile() && e.name.endsWith('.xml')) {
        descriptors.push(this._fileDescriptor(e.name, path.join(formsPath, e.name)));
      }
    }

    descriptors.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    this._storeChildrenInCache(rootPath, cacheKey, descriptors);
    return descriptors.map(descriptor => this._createItemFromDescriptor(descriptor));
  }

  async buildFormChildren(rootPath, formPath, parentFolderName) {
    const hideFormChildren = ['Catalogs', 'Documents', 'AccumulationRegisters', 'InformationRegisters', 'DataProcessors'].includes(parentFolderName);
    if (hideFormChildren) {
      return [];
    }

    await this._ensureCacheLoaded(rootPath);
    const cacheKey = `form:${path.relative(rootPath, formPath)}`;
    const cachedChildren = this._restoreChildrenFromCache(cacheKey);
    if (cachedChildren) {
      return cachedChildren;
    }

    const descriptors = [];

    const xmlPath = path.join(path.dirname(formPath), path.basename(formPath) + '.xml');
    const extPath = path.join(formPath, 'Ext');
    const [hasXml, entries] = await Promise.all([
      this._safeAccess(rootPath, xmlPath),
      this._safeReaddir(rootPath, extPath)
    ]);

    if (hasXml) {
      descriptors.push(this._fileDescriptor(path.basename(formPath) + '.xml', xmlPath));
    }

    const subdirectoryEntries = await Promise.all(entries
      .filter(e => e.isDirectory())
      .map(async (e) => ({
        folderName: e.name,
        subPath: path.join(extPath, e.name),
        entries: await this._safeReaddir(rootPath, path.join(extPath, e.name))
      })));

    for (const e of entries) {
      if (e.isFile()) {
        const fullPath = path.join(extPath, e.name);
        descriptors.push(this._fileDescriptor(e.name, fullPath, getFileIcon(e.name)));
      }
    }

    for (const subdir of subdirectoryEntries) {
      for (const entry of subdir.entries) {
        if (entry.isFile()) {
          descriptors.push(this._fileDescriptor(
            subdir.folderName + '/' + entry.name,
            path.join(subdir.subPath, entry.name),
            getFileIcon(entry.name)
          ));
        }
      }
    }

    this._storeChildrenInCache(rootPath, cacheKey, descriptors);
    return descriptors.map(descriptor => this._createItemFromDescriptor(descriptor));
  }

  async buildTemplateChildren(rootPath, templatePath) {
    await this._ensureCacheLoaded(rootPath);
    const cacheKey = `template:${path.relative(rootPath, templatePath)}`;
    const cachedChildren = this._restoreChildrenFromCache(cacheKey);
    if (cachedChildren) {
      return cachedChildren;
    }

    const descriptors = [];
    const templateName = path.basename(templatePath);

    const xmlPath = path.join(path.dirname(templatePath), templateName + '.xml');
    const extPath = path.join(templatePath, 'Ext');
    const [hasXml, entries] = await Promise.all([
      this._safeAccess(rootPath, xmlPath),
      this._safeReaddir(rootPath, extPath)
    ]);

    if (hasXml) {
      descriptors.push(this._fileDescriptor(templateName + '.xml', xmlPath));
    }

    const subdirectoryEntries = await Promise.all(entries
      .filter(e => e.isDirectory())
      .map(async (e) => ({
        folderName: e.name,
        subPath: path.join(extPath, e.name),
        entries: await this._safeReaddir(rootPath, path.join(extPath, e.name))
      })));

    for (const e of entries) {
      if (e.isFile()) {
        const fullPath = path.join(extPath, e.name);
        descriptors.push(this._fileDescriptor(e.name, fullPath, getFileIcon(e.name)));
      }
    }

    for (const subdir of subdirectoryEntries) {
      for (const entry of subdir.entries) {
        if (entry.isFile()) {
          descriptors.push(this._fileDescriptor(
            subdir.folderName + '/' + entry.name,
            path.join(subdir.subPath, entry.name),
            getFileIcon(entry.name)
          ));
        }
      }
    }

    this._storeChildrenInCache(rootPath, cacheKey, descriptors);
    return descriptors.map(descriptor => this._createItemFromDescriptor(descriptor));
  }

  async buildTemplatesChildren(rootPath, templatesPath) {
    await this._ensureCacheLoaded(rootPath);
    const cacheKey = `templates:${path.relative(rootPath, templatesPath)}`;
    const cachedChildren = this._restoreChildrenFromCache(cacheKey);
    if (cachedChildren) {
      return cachedChildren;
    }

    const entries = await this._safeReaddir(rootPath, templatesPath);
    const descriptors = [];
    const seen = new Set();

    for (const e of entries) {
      const baseName = e.name.replace(/\.xml$/, '');
      if (seen.has(baseName)) continue;
      seen.add(baseName);

      if (e.isDirectory()) {
        descriptors.push(this._nodeDescriptor({
          label: e.name,
          contextValue: 'templateFolder',
          basePath: path.join(templatesPath, e.name),
          icon: 'file-media'
        }));
      } else if (e.isFile() && e.name.endsWith('.xml')) {
        descriptors.push(this._fileDescriptor(e.name, path.join(templatesPath, e.name)));
      }
    }

    descriptors.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    this._storeChildrenInCache(rootPath, cacheKey, descriptors);
    return descriptors.map(descriptor => this._createItemFromDescriptor(descriptor));
  }
}

async function activate(context) {
  const stateManager = require('./stateManager');
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    await stateManager.init(vscode.workspace.workspaceFolders[0].uri.fsPath);
  }

  const treeProvider = new MetadataTreeProvider();
  vscode.window.registerTreeDataProvider('1cMetadata', treeProvider);

  const storageDecorationProvider = require('./storageDecorationProvider');
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(storageDecorationProvider)
  );

  setTimeout(() => {
    treeProvider.refresh();
    storageDecorationProvider.refresh();
  }, 100);

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.setSearchQuery', async () => {
      const query = await vscode.window.showInputBox({
        placeHolder: 'Введите имя объекта...',
        prompt: 'Поиск по дереву метаданных',
        value: treeProvider.searchQuery
      });
      if (query !== undefined) {
        treeProvider.searchQuery = query;
        treeProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.refresh', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const formUnpacker = require('./formUnpacker');
        await formUnpacker.unpackAllForms(workspaceRoot);
      }
      treeProvider.forceRefresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.refreshEntry', () => treeProvider.refresh())
  );

  vscode.commands.executeCommand('setContext', '1cMetadata:capturedOnlyFilter', false);

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.toggleCapturedFilterOn', () => {
      treeProvider.capturedOnlyFilter = true;
      vscode.commands.executeCommand('setContext', '1cMetadata:capturedOnlyFilter', true);
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.toggleCapturedFilterOff', () => {
      treeProvider.capturedOnlyFilter = false;
      vscode.commands.executeCommand('setContext', '1cMetadata:capturedOnlyFilter', false);
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.openSettings', () => {
      openSettingsWebview(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.captureStorage', async (treeItem) => {
      if (!treeItem) return;
      const { openStorageActionWebview } = require('./storageActionWebview');
      const { getFullName } = require('./fullNameHelper');
      const fullName = getFullName(treeItem);
      
      if (!fullName) {
        vscode.window.showErrorMessage('Не удалось определить полное имя объекта для хранилища.');
        return;
      }

      openStorageActionWebview(context, 'lock', treeItem, async (data) => {
        const { sendTo1C } = require('./sendTo1C');
        const success = await sendTo1C(treeProvider._outputChannel, {
          action: 'lock',
          targetObjects: [{ fullName: fullName, includeChildObjects: data.recursive }]
        });

        if (success) {
          const stateManager = require('./stateManager');
          await stateManager.addCaptured([{ fullName, recursive: data.recursive }]);
          await treeProvider.softRefresh();
          storageDecorationProvider.refresh();
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.putToStorage', async (treeItem) => {
      if (!treeItem) return;
      const { openStorageActionWebview } = require('./storageActionWebview');
      const { getFullName } = require('./fullNameHelper');
      const fullName = getFullName(treeItem);
      
      if (!fullName) {
        vscode.window.showErrorMessage('Не удалось определить полное имя объекта для хранилища.');
        return;
      }

      openStorageActionWebview(context, 'commit', treeItem, async (data) => {
        const { sendTo1C } = require('./sendTo1C');
        const success = await sendTo1C(treeProvider._outputChannel, {
          action: 'commit',
          targetObjects: [{ fullName: fullName, includeChildObjects: data.recursive }],
          commitComment: data.comment,
          commitLabel: data.label
        });

        if (success) {
          const stateManager = require('./stateManager');
          await stateManager.removeCaptured([{ fullName, recursive: data.recursive }]);
          await treeProvider.softRefresh();
          storageDecorationProvider.refresh();
        }
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.openObject', async (treeItem) => {
      if (!treeItem) return;
      if (treeItem.contextValue === 'metadataObject') {
        await openObjectMetadataWebview(context, treeItem);
      } else if (treeItem.contextValue === 'formFolder') {
        await openFormViewerWebview(context, treeItem);
      } else if (treeItem.contextValue === 'constantObject') {
        const { openConstantPropertiesWebview } = require('./constantPropertiesWebview');
        await openConstantPropertiesWebview(context, treeItem);
      } else if (treeItem.contextValue === 'enumObject') {
        const { openEnumPropertiesWebview } = require('./enumPropertiesWebview');
        await openEnumPropertiesWebview(context, treeItem);
      } else {
        vscode.window.showInformationMessage('Выберите объект метаданных или форму');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.openRequisiteProperties', async (treeItem) => {
      if (treeItem && (treeItem.contextValue === 'attrItem' || treeItem.contextValue === 'dimensionOrResourceItem')) {
        await openRequisitePropertiesWebview(context, treeItem);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.openEnumValueProperties', async (treeItem) => {
      if (treeItem && treeItem.contextValue === 'enumValueItem') {
        const { openEnumValuePropertiesWebview } = require('./enumValuePropertiesWebview');
        await openEnumValuePropertiesWebview(context, treeItem);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.openFormProperties', async (treeItem) => {
      if (treeItem && treeItem.contextValue === 'formFolder') {
        await openFormPropertiesWebview(context, treeItem);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.openFormModule', async (treeItem) => {
      if (!treeItem || treeItem.contextValue !== 'formFolder') return;
      const formModulePath = path.join(treeItem.basePath, 'Ext', 'Form', 'Module.bsl');
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return;
      const rootPath = workspaceFolders[0].uri.fsPath;
      try {
        await fs.access(formModulePath);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(formModulePath));
        await vscode.window.showTextDocument(doc);
      } catch {
        const create = await vscode.window.showInformationMessage(
          `Файл модуля формы не найден: ${path.basename(treeItem.basePath)}/Ext/Form/Module.bsl`,
          'Создать'
        );
        if (create === 'Создать') {
          await fs.mkdir(path.dirname(formModulePath), { recursive: true });
          await fs.writeFile(formModulePath, '', 'utf8');
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(formModulePath));
          await vscode.window.showTextDocument(doc);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.openObjectModule', async (treeItem) => {
      if (!treeItem || treeItem.contextValue !== 'metadataObject') return;
      const objectModulePath = path.join(treeItem.basePath, 'Ext', 'ObjectModule.bsl');
      try {
        await fs.access(objectModulePath);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(objectModulePath));
        await vscode.window.showTextDocument(doc);
      } catch {
        const create = await vscode.window.showInformationMessage(
          `Файл модуля объекта не найден: ${treeItem.objectName}/Ext/ObjectModule.bsl`,
          'Создать'
        );
        if (create === 'Создать') {
          await fs.mkdir(path.dirname(objectModulePath), { recursive: true });
          await fs.writeFile(objectModulePath, '', 'utf8');
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(objectModulePath));
          await vscode.window.showTextDocument(doc);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.openManagerModule', async (treeItem) => {
      if (!treeItem || treeItem.contextValue !== 'metadataObject') return;
      const managerModulePath = path.join(treeItem.basePath, 'Ext', 'ManagerModule.bsl');
      try {
        await fs.access(managerModulePath);
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(managerModulePath));
        await vscode.window.showTextDocument(doc);
      } catch {
        const create = await vscode.window.showInformationMessage(
          `Файл модуля менеджера не найден: ${treeItem.objectName}/Ext/ManagerModule.bsl`,
          'Создать'
        );
        if (create === 'Создать') {
          await fs.mkdir(path.dirname(managerModulePath), { recursive: true });
          await fs.writeFile(managerModulePath, '', 'utf8');
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(managerModulePath));
          await vscode.window.showTextDocument(doc);
        }
      }
    })
  );

  let sendTo1CInProgress = false;
  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.sendTo1C', async () => {
      if (sendTo1CInProgress) {
        vscode.window.showInformationMessage('Скрипт отправки в 1С ещё выполняется. Дождитесь завершения.');
        return;
      }
      sendTo1CInProgress = true;
      await vscode.commands.executeCommand('setContext', '1cMetadata.sendTo1CInProgress', true);
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
          const formUnpacker = require('./formUnpacker');
          await formUnpacker.packAllForms(workspaceRoot);
        }
        const { sendTo1C } = require('./sendTo1C');
        await sendTo1C(treeProvider._outputChannel);
      } finally {
        sendTo1CInProgress = false;
        await vscode.commands.executeCommand('setContext', '1cMetadata.sendTo1CInProgress', false);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.sendTo1CAndLaunchConfigurator', async () => {
      if (sendTo1CInProgress) {
        vscode.window.showInformationMessage('Скрипт отправки в 1С ещё выполняется. Дождитесь завершения.');
        return;
      }
      sendTo1CInProgress = true;
      await vscode.commands.executeCommand('setContext', '1cMetadata.sendTo1CInProgress', true);
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
          const formUnpacker = require('./formUnpacker');
          await formUnpacker.packAllForms(workspaceRoot);
        }
        const { sendTo1C } = require('./sendTo1C');
        await sendTo1C(treeProvider._outputChannel, { action: 'upload', launchAfterSuccess: 'designer' });
      } finally {
        sendTo1CInProgress = false;
        await vscode.commands.executeCommand('setContext', '1cMetadata.sendTo1CInProgress', false);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('1cMetadata.sendTo1CAndLaunchEnterprise', async () => {
      if (sendTo1CInProgress) {
        vscode.window.showInformationMessage('Скрипт отправки в 1С ещё выполняется. Дождитесь завершения.');
        return;
      }
      sendTo1CInProgress = true;
      await vscode.commands.executeCommand('setContext', '1cMetadata.sendTo1CInProgress', true);
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
          const formUnpacker = require('./formUnpacker');
          await formUnpacker.packAllForms(workspaceRoot);
        }
        const { sendTo1C } = require('./sendTo1C');
        await sendTo1C(treeProvider._outputChannel, { action: 'upload', launchAfterSuccess: 'enterprise' });
      } finally {
        sendTo1CInProgress = false;
        await vscode.commands.executeCommand('setContext', '1cMetadata.sendTo1CInProgress', false);
      }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
