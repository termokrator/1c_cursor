/**
 * Пересохраняет файлы из CP1251 в UTF-8 с сохранением даты изменения.
 * Это нужно, чтобы файлы корректно отображались в редакторе, но не попадали
 * в список изменённых при отправке в 1С (mtime не меняется).
 */
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

// Проверяем, содержит ли буфер невалидный UTF-8 (признак CP1251 или другой кодировки)
function needsConversion(buffer) {
    const str = buffer.toString('utf8');
    return str.includes('\uFFFD'); // replacement character
}

function decodeFromCp1251(buffer) {
    try {
        const decoder = new TextDecoder('windows-1251');
        return decoder.decode(buffer);
    } catch (e) {
        try {
            const iconv = require('iconv-lite');
            return iconv.decode(buffer, 'win1251');
        } catch (e2) {
            return null;
        }
    }
}

async function normalizeEncodingToUtf8(workspaceRoot) {
    const patterns = [
        new vscode.RelativePattern(workspaceRoot, '**/Ext/Template.txt'),
        new vscode.RelativePattern(workspaceRoot, '**/Ext/Form.txt')
    ];
    const fileSet = new Set();
    for (const pattern of patterns) {
        const files = await vscode.workspace.findFiles(pattern);
        for (const f of files) fileSet.add(f.fsPath);
    }
    const files = Array.from(fileSet).map(p => ({ fsPath: p }));

    for (const file of files) {
        const filePath = file.fsPath;
        try {
            const buffer = fs.readFileSync(filePath);
            if (buffer.length === 0) continue;
            if (!needsConversion(buffer)) continue;

            const text = decodeFromCp1251(buffer);
            if (!text) continue;

            const stats = fs.statSync(filePath);
            const originalMtime = stats.mtime;
            const originalAtime = stats.atime;

            const utf8Buffer = Buffer.from(text, 'utf8');
            fs.writeFileSync(filePath, utf8Buffer, 'utf8');

            // Восстанавливаем исходную дату изменения
            fs.utimesSync(filePath, originalAtime, originalMtime);
        } catch (e) {
            console.error(`Encoding normalizer: error processing ${filePath}:`, e);
        }
    }
}

const UTF8_BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

/**
 * Добавляет UTF-8 BOM в Template.txt (и Form.txt), если его нет.
 * 1С без BOM интерпретирует файлы как ANSI (CP1251), что даёт крокозябры.
 */
function ensureUtf8BomFor1C(rootPath, filePaths) {
    const txtPattern = /[\/\\](?:Templates|Forms)\/[^\/\\]+[\/\\]Ext[\/\\](?:Template|Form)\.txt$/i;
    for (const relPath of filePaths) {
        const np = relPath.replace(/\\/g, '/');
        if (!txtPattern.test(np)) continue;
        const filePath = path.join(rootPath, relPath);
        try {
            const buffer = fs.readFileSync(filePath);
            if (buffer.length === 0) continue;
            if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) continue; // уже есть BOM
            const stats = fs.statSync(filePath);
            const content = buffer.toString('utf8');
            if (content.includes('\uFFFD')) continue; // невалидный UTF-8, не трогаем
            const withBom = Buffer.concat([UTF8_BOM, buffer]);
            fs.writeFileSync(filePath, withBom);
            fs.utimesSync(filePath, stats.atime, stats.mtime);
        } catch (e) {
            console.error(`ensureUtf8BomFor1C: ${filePath}`, e);
        }
    }
}

module.exports = { normalizeEncodingToUtf8, ensureUtf8BomFor1C };
