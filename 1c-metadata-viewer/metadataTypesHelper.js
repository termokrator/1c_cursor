const path = require('path');
const fs = require('fs').promises;

async function getAvailableTypes(rootPath) {
  const types = {
    Catalogs: [],
    Documents: [],
    Enums: [],
    ChartsOfCharacteristicTypes: [],
    ChartsOfAccounts: [],
    ChartsOfCalculationTypes: [],
    BusinessProcesses: [],
    BusinessProcessRoutePoints: [],
    Tasks: [],
    ExchangePlans: []
  };

  for (const folder of Object.keys(types)) {
    if (folder === 'BusinessProcessRoutePoints') continue;
    try {
      const entries = await fs.readdir(path.join(rootPath, folder), { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          types[folder].push(e.name);
        } else if (e.isFile() && e.name.endsWith('.xml')) {
          types[folder].push(e.name.replace('.xml', ''));
        }
      }
    } catch {
      // ignore missing folders
    }
  }

  try {
    const bpPath = path.join(rootPath, 'BusinessProcesses');
    const bps = await fs.readdir(bpPath, { withFileTypes: true });
    for (const bp of bps) {
      if (bp.isDirectory()) {
        const rpPath = path.join(bpPath, bp.name, 'RoutePoints');
        try {
          const rps = await fs.readdir(rpPath, { withFileTypes: true });
          for (const rp of rps) {
            if (rp.isDirectory()) types.BusinessProcessRoutePoints.push(rp.name);
            else if (rp.isFile() && rp.name.endsWith('.xml')) types.BusinessProcessRoutePoints.push(rp.name.replace('.xml', ''));
          }
        } catch { /* no RoutePoints */ }
      }
    }
    types.BusinessProcessRoutePoints = [...new Set(types.BusinessProcessRoutePoints)].sort();
  } catch { /* no BusinessProcesses */ }

  for (const k of Object.keys(types)) {
    types[k] = [...new Set(types[k])].sort();
  }

  return types;
}

function formatTypeForDisplay(rawType) {
  const map = {
    'xs:string': 'Строка',
    'xs:decimal': 'Число',
    'xs:boolean': 'Булево',
    'xs:dateTime': 'Дата',
    'v8:ValueStorage': 'ХранилищеЗначения',
    'v8:UUID': 'УникальныйИдентификатор'
  };
  if (map[rawType]) return map[rawType];
  return rawType
    .replace(/^cfg:CatalogRef\./, 'СправочникСсылка.')
    .replace(/^cfg:DocumentRef\./, 'ДокументСсылка.')
    .replace(/^cfg:EnumRef\./, 'ПеречислениеСсылка.')
    .replace(/^cfg:ChartOfCharacteristicTypesRef\./, 'ПланВидовХарактеристикСсылка.')
    .replace(/^cfg:ChartOfAccountsRef\./, 'ПланСчетовСсылка.')
    .replace(/^cfg:ChartOfCalculationTypesRef\./, 'ПланВидовРасчетаСсылка.')
    .replace(/^cfg:BusinessProcessRef\./, 'БизнесПроцессСсылка.')
    .replace(/^cfg:TaskRef\./, 'ЗадачаСсылка.')
    .replace(/^cfg:ExchangePlanRef\./, 'ПланОбменаСсылка.');
}

module.exports = { getAvailableTypes, formatTypeForDisplay };
