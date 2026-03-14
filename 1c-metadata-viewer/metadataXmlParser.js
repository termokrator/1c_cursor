/**
 * Парсер XML метаданных 1С для извлечения свойств объектов и форм
 */
const fs = require('fs').promises;

const NS = {
  v8: 'http://v8.1c.ru/8.1/data/core',
  xr: 'http://v8.1c.ru/8.3/xcf/readable'
};

function getTextContent(str, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = str.match(regex);
  return match ? match[1].trim() : '';
}

function getV8Content(str) {
  const contentMatch = str.match(/<v8:content>([\s\S]*?)<\/v8:content>/i);
  return contentMatch ? contentMatch[1].trim() : '';
}

function formatTypeString(typeStr) {
  if (!typeStr) return '';
  typeStr = typeStr.trim();
  
  const map = {
    'xs:string': 'Строка',
    'xs:decimal': 'Число',
    'xs:boolean': 'Булево',
    'xs:dateTime': 'Дата',
    'v8:ValueStorage': 'ХранилищеЗначения',
    'v8:UUID': 'УникальныйИдентификатор',
    'cfg:CatalogRef.': 'СправочникСсылка.',
    'cfg:DocumentRef.': 'ДокументСсылка.',
    'cfg:EnumRef.': 'ПеречислениеСсылка.',
    'cfg:ChartOfCharacteristicTypesRef.': 'ПланВидовХарактеристикСсылка.',
    'cfg:ChartOfAccountsRef.': 'ПланСчетовСсылка.',
    'cfg:ChartOfCalculationTypesRef.': 'ПланВидовРасчетаСсылка.',
    'cfg:BusinessProcessRef.': 'БизнесПроцессСсылка.',
    'cfg:BusinessProcessRoutePointRef.': 'ТочкаМаршрутаБизнесПроцессаСсылка.',
    'cfg:TaskRef.': 'ЗадачаСсылка.',
    'cfg:ExchangePlanRef.': 'ПланОбменаСсылка.',
    'cfg:AnyRef': 'ЛюбаяСсылка'
  };

  if (map[typeStr]) return map[typeStr];
  
  for (const [key, val] of Object.entries(map)) {
    if (typeStr.startsWith(key)) {
      return typeStr.replace(key, val);
    }
  }
  
  return typeStr;
}

function extractSynonym(xmlStr) {
  const synonymMatch = xmlStr.match(/<Synonym>([\s\S]*?)<\/Synonym>/i);
  if (!synonymMatch) return '';
  return getV8Content(synonymMatch[1]) || getTextContent(synonymMatch[1], 'v8:content');
}

/**
 * Извлекает простые свойства из блока Properties (теги без вложенных элементов)
 */
function extractSimpleProperties(xmlStr, propertiesBlock) {
  const result = {};
  const simpleTags = [
    'Name', 'Comment', 'Hierarchical', 'HierarchyType', 'LimitLevelCount', 'LevelCount',
    'FoldersOnTop', 'UseStandardCommands', 'SubordinationUse', 'CodeLength', 'DescriptionLength',
    'CodeType', 'CodeAllowedLength', 'CodeSeries', 'CheckUnique', 'Autonumbering',
    'DefaultPresentation', 'PredefinedDataUpdate', 'EditType', 'QuickChoice', 'ChoiceMode',
    'DefaultObjectForm', 'DefaultFolderForm', 'DefaultListForm', 'DefaultChoiceForm',
    'DefaultFolderChoiceForm', 'IncludeHelpInContents', 'DataLockControlMode', 'FullTextSearch',
    'ObjectPresentation', 'ExtendedObjectPresentation', 'ListPresentation', 'ExtendedListPresentation',
    'CreateOnInput', 'ChoiceHistoryOnInput', 'DataHistory', 'Numerator', 'NumberType',
    'NumberLength', 'NumberAllowedLength', 'NumberPeriodicity', 'Posting', 'RealTimePosting',
    'RegisterRecordsDeletion', 'RegisterRecordsWritingOnPost', 'SequenceFilling',
    'PostInPrivilegedMode', 'UnpostInPrivilegedMode', 'UpdateDataHistoryImmediatelyAfterWrite',
    'ExecuteAfterWriteDataHistoryVersionProcessing'
  ];
  for (const tag of simpleTags) {
    const val = getTextContent(propertiesBlock, tag);
    if (val !== undefined && val !== '') result[tag] = val;
  }
  return result;
}

/**
 * Парсит XML объекта метаданных (справочник, документ и т.д.)
 */
async function parseMetadataObjectXml(xmlPath) {
  const xmlStr = await fs.readFile(xmlPath, 'utf8');
  const result = { type: null, objectName: '', tabs: [], attributes: [], rawXml: xmlStr };

  const catalogMatch = xmlStr.match(/<Catalog[^>]*>([\s\S]*?)<\/Catalog>/i);
  const documentMatch = xmlStr.match(/<Document[^>]*>([\s\S]*?)<\/Document>/i);
  const formMatch = xmlStr.match(/<Form[^>]*uuid[^>]*>([\s\S]*?)<\/Form>/i);

  let content = '';
  if (catalogMatch) {
    result.type = 'Catalog';
    content = catalogMatch[1];
  } else if (documentMatch) {
    result.type = 'Document';
    content = documentMatch[1];
  } else if (formMatch) {
    result.type = 'Form';
    content = formMatch[1];
  } else {
    return result;
  }

  const propsMatch = content.match(/<Properties>([\s\S]*?)<\/Properties>/i);
  const propsBlock = propsMatch ? propsMatch[1] : '';

  result.objectName = getTextContent(propsBlock, 'Name') || extractSynonym(propsBlock);
  const synonym = extractSynonym(propsBlock);
  if (synonym) result.synonym = synonym;

  const simpleProps = extractSimpleProperties(xmlStr, propsBlock);

  if (result.type === 'Catalog') {
    result.tabs = [
      { id: 'main', title: 'Основные', fields: [
        { key: 'Name', label: 'Имя', value: simpleProps.Name || '', type: 'string' },
        { key: 'Synonym', label: 'Синоним', value: synonym || '', type: 'string' },
        { key: 'Comment', label: 'Комментарий', value: simpleProps.Comment || '', type: 'string' }
      ]},
      { id: 'subsystems', title: 'Подсистемы', fields: [] },
      { id: 'functionalOptions', title: 'Функциональные опции', fields: [] },
      { id: 'hierarchy', title: 'Иерархия', fields: [
        { key: 'Hierarchical', label: 'Иерархический', value: simpleProps.Hierarchical || 'false', type: 'boolean' },
        { key: 'HierarchyType', label: 'Тип иерархии', value: simpleProps.HierarchyType || '', type: 'string' },
        { key: 'LimitLevelCount', label: 'Ограничить количество уровней', value: simpleProps.LimitLevelCount || 'false', type: 'boolean' },
        { key: 'LevelCount', label: 'Количество уровней', value: simpleProps.LevelCount || '2', type: 'string' },
        { key: 'FoldersOnTop', label: 'Размещать группы сверху', value: simpleProps.FoldersOnTop || 'true', type: 'boolean' },
        { key: 'SubordinationUse', label: 'Использование подчинения', value: simpleProps.SubordinationUse || '', type: 'string' }
      ]},
      { id: 'owners', title: 'Владельцы', fields: [] },
      { id: 'data', title: 'Данные', fields: [] },
      { id: 'numbering', title: 'Нумерация', fields: [
        { key: 'CodeLength', label: 'Длина кода', value: simpleProps.CodeLength || '9', type: 'string' },
        { key: 'DescriptionLength', label: 'Длина наименования', value: simpleProps.DescriptionLength || '25', type: 'string' },
        { key: 'CodeType', label: 'Тип кода', value: simpleProps.CodeType || 'String', type: 'string' },
        { key: 'CodeAllowedLength', label: 'Допустимая длина кода', value: simpleProps.CodeAllowedLength || 'Variable', type: 'string' },
        { key: 'CodeSeries', label: 'Серия кода', value: simpleProps.CodeSeries || 'WholeCatalog', type: 'string' },
        { key: 'CheckUnique', label: 'Контроль уникальности', value: simpleProps.CheckUnique || 'true', type: 'boolean' },
        { key: 'Autonumbering', label: 'Автонумерация', value: simpleProps.Autonumbering || 'true', type: 'boolean' },
        { key: 'DefaultPresentation', label: 'Основное представление', value: simpleProps.DefaultPresentation || 'AsDescription', type: 'string' }
      ]},
      { id: 'forms', title: 'Формы', fields: [
        { key: 'DefaultObjectForm', label: 'Форма объекта', value: simpleProps.DefaultObjectForm || '', type: 'string' },
        { key: 'DefaultListForm', label: 'Форма списка', value: simpleProps.DefaultListForm || '', type: 'string' },
        { key: 'DefaultChoiceForm', label: 'Форма выбора', value: simpleProps.DefaultChoiceForm || '', type: 'string' }
      ]},
      { id: 'inputField', title: 'Поле ввода', fields: [] },
      { id: 'commands', title: 'Команды', fields: [] },
      { id: 'templates', title: 'Макеты', fields: [] },
      { id: 'createOnInput', title: 'Ввод на основании', fields: [] },
      { id: 'rights', title: 'Права', fields: [] },
      { id: 'dataExchange', title: 'Обмен данными', fields: [] },
      { id: 'other', title: 'Прочее', fields: [] }
    ];
  } else if (result.type === 'Document') {
    result.tabs = [
      { id: 'main', title: 'Основные', fields: [
        { key: 'Name', label: 'Имя', value: simpleProps.Name || '', type: 'string' },
        { key: 'Synonym', label: 'Синоним', value: synonym || '', type: 'string' },
        { key: 'Comment', label: 'Комментарий', value: simpleProps.Comment || '', type: 'string' }
      ]},
      { id: 'subsystems', title: 'Подсистемы', fields: [] },
      { id: 'functionalOptions', title: 'Функциональные опции', fields: [] },
      { id: 'data', title: 'Данные', fields: [] },
      { id: 'numbering', title: 'Нумерация', fields: [
        { key: 'Numerator', label: 'Нумератор', value: simpleProps.Numerator || '', type: 'string' },
        { key: 'NumberType', label: 'Тип номера', value: simpleProps.NumberType || 'String', type: 'string' },
        { key: 'NumberLength', label: 'Длина номера', value: simpleProps.NumberLength || '6', type: 'string' },
        { key: 'NumberAllowedLength', label: 'Допустимая длина', value: simpleProps.NumberAllowedLength || 'Variable', type: 'string' },
        { key: 'NumberPeriodicity', label: 'Периодичность', value: simpleProps.NumberPeriodicity || 'Nonperiodical', type: 'string' },
        { key: 'CheckUnique', label: 'Контроль уникальности', value: simpleProps.CheckUnique || 'true', type: 'boolean' },
        { key: 'Autonumbering', label: 'Автонумерация', value: simpleProps.Autonumbering || 'true', type: 'boolean' }
      ]},
      { id: 'movements', title: 'Движения', fields: [
        { key: 'Posting', label: 'Проведение', value: simpleProps.Posting || 'Allow', type: 'string' },
        { key: 'RealTimePosting', label: 'Проведение в реальном времени', value: simpleProps.RealTimePosting || 'Allow', type: 'string' },
        { key: 'RegisterRecordsDeletion', label: 'Удаление записей регистров', value: simpleProps.RegisterRecordsDeletion || '', type: 'string' },
        { key: 'RegisterRecordsWritingOnPost', label: 'Запись в регистры при проведении', value: simpleProps.RegisterRecordsWritingOnPost || '', type: 'string' }
      ]},
      { id: 'sequences', title: 'Последовательности', fields: [] },
      { id: 'journals', title: 'Журналы', fields: [] },
      { id: 'forms', title: 'Формы', fields: [
        { key: 'DefaultObjectForm', label: 'Форма объекта', value: simpleProps.DefaultObjectForm || '', type: 'string' },
        { key: 'DefaultListForm', label: 'Форма списка', value: simpleProps.DefaultListForm || '', type: 'string' },
        { key: 'DefaultChoiceForm', label: 'Форма выбора', value: simpleProps.DefaultChoiceForm || '', type: 'string' }
      ]},
      { id: 'inputField', title: 'Поле ввода', fields: [] },
      { id: 'commands', title: 'Команды', fields: [] },
      { id: 'templates', title: 'Макеты', fields: [] },
      { id: 'createOnInput', title: 'Ввод на основании', fields: [] },
      { id: 'rights', title: 'Права', fields: [] },
      { id: 'dataExchange', title: 'Обмен данными', fields: [] },
      { id: 'other', title: 'Прочее', fields: [] }
    ];
  }

  const attrMatches = content.matchAll(/<Attribute[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Attribute>/gi);
  for (const m of attrMatches) {
    const uuid = m[1];
    const attrBlock = m[2];
    const propsMatch = attrBlock.match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    
    const attrName = getTextContent(propsBlock, 'Name');
    const attrSynonym = extractSynonym(propsBlock);
    const comment = getTextContent(propsBlock, 'Comment');

    const typeMatch = propsBlock.match(/<Type>([\s\S]*?)<\/Type>/i);
    const typeStrs = [];
    if (typeMatch) {
      const v8Types = typeMatch[1].matchAll(/<v8:Type>([^<]*)<\/v8:Type>/gi);
      for (const t of v8Types) {
        typeStrs.push(t[1].trim());
      }
    }

    if (attrName && !attrName.startsWith('StandardAttribute')) {
      const rawTypes = typeStrs;
      const formattedTypes = rawTypes.map(formatTypeString);

      result.attributes.push({
        uuid,
        name: attrName,
        synonym: attrSynonym || attrName,
        comment: comment,
        type: formattedTypes.join(', '),
        rawTypes: rawTypes,
        use: getTextContent(propsBlock, 'Use'),
        indexing: getTextContent(propsBlock, 'Indexing'),
        fullTextSearch: getTextContent(propsBlock, 'FullTextSearch'),
        dataHistory: getTextContent(propsBlock, 'DataHistory'),
        toolTip: getTextContent(propsBlock, 'ToolTip') || extractSynonym(getTextContent(propsBlock, 'ToolTip')),
        fillFromFillingValue: getTextContent(propsBlock, 'FillFromFillingValue'),
        fillValue: getTextContent(propsBlock, 'FillValue'),
        fillChecking: getTextContent(propsBlock, 'FillChecking'),
        choiceFoldersAndItems: getTextContent(propsBlock, 'ChoiceFoldersAndItems'),
        choiceParameterLinks: getTextContent(propsBlock, 'ChoiceParameterLinks'),
        choiceParameters: getTextContent(propsBlock, 'ChoiceParameters'),
        quickChoice: getTextContent(propsBlock, 'QuickChoice'),
        createOnInput: getTextContent(propsBlock, 'CreateOnInput'),
        choiceForm: getTextContent(propsBlock, 'ChoiceForm'),
        linkByType: getTextContent(propsBlock, 'LinkByType'),
        choiceHistoryOnInput: getTextContent(propsBlock, 'ChoiceHistoryOnInput')
      });
    }
  }

  result.allFields = {};
  for (const tab of result.tabs) {
    for (const f of tab.fields) {
      result.allFields[f.key] = f;
    }
  }

  return result;
}

/**
 * Заменяет значение свойства в XML
 */
function updateXmlProperty(xmlStr, tagName, newValue) {
  const escaped = String(newValue)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const fullRegex = new RegExp(`(<${tagName}[^>]*>)([\\s\\S]*?)(</${tagName}>)`, 'i');
  const selfClosingRegex = new RegExp(`<${tagName}([^>]*)/>`, 'i');
  let result = xmlStr.replace(fullRegex, (_, open, __, close) => `${open}${escaped}${close}`);
  result = result.replace(selfClosingRegex, `<${tagName}$1>${escaped}</${tagName}>`);
  return result;
}

/**
 * Заменяет содержимое Synonym (v8:content)
 */
function updateSynonymInXml(xmlStr, newValue) {
  const escaped = String(newValue)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return xmlStr.replace(
    /(<Synonym>\s*<v8:item>\s*<v8:lang>ru<\/v8:lang>\s*<v8:content>)([\s\S]*?)(<\/v8:content>)/i,
    `$1${escaped}$3`
  );
}

/**
 * Применяет изменения к XML и сохраняет файл
 */
async function saveMetadataObjectXml(xmlPath, changes, parsed) {
  let xmlStr = parsed.rawXml;
  
  if (changes._attributes) {
    for (const [uuid, mods] of Object.entries(changes._attributes)) {
      const attrRegex = new RegExp(`(<Attribute[^>]*uuid="${uuid}"[^>]*>)([\\s\\S]*?)(</Attribute>)`, 'i');
      xmlStr = xmlStr.replace(attrRegex, (match, open, inner, close) => {
        let newInner = inner;
        const stringProps = ['Name', 'Comment', 'ToolTip', 'FillFromFillingValue', 'FillValue', 'FillChecking', 'ChoiceFoldersAndItems', 'ChoiceParameterLinks', 'ChoiceParameters', 'QuickChoice', 'CreateOnInput', 'ChoiceForm', 'LinkByType', 'ChoiceHistoryOnInput', 'Use', 'Indexing', 'FullTextSearch', 'DataHistory'];
        for (const prop of stringProps) {
          if (mods[prop] !== undefined) {
            newInner = updateXmlProperty(newInner, prop, mods[prop]);
          }
        }
        if (mods.Synonym !== undefined) {
          newInner = updateSynonymInXml(newInner, mods.Synonym);
        }
        if (mods.Type !== undefined && Array.isArray(mods.Type)) {
          const newTypeContent = mods.Type.map(t => `<v8:Type>${t}</v8:Type>`).join('\n\t\t\t\t\t\t');
          let firstTypeReplaced = false;
          let tempInner = newInner.replace(/<v8:Type>[\s\S]*?<\/v8:Type>\s*/ig, (match) => {
            if (!firstTypeReplaced) {
              firstTypeReplaced = true;
              return `${newTypeContent}\n\t\t\t\t\t\t`;
            }
            return '';
          });
          if (!firstTypeReplaced) {
            const typeRegex = /(<Type>)([\s\S]*?)(<\/Type>)/i;
            if (typeRegex.test(newInner)) {
              newInner = newInner.replace(typeRegex, `$1\n\t\t\t\t\t\t${newTypeContent}\n\t\t\t\t\t$3`);
            } else {
              newInner = newInner.replace(/(<\/Properties>)/i, `\t<Type>\n\t\t\t\t\t\t${newTypeContent}\n\t\t\t\t\t</Type>\n\t\t\t\t$1`);
            }
          } else {
            newInner = tempInner;
          }
        }
        return `${open}${newInner}${close}`;
      });
    }
  }

  for (const [key, value] of Object.entries(changes)) {
    if (key === '_attributes') continue;
    if (key === 'Synonym') {
      xmlStr = updateSynonymInXml(xmlStr, value);
    } else {
      xmlStr = updateXmlProperty(xmlStr, key, value);
    }
  }
  await fs.writeFile(xmlPath, xmlStr, 'utf8');
}

/**
 * Парсит форму из Form.xml
 */
async function parseFormXml(formXmlPath) {
  const xmlStr = await fs.readFile(formXmlPath, 'utf8');
  const result = { items: [], attributes: [], commands: [] };

  const formName = getTextContent(xmlStr, 'Name') || 'Форма';
  const synonym = extractSynonym(xmlStr);

  const childItemsMatch = xmlStr.match(/<ChildItems>([\s\S]*?)<\/ChildItems>/i);
  const childItemsBlock = childItemsMatch ? childItemsMatch[1] : '';

  const itemTypes = ['InputField', 'LabelField', 'Button', 'Table', 'UsualGroup', 'Page', 'FormattedDocumentField'];
  for (const itemType of itemTypes) {
    const regex = new RegExp(`<${itemType}\\s+[^>]*name="([^"]+)"[^>]*id="([^"]+)"[^>]*>([\\s\\S]*?)</${itemType}>`, 'gi');
    let m;
    while ((m = regex.exec(childItemsBlock)) !== null) {
      const name = m[1];
      const id = m[2];
      const inner = m[3];
      const dataPath = getTextContent(inner, 'DataPath');
      const titleMatch = inner.match(/<Title>([\s\S]*?)<\/Title>/i);
      let title = name;
      if (titleMatch) {
        const v8content = titleMatch[1].match(/<v8:content>([\s\S]*?)<\/v8:content>/i);
        if (v8content) title = v8content[1].trim();
      }
      const nestedChildItems = getTextContent(inner, 'ChildItems');
      let columns = [];
      if (nestedChildItems && itemType === 'Table') {
        const colRegex = /<LabelField\s+[^>]*name="([^"]+)"[^>]*>[\s\S]*?<DataPath>([^<]*)<\/DataPath>/gi;
        let cm;
        while ((cm = colRegex.exec(nestedChildItems)) !== null) {
          columns.push({ name: cm[1], dataPath: cm[2] });
        }
      }
      const visibleStr = getTextContent(inner, 'Visible');
      const userVisibleStr = getTextContent(inner, 'UserVisible');
      
      let visible = true;
      if (visibleStr === 'false') visible = false;
      if (userVisibleStr) {
        const uvMatch = userVisibleStr.match(/<common:Visible>([\s\S]*?)<\/common:Visible>/i);
        if (uvMatch && uvMatch[1].trim() === 'false') visible = false;
      }
      
      const typeMatch = inner.match(/<Type>([\s\S]*?)<\/Type>/i);
      let fieldType = '';
      if (typeMatch) {
         const tMatch = typeMatch[1].match(/<v8:Type>([^<]+)<\/v8:Type>/i);
         if (tMatch) fieldType = tMatch[1];
      }

      result.items.push({
        type: itemType,
        name,
        id,
        title,
        dataPath,
        width: getTextContent(inner, 'Width'),
        multiLine: getTextContent(inner, 'MultiLine') === 'true',
        representation: getTextContent(inner, 'Representation'),
        columns,
        visible,
        fieldType,
        titleLocation: getTextContent(inner, 'TitleLocation'),
        readOnly: getTextContent(inner, 'ReadOnly') === 'true'
      });
    }
  }

  const attrMatch = xmlStr.match(/<Attributes>([\s\S]*?)<\/Attributes>/i);
  if (attrMatch) {
    const attrRegex = /<Attribute\s+name="([^"]+)"[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/Attribute>/gi;
    let am;
    while ((am = attrRegex.exec(attrMatch[1])) !== null) {
      const typeMatch = am[3].match(/<v8:Type>([^<]+)<\/v8:Type>/i);
      result.attributes.push({
        name: am[1],
        id: am[2],
        type: typeMatch ? typeMatch[1] : ''
      });
    }
  }

  const cmdMatch = xmlStr.match(/<Commands>([\s\S]*?)<\/Commands>/i);
  if (cmdMatch) {
    const cmdRegex = /<Command\s+name="([^"]+)"[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/Command>/gi;
    let cm;
    while ((cm = cmdRegex.exec(cmdMatch[1])) !== null) {
      const titleMatch = cm[3].match(/<v8:content>([\s\S]*?)<\/v8:content>/i);
      result.commands.push({
        name: cm[1],
        id: cm[2],
        title: titleMatch ? titleMatch[1].trim() : cm[1]
      });
    }
  }

  result.formName = formName;
  result.synonym = synonym || formName;
  return result;
}

/**
 * Парсит XML объекта метаданных для отображения в дереве (реквизиты, табличные части, команды)
 */
async function parseMetadataForTree(xmlPath) {
  const xmlStr = await fs.readFile(xmlPath, 'utf8');
  const result = { attributes: [], tabularSections: [], commands: [], forms: [], templates: [] };

  const catalogMatch = xmlStr.match(/<Catalog[^>]*>([\s\S]*?)<\/Catalog>/i);
  const documentMatch = xmlStr.match(/<Document[^>]*>([\s\S]*?)<\/Document>/i);
  const content = catalogMatch ? catalogMatch[1] : (documentMatch ? documentMatch[1] : '');
  if (!content) return result;

  // Жадный * нужен: при вложенных <ChildObjects> внутри TabularSection нежадный *? обрезал бы блок
  const childMatch = content.match(/<ChildObjects>([\s\S]*)<\/ChildObjects>/i);
  const childBlock = childMatch ? childMatch[1] : '';

  // Attributes (реквизиты)
  const attrMatches = childBlock.matchAll(/<Attribute[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Attribute>/gi);
  for (const m of attrMatches) {
    const propsMatch = m[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    if (name && !name.startsWith('StandardAttribute')) {
      result.attributes.push({ uuid: m[1], name, synonym: synonym || name });
    }
  }

  // Tabular sections (табличные части)
  const tsMatches = childBlock.matchAll(/<TabularSection[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/TabularSection>/gi);
  for (const m of tsMatches) {
    const tsInner = m[2];
    const propsMatch = tsInner.match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    const attrs = [];
    const tsChildMatch = tsInner.match(/<ChildObjects>([\s\S]*?)<\/ChildObjects>/i);
    const tsChildBlock = tsChildMatch ? tsChildMatch[1] : '';
    const tsAttrMatches = tsChildBlock.matchAll(/<Attribute[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Attribute>/gi);
    for (const am of tsAttrMatches) {
      const aPropsMatch = am[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
      const aPropsBlock = aPropsMatch ? aPropsMatch[1] : '';
      const aName = getTextContent(aPropsBlock, 'Name');
      const aSynonym = extractSynonym(aPropsBlock);
      if (aName) attrs.push({ uuid: am[1], name: aName, synonym: aSynonym || aName });
    }
    result.tabularSections.push({ uuid: m[1], name: name || 'ТабличнаяЧасть', synonym: synonym || name, attributes: attrs });
  }

  // Commands
  const cmdMatches = childBlock.matchAll(/<Command[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Command>/gi);
  for (const m of cmdMatches) {
    const propsMatch = m[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    if (name) result.commands.push({ uuid: m[1], name, synonym: synonym || name });
  }

  // Forms (просто имена из тегов <Form>)
  const formMatches = childBlock.matchAll(/<Form>([^<]+)<\/Form>/gi);
  for (const m of formMatches) {
    const formName = m[1].trim();
    if (formName) result.forms.push(formName);
  }

  // Templates
  const tplMatches = childBlock.matchAll(/<Template>([^<]+)<\/Template>/gi);
  for (const m of tplMatches) {
    const tplName = m[1].trim();
    if (tplName) result.templates.push(tplName);
  }

  return result;
}

/**
 * Парсит XML регистра (накопления/сведений) для дерева
 */
async function parseRegisterForTree(xmlPath) {
  const xmlStr = await fs.readFile(xmlPath, 'utf8');
  const result = { dimensions: [], resources: [], attributes: [], forms: [], commands: [], templates: [] };

  const regMatch = xmlStr.match(/<(?:AccumulationRegister|InformationRegister)[^>]*>([\s\S]*?)<\/(?:AccumulationRegister|InformationRegister)>/i);
  if (!regMatch) return result;
  const childMatch = regMatch[1].match(/<ChildObjects>([\s\S]*?)<\/ChildObjects>/i);
  const childBlock = childMatch ? childMatch[1] : '';

  const parseAttrLike = (tagName) => {
    const items = [];
    const regex = new RegExp(`<${tagName}[^>]*uuid="([^"]*)"[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
    let m;
    while ((m = regex.exec(childBlock)) !== null) {
      const propsMatch = m[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
      const propsBlock = propsMatch ? propsMatch[1] : '';
      const name = getTextContent(propsBlock, 'Name');
      const synonym = extractSynonym(propsBlock);
      if (name) items.push({ uuid: m[1], name, synonym: synonym || name });
    }
    return items;
  };

  result.dimensions = parseAttrLike('Dimension');
  result.resources = parseAttrLike('Resource');
  result.attributes = parseAttrLike('Attribute');

  const formMatches = childBlock.matchAll(/<Form>([^<]+)<\/Form>/gi);
  for (const m of formMatches) {
    const fn = m[1].trim();
    if (fn) result.forms.push(fn);
  }
  const cmdMatches = childBlock.matchAll(/<Command[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Command>/gi);
  for (const m of cmdMatches) {
    const propsMatch = m[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    if (name) result.commands.push({ uuid: m[1], name, synonym: synonym || name });
  }
  const tplMatches = childBlock.matchAll(/<Template>([^<]+)<\/Template>/gi);
  for (const m of tplMatches) {
    const tn = m[1].trim();
    if (tn) result.templates.push(tn);
  }
  return result;
}

/**
 * Парсит XML обработки для дерева
 */
async function parseDataProcessorForTree(xmlPath) {
  const xmlStr = await fs.readFile(xmlPath, 'utf8');
  const result = { attributes: [], tabularSections: [], forms: [], commands: [], templates: [] };

  const dpMatch = xmlStr.match(/<DataProcessor[^>]*>([\s\S]*?)<\/DataProcessor>/i);
  if (!dpMatch) return result;
  const content = dpMatch[1];
  // Жадный * нужен: при вложенных <ChildObjects> внутри TabularSection нежадный *? обрезал бы блок
  const childMatch = content.match(/<ChildObjects>([\s\S]*)<\/ChildObjects>/i);
  const childBlock = childMatch ? childMatch[1] : '';

  const attrMatches = childBlock.matchAll(/<Attribute[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Attribute>/gi);
  for (const m of attrMatches) {
    const propsMatch = m[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    if (name && !name.startsWith('StandardAttribute')) {
      result.attributes.push({ uuid: m[1], name, synonym: synonym || name });
    }
  }

  const tsMatches = childBlock.matchAll(/<TabularSection[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/TabularSection>/gi);
  for (const m of tsMatches) {
    const tsInner = m[2];
    const propsMatch = tsInner.match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    const attrs = [];
    const tsChildMatch = tsInner.match(/<ChildObjects>([\s\S]*?)<\/ChildObjects>/i);
    const tsChildBlock = tsChildMatch ? tsChildMatch[1] : '';
    const tsAttrMatches = tsChildBlock.matchAll(/<Attribute[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Attribute>/gi);
    for (const am of tsAttrMatches) {
      const aPropsMatch = am[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
      const aPropsBlock = aPropsMatch ? aPropsMatch[1] : '';
      const aName = getTextContent(aPropsBlock, 'Name');
      const aSynonym = extractSynonym(aPropsBlock);
      if (aName) attrs.push({ uuid: am[1], name: aName, synonym: aSynonym || aName });
    }
    result.tabularSections.push({ uuid: m[1], name: name || 'ТабличнаяЧасть', synonym: synonym || name, attributes: attrs });
  }

  const formMatches = childBlock.matchAll(/<Form>([^<]+)<\/Form>/gi);
  for (const m of formMatches) {
    const fn = m[1].trim();
    if (fn) result.forms.push(fn);
  }
  const cmdMatches = childBlock.matchAll(/<Command[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Command>/gi);
  for (const m of cmdMatches) {
    const propsMatch = m[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    if (name) result.commands.push({ uuid: m[1], name, synonym: synonym || name });
  }
  const tplMatches = childBlock.matchAll(/<Template>([^<]+)<\/Template>/gi);
  for (const m of tplMatches) {
    const tn = m[1].trim();
    if (tn) result.templates.push(tn);
  }
  return result;
}

/**
 * Парсит XML перечисления для дерева
 */
async function parseEnumForTree(xmlPath) {
  const xmlStr = await fs.readFile(xmlPath, 'utf8');
  const result = { values: [], forms: [], commands: [], templates: [] };

  const enumMatch = xmlStr.match(/<Enum[^>]*>([\s\S]*?)<\/Enum>/i);
  if (!enumMatch) return result;
  const childMatch = enumMatch[1].match(/<ChildObjects>([\s\S]*?)<\/ChildObjects>/i);
  const childBlock = childMatch ? childMatch[1] : '';

  const valueMatches = childBlock.matchAll(/<EnumValue[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/EnumValue>/gi);
  for (const m of valueMatches) {
    const propsMatch = m[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    const comment = getTextContent(propsBlock, 'Comment');
    if (name) result.values.push({ uuid: m[1], name, synonym: synonym || name, comment: comment || '' });
  }

  const formMatches = childBlock.matchAll(/<Form>([^<]+)<\/Form>/gi);
  for (const m of formMatches) {
    const fn = m[1].trim();
    if (fn) result.forms.push(fn);
  }
  const cmdMatches = childBlock.matchAll(/<Command[^>]*uuid="([^"]*)"[^>]*>([\s\S]*?)<\/Command>/gi);
  for (const m of cmdMatches) {
    const propsMatch = m[2].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    if (name) result.commands.push({ uuid: m[1], name, synonym: synonym || name });
  }
  const tplMatches = childBlock.matchAll(/<Template>([^<]+)<\/Template>/gi);
  for (const m of tplMatches) {
    const tn = m[1].trim();
    if (tn) result.templates.push(tn);
  }
  return result;
}

function getTextContentFromBlock(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

/**
 * Парсит Attribute, Dimension или Resource по uuid из XML
 */
async function parseAttributeLikeByUuid(xmlPath, uuid) {
  const xmlStr = await fs.readFile(xmlPath, 'utf8');
  const tagNames = ['Attribute', 'Dimension', 'Resource'];
  for (const tag of tagNames) {
    const regex = new RegExp(`<${tag}[^>]*uuid="${uuid}"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = xmlStr.match(regex);
    if (m) {
      const propsMatch = m[1].match(/<Properties>([\s\S]*?)<\/Properties>/i);
      const propsBlock = propsMatch ? propsMatch[1] : '';
      const typeMatch = propsBlock.match(/<Type>([\s\S]*?)<\/Type>/i);
      const typeBlock = typeMatch ? typeMatch[1] : '';
      const typeStrs = [];
      const v8Types = typeBlock.matchAll(/<v8:Type>([^<]*)<\/v8:Type>/gi);
      for (const t of v8Types) typeStrs.push(t[1].trim());

      const strQual = propsBlock.match(/<v8:StringQualifiers>([\s\S]*?)<\/v8:StringQualifiers>/i);
      const strQualBlock = strQual ? strQual[1] : '';
      const numQual = propsBlock.match(/<v8:NumberQualifiers>([\s\S]*?)<\/v8:NumberQualifiers>/i);
      const numQualBlock = numQual ? numQual[1] : '';
      const dateQual = propsBlock.match(/<v8:DateQualifiers>([\s\S]*?)<\/v8:DateQualifiers>/i);
      const dateQualBlock = dateQual ? dateQual[1] : '';

      return {
        tagName: tag,
        uuid,
        name: getTextContent(propsBlock, 'Name'),
        synonym: extractSynonym(propsBlock),
        comment: getTextContent(propsBlock, 'Comment'),
        type: typeStrs.map(formatTypeString).join(', '),
        rawTypes: typeStrs,
        use: getTextContent(propsBlock, 'Use'),
        indexing: getTextContent(propsBlock, 'Indexing'),
        fullTextSearch: getTextContent(propsBlock, 'FullTextSearch'),
        dataHistory: getTextContent(propsBlock, 'DataHistory'),
        toolTip: getTextContent(propsBlock, 'ToolTip'),
        fillFromFillingValue: getTextContent(propsBlock, 'FillFromFillingValue'),
        fillValue: getTextContent(propsBlock, 'FillValue'),
        fillChecking: getTextContent(propsBlock, 'FillChecking'),
        choiceFoldersAndItems: getTextContent(propsBlock, 'ChoiceFoldersAndItems'),
        quickChoice: getTextContent(propsBlock, 'QuickChoice'),
        createOnInput: getTextContent(propsBlock, 'CreateOnInput'),
        choiceHistoryOnInput: getTextContent(propsBlock, 'ChoiceHistoryOnInput'),
        choiceForm: getTextContent(propsBlock, 'ChoiceForm'),
        linkByType: getTextContent(propsBlock, 'LinkByType'),
        choiceParameterLinks: getTextContent(propsBlock, 'ChoiceParameterLinks'),
        choiceParameters: getTextContent(propsBlock, 'ChoiceParameters'),
        stringLength: getTextContentFromBlock(strQualBlock, 'v8:Length'),
        stringAllowedLength: getTextContentFromBlock(strQualBlock, 'v8:AllowedLength'),
        stringUnlimitedLength: getTextContentFromBlock(strQualBlock, 'v8:UnlimitedLength') === 'true',
        numberDigits: getTextContentFromBlock(numQualBlock, 'v8:Digits'),
        numberFractionDigits: getTextContentFromBlock(numQualBlock, 'v8:FractionDigits'),
        numberAllowedSign: getTextContentFromBlock(numQualBlock, 'v8:AllowedSign'),
        dateFractions: getTextContentFromBlock(dateQualBlock, 'v8:DateFractions') || 'Date',
        passwordMode: getTextContent(propsBlock, 'PasswordMode') === 'true',
        format: getTextContent(propsBlock, 'Format'),
        editFormat: getTextContent(propsBlock, 'EditFormat'),
        markNegatives: getTextContent(propsBlock, 'MarkNegatives') === 'true',
        mask: getTextContent(propsBlock, 'Mask'),
        multiLine: getTextContent(propsBlock, 'MultiLine') === 'true',
        extendedEdit: getTextContent(propsBlock, 'ExtendedEdit') === 'true',
        minValue: getTextContent(propsBlock, 'MinValue'),
        maxValue: getTextContent(propsBlock, 'MaxValue'),
        denyIncompleteValues: getTextContent(propsBlock, 'DenyIncompleteValues') === 'true',
        master: getTextContent(propsBlock, 'Master') === 'true',
        mainFilter: getTextContent(propsBlock, 'MainFilter') === 'true',
        typeReductionMode: getTextContent(propsBlock, 'TypeReductionMode'),
        useInTotals: getTextContent(propsBlock, 'UseInTotals') === 'true'
      };
    }
  }
  return null;
}

/**
 * Сохраняет изменения в Attribute, Dimension или Resource по uuid
 */
async function saveAttributeLikeInXml(xmlPath, uuid, tagName, changes) {
  let xmlStr = await fs.readFile(xmlPath, 'utf8');
  const regex = new RegExp(`(<${tagName}[^>]*uuid="${uuid}"[^>]*>)([\\s\\S]*?)(<\\/${tagName}>)`, 'i');
  xmlStr = xmlStr.replace(regex, (_, openTag, inner, closeTag) => {
    const stringProps = ['Name', 'Comment', 'ToolTip', 'Use', 'Indexing', 'FullTextSearch', 'DataHistory', 'FillFromFillingValue', 'FillValue', 'FillChecking', 'ChoiceFoldersAndItems', 'QuickChoice', 'CreateOnInput', 'ChoiceHistoryOnInput', 'ChoiceForm', 'LinkByType', 'ChoiceParameterLinks', 'ChoiceParameters', 'Format', 'EditFormat', 'Mask', 'MinValue', 'MaxValue', 'TypeReductionMode'];
    for (const prop of stringProps) {
      if (changes[prop] !== undefined) {
        inner = updateXmlProperty(inner, prop, changes[prop]);
      }
    }
    const boolProps = ['PasswordMode', 'MarkNegatives', 'MultiLine', 'ExtendedEdit', 'DenyIncompleteValues', 'Master', 'MainFilter', 'UseInTotals', 'FillFromFillingValue'];
    for (const prop of boolProps) {
      if (changes[prop] !== undefined) {
        inner = updateXmlProperty(inner, prop, changes[prop] ? 'true' : 'false');
      }
    }
    if (changes.Synonym !== undefined) {
      inner = updateSynonymInXml(inner, changes.Synonym);
    }
    if (changes.Type !== undefined && Array.isArray(changes.Type)) {
      const types = changes.Type;
      let typeContent = types.map(t => `<v8:Type>${escapeXml(t)}</v8:Type>`).join('\n\t\t\t\t\t\t');
      // Добавляем квалификаторы при замене типа — иначе они теряются и 1С получает длину 0
      if (types.includes('xs:string')) {
        const len = changes.stringLength !== undefined ? String(changes.stringLength) : '100';
        const allowed = changes.stringAllowedLength || 'Variable';
        typeContent += `\n\t\t\t\t\t\t<v8:StringQualifiers>\n\t\t\t\t\t\t\t<v8:Length>${escapeXml(len)}</v8:Length>\n\t\t\t\t\t\t\t<v8:AllowedLength>${escapeXml(allowed)}</v8:AllowedLength>\n\t\t\t\t\t\t</v8:StringQualifiers>`;
      }
      if (types.includes('xs:decimal')) {
        const digits = changes.numberDigits || '10';
        const frac = changes.numberFractionDigits || '0';
        const sign = changes.numberAllowedSign || 'Any';
        typeContent += `\n\t\t\t\t\t\t<v8:NumberQualifiers>\n\t\t\t\t\t\t\t<v8:Digits>${escapeXml(digits)}</v8:Digits>\n\t\t\t\t\t\t\t<v8:FractionDigits>${escapeXml(frac)}</v8:FractionDigits>\n\t\t\t\t\t\t\t<v8:AllowedSign>${escapeXml(sign)}</v8:AllowedSign>\n\t\t\t\t\t\t</v8:NumberQualifiers>`;
      }
      if (types.includes('xs:dateTime') && changes.dateFractions !== undefined) {
        typeContent += `\n\t\t\t\t\t\t<v8:DateQualifiers>\n\t\t\t\t\t\t\t<v8:DateFractions>${escapeXml(changes.dateFractions)}</v8:DateFractions>\n\t\t\t\t\t\t</v8:DateQualifiers>`;
      }
      const typeRegex = /<Type>[\s\S]*?<\/Type>/i;
      if (typeRegex.test(inner)) {
        inner = inner.replace(typeRegex, `<Type>\n\t\t\t\t\t\t${typeContent}\n\t\t\t\t\t</Type>`);
      } else {
        inner = inner.replace(/(<\/Properties>)/i, `\t<Type>\n\t\t\t\t\t\t${typeContent}\n\t\t\t\t\t</Type>\n\t\t\t\t$1`);
      }
    } else if (changes.stringLength !== undefined || changes.stringAllowedLength !== undefined || changes.stringUnlimitedLength !== undefined) {
      const strQualMatch = inner.match(/<v8:StringQualifiers>([\s\S]*?)<\/v8:StringQualifiers>/i);
      if (strQualMatch) {
        let strQualInner = strQualMatch[1];
        if (changes.stringLength !== undefined) strQualInner = updateXmlProperty(strQualInner, 'v8:Length', changes.stringLength);
        if (changes.stringAllowedLength !== undefined) strQualInner = updateXmlProperty(strQualInner, 'v8:AllowedLength', changes.stringAllowedLength);
        if (changes.stringUnlimitedLength !== undefined) strQualInner = updateXmlProperty(strQualInner, 'v8:UnlimitedLength', changes.stringUnlimitedLength ? 'true' : 'false');
        inner = inner.replace(/<v8:StringQualifiers>[\s\S]*?<\/v8:StringQualifiers>/i, `<v8:StringQualifiers>\n\t\t\t\t\t\t${strQualInner}\n\t\t\t\t\t</v8:StringQualifiers>`);
      } else {
        const typeMatch = inner.match(/<Type>([\s\S]*?)<\/Type>/i);
        if (typeMatch && typeMatch[1].includes('xs:string')) {
          const len = changes.stringLength !== undefined ? String(changes.stringLength) : '100';
          const allowed = changes.stringAllowedLength || 'Variable';
          const strQualBlock = `\n\t\t\t\t\t\t<v8:StringQualifiers>\n\t\t\t\t\t\t\t<v8:Length>${escapeXml(len)}</v8:Length>\n\t\t\t\t\t\t\t<v8:AllowedLength>${escapeXml(allowed)}</v8:AllowedLength>\n\t\t\t\t\t\t</v8:StringQualifiers>`;
          inner = inner.replace(/(<Type>)([\s\S]*?)(<\/Type>)/i, (_, open, typeContent, close) =>
            `${open}${typeContent}${strQualBlock}\n\t\t\t\t\t${close}`);
        }
      }
    }
    if (changes.numberDigits !== undefined || changes.numberFractionDigits !== undefined || changes.numberAllowedSign !== undefined) {
      const numQualMatch = inner.match(/<v8:NumberQualifiers>([\s\S]*?)<\/v8:NumberQualifiers>/i);
      if (numQualMatch) {
        let numQualInner = numQualMatch[1];
        if (changes.numberDigits !== undefined) numQualInner = updateXmlProperty(numQualInner, 'v8:Digits', changes.numberDigits);
        if (changes.numberFractionDigits !== undefined) numQualInner = updateXmlProperty(numQualInner, 'v8:FractionDigits', changes.numberFractionDigits);
        if (changes.numberAllowedSign !== undefined) numQualInner = updateXmlProperty(numQualInner, 'v8:AllowedSign', changes.numberAllowedSign);
        inner = inner.replace(/<v8:NumberQualifiers>[\s\S]*?<\/v8:NumberQualifiers>/i, `<v8:NumberQualifiers>\n\t\t\t\t\t\t${numQualInner}\n\t\t\t\t\t</v8:NumberQualifiers>`);
      } else {
        const typeMatch = inner.match(/<Type>([\s\S]*?)<\/Type>/i);
        if (typeMatch && inner.includes('xs:decimal')) {
          const digits = changes.numberDigits || '10';
          const frac = changes.numberFractionDigits || '0';
          const sign = changes.numberAllowedSign || 'Any';
          const numQualBlock = `\n\t\t\t\t\t\t<v8:NumberQualifiers>\n\t\t\t\t\t\t\t<v8:Digits>${escapeXml(digits)}</v8:Digits>\n\t\t\t\t\t\t\t<v8:FractionDigits>${escapeXml(frac)}</v8:FractionDigits>\n\t\t\t\t\t\t\t<v8:AllowedSign>${escapeXml(sign)}</v8:AllowedSign>\n\t\t\t\t\t\t</v8:NumberQualifiers>`;
          inner = inner.replace(/(<Type>)([\s\S]*?)(<\/Type>)/i, (_, open, typeContent, close) =>
            `${open}${typeContent}${numQualBlock}\n\t\t\t\t\t${close}`);
        }
      }
    }
    if (changes.dateFractions !== undefined && changes.Type && Array.isArray(changes.Type) && changes.Type.some(t => t === 'xs:dateTime')) {
      const dateQualMatch = inner.match(/<v8:DateQualifiers>([\s\S]*?)<\/v8:DateQualifiers>/i);
      let dateQualInner = dateQualMatch ? dateQualMatch[1] : '';
      dateQualInner = updateXmlProperty(dateQualInner || '<v8:DateFractions>Date</v8:DateFractions>', 'v8:DateFractions', changes.dateFractions);
      if (dateQualMatch) {
        inner = inner.replace(/<v8:DateQualifiers>[\s\S]*?<\/v8:DateQualifiers>/i, `<v8:DateQualifiers>\n\t\t\t\t\t\t${dateQualInner}\n\t\t\t\t\t</v8:DateQualifiers>`);
      } else {
        inner = inner.replace(/(<Type>)([\s\S]*?)(<\/Type>)/i, (_, open, typeContent, close) =>
          `${open}${typeContent}\n\t\t\t\t\t<v8:DateQualifiers>\n\t\t\t\t\t\t${dateQualInner}\n\t\t\t\t\t</v8:DateQualifiers>\n\t\t\t\t${close}`);
      }
    }
    return openTag + inner + closeTag;
  });
  await fs.writeFile(xmlPath, xmlStr, 'utf8');
}

/**
 * Парсит XML константы
 */
async function parseConstantXml(xmlPath) {
  try {
    const xmlStr = await fs.readFile(xmlPath, 'utf8');
    const constMatch = xmlStr.match(/<Constant[^>]*>([\s\S]*?)<\/Constant>/i);
    if (!constMatch) return null;
    const propsMatch = constMatch[1].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    const comment = getTextContent(propsBlock, 'Comment');
    const useStandardCommands = getTextContent(propsBlock, 'UseStandardCommands') === 'true';
    const defaultForm = getTextContent(propsBlock, 'DefaultForm');
    return { name: name || '', synonym: synonym || name, comment, useStandardCommands, defaultForm, rawXml: xmlStr };
  } catch {
    return null;
  }
}

/**
 * Сохраняет свойства константы в XML
 */
async function saveConstantXml(xmlPath, changes) {
  let xmlStr = await fs.readFile(xmlPath, 'utf8');
  const constRegex = /(<Constant[^>]*>)([\s\S]*?)(<\/Constant>)/i;
  xmlStr = xmlStr.replace(constRegex, (_, openTag, content, closeTag) => {
    let inner = content;
    if (changes.name !== undefined) inner = inner.replace(/<Name>[\s\S]*?<\/Name>/i, `<Name>${escapeXml(changes.name)}</Name>`);
    if (changes.synonym !== undefined) {
      inner = inner.replace(/(<Synonym>\s*<v8:item>\s*<v8:lang>ru<\/v8:lang>\s*<v8:content>)([\s\S]*?)(<\/v8:content>)/i, `$1${escapeXml(changes.synonym)}$3`);
    }
    if (changes.comment !== undefined) inner = inner.replace(/<Comment[^>]*>[\s\S]*?<\/Comment>/i, `<Comment>${escapeXml(changes.comment)}</Comment>`);
    if (changes.useStandardCommands !== undefined) inner = inner.replace(/<UseStandardCommands>[\s\S]*?<\/UseStandardCommands>/i, `<UseStandardCommands>${changes.useStandardCommands ? 'true' : 'false'}</UseStandardCommands>`);
    if (changes.defaultForm !== undefined) inner = inner.replace(/<DefaultForm>[\s\S]*?<\/DefaultForm>/i, `<DefaultForm>${escapeXml(changes.defaultForm)}</DefaultForm>`);
    return openTag + inner + closeTag;
  });
  await fs.writeFile(xmlPath, xmlStr, 'utf8');
}

/**
 * Сохраняет свойства перечисления в XML
 */
async function saveEnumXml(xmlPath, changes) {
  let xmlStr = await fs.readFile(xmlPath, 'utf8');
  const enumRegex = /(<Enum[^>]*>)([\s\S]*?)(<\/Enum>)/i;
  xmlStr = xmlStr.replace(enumRegex, (_, openTag, content, closeTag) => {
    const propsMatch = content.match(/<Properties>([\s\S]*?)<\/Properties>/i);
    if (!propsMatch) return openTag + content + closeTag;
    let inner = content;
    if (changes.name !== undefined) inner = inner.replace(/<Name>[\s\S]*?<\/Name>/i, `<Name>${escapeXml(changes.name)}</Name>`);
    if (changes.synonym !== undefined) {
      inner = inner.replace(/(<Synonym>\s*<v8:item>\s*<v8:lang>ru<\/v8:lang>\s*<v8:content>)([\s\S]*?)(<\/v8:content>)/i, `$1${escapeXml(changes.synonym)}$3`);
    }
    if (changes.comment !== undefined) inner = inner.replace(/<Comment[^>]*>[\s\S]*?<\/Comment>/i, `<Comment>${escapeXml(changes.comment)}</Comment>`);
    if (changes.useStandardCommands !== undefined) inner = inner.replace(/<UseStandardCommands>[\s\S]*?<\/UseStandardCommands>/i, `<UseStandardCommands>${changes.useStandardCommands ? 'true' : 'false'}</UseStandardCommands>`);
    if (changes.quickChoice !== undefined) inner = inner.replace(/<QuickChoice>[\s\S]*?<\/QuickChoice>/i, `<QuickChoice>${changes.quickChoice ? 'true' : 'false'}</QuickChoice>`);
    if (changes.choiceMode !== undefined) inner = inner.replace(/<ChoiceMode>[\s\S]*?<\/ChoiceMode>/i, `<ChoiceMode>${escapeXml(changes.choiceMode)}</ChoiceMode>`);
    if (changes.choiceHistoryOnInput !== undefined) inner = inner.replace(/<ChoiceHistoryOnInput>[\s\S]*?<\/ChoiceHistoryOnInput>/i, `<ChoiceHistoryOnInput>${escapeXml(changes.choiceHistoryOnInput)}</ChoiceHistoryOnInput>`);
    return openTag + inner + closeTag;
  });
  await fs.writeFile(xmlPath, xmlStr, 'utf8');
}

/**
 * Парсит EnumValue по uuid из XML перечисления
 */
async function parseEnumValueByUuid(xmlPath, uuid) {
  const xmlStr = await fs.readFile(xmlPath, 'utf8');
  const regex = new RegExp(`<EnumValue[^>]*uuid="${uuid}"[^>]*>([\\s\\S]*?)<\\/EnumValue>`, 'i');
  const m = xmlStr.match(regex);
  if (!m) return null;
  const propsMatch = m[1].match(/<Properties>([\s\S]*?)<\/Properties>/i);
  const propsBlock = propsMatch ? propsMatch[1] : '';
  const name = getTextContent(propsBlock, 'Name');
  const synonym = extractSynonym(propsBlock);
  const comment = getTextContent(propsBlock, 'Comment');
  return { uuid, name: name || '', synonym: synonym || name, comment: comment || '' };
}

/**
 * Сохраняет свойства EnumValue в XML перечисления
 */
async function saveEnumValueInXml(xmlPath, uuid, changes) {
  let xmlStr = await fs.readFile(xmlPath, 'utf8');
  const regex = new RegExp(`(<EnumValue[^>]*uuid="${uuid}"[^>]*>)([\\s\\S]*?)(<\\/EnumValue>)`, 'i');
  xmlStr = xmlStr.replace(regex, (_, openTag, inner, closeTag) => {
    if (changes.name !== undefined) {
      inner = inner.replace(/<Name>[\s\S]*?<\/Name>/i, `<Name>${escapeXml(changes.name)}</Name>`);
    }
    if (changes.synonym !== undefined) {
      inner = updateSynonymInXml(inner, changes.synonym);
    }
    if (changes.comment !== undefined) {
      const commentVal = escapeXml(changes.comment);
      inner = inner.replace(/<Comment[^>]*>[\s\S]*?<\/Comment>/i, `<Comment>${commentVal}</Comment>`);
      inner = inner.replace(/<Comment[^>]*\/>/i, `<Comment>${commentVal}</Comment>`);
    }
    return openTag + inner + closeTag;
  });
  await fs.writeFile(xmlPath, xmlStr, 'utf8');
}

/**
 * Парсит XML перечисления (свойства)
 */
async function parseEnumXml(xmlPath) {
  try {
    const xmlStr = await fs.readFile(xmlPath, 'utf8');
    const enumMatch = xmlStr.match(/<Enum[^>]*>([\s\S]*?)<\/Enum>/i);
    if (!enumMatch) return null;
    const propsMatch = enumMatch[1].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    const comment = getTextContent(propsBlock, 'Comment');
    const useStandardCommands = getTextContent(propsBlock, 'UseStandardCommands') === 'true';
    const quickChoice = getTextContent(propsBlock, 'QuickChoice') === 'true';
    const choiceMode = getTextContent(propsBlock, 'ChoiceMode');
    const choiceHistoryOnInput = getTextContent(propsBlock, 'ChoiceHistoryOnInput');
    return { name: name || '', synonym: synonym || name, comment, useStandardCommands, quickChoice, choiceMode, choiceHistoryOnInput, rawXml: xmlStr };
  } catch {
    return null;
  }
}

/**
 * Парсит метаданные формы из FormName.xml (свойства формы)
 */
async function parseFormMetadataXml(formMetaPath) {
  try {
    const xmlStr = await fs.readFile(formMetaPath, 'utf8');
    const formMatch = xmlStr.match(/<Form[^>]*>([\s\S]*?)<\/Form>/i);
    if (!formMatch) return null;
    const propsMatch = formMatch[1].match(/<Properties>([\s\S]*?)<\/Properties>/i);
    const propsBlock = propsMatch ? propsMatch[1] : '';
    const name = getTextContent(propsBlock, 'Name');
    const synonym = extractSynonym(propsBlock);
    const comment = getTextContent(propsBlock, 'Comment');
    const includeHelpInContents = getTextContent(propsBlock, 'IncludeHelpInContents') === 'true';
    return { name: name || 'Форма', synonym: synonym || name, comment, includeHelpInContents };
  } catch {
    return null;
  }
}

/**
 * Сохраняет свойства формы в FormName.xml
 */
async function saveFormMetadataXml(formMetaPath, changes) {
  let xmlStr = await fs.readFile(formMetaPath, 'utf8');
  const formRegex = /(<Form[^>]*>)([\s\S]*?)(<\/Form>)/i;
  xmlStr = xmlStr.replace(formRegex, (_, openTag, formContent, closeTag) => {
    let inner = formContent;
    if (changes.name !== undefined) {
      inner = inner.replace(/<Name>[\s\S]*?<\/Name>/i, `<Name>${escapeXml(changes.name)}</Name>`);
    }
    if (changes.synonym !== undefined) {
      inner = inner.replace(
        /(<Synonym>\s*<v8:item>\s*<v8:lang>ru<\/v8:lang>\s*<v8:content>)([\s\S]*?)(<\/v8:content>)/i,
        `$1${escapeXml(changes.synonym)}$3`
      );
    }
    if (changes.comment !== undefined) {
      const commentVal = escapeXml(changes.comment);
      inner = inner.replace(/<Comment[^>]*>[\s\S]*?<\/Comment>/i, `<Comment>${commentVal}</Comment>`);
      inner = inner.replace(/<Comment[^>]*\/>/i, `<Comment>${commentVal}</Comment>`);
    }
    if (changes.includeHelpInContents !== undefined) {
      const val = changes.includeHelpInContents ? 'true' : 'false';
      inner = inner.replace(/<IncludeHelpInContents>[\s\S]*?<\/IncludeHelpInContents>/i, `<IncludeHelpInContents>${val}</IncludeHelpInContents>`);
    }
    return openTag + inner + closeTag;
  });
  await fs.writeFile(formMetaPath, xmlStr, 'utf8');
}

function escapeXml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  parseMetadataObjectXml,
  saveMetadataObjectXml,
  parseFormXml,
  parseMetadataForTree,
  parseRegisterForTree,
  parseDataProcessorForTree,
  parseEnumForTree,
  parseConstantXml,
  parseEnumXml,
  saveConstantXml,
  saveEnumXml,
  parseEnumValueByUuid,
  saveEnumValueInXml,
  parseAttributeLikeByUuid,
  saveAttributeLikeInXml,
  parseFormMetadataXml,
  saveFormMetadataXml,
  getTextContent,
  extractSynonym
};
