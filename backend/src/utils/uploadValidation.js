'use strict';

const path = require('path');
const fs = require('fs/promises');

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.docx', '.dwg', '.dxf', '.txt', '.csv']);

function has(bytes, signature, offset = 0) {
  return bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
}

function validText(bytes) {
  if (bytes.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch (_) { return false; }
}

async function validateUploadFile(file) {
  const ext = path.extname(file.originalname || file.path || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return false;
  let bytes;
  try { bytes = await fs.readFile(file.path, { flag: 'r' }); } catch (_) { return false; }
  if (bytes.length !== file.size) return false;
  switch (ext) {
    case '.jpg': case '.jpeg': return has(bytes, [0xff, 0xd8, 0xff]);
    case '.png': return has(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case '.gif': return bytes.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) != null;
    case '.webp': return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    case '.pdf': return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    case '.docx': return has(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case '.dwg': return /^AC10\d{2}/.test(bytes.subarray(0, 6).toString('ascii'));
    case '.dxf': return validText(bytes) && /^\s*0\r?\nSECTION\b/i.test(bytes.toString('utf8'));
    case '.txt': case '.csv': return validText(bytes);
    default: return false;
  }
}

module.exports = { MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, validateUploadFile };
