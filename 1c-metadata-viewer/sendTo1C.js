const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec } = require('child_process');

async function findChangedFiles(dir, markerTime, basePath = '') {
  let results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.compilings' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(await findChangedFiles(fullPath, markerTime, relativePath));
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.xml') || entry.name.endsWith('.bsl') || entry.name.endsWith('.mxl') || entry.name.endsWith('.bin') || entry.name.endsWith('.txt')) {
        // Пропускаем только искусственные файлы обычной формы (Form.bin существует)
        const normalizedPath = fullPath.replace(/\\/g, '/');
        if (entry.name === 'Form.txt' && normalizedPath.includes('/Ext/Form.txt')) continue;
        // Template.txt — содержимое макета, включаем. Form.txt — распакованная форма, исключаем выше
        if (entry.name === 'Module.bsl' && normalizedPath.includes('/Ext/Form/Module.bsl')) {
          const extDir = path.dirname(path.dirname(fullPath));
          if (fsSync.existsSync(path.join(extDir, 'Form.bin'))) continue; // обычная форма
        }
        
        const stats = await fs.stat(fullPath);
        if (stats.mtimeMs > markerTime) {
          results.push(relativePath.replace(/\\/g, '/'));
        }
      }
    }
  }
  return results;
}

/**
 * 
 * @param {*} outputChannel 
 * @param {*} commandConfig object with options:
 * - action: 'upload' | 'lock' | 'commit'
 * - targetObjects: [{ fullName: '...', includeChildObjects: true/false }]
 * - commitLabel: string (optional)
 * - commitComment: string (optional)
 * - launchAfterSuccess: 'designer' | 'enterprise' (optional) — после успешной отправки запустить 1С в указанном режиме
 */
async function sendTo1C(outputChannel, commandConfig = { action: 'upload' }) {
  const log = (msg) => {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
  };

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('Нет открытого рабочего пространства.');
    return false;
  }
  const rootPath = workspaceFolders[0].uri.fsPath;
  const compDir = path.join(rootPath, '.compilings');
  
  const action = commandConfig.action || 'upload';
  const taskName = action === 'lock' ? 'task.storageLock' :
                   action === 'commit' ? 'task.storageCommit' : 'task.uploadTo1c';
                   
  const taskDir = path.join(compDir, taskName);
  const markerFile = path.join(taskDir, '.last_1c_sync');
  const triggerFile = path.join(taskDir, taskName);
  const zipFile = path.join(taskDir, 'task.uploadTo1c.zip');
  const resultFile = path.join(taskDir, '1c_result.txt');
  const logFile = path.join(taskDir, '1c_run.log');
  const runFile = path.join(taskDir, `${taskName}.ps1`);

  const updateMarkerOnSuccess = async () => {
    if (action !== 'upload') return;
    try {
      const now = new Date();
      await fs.utimes(markerFile, now, now);
    } catch (e) {
      log(`Не удалось обновить маркер: ${e.message}`);
    }
  };

  // 1. Создаем папки, если их нет
  await fs.mkdir(compDir, { recursive: true });
  await fs.mkdir(taskDir, { recursive: true });

  // Чтение настроек
  const config = vscode.workspace.getConfiguration('1cMetadata');
  const workMode = config.get('workMode');
  const storageEnabled = config.get('storage.enabled');

  if (action === 'upload') {
    // 2. Проверка маркера
    let markerTime = 0;
    try {
      const stats = await fs.stat(markerFile);
      markerTime = stats.mtimeMs;
    } catch (e) {
      // Маркера нет, создаем
      await fs.writeFile(markerFile, '');
      vscode.window.showInformationMessage('Первый запуск: создан маркер .last_1c_sync. Внесите изменения в конфигурацию и запустите задачу снова!');
      return false;
    }

    // 3. Ищем измененные файлы
    log('Ищем измененные файлы...');
    const changedFiles = await findChangedFiles(rootPath, markerTime);

    let allPaths = new Set();

    // 4. Читаем уже существующие пути из trigger-файла
    try {
      const oldContent = await fs.readFile(triggerFile, 'utf8');
      let oldPaths = oldContent.replace(/\\/g, '/').split(/[,\r\n]+/).map((p) => p.trim()).filter(Boolean);
      if (storageEnabled && oldPaths.length > 0) {
        const stateManager = require('./stateManager');
        const { getFullNameFromFsPath } = require('./fullNameHelper');
        if (!stateManager.rootPath) await stateManager.init(rootPath);
        else await stateManager.load();
        oldPaths = oldPaths.filter((p) => {
          const fullName = getFullNameFromFsPath(p.replace(/\\/g, '/'));
          if (!fullName) return true;
          return stateManager.isCaptured(fullName);
        });
      }
      for (const p of oldPaths) allPaths.add(p);
    } catch (e) {
      // Файл не существует или не читается, игнорируем
    }

    if (changedFiles.length === 0) {
      if (workMode === 'local' && allPaths.size > 0) {
        log('Нет свежих файлов, но найден task.uploadTo1c. Повторная попытка отправки (локальный режим)...');
      } else {
        vscode.window.showInformationMessage('Нет свежих файлов для отправки.');
        return false;
      }
    }

    // 5. Обрабатываем новые пути — добавляем только реально изменённые файлы, без родительского XML
    for (const file of changedFiles) {
      allPaths.add(file);
    }

    // 6. Исключаем ConfigDumpInfo.xml и искусственные файлы распаковки обычных форм
    for (const p of Array.from(allPaths)) {
      const np = p.replace(/\\/g, '/');
      if (path.basename(p) === 'ConfigDumpInfo.xml') allPaths.delete(p);
      else if (np.includes('Ext/Form.txt')) allPaths.delete(p);
      else if (np.includes('Ext/Form/Module.bsl')) {
        // Module.bsl в Ext/Form/ — искусственный только у обычной формы (рядом есть Form.bin)
        const extRelative = np.replace(/\/Ext\/Form\/Module\.bsl$/, '/Ext');
        const binPath = path.join(rootPath, extRelative, 'Form.bin');
        if (fsSync.existsSync(binPath)) allPaths.delete(p);
      }
    }

    let uniquePaths = Array.from(allPaths);

    // 7.5. Если хранилище включено — исключаем файлы незахваченных объектов
    if (storageEnabled) {
      const stateManager = require('./stateManager');
      const { getFullNameFromFsPath } = require('./fullNameHelper');
      if (!stateManager.rootPath) await stateManager.init(rootPath);
      else await stateManager.load();
      const beforeCount = uniquePaths.length;
      uniquePaths = uniquePaths.filter((p) => {
        const fullName = getFullNameFromFsPath(p.replace(/\\/g, '/'));
        if (!fullName) return true; // файлы вне метаданных (Configuration.xml и т.п.) включаем
        return stateManager.isCaptured(fullName);
      });
      const excluded = beforeCount - uniquePaths.length;
      if (excluded > 0) {
        log(`Исключено ${excluded} файлов незахваченных объектов (хранилище включено)`);
      }
    }

    log(`Найдено файлов для отправки: ${uniquePaths.length}`);

    // 6.5. Добавляем UTF-8 BOM в Template.txt/Form.txt — 1С без BOM читает как CP1251
    const { ensureUtf8BomFor1C } = require('./encodingNormalizer');
    ensureUtf8BomFor1C(rootPath, uniquePaths);

    if (uniquePaths.length === 0) {
      const msg = storageEnabled
        ? 'Нет файлов для отправки. Все изменённые файлы относятся к объектам, не захваченным в хранилище.'
        : 'Нет файлов для отправки.';
      vscode.window.showInformationMessage(msg);
      return false;
    }

    // 7. Создаем ZIP архив
    log(`Архивируем файлы в ${zipFile}...`);
    const isWindows = process.platform === 'win32';
    const listFile = path.join(taskDir, 'files_to_zip.txt');
    try {
      if (isWindows) {
        const absolutePaths = uniquePaths.map(p => path.join(rootPath, p));
        await fs.writeFile(listFile, '\ufeff' + absolutePaths.join('\n'), 'utf8');
        const psCommand = `$files = Get-Content '${listFile.replace(/'/g, "''")}' -Encoding UTF8; Compress-Archive -Path $files -DestinationPath '${zipFile.replace(/'/g, "''")}' -Force; Remove-Item '${listFile.replace(/'/g, "''")}' -Force`;
        await new Promise((resolve, reject) => {
          exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, { cwd: rootPath }, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          });
        });
      } else {
        await fs.rm(zipFile, { force: true }).catch(() => {});
        await fs.writeFile(listFile, uniquePaths.join('\n'), 'utf8');
        const safeZip = zipFile.replace(/"/g, '\\"');
        const safeList = listFile.replace(/"/g, '\\"');
        
        const pyScript = `
import zipfile, sys, os
with open(sys.argv[2], 'r', encoding='utf-8') as f:
    files = [line.strip() for line in f if line.strip()]
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as zf:
    for file in files:
        if os.path.exists(file):
            zf.write(file, arcname=file)
`;
        const pyFile = path.join(taskDir, 'zip_maker.py');
        await fs.writeFile(pyFile, pyScript, 'utf8');

        await new Promise((resolve, reject) => {
          exec(`python3 "${pyFile}" "${safeZip}" "${safeList}"`, { cwd: rootPath, shell: true }, (error, stdout, stderr) => {
            if (error) {
              exec(`zip -q "${safeZip}" -@ < "${safeList}"`, { cwd: rootPath, shell: true }, (err, out, std) => {
                fs.unlink(listFile).catch(() => {});
                fs.unlink(pyFile).catch(() => {});
                if (err) reject(err);
                else resolve(out);
              });
            } else {
              fs.unlink(listFile).catch(() => {});
              fs.unlink(pyFile).catch(() => {});
              resolve(stdout);
            }
          });
        });
      }
    } catch (err) {
      log(`Ошибка при создании архива: ${err.message}`);
      vscode.window.showErrorMessage('Ошибка при создании архива.');
      return false;
    }

    const winPaths = uniquePaths.map(p => p.replace(/\//g, '\\'));
    const triggerContent = winPaths.join('\n');
    log(`Сохраняем триггер файл: ${triggerFile}`);
    await fs.writeFile(triggerFile, triggerContent, 'utf8');
    log('✅ Очередь обновлена! Файлы запакованы.');

  } else if (action === 'lock' || action === 'commit') {
    log(`Формируем XML файл для операции ${action}...`);
    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<Objects xmlns="http://v8.1c.ru/8.3/config/objects" version="1.0">\n`;
    for (const obj of (commandConfig.targetObjects || [])) {
      const inc = obj.includeChildObjects ? 'true' : 'false';
      xmlContent += `    <Object fullName="${obj.fullName}" includeChildObjects="${inc}" />\n`;
    }
    xmlContent += `</Objects>`;
    // Сохраняем в utf8 с BOM, как требует 1C
    await fs.writeFile(triggerFile, '\ufeff' + xmlContent, 'utf8');
    log(`Файл ${triggerFile} успешно создан.`);
  }

  const dbType = config.get('databaseType');
  const dbServer = config.get('server.server');
  const dbName = config.get('server.database');
  const dbUser = config.get('server.user') || '';
  const dbPass = config.get('server.password') || '';
  const fileDbPath = config.get('file.path');
  const repoPath = config.get('storage.path') || '';
  const repoUser = config.get('storage.user') || '';
  const repoPass = config.get('storage.password') || '';
  const disableStartupDialogs = config.get('disableStartupDialogs', false);
  const launchAfterSuccess = commandConfig.launchAfterSuccess; // 'designer' | 'enterprise'

  const v8exe = "C:\\Program Files\\1cv8\\common\\1cestart.exe";
  let ibConn = '';
  if (dbType === 'server') {
    ibConn = `/S "${dbServer}\\${dbName}"`;
  } else {
    ibConn = `/F "${fileDbPath}"`;
  }
  let repoArgs = '';
  if (storageEnabled && repoPath) {
    repoArgs = `/ConfigurationRepositoryF "${repoPath}" /ConfigurationRepositoryN "${repoUser}" /ConfigurationRepositoryP "${repoPass}"`;
  }
  let userArgs = '';
  if (dbUser) {
    userArgs = `/N "${dbUser}" /P "${dbPass}"`;
  }

  const launchMode = (launchAfterSuccess === 'designer' || launchAfterSuccess === 'enterprise') ? launchAfterSuccess.toUpperCase() : '';
  const launchAfterSuccessBlock = launchMode ? `
          $launchArgs = "${launchMode} $ibConn $userArgs $repoArgs $disableStartupDialogsArg".Trim()
          if ($launchArgs) {
              Start-Process -FilePath $v8exe -ArgumentList $launchArgs
          }
  ` : '';

  let cmdAction = '';
  if (action === 'upload') {
    cmdAction = `/LoadConfigFromFiles \`"$ProjectRoot\`" -listFile \`"$triggerFile\`" -NoCheck /UpdateDBCfg`;
  } else if (action === 'lock') {
    cmdAction = `/ConfigurationRepositoryLock -Objects \`"$triggerFile\`"`;
  } else if (action === 'commit') {
    cmdAction = `/ConfigurationRepositoryCommit -Objects \`"$triggerFile\`"`;
    if (commandConfig.commitComment) {
      cmdAction += ` -Comment \`"${commandConfig.commitComment.replace(/"/g, '""')}\`"`;
    }
  }

  const psScript = `
      $OutputEncoding = [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      
      # Вычисляем пути на лету
      $TaskDir = $PSScriptRoot
      $CompDir = Split-Path -LiteralPath $TaskDir
      $ProjectRoot = Split-Path -LiteralPath $CompDir
      $triggerFile = Join-Path $TaskDir '${taskName}'

      $v8exe = '${v8exe.replace(/'/g, "''")}'

      $resultFile = Join-Path $TaskDir '1c_result.txt'
      $logFile = Join-Path $TaskDir '1c_run.log'
      $zipFile = Join-Path $TaskDir 'task.uploadTo1c.zip'
      $runFile = Join-Path $TaskDir '${taskName}.ps1'

      $ibConn = '${ibConn.replace(/'/g, "''")}'
      $userArgs = '${userArgs.replace(/'/g, "''")}'
      $repoArgs = '${repoArgs.replace(/'/g, "''")}'
      $disableStartupDialogsArg = '${(disableStartupDialogs ? '/DisableStartupDialogs' : '').replace(/'/g, "''")}'

      $argsList = "DESIGNER $ibConn $userArgs $repoArgs $disableStartupDialogsArg -force /DumpResult \`"$resultFile\`" /Out \`"$logFile\`" ${cmdAction}"
      
      Write-Host "Zapuskau 1C dlya primeneniya izmenenij..."
      
      $pinfo = New-Object System.Diagnostics.ProcessStartInfo
      $pinfo.FileName = $v8exe
      $pinfo.Arguments = $argsList
      $pinfo.UseShellExecute = $false
      $process = [System.Diagnostics.Process]::Start($pinfo)
      $process.WaitForExit()
      
      # Ждем появления файла с результатом, но не более 3 минут
      $timeout = 180
      while (-not (Test-Path $resultFile) -and $timeout -gt 0) {
          Start-Sleep -Seconds 1
          $timeout--
      }
      
      $resultCode = 1
      if (Test-Path $resultFile) {
          $content = Get-Content $resultFile -Encoding UTF8 -Raw -ErrorAction SilentlyContinue
          if ($content -and $content.Trim() -eq '0') { $resultCode = 0 }
      }
      
      if ($resultCode -eq 0) {
          Write-Host "Uspeshno zaversheno (kod 0)!"
          
          $timestamp = Get-Date -Format "yyyy.MM.dd-HH.mm.ss"
          $historyDir = Join-Path $TaskDir $timestamp
          New-Item -ItemType Directory -Path $historyDir -Force | Out-Null
          
          if (Test-Path $triggerFile) { Copy-Item -Path $triggerFile -Destination $historyDir -Force -ErrorAction SilentlyContinue; Remove-Item $triggerFile -Force -ErrorAction SilentlyContinue }
          if (Test-Path $zipFile) { Copy-Item -Path $zipFile -Destination $historyDir -Force -ErrorAction SilentlyContinue; Remove-Item $zipFile -Force -ErrorAction SilentlyContinue }
          if (Test-Path $resultFile) { Copy-Item -Path $resultFile -Destination $historyDir -Force -ErrorAction SilentlyContinue; Remove-Item $resultFile -Force -ErrorAction SilentlyContinue }
          if (Test-Path $logFile) { Copy-Item -Path $logFile -Destination $historyDir -Force -ErrorAction SilentlyContinue; Remove-Item $logFile -Force -ErrorAction SilentlyContinue }
          if (Test-Path $runFile) { Copy-Item -Path $runFile -Destination $historyDir -Force -ErrorAction SilentlyContinue; Remove-Item $runFile -Force -ErrorAction SilentlyContinue }
          
          ${launchAfterSuccessBlock}
          
          exit 0
      } else {
          Write-Host "Oshibka 1C (rezultat iz DumpResult ne 0)"
          Remove-Item $runFile -Force -ErrorAction SilentlyContinue
          Remove-Item $logFile -Force -ErrorAction SilentlyContinue
          Remove-Item $resultFile -Force -ErrorAction SilentlyContinue
          exit 1
      }
    `;

  await fs.writeFile(runFile, '\ufeff' + psScript, 'utf8');

  const disableStartupDialogsArg = disableStartupDialogs ? '/DisableStartupDialogs' : '';
  const argsListForLog = `DESIGNER ${ibConn} ${userArgs} ${repoArgs} ${disableStartupDialogsArg} -force /DumpResult "${resultFile}" ${action === 'upload' ? '...' : cmdAction.replace(/`"/g, '"')}`;

  if (workMode === 'local') {
    log('Локальный режим: запуск 1С...');
    log(`Выполняем команду 1С: ${argsListForLog}`);

    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Операция с 1С (${action})`,
      cancellable: false
    }, async (progress) => {
      progress.report({ message: "Выполнение операции..." });
      try {
        await new Promise((resolve, reject) => {
          exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${runFile}"`, (error, stdout, stderr) => {
            log(stdout);
            if (stderr) log(stderr);
            if (error) reject(error);
            else updateMarkerOnSuccess().then(() => resolve(), reject);
          });
        });
        vscode.window.showInformationMessage(`Операция ${action} успешно выполнена в 1С!`);
        return true;
      } catch (err) {
        log(`Ошибка при запуске 1С: ${err.message}`);
        vscode.window.showErrorMessage(`Ошибка выполнения операции ${action} в 1С. Проверьте лог.`);
        return false;
      }
    });

  } else {
    log('Удаленный режим: файлы подготовлены. Скрипт на удаленном компьютере подхватит их.');
    vscode.window.showInformationMessage('Файлы подготовлены. Ожидание выполнения на удалённом компьютере...');

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fileExists = async (p) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    };

    const pollIntervalMs = 2000;
    const timeoutMs = 3 * 60 * 1000;
    const startTime = Date.now();
    let resolved = false;

    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Операция с 1С (${action}, удалённый режим)`,
      cancellable: false
    }, async (progress) => {
      while (!resolved && Date.now() - startTime < timeoutMs) {
        await sleep(pollIntervalMs);
        const runExists = await fileExists(runFile);
        const triggerExists = await fileExists(triggerFile);

        if (!runExists && triggerExists) {
          resolved = true;
          log('Удалённый режим: PS1 скрипт исчез, но trigger остался — операция не успешна.');
          vscode.window.showErrorMessage('Операция 1С не выполнена. Скрипт завершился с ошибкой.');
          return false;
        }
        if (!runExists && !triggerExists) {
          resolved = true;
          await updateMarkerOnSuccess();
          log('Удалённый режим: оба файла исчезли — операция успешна.');
          vscode.window.showInformationMessage(`Операция ${action} успешно выполнена в 1С!`);
          return true;
        }
        progress.report({ message: `Ожидание выполнения... (${Math.round((Date.now() - startTime) / 1000)} с)` });
      }

      if (!resolved) {
        log('Удалённый режим: таймаут 3 минуты. Результат неизвестен.');
        vscode.window.showWarningMessage('Таймаут ожидания (3 мин). Проверьте выполнение на удалённом компьютере.');
        return false;
      }
    });
  }
}

module.exports = { sendTo1C };
