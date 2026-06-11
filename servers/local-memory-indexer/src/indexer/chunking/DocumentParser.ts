import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Extract plain text from a PDF file. Returns empty string on failure. */
export async function parsePdf(filePath: string): Promise<string> {
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');
  const { readFile } = await import('node:fs/promises');
  try {
    const buf = await readFile(filePath);
    const result = await pdfParse(buf);
    return result.text ?? '';
  } catch {
    return '';
  }
}

/** Extract plain text from a .docx file. Returns empty string on failure. */
export async function parseDocx(filePath: string): Promise<string> {
  const mammoth: { extractRawText(opts: { path: string }): Promise<{ value: string }> } =
    require('mammoth');
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value ?? '';
  } catch {
    return '';
  }
}

/** Route by extension; returns extracted text or null if unsupported. */
export async function parseDocument(filePath: string): Promise<string | null> {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return parsePdf(filePath);
  if (ext === 'docx') return parseDocx(filePath);
  return null;
}
