const vscode = require('vscode');
const path = require('path');
const { parseMetadataObjectXml, saveMetadataObjectXml, parseAttributeLikeByUuid, saveAttributeLikeInXml } = require('./metadataXmlParser');
const { normalizePath, tryReveal, register } = require('./openPanelsRegistry');
const { getAvailableTypes } = require('./metadataTypesHelper');

function getRequisitePropertiesHtml(attr, xmlPath, tagName, availableTypes) {
  const name = attr.name || '';
  const synonym = attr.synonym || '';
  const comment = attr.comment || '';
  const type = attr.type || '';
  const use = attr.use || 'ForItem';
  const indexing = attr.indexing || 'DontIndex';
  const fullTextSearch = attr.fullTextSearch || 'Use';
  const dataHistory = attr.dataHistory || 'Use';
  const toolTip = attr.toolTip || '';
  const fillFromFillingValue = attr.fillFromFillingValue === 'true' || attr.fillFromFillingValue === true;
  const fillValue = attr.fillValue || '';
  const fillChecking = attr.fillChecking || 'DontCheck';
  const choiceFoldersAndItems = attr.choiceFoldersAndItems || 'Items';
  const quickChoice = attr.quickChoice || 'Auto';
  const createOnInput = attr.createOnInput || 'Auto';
  const choiceHistoryOnInput = attr.choiceHistoryOnInput || 'Auto';
  const stringLength = attr.stringLength || '10';
  const stringAllowedLength = attr.stringAllowedLength || 'Variable';
  const stringUnlimitedLength = attr.stringUnlimitedLength || false;
  const numberDigits = attr.numberDigits || '10';
  const numberFractionDigits = attr.numberFractionDigits || '0';
  const numberAllowedSign = attr.numberAllowedSign || 'Any';
  const passwordMode = attr.passwordMode || false;
  const format = attr.format || '';
  const editFormat = attr.editFormat || '';
  const markNegatives = attr.markNegatives || false;
  const mask = attr.mask || '';
  const multiLine = attr.multiLine || false;
  const extendedEdit = attr.extendedEdit || false;
  const minValue = attr.minValue || '';
  const maxValue = attr.maxValue || '';
  const denyIncompleteValues = attr.denyIncompleteValues || false;
  const master = attr.master || false;
  const mainFilter = attr.mainFilter === true;
  const typeReductionMode = attr.typeReductionMode || 'TransformValues';
  const useInTotals = attr.useInTotals !== false;
  const choiceForm = attr.choiceForm || '';
  const linkByType = attr.linkByType || '';
  const choiceParameterLinks = attr.choiceParameterLinks || '';
  const choiceParameters = attr.choiceParameters || '';

  const isDimension = tagName === 'Dimension';
  const isResource = tagName === 'Resource';
  const dateFractions = attr.dateFractions || 'Date';

  const allowedSignOpts = [
    { v: 'Any', l: 'Любой' },
    { v: 'Nonnegative', l: 'Неотрицательное' },
    { v: 'Positive', l: 'Положительное' }
  ];
  const typeReductionOpts = [
    { v: 'TransformValues', l: 'Преобразовывать значения' },
    { v: 'CutLeading', l: 'Отсекать ведущие' },
    { v: 'CutTrailing', l: 'Отсекать замыкающие' }
  ];

  const rawTypes = (attr && attr.rawTypes) ? attr.rawTypes : [];
  const rawTypesJson = JSON.stringify(rawTypes).replace(/</g, '\\u003c').replace(/'/g, '\\u0027');
  const availTypesJson = JSON.stringify(availableTypes || {}).replace(/</g, '\\u003c');

  let mainSection = `
    <div class="prop-row"><label>Имя</label><input type="text" id="Name" value="${escapeHtml(name)}"></div>
    <div class="prop-row"><label>Синоним</label><input type="text" id="Synonym" value="${escapeHtml(synonym)}"></div>
    <div class="prop-row"><label>Комментарий</label><textarea id="Comment" rows="2">${escapeHtml(comment)}</textarea></div>
    <div class="prop-row prop-row-type">
      <label>Тип</label>
      <div class="type-input-wrap">
        <input type="text" id="Type" value="${escapeHtml(type)}" readonly data-raw='${rawTypesJson}' data-string-length="${escapeHtml(stringLength)}" data-string-allowed-length="${escapeHtml(stringAllowedLength)}" data-string-unlimited-length="${stringUnlimitedLength ? '1' : '0'}" data-number-digits="${escapeHtml(numberDigits)}" data-number-fraction-digits="${escapeHtml(numberFractionDigits)}" data-number-allowed-sign="${escapeHtml(numberAllowedSign)}" data-date-fractions="${escapeHtml(dateFractions)}">
        <button type="button" id="TypeBtn" class="type-btn" title="Выбрать тип">...</button>
      </div>
    </div>`;

  /* Параметры Число, Строка, Дата перенесены в форму выбора типа */
  if (isDimension) {
    mainSection += `
    <div class="prop-row"><label><input type="checkbox" id="Master" ${master ? 'checked' : ''}> Ведущее</label></div>
    <div class="prop-row"><label><input type="checkbox" id="MainFilter" ${mainFilter ? 'checked' : ''}> Основной отбор</label></div>
    <div class="prop-row"><label><input type="checkbox" id="DenyIncompleteValues" ${denyIncompleteValues ? 'checked' : ''}> Запрет незаполненных значений</label></div>`;
  }
  if (isResource && (type && type.includes('Число'))) {
    mainSection += `
    <div class="prop-row"><label><input type="checkbox" id="UseInTotals" ${useInTotals ? 'checked' : ''}> Использовать в итогах</label></div>`;
  }

  let usageSection = '';
  if (attr.use !== undefined) {
    usageSection = `
    <div class="prop-row"><label>Использование</label>
      <select id="Use">
        <option value="ForItem" ${use === 'ForItem' ? 'selected' : ''}>Для элемента</option>
        <option value="ForFolder" ${use === 'ForFolder' ? 'selected' : ''}>Для группы</option>
        <option value="ForItemAndFolder" ${use === 'ForItemAndFolder' ? 'selected' : ''}>Для элемента и группы</option>
      </select>
    </div>`;
  }
  usageSection += `
    <div class="prop-row"><label>Индексировать</label>
      <select id="Indexing">
        <option value="DontIndex" ${indexing === 'DontIndex' ? 'selected' : ''}>Не индексировать</option>
        <option value="Index" ${indexing === 'Index' ? 'selected' : ''}>Индексировать</option>
      </select>
    </div>
    <div class="prop-row"><label>Полнотекстовый поиск</label>
      <select id="FullTextSearch">
        <option value="Use" ${fullTextSearch === 'Use' ? 'selected' : ''}>Использовать</option>
        <option value="DontUse" ${fullTextSearch === 'DontUse' ? 'selected' : ''}>Не использовать</option>
      </select>
    </div>
    <div class="prop-row"><label>История данных</label>
      <select id="DataHistory">
        <option value="Use" ${dataHistory === 'Use' ? 'selected' : ''}>Использовать</option>
        <option value="DontUse" ${dataHistory === 'DontUse' ? 'selected' : ''}>Не использовать</option>
      </select>
    </div>`;
  if (isDimension) {
    usageSection += `
    <div class="prop-row"><label>Режим сокращения типа</label>
      <select id="TypeReductionMode">
        ${typeReductionOpts.map(o => `<option value="${o.v}" ${typeReductionMode === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
      </select>
    </div>`;
  }

  const hasNumberQuals = attr.numberDigits !== undefined || attr.numberFractionDigits !== undefined || (type && type.includes('Число'));
  let presentationSection = `
    <div class="prop-row"><label><input type="checkbox" id="PasswordMode" ${passwordMode ? 'checked' : ''}> Режим пароля</label></div>
    <div class="prop-row"><label>Подсказка</label><textarea id="ToolTip" rows="2">${escapeHtml(toolTip)}</textarea></div>
    <div class="prop-row"><label>Маска</label><input type="text" id="Mask" value="${escapeHtml(mask)}"></div>
    <div class="prop-row"><label><input type="checkbox" id="MultiLine" ${multiLine ? 'checked' : ''}> Многострочный режим</label></div>
    <div class="prop-row"><label><input type="checkbox" id="ExtendedEdit" ${extendedEdit ? 'checked' : ''}> Расширенное редактирование</label></div>`;
  if (hasNumberQuals) {
    presentationSection += `
    <div class="prop-row"><label>Формат</label><input type="text" id="Format" value="${escapeHtml(format)}"></div>
    <div class="prop-row"><label>Формат редактирования</label><input type="text" id="EditFormat" value="${escapeHtml(editFormat)}"></div>
    <div class="prop-row"><label><input type="checkbox" id="MarkNegatives" ${markNegatives ? 'checked' : ''}> Выделять отрицательные</label></div>
    <div class="prop-row"><label>Минимальное значение</label><input type="text" id="MinValue" value="${escapeHtml(minValue)}"></div>
    <div class="prop-row"><label>Максимальное значение</label><input type="text" id="MaxValue" value="${escapeHtml(maxValue)}"></div>`;
  }
  presentationSection += `
    <div class="prop-row"><label><input type="checkbox" id="FillFromFillingValue" ${fillFromFillingValue ? 'checked' : ''}> Заполнять из данных заполнения</label></div>
    <div class="prop-row"><label>Значение заполнения</label><input type="text" id="FillValue" value="${escapeHtml(fillValue)}"></div>
    <div class="prop-row"><label>Проверка заполнения</label>
      <select id="FillChecking">
        <option value="DontCheck" ${fillChecking === 'DontCheck' ? 'selected' : ''}>Не проверять</option>
        <option value="ShowError" ${fillChecking === 'ShowError' ? 'selected' : ''}>Выдавать ошибку</option>
      </select>
    </div>`;

  const choiceSection = (attr.choiceFoldersAndItems !== undefined || type.includes('Ссылка')) ? `
    <div class="prop-row"><label>Выбор групп и элементов</label>
      <select id="ChoiceFoldersAndItems">
        <option value="Items" ${choiceFoldersAndItems === 'Items' ? 'selected' : ''}>Элементы</option>
        <option value="Folders" ${choiceFoldersAndItems === 'Folders' ? 'selected' : ''}>Группы</option>
        <option value="FoldersAndItems" ${choiceFoldersAndItems === 'FoldersAndItems' ? 'selected' : ''}>Группы и элементы</option>
      </select>
    </div>
    <div class="prop-row"><label>Связи параметров выбора</label><input type="text" id="ChoiceParameterLinks" value="${escapeHtml(choiceParameterLinks)}"></div>
    <div class="prop-row"><label>Параметры выбора</label><input type="text" id="ChoiceParameters" value="${escapeHtml(choiceParameters)}"></div>
    <div class="prop-row"><label>Форма выбора</label><input type="text" id="ChoiceForm" value="${escapeHtml(choiceForm)}"></div>
    <div class="prop-row"><label>Быстрый выбор</label>
      <select id="QuickChoice">
        <option value="Auto" ${quickChoice === 'Auto' ? 'selected' : ''}>Авто</option>
        <option value="DontUse" ${quickChoice === 'DontUse' ? 'selected' : ''}>Не использовать</option>
        <option value="Use" ${quickChoice === 'Use' ? 'selected' : ''}>Использовать</option>
      </select>
    </div>
    <div class="prop-row"><label>Создание при вводе</label>
      <select id="CreateOnInput">
        <option value="Auto" ${createOnInput === 'Auto' ? 'selected' : ''}>Авто</option>
        <option value="DontUse" ${createOnInput === 'DontUse' ? 'selected' : ''}>Не использовать</option>
        <option value="Use" ${createOnInput === 'Use' ? 'selected' : ''}>Использовать</option>
      </select>
    </div>
    <div class="prop-row"><label>История выбора при вводе</label>
      <select id="ChoiceHistoryOnInput">
        <option value="Auto" ${choiceHistoryOnInput === 'Auto' ? 'selected' : ''}>Авто</option>
        <option value="DontUse" ${choiceHistoryOnInput === 'DontUse' ? 'selected' : ''}>Не использовать</option>
      </select>
    </div>
    <div class="prop-row"><label>Связь по типу</label><input type="text" id="LinkByType" value="${escapeHtml(linkByType)}"></div>` : `
    <div class="prop-row"><label>Быстрый выбор</label>
      <select id="QuickChoice">
        <option value="Auto" ${quickChoice === 'Auto' ? 'selected' : ''}>Авто</option>
        <option value="DontUse" ${quickChoice === 'DontUse' ? 'selected' : ''}>Не использовать</option>
        <option value="Use" ${quickChoice === 'Use' ? 'selected' : ''}>Использовать</option>
      </select>
    </div>
    <div class="prop-row"><label>Создание при вводе</label>
      <select id="CreateOnInput">
        <option value="Auto" ${createOnInput === 'Auto' ? 'selected' : ''}>Авто</option>
        <option value="DontUse" ${createOnInput === 'DontUse' ? 'selected' : ''}>Не использовать</option>
        <option value="Use" ${createOnInput === 'Use' ? 'selected' : ''}>Использовать</option>
      </select>
    </div>
    <div class="prop-row"><label>История выбора при вводе</label>
      <select id="ChoiceHistoryOnInput">
        <option value="Auto" ${choiceHistoryOnInput === 'Auto' ? 'selected' : ''}>Авто</option>
        <option value="DontUse" ${choiceHistoryOnInput === 'DontUse' ? 'selected' : ''}>Не использовать</option>
      </select>
    </div>
    <div class="prop-row"><label>Связь по типу</label><input type="text" id="LinkByType" value="${escapeHtml(linkByType)}"></div>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Свойства: ${escapeHtml(name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; margin: 0; background: #fdfdf5; color: #000; }
    .header-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #ccc; }
    .header-title { font-weight: 600; font-size: 1.1em; }
    .section { margin-bottom: 16px; }
    .section-title { font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .prop-row { display: flex; align-items: center; margin-bottom: 8px; }
    .prop-row label { width: 260px; font-size: 0.9em; }
    .prop-row input, .prop-row select, .prop-row textarea { flex: 1; max-width: 400px; padding: 4px 6px; border: 1px solid #999; background: #fff; }
    .prop-row input[type="checkbox"] { max-width: auto; width: 16px; margin-right: 4px; }
    .prop-row textarea { min-height: 40px; }
    .type-input-wrap { display: flex; flex: 1; max-width: 400px; gap: 4px; }
    .type-input-wrap input { flex: 1; }
    .type-btn { padding: 2px 10px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border); }
    .type-modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
    .type-modal.active { display: flex; }
    .type-modal-content { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); width: 420px; max-height: 85vh; border: 1px solid var(--vscode-widget-border); border-radius: 4px; display: flex; flex-direction: column; }
    .type-modal-header { padding: 8px 12px; font-weight: 600; border-bottom: 1px solid var(--vscode-widget-border); display: flex; justify-content: space-between; }
    .type-modal-body { padding: 12px; overflow-y: auto; flex: 1; }
    .type-search { width: 100%; padding: 6px 8px; margin-bottom: 8px; }
    .type-tree { max-height: 350px; overflow-y: auto; border: 1px solid var(--vscode-input-border); padding: 8px; }
    .type-tree-item { padding: 2px 0; }
    .type-tree-item label { cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .type-tree-cat { cursor: pointer; font-weight: 500; padding: 4px 0; display: flex; align-items: center; gap: 6px; }
    .type-tree-cat .type-tree-toggle { font-size: 10px; width: 14px; }
    .type-tree-children { margin-left: 20px; }
    .type-tree-children.collapsed { display: none; }
    .type-tree-item label { display: flex; align-items: center; gap: 6px; }
    .type-icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
    .type-params { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--vscode-widget-border); }
    .type-params-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .type-params-row label { min-width: 120px; }
    .type-params-row input, .type-params-row select { flex: 1; max-width: 180px; padding: 4px 6px; }
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
    ${mainSection}
  </div>
  <div class="section">
    <div class="section-title">Использование</div>
    ${usageSection}
  </div>
  <div class="section">
    <div class="section-title">Представление</div>
    ${presentationSection}
  </div>
  <div class="section">
    <div class="section-title">Выбор и ввод</div>
    ${choiceSection}
  </div>
  <div id="status" style="margin-top:8px;font-size:0.9em;color:var(--vscode-errorForeground);"></div>

  <div class="type-modal" id="typeModal">
    <div class="type-modal-content">
      <div class="type-modal-header">
        <span>Редактирование типа данных</span>
        <span style="cursor:pointer" id="typeModalClose">&times;</span>
      </div>
      <div class="type-modal-body">
        <label><input type="checkbox" id="typeComposite"> Составной тип данных</label>
        <input type="text" class="type-search" id="typeSearch" placeholder="Поиск (Ctrl+Alt+M)">
        <div class="type-tree" id="typeTree"></div>
        <div class="type-params" id="typeParams">
          <div id="typeParamsNumber" class="type-params-block" style="display:none">
            <div class="type-params-row"><label>Длина</label><input type="number" id="paramNumberDigits" min="1" value="10"></div>
            <div class="type-params-row"><label>Точность</label><input type="number" id="paramNumberFractionDigits" min="0" value="0"></div>
            <div class="type-params-row"><label><input type="checkbox" id="paramNumberNonnegative"> Неотрицательное</label></div>
          </div>
          <div id="typeParamsString" class="type-params-block" style="display:none">
            <div class="type-params-row"><label>Длина</label><input type="number" id="paramStringLength" min="1" value="10"></div>
            <div class="type-params-row"><label>Допустимая длина</label><select id="paramStringAllowedLength"><option value="Fixed">Фиксированная</option><option value="Variable" selected>Переменная</option></select></div>
            <div class="type-params-row"><label><input type="checkbox" id="paramStringUnlimited"> Неограниченная</label></div>
          </div>
          <div id="typeParamsDate" class="type-params-block" style="display:none">
            <div class="type-params-row"><label>Состав даты</label><select id="paramDateFractions"><option value="Date">Дата</option><option value="Time">Время</option><option value="DateTime">Дата и время</option></select></div>
          </div>
        </div>
        <div style="margin-top:12px; text-align:right;">
          <button type="button" id="typeModalOkBtn" class="save-btn">OK</button>
          <button type="button" id="typeModalCancelBtn" style="margin-left:8px; padding:6px 16px;">Отмена</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const tagName = ${JSON.stringify(tagName || 'Attribute')};
    const availableTypes = ${availTypesJson};
    const formatType = (t) => {
      const m = { 'xs:string':'Строка','xs:decimal':'Число','xs:boolean':'Булево','xs:dateTime':'Дата','v8:ValueStorage':'ХранилищеЗначения','v8:UUID':'УникальныйИдентификатор','cfg:AnyRef':'ЛюбаяСсылка' };
      if (m[t]) return m[t];
      return t.replace(/^cfg:CatalogRef\\./,'СправочникСсылка.').replace(/^cfg:DocumentRef\\./,'ДокументСсылка.').replace(/^cfg:EnumRef\\./,'ПеречислениеСсылка.').replace(/^cfg:ChartOfCharacteristicTypesRef\\./,'ПланВидовХарактеристикСсылка.').replace(/^cfg:ChartOfAccountsRef\\./,'ПланСчетовСсылка.').replace(/^cfg:ChartOfCalculationTypesRef\\./,'ПланВидовРасчетаСсылка.').replace(/^cfg:BusinessProcessRef\\./,'БизнесПроцессСсылка.').replace(/^cfg:BusinessProcessRoutePointRef\\./,'ТочкаМаршрутаБизнесПроцессаСсылка.').replace(/^cfg:TaskRef\\./,'ЗадачаСсылка.').replace(/^cfg:ExchangePlanRef\\./,'ПланОбменаСсылка.');
    };
    const typeIcons = { 'xs:decimal':'123','xs:string':'abc','xs:dateTime':'31','xs:boolean':'✓','v8:ValueStorage':'▦','v8:UUID':'ID','cfg:AnyRef':'◉','cfg:TaskRef':'☑','cfg:ExchangePlanRef':'⇄' };
    const folderIcons = { 'Catalogs':'📁','Documents':'📄','Enums':'≡','ChartsOfCharacteristicTypes':'⊞','ChartsOfAccounts':'⊞','ChartsOfCalculationTypes':'⊞','BusinessProcesses':'⚙','BusinessProcessRoutePoints':'📍','Tasks':'☑','ExchangePlans':'⇄' };
    const primitives = [{label:'Число',val:'xs:decimal'},{label:'Строка',val:'xs:string'},{label:'Дата',val:'xs:dateTime'},{label:'Булево',val:'xs:boolean'},{label:'ХранилищеЗначения',val:'v8:ValueStorage'},{label:'УникальныйИдентификатор',val:'v8:UUID'}];
    const refCats = [{key:'Catalogs',label:'СправочникСсылка',prefix:'cfg:CatalogRef.',icon:'database'},{key:'Documents',label:'ДокументСсылка',prefix:'cfg:DocumentRef.',icon:'file-text'},{key:'Enums',label:'ПеречислениеСсылка',prefix:'cfg:EnumRef.',icon:'symbol-enum'},{key:'ChartsOfCharacteristicTypes',label:'ПланВидовХарактеристикСсылка',prefix:'cfg:ChartOfCharacteristicTypesRef.',icon:'symbol-structure'},{key:'ChartsOfAccounts',label:'ПланСчетовСсылка',prefix:'cfg:ChartOfAccountsRef.',icon:'symbol-structure'},{key:'ChartsOfCalculationTypes',label:'ПланВидовРасчетаСсылка',prefix:'cfg:ChartOfCalculationTypesRef.',icon:'symbol-numeric'},{key:'BusinessProcesses',label:'БизнесПроцессСсылка',prefix:'cfg:BusinessProcessRef.',icon:'circuit-board'},{key:'BusinessProcessRoutePoints',label:'ТочкаМаршрутаБизнесПроцессаСсылка',prefix:'cfg:BusinessProcessRoutePointRef.',icon:'location'},{key:'Tasks',label:'ЗадачаСсылка',prefix:'cfg:TaskRef.',icon:'tasklist'},{key:'ExchangePlans',label:'ПланОбменаСсылка',prefix:'cfg:ExchangePlanRef.',icon:'repo-pull'}];
    const standaloneRefs = [{label:'ЛюбаяСсылка',val:'cfg:AnyRef',icon:'◉'}];
    function getTypeIcon(val, catKey) {
      if (val && typeIcons[val]) return '<span class="type-icon">'+typeIcons[val]+'</span>';
      if (catKey && folderIcons[catKey]) return '<span class="type-icon">'+folderIcons[catKey]+'</span>';
      if (!val) return '<span class="type-icon">•</span>';
      const p = refCats.find(c => val.startsWith(c.prefix)); return p && folderIcons[p.key] ? '<span class="type-icon">'+folderIcons[p.key]+'</span>' : '<span class="type-icon">•</span>';
    }
    function renderTypeTree(selected, searchQ) {
      const tree = document.getElementById('typeTree');
      let html = '';
      const q = (searchQ || '').toLowerCase();
      const composite = document.getElementById('typeComposite').checked;
      primitives.forEach(p => {
        if (q && !p.label.toLowerCase().includes(q)) return;
        const icon = getTypeIcon(p.val);
        html += '<div class="type-tree-item"><label>'+icon+'<input type="checkbox" class="type-cb" value="'+p.val+'"> '+p.label+'</label></div>';
      });
      standaloneRefs.forEach(s => {
        if (q && !s.label.toLowerCase().includes(q)) return;
        html += '<div class="type-tree-item"><label>'+getTypeIcon(s.val)+'<input type="checkbox" class="type-cb" value="'+s.val+'"> '+s.label+'</label></div>';
      });
      refCats.forEach(c => {
        const items = (availableTypes[c.key] || []).filter(obj => !q || obj.toLowerCase().includes(q));
        const showCat = items.length > 0 || !q;
        if (!showCat) return;
        const catId = 'cat-'+c.key;
        html += '<div class="type-tree-cat" data-cat="'+c.key+'" data-collapsed="false"><span class="type-tree-toggle">[−]</span> '+getTypeIcon(null,c.key)+'<span>'+c.label+'</span></div><div class="type-tree-children" id="'+catId+'">';
        items.forEach(obj => {
          const val = c.prefix + obj;
          html += '<div class="type-tree-item"><label>'+getTypeIcon(val,c.key)+'<input type="checkbox" class="type-cb" value="'+val.replace(/"/g,'&quot;')+'"> '+obj+'</label></div>';
        });
        html += '</div>';
      });
      tree.innerHTML = html;
      tree.querySelectorAll('.type-tree-cat').forEach(cat => {
        cat.addEventListener('click', (e) => {
          if (e.target.classList.contains('type-cb')) return;
          const children = cat.nextElementSibling;
          if (!children) return;
          const collapsed = cat.dataset.collapsed === 'true';
          cat.dataset.collapsed = !collapsed;
          children.classList.toggle('collapsed', !collapsed);
          cat.querySelector('.type-tree-toggle').textContent = collapsed ? '[−]' : '[+]';
        });
      });
      tree.querySelectorAll('.type-cb').forEach(cb => {
        if (selected.includes(cb.value)) cb.checked = true;
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          const comp = document.getElementById('typeComposite').checked;
          if (!comp && cb.checked) {
            tree.querySelectorAll('.type-cb').forEach(o => { if (o !== cb) o.checked = false; });
          }
          updateTypeParamsVisibility();
        });
      });
      updateTypeParamsVisibility();
    }
    function updateTypeParamsVisibility() {
      const paramsNum = document.getElementById('typeParamsNumber');
      const paramsStr = document.getElementById('typeParamsString');
      const paramsDate = document.getElementById('typeParamsDate');
      if (!paramsNum || !paramsStr || !paramsDate) return;
      const checked = Array.from(document.querySelectorAll('#typeTree .type-cb:checked')).map(cb => cb.value);
      paramsNum.style.display = checked.includes('xs:decimal') ? 'block' : 'none';
      paramsStr.style.display = checked.includes('xs:string') ? 'block' : 'none';
      paramsDate.style.display = checked.includes('xs:dateTime') ? 'block' : 'none';
      const t = document.getElementById('Type');
      if (checked.includes('xs:decimal') && t) {
        const el = document.getElementById('paramNumberDigits'); if (el) el.value = t.dataset.numberDigits || '10';
        const el2 = document.getElementById('paramNumberFractionDigits'); if (el2) el2.value = t.dataset.numberFractionDigits || '0';
        const el3 = document.getElementById('paramNumberNonnegative'); if (el3) el3.checked = (t.dataset.numberAllowedSign || 'Any') !== 'Any';
      }
      if (checked.includes('xs:string') && t) {
        const el = document.getElementById('paramStringLength'); if (el) el.value = t.dataset.stringLength || '10';
        const el2 = document.getElementById('paramStringAllowedLength'); if (el2) el2.value = t.dataset.stringAllowedLength || 'Variable';
        const el3 = document.getElementById('paramStringUnlimited'); if (el3) el3.checked = t.dataset.stringUnlimitedLength === '1';
      }
      if (checked.includes('xs:dateTime') && t) {
        const el = document.getElementById('paramDateFractions'); if (el) el.value = t.dataset.dateFractions || 'Date';
      }
    }
    document.getElementById('typeComposite').addEventListener('change', () => {
      if (!document.getElementById('typeComposite').checked) {
        const checked = document.querySelectorAll('#typeTree .type-cb:checked');
        if (checked.length > 1) { checked.forEach((c,i) => { if (i > 0) c.checked = false; }); }
      }
      updateTypeParamsVisibility();
    });
    document.getElementById('TypeBtn').addEventListener('click', () => {
      let raw = [];
      try { raw = JSON.parse(document.getElementById('Type').dataset.raw || '[]'); } catch(e) {}
      document.getElementById('typeComposite').checked = raw.length > 1;
      renderTypeTree(raw);
      document.getElementById('typeSearch').value = '';
      document.getElementById('typeModal').classList.add('active');
    });
    document.getElementById('typeSearch').addEventListener('input', (e) => renderTypeTree(JSON.parse(document.getElementById('Type').dataset.raw || '[]'), e.target.value));
    document.getElementById('typeModalClose').addEventListener('click', () => document.getElementById('typeModal').classList.remove('active'));
    document.getElementById('typeModalCancelBtn').addEventListener('click', () => document.getElementById('typeModal').classList.remove('active'));
    document.getElementById('typeModalOkBtn').addEventListener('click', () => {
      const sel = Array.from(document.querySelectorAll('#typeTree .type-cb:checked')).map(cb => cb.value);
      if (sel.length === 0) { alert('Выберите хотя бы один тип данных'); return; }
      const t = document.getElementById('Type');
      t.dataset.raw = JSON.stringify(sel);
      t.value = sel.map(formatType).join(', ');
      if (sel.includes('xs:decimal')) {
        t.dataset.numberDigits = document.getElementById('paramNumberDigits').value;
        t.dataset.numberFractionDigits = document.getElementById('paramNumberFractionDigits').value;
        t.dataset.numberAllowedSign = document.getElementById('paramNumberNonnegative').checked ? 'Nonnegative' : 'Any';
      }
      if (sel.includes('xs:string')) {
        t.dataset.stringLength = document.getElementById('paramStringLength').value;
        t.dataset.stringAllowedLength = document.getElementById('paramStringAllowedLength').value;
        t.dataset.stringUnlimitedLength = document.getElementById('paramStringUnlimited').checked ? '1' : '0';
      }
      if (sel.includes('xs:dateTime')) {
        t.dataset.dateFractions = document.getElementById('paramDateFractions').value;
      }
      document.getElementById('typeModal').classList.remove('active');
    });
    const saveBtn = document.getElementById('saveBtn');
    const getData = () => {
      const rawStr = document.getElementById('Type').dataset.raw;
      let Type;
      try { Type = rawStr ? JSON.parse(rawStr) : undefined; } catch(e) {}
      return {
        Name: document.getElementById('Name').value,
        Synonym: document.getElementById('Synonym').value,
        Comment: document.getElementById('Comment').value,
        Type: Type,
        Use: document.getElementById('Use')?.value,
        Indexing: document.getElementById('Indexing').value,
        FullTextSearch: document.getElementById('FullTextSearch').value,
        DataHistory: document.getElementById('DataHistory').value,
        ToolTip: document.getElementById('ToolTip').value,
        FillFromFillingValue: document.getElementById('FillFromFillingValue').checked ? 'true' : 'false',
        FillValue: document.getElementById('FillValue').value,
        FillChecking: document.getElementById('FillChecking').value,
        ChoiceFoldersAndItems: document.getElementById('ChoiceFoldersAndItems')?.value,
        QuickChoice: document.getElementById('QuickChoice').value,
        CreateOnInput: document.getElementById('CreateOnInput').value,
        ChoiceHistoryOnInput: document.getElementById('ChoiceHistoryOnInput').value,
        ChoiceForm: document.getElementById('ChoiceForm')?.value || '',
        LinkByType: document.getElementById('LinkByType')?.value || '',
        ChoiceParameterLinks: document.getElementById('ChoiceParameterLinks')?.value || '',
        ChoiceParameters: document.getElementById('ChoiceParameters')?.value || '',
        PasswordMode: document.getElementById('PasswordMode').checked,
        Format: document.getElementById('Format')?.value || '',
        EditFormat: document.getElementById('EditFormat')?.value || '',
        MarkNegatives: document.getElementById('MarkNegatives')?.checked,
        Mask: document.getElementById('Mask')?.value || '',
        MultiLine: document.getElementById('MultiLine')?.checked,
        ExtendedEdit: document.getElementById('ExtendedEdit')?.checked,
        MinValue: document.getElementById('MinValue')?.value || '',
        MaxValue: document.getElementById('MaxValue')?.value || '',
        DenyIncompleteValues: document.getElementById('DenyIncompleteValues')?.checked ?? false,
        Master: document.getElementById('Master')?.checked ?? false,
        MainFilter: document.getElementById('MainFilter')?.checked ?? false,
        UseInTotals: document.getElementById('UseInTotals')?.checked ?? true,
        TypeReductionMode: document.getElementById('TypeReductionMode')?.value || 'TransformValues',
        stringLength: document.getElementById('Type')?.dataset?.stringLength,
        stringAllowedLength: document.getElementById('Type')?.dataset?.stringAllowedLength,
        stringUnlimitedLength: document.getElementById('Type')?.dataset?.stringUnlimitedLength === '1',
        numberDigits: document.getElementById('Type')?.dataset?.numberDigits,
        numberFractionDigits: document.getElementById('Type')?.dataset?.numberFractionDigits,
        numberAllowedSign: document.getElementById('Type')?.dataset?.numberAllowedSign || 'Any',
        dateFractions: document.getElementById('Type')?.dataset?.dateFractions
      };
    };
    const dataKeys = () => {
      const d = getData();
      return JSON.stringify(d);
    };
    let initialData = dataKeys();
    const hasChanges = () => dataKeys() !== initialData;
    const updateBtn = () => {
      saveBtn.classList.toggle('muted', !hasChanges());
    };
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.id && !el.closest('.type-modal')) {
        el.addEventListener('input', updateBtn);
        el.addEventListener('change', updateBtn);
      }
    });
    document.getElementById('TypeBtn')?.addEventListener('click', () => { setTimeout(updateBtn, 0); });
    document.getElementById('typeModalOkBtn')?.addEventListener('click', () => { setTimeout(updateBtn, 0); });
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
        initialData = dataKeys();
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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function openRequisitePropertiesWebview(context, treeItem, options = {}) {
  if (!treeItem || (treeItem.contextValue !== 'attrItem' && treeItem.contextValue !== 'dimensionOrResourceItem')) return;

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Откройте папку проекта');
    return;
  }

  const basePath = treeItem.basePath;
  const objectName = treeItem.objectName;
  const attrUuid = treeItem.attrUuid;
  const rootPath = workspaceFolders[0].uri.fsPath;
  let xmlPath = path.join(path.dirname(basePath), objectName + '.xml');
  const fs = require('fs');
  if (!fs.existsSync(xmlPath) && treeItem.folderName) {
    xmlPath = path.join(rootPath, treeItem.folderName, objectName + '.xml');
  }

  let attr;
  let parsed;
  let useAttributeLike = false;
  let tagName = 'Attribute';

  if (treeItem.contextValue === 'dimensionOrResourceItem' && treeItem.attrTagName) {
    useAttributeLike = true;
    tagName = treeItem.attrTagName;
  }

  try {
    attr = await parseAttributeLikeByUuid(xmlPath, attrUuid);
  } catch (err) {
    vscode.window.showErrorMessage('Ошибка чтения XML: ' + err.message);
    return;
  }

  if (!attr) {
    try {
      parsed = await parseMetadataObjectXml(xmlPath);
      attr = parsed.attributes.find(a => a.uuid === attrUuid);
      useAttributeLike = false;
    } catch {
      vscode.window.showErrorMessage('Реквизит не найден');
      return;
    }
  } else {
    useAttributeLike = true;
    tagName = attr.tagName || tagName;
  }

  if (!attr) {
    vscode.window.showErrorMessage('Реквизит не найден');
    return;
  }

  const viewColumn = options.viewColumn ?? (options.asSubordinate ? vscode.ViewColumn.Beside : (vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One));

  const panelKey = `requisite:${normalizePath(xmlPath)}:${attrUuid}`;
  if (tryReveal(panelKey, viewColumn)) return;

  const panel = vscode.window.createWebviewPanel(
    '1cRequisiteProperties',
    `Свойства: ${attr.name}`,
    viewColumn,
    { enableScripts: true }
  );

  const availableTypes = await require('./metadataTypesHelper').getAvailableTypes(rootPath);
  panel.webview.html = getRequisitePropertiesHtml(attr, xmlPath, tagName, availableTypes);

  register(panelKey, panel);

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'save') {
      try {
        if (useAttributeLike) {
          const data = message.data;
          const changes = {
            Name: data.Name,
            Synonym: data.Synonym,
            Comment: data.Comment,
            Type: data.Type,
            Use: data.Use,
            Indexing: data.Indexing,
            FullTextSearch: data.FullTextSearch,
            DataHistory: data.DataHistory,
            ToolTip: data.ToolTip,
            FillFromFillingValue: data.FillFromFillingValue,
            FillValue: data.FillValue,
            FillChecking: data.FillChecking,
            ChoiceFoldersAndItems: data.ChoiceFoldersAndItems,
            QuickChoice: data.QuickChoice,
            CreateOnInput: data.CreateOnInput,
            ChoiceHistoryOnInput: data.ChoiceHistoryOnInput,
            ChoiceForm: data.ChoiceForm,
            LinkByType: data.LinkByType,
            ChoiceParameterLinks: data.ChoiceParameterLinks,
            ChoiceParameters: data.ChoiceParameters,
            PasswordMode: data.PasswordMode,
            Format: data.Format,
            EditFormat: data.EditFormat,
            MarkNegatives: data.MarkNegatives,
            Mask: data.Mask,
            MultiLine: data.MultiLine,
            ExtendedEdit: data.ExtendedEdit,
            MinValue: data.MinValue,
            MaxValue: data.MaxValue,
            DenyIncompleteValues: data.DenyIncompleteValues,
            Master: data.Master,
            MainFilter: data.MainFilter,
            UseInTotals: data.UseInTotals,
            TypeReductionMode: data.TypeReductionMode,
            stringLength: data.stringLength,
            stringAllowedLength: data.stringAllowedLength,
            stringUnlimitedLength: data.stringUnlimitedLength,
            numberDigits: data.numberDigits,
            numberFractionDigits: data.numberFractionDigits,
            numberAllowedSign: data.numberAllowedSign,
            dateFractions: data.dateFractions
          };
          await saveAttributeLikeInXml(xmlPath, attrUuid, tagName, changes);
        } else {
          const changes = { _attributes: { [attrUuid]: message.data } };
          await saveMetadataObjectXml(xmlPath, changes, parsed);
        }
        panel.webview.postMessage({ type: 'saved' });
        try {
          const { refreshObjectEditorIfNeeded } = require('./objectMetadataWebview');
          await refreshObjectEditorIfNeeded(xmlPath);
        } catch {
          // ignore
        }
      } catch (err) {
        panel.webview.postMessage({ type: 'error', message: err.message });
      }
    }
  });
}

module.exports = { openRequisitePropertiesWebview };
