const path = require('path');

const METADATA_PREFIXES = {
  'AccumulationRegisters': 'РегистрНакопления',
  'Catalogs': 'Справочник',
  'CommonForms': 'ОбщаяФорма',
  'CommonPictures': 'ОбщаяКартинка',
  'Constants': 'Константа',
  'DataProcessors': 'Обработка',
  'Documents': 'Документ',
  'Enums': 'Перечисление',
  'FilterCriteria': 'КритерийОтбора',
  'Languages': 'Язык',
  'Roles': 'Роль',
  'Subsystems': 'Подсистема',
  'InformationRegisters': 'РегистрСведений',
  'Reports': 'Отчет',
  'ChartsOfCalculationTypes': 'ПланВидовРасчета',
  'ChartsOfAccounts': 'ПланСчетов',
  'ChartsOfCharacteristicTypes': 'ПланВидовХарактеристик',
  'BusinessProcesses': 'БизнесПроцесс',
  'Tasks': 'Задача',
  'ExchangePlans': 'ПланОбмена',
  'SettingsStorages': 'ХранилищеНастроек',
  'Commands': 'ОбщаяКоманда',
  'CommonAttributes': 'ОбщийРеквизит',
  'CommonModules': 'ОбщийМодуль',
  'SessionParameters': 'ПараметрСеанса',
  'WebServices': 'WebСервис',
  'HTTPServices': 'HTTPСервис',
  'WSReferences': 'WSСсылка',
  'Workflows': 'РегламентноеЗадание',
  'Ext': 'Расширение'
};

const PREFIX_TO_FOLDER = Object.fromEntries(
  Object.entries(METADATA_PREFIXES).map(([folder, prefix]) => [prefix, folder])
);

function getMetadataPrefix(folderName) {
  return METADATA_PREFIXES[folderName] || folderName;
}

function getFolderNameFromFullName(fullName) {
  if (!fullName) return null;
  const parts = fullName.split('.');
  return PREFIX_TO_FOLDER[parts[0]] || null;
}

function getFullName(item) {
  if (!item) return null;

  function safeResult(str) {
    if (!str || typeof str !== 'string' || str.includes('undefined')) return null;
    return str;
  }

  // Синтетические папки не имеют fullName
  if ([
    'metadataFolder', 'metadataFolderSearch', 'formsFolder', 
    'attributesFolder', 'tabularSectionsFolder', 'commandsFolder',
    'templatesFolder', 'enumValuesFolder', 'dimensionsFolder', 
    'resourcesFolder', 'extFolder', 'searchField'
  ].includes(item.contextValue)) {
    return null;
  }

  // Для главного объекта
  if (['metadataObject', 'constantObject', 'enumObject'].includes(item.contextValue)) {
    const prefix = getMetadataPrefix(item.folderName);
    return safeResult(`${prefix}.${item.objectName}`);
  }

  // Для подчиненных объектов нужен префикс и имя родительского объекта
  const prefix = getMetadataPrefix(item.folderName || item.parentFolderName);
  if (!prefix) return null;

  const parentFullName = `${prefix}.${item.objectName}`;
  if (!safeResult(parentFullName)) return null;

  if (item.contextValue === 'attrItem') {
    // Реквизит может быть у самого объекта или у табличной части
    // У нас item.basePath может подсказать, или item.tabularSection
    // Если это реквизит таб части, то его родитель - таб часть
    // В extension.js для реквизитов ТЧ мы не передавали явно имя ТЧ в attrItem,
    // но мы можем извлечь его или добавить. В buildTabularSectionAttributesChildren item.basePath - это путь? Нет.
    // Давайте доработаем extension.js, чтобы у реквизитов ТЧ было item.tabularSectionName
    if (item.tabularSectionName) {
      return safeResult(`${parentFullName}.ТабличнаяЧасть.${item.tabularSectionName}.Реквизит.${item.label}`);
    }
    return safeResult(`${parentFullName}.Реквизит.${item.label}`);
  }

  if (item.contextValue === 'tabularSectionFolder') {
    return safeResult(`${parentFullName}.ТабличнаяЧасть.${item.label}`);
  }

  if (item.contextValue === 'formFolder') {
    return safeResult(`${parentFullName}.Форма.${item.label}`);
  }

  if (item.contextValue === 'commandItem') {
    return safeResult(`${parentFullName}.Команда.${item.label}`);
  }

  if (item.contextValue === 'templateFolder') {
    return safeResult(`${parentFullName}.Макет.${item.label}`);
  }

  if (item.contextValue === 'enumValueItem') {
    return safeResult(`${parentFullName}.Значение.${item.label}`);
  }

  if (item.contextValue === 'dimensionOrResourceItem') {
    if (item.attrTagName === 'Dimension') {
      return safeResult(`${parentFullName}.Измерение.${item.label}`);
    } else if (item.attrTagName === 'Resource') {
      return safeResult(`${parentFullName}.Ресурс.${item.label}`);
    }
  }

  return null;
}

/**
 * Определяет полное имя объекта 1С по относительному пути к файлу (от корня проекта).
 * @param {string} relativePath - путь вида "Catalogs/Организации/Ext/ObjectModule.bsl"
 * @returns {string|null} - полное имя, например "Справочник.Организации", или null
 */
function getFullNameFromFsPath(relativePath) {
  const normalized = (relativePath || '').replace(/\\/g, '/');
  const rel = normalized.split('/').filter(Boolean);
  if (rel.length < 2) return null;

  const folder = rel[0];
  const prefix = getMetadataPrefix(folder);
  if (!prefix || prefix === folder) return null;

  const objectName = (rel[1] || '').replace(/\.(xml|bsl|mxl|bin)$/i, '');
  if (!objectName) return null;

  // XML описания объекта: Catalogs/Организации.xml
  if (rel.length === 2 && /\.(xml|bsl|mxl|bin)$/i.test(rel[1])) {
    return `${prefix}.${objectName}`;
  }

  // Модули объекта: Catalogs/Организации/Ext/*.bsl
  if (rel[2] === 'Ext') {
    return `${prefix}.${objectName}`;
  }

  // Формы: Catalogs/Организации/Forms/ФормаЭлемента/...
  if (rel[2] === 'Forms' && rel[3]) {
    const formName = rel[3].replace(/\.(xml|bsl|mxl|bin)$/i, '');
    return `${prefix}.${objectName}.Форма.${formName}`;
  }

  // Макеты: Catalogs/Организации/Templates/ИмяМакета/...
  if (rel[2] === 'Templates' && rel[3]) {
    const templateName = rel[3].replace(/\.(xml|bsl|mxl|bin)$/i, '');
    return `${prefix}.${objectName}.Макет.${templateName}`;
  }

  // Команды: Catalogs/Организации/Commands/ИмяКоманды/...
  if (rel[2] === 'Commands' && rel[3]) {
    return `${prefix}.${objectName}.Команда.${rel[3]}`;
  }

  // Остальные файлы объекта (реквизиты и т.п. — часть основного объекта)
  return `${prefix}.${objectName}`;
}

module.exports = {
  getFullName,
  getFullNameFromFsPath,
  getMetadataPrefix,
  getFolderNameFromFullName
};
