'use strict';

jest.mock('fs/promises', () => ({ readFile: jest.fn() }));
const fs = require('fs/promises');
const { MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, validateUploadFile } = require('../../utils/uploadValidation');

describe('upload content validation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('accepts valid PDF magic bytes and rejects a mismatched extension', async () => {
    const pdf = Buffer.from('%PDF-1.7 sample');
    fs.readFile.mockResolvedValue(pdf);
    expect(await validateUploadFile({ originalname: 'drawing.pdf', path: 'p', size: pdf.length })).toBe(true);
    expect(await validateUploadFile({ originalname: 'drawing.jpg', path: 'p', size: pdf.length })).toBe(false);
  });

  test('rejects empty, oversized, disallowed, and malformed text uploads', async () => {
    expect(await validateUploadFile({ originalname: 'a.zip', path: 'p', size: 4 })).toBe(false);
    expect(ALLOWED_EXTENSIONS.has('.zip')).toBe(false);
    expect(await validateUploadFile({ originalname: 'a.csv', path: 'p', size: MAX_UPLOAD_BYTES + 1 })).toBe(false);
    fs.readFile.mockResolvedValue(Buffer.from([0xff, 0xfe, 0x00]));
    expect(await validateUploadFile({ originalname: 'a.csv', path: 'p', size: 3 })).toBe(false);
  });

  test('accepts PNG and Office Open XML only when their signatures match', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.readFile.mockResolvedValue(png);
    expect(await validateUploadFile({ originalname: 'a.png', path: 'p', size: png.length })).toBe(true);
    expect(await validateUploadFile({ originalname: 'a.docx', path: 'p', size: png.length })).toBe(false);
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    fs.readFile.mockResolvedValue(zipHeader);
    expect(await validateUploadFile({ originalname: 'a.docx', path: 'p', size: zipHeader.length })).toBe(true);
  });
});
