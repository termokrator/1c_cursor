const fs = require('fs');

const END_MARKER = 0x7fffffff;
const DEFAULT_BLOCK_SIZE = 512;

function readBlock(buffer, offset, maxDataLength = null) {
    if (offset + 31 > buffer.length) throw new Error('Invalid offset');
    
    const headerStr = buffer.toString('ascii', offset, offset + 31);
    const docSize = parseInt(headerStr.substring(2, 10), 16);
    const currentBlockSize = parseInt(headerStr.substring(11, 19), 16);
    const nextBlockOffset = parseInt(headerStr.substring(20, 28), 16);
    
    const readLen = maxDataLength !== null ? Math.min(currentBlockSize, maxDataLength) : Math.min(currentBlockSize, docSize);
    const data = buffer.subarray(offset + 31, offset + 31 + readLen);
    
    return { docSize, currentBlockSize, nextBlockOffset, data };
}

function readDocument(buffer, offset) {
    const headerBlock = readBlock(buffer, offset);
    const chunks = [headerBlock.data];
    let leftBytes = headerBlock.docSize - headerBlock.data.length;
    let nextBlockOffset = headerBlock.nextBlockOffset;
    
    while (leftBytes > 0 && nextBlockOffset !== END_MARKER) {
        const block = readBlock(buffer, nextBlockOffset, leftBytes);
        chunks.push(block.data);
        leftBytes -= block.data.length;
        nextBlockOffset = block.nextBlockOffset;
    }
    
    return { size: headerBlock.docSize, data: Buffer.concat(chunks) };
}

function extract(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 16) return [];
    
    const tocDoc = readDocument(buffer, 16);
    const tocData = tocDoc.data;
    const entries = [];
    
    for (let i = 0; i + 12 <= tocData.length; i += 12) {
        const attrOffset = tocData.readInt32LE(i);
        const dataOffset = tocData.readInt32LE(i + 4);
        if (attrOffset === END_MARKER || attrOffset === 0) break;
        entries.push({ attrOffset, dataOffset });
    }
    
    const files = [];
    for (const entry of entries) {
        const attrDoc = readDocument(buffer, entry.attrOffset);
        const dataDoc = readDocument(buffer, entry.dataOffset);
        
        const nameBuffer = attrDoc.data.subarray(20);
        let name = '';
        for (let i = 0; i < nameBuffer.length; i += 2) {
            const charCode = nameBuffer.readUInt16LE(i);
            if (charCode === 0) break;
            name += String.fromCharCode(charCode);
        }
        
        files.push({ name, data: dataDoc.data });
    }
    return files;
}

function getFileSize(fd) {
    return fs.fstatSync(fd).size;
}

function writeBlock(fd, dataBuf, offset = null, blockSize = null, nextBlockOffset = END_MARKER) {
    const size = dataBuf.length;
    if (offset === null) {
        offset = getFileSize(fd);
    }
    if (blockSize === null) {
        blockSize = Math.max(DEFAULT_BLOCK_SIZE, size);
    }
    
    const sizeHex = size.toString(16).padStart(8, '0');
    const blockSizeHex = blockSize.toString(16).padStart(8, '0');
    const nextBlockOffsetHex = nextBlockOffset.toString(16).padStart(8, '0');
    
    const headerStr = `\r\n${sizeHex} ${blockSizeHex} ${nextBlockOffsetHex} \r\n`;
    const headerBuf = Buffer.from(headerStr, 'ascii');
    
    const paddingSize = Math.max(0, blockSize - size);
    const padding = Buffer.alloc(paddingSize, 0);
    
    fs.writeSync(fd, headerBuf, 0, headerBuf.length, offset);
    fs.writeSync(fd, dataBuf, 0, dataBuf.length, offset + 31);
    if (padding.length > 0) {
        fs.writeSync(fd, padding, 0, padding.length, offset + 31 + size);
    }
    
    return offset;
}

function build(files, outputFile) {
    const fd = fs.openSync(outputFile, 'w+');
    
    // Header
    const header = Buffer.alloc(16, 0);
    header.writeInt32LE(END_MARKER, 0);
    header.writeInt32LE(DEFAULT_BLOCK_SIZE, 4);
    fs.writeSync(fd, header, 0, 16, 0);
    
    // Pad first block
    fs.writeSync(fd, Buffer.alloc(DEFAULT_BLOCK_SIZE + 31, 0), 0, DEFAULT_BLOCK_SIZE + 31, 16);
    
    const toc = [];
    
    for (const f of files) {
        // Attributes block
        const nameBuf = Buffer.from(f.name, 'utf16le');
        const attrBuf = Buffer.alloc(20 + nameBuf.length + 4, 0);
        nameBuf.copy(attrBuf, 20);
        
        const attrOffset = writeBlock(fd, attrBuf);
        const dataOffset = writeBlock(fd, f.data);
        
        toc.push({ attrOffset, dataOffset });
    }
    
    // TOC block
    const tocBuf = Buffer.alloc(toc.length * 12, 0);
    for (let i = 0; i < toc.length; i++) {
        tocBuf.writeInt32LE(toc[i].attrOffset, i * 12);
        tocBuf.writeInt32LE(toc[i].dataOffset, i * 12 + 4);
        tocBuf.writeInt32LE(END_MARKER, i * 12 + 8);
    }
    
    const tocBlocksCount = Math.floor(tocBuf.length / DEFAULT_BLOCK_SIZE) + 1;
    if (tocBlocksCount === 1) {
        writeBlock(fd, tocBuf, 16);
    } else {
        let currentOffset = 16;
        let bufOffset = 0;
        for (let i = 0; i < tocBlocksCount; i++) {
            const chunk = tocBuf.subarray(bufOffset, bufOffset + DEFAULT_BLOCK_SIZE);
            bufOffset += DEFAULT_BLOCK_SIZE;
            
            const nextOffset = (i === tocBlocksCount - 1) ? END_MARKER : getFileSize(fd);
            writeBlock(fd, chunk, currentOffset, DEFAULT_BLOCK_SIZE, nextOffset);
            currentOffset = nextOffset;
        }
    }
    
    fs.closeSync(fd);
}

module.exports = {
    extract,
    build
};
