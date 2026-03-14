const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const v8container = require('./v8container');

async function unpackAllForms(workspaceRoot) {
    // Look for Form.bin in Forms/**/Ext/
    // We'll also check Forms/**/Ext/Form/ just in case
    const patterns = [
        new vscode.RelativePattern(workspaceRoot, '**/Forms/*/Ext/Form.bin'),
        new vscode.RelativePattern(workspaceRoot, '**/Forms/*/Ext/Form/Form.bin')
    ];
    
    for (const pattern of patterns) {
        const files = await vscode.workspace.findFiles(pattern);
        
        for (const file of files) {
            const binPath = file.fsPath;
            
            // Determine the Ext directory.
            // If bin is at Ext/Form.bin, extDir is Ext
            // If bin is at Ext/Form/Form.bin, extDir is Ext
            let extDir = path.dirname(binPath);
            if (path.basename(extDir).toLowerCase() === 'form') {
                extDir = path.dirname(extDir);
            }
            
            const formDirPath = path.join(extDir, 'Form');
            
            try {
                const unpackedFiles = v8container.extract(binPath);
                
                if (unpackedFiles.length > 0) {
                    if (!fs.existsSync(formDirPath)) {
                        fs.mkdirSync(formDirPath, { recursive: true });
                    }
                    
                    for (const f of unpackedFiles) {
                        if (f.name === 'form') {
                            // As requested, fallback to Form.txt since XML conversion is too complex
                            fs.writeFileSync(path.join(extDir, 'Form.txt'), f.data);
                        } else if (f.name === 'module') {
                            fs.writeFileSync(path.join(formDirPath, 'Module.bsl'), f.data);
                        } else {
                            fs.writeFileSync(path.join(formDirPath, f.name), f.data);
                        }
                    }
                }
            } catch (e) {
                console.error(`Error unpacking ${binPath}:`, e);
            }
        }
    }
}

async function packAllForms(workspaceRoot) {
    // Look for Form.txt which means we unpacked an ordinary form
    const pattern = new vscode.RelativePattern(workspaceRoot, '**/Forms/*/Ext/Form.txt');
    const files = await vscode.workspace.findFiles(pattern);
    
    for (const file of files) {
        const formTxtPath = file.fsPath;
        const extDir = path.dirname(formTxtPath);
        const formDirPath = path.join(extDir, 'Form');
        
        // Find where Form.bin is. We prioritize Ext/Form/Form.bin, then Ext/Form.bin
        let binPath = path.join(formDirPath, 'Form.bin');
        if (!fs.existsSync(binPath)) {
            binPath = path.join(extDir, 'Form.bin');
        }
        
        if (fs.existsSync(binPath)) {
            try {
                const filesToPack = [];
                let needRepack = false;
                const binMtime = fs.statSync(binPath).mtimeMs;
                
                // Read Form.txt
                if (fs.existsSync(formTxtPath)) {
                    if (fs.statSync(formTxtPath).mtimeMs > binMtime) needRepack = true;
                    filesToPack.push({
                        name: 'form',
                        data: fs.readFileSync(formTxtPath)
                    });
                }
                
                // Read Module.bsl
                const modulePath = path.join(formDirPath, 'Module.bsl');
                if (fs.existsSync(modulePath)) {
                    if (fs.statSync(modulePath).mtimeMs > binMtime) needRepack = true;
                    filesToPack.push({
                        name: 'module',
                        data: fs.readFileSync(modulePath)
                    });
                }
                
                if (filesToPack.length > 0 && needRepack) {
                    v8container.build(filesToPack, binPath);
                    const now = new Date();
                    fs.utimesSync(binPath, now, now);
                }
            } catch (e) {
                console.error(`Error packing to ${binPath}:`, e);
            }
        }
    }
}

module.exports = {
    unpackAllForms,
    packAllForms
};
