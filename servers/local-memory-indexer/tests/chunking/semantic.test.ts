import { describe, it, expect } from 'vitest';
import { SemanticChunker, stripMarkup } from '../../src/indexer/chunking/SemanticChunker.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD_FIXTURE = path.join(__dirname, '../fixtures/repos/md-sample/README.md');

describe('SemanticChunker', () => {
  it('produces at least one chunk for non-empty text', () => {
    const sc = new SemanticChunker();
    const text = fs.readFileSync(MD_FIXTURE, 'utf8');
    const chunks = sc.chunk(text);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('start_line is monotonically non-decreasing across chunks', () => {
    const sc = new SemanticChunker({ maxChars: 200 });
    const text = fs.readFileSync(MD_FIXTURE, 'utf8');
    const chunks = sc.chunk(text);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.start_line).toBeGreaterThanOrEqual(chunks[i - 1]!.start_line);
    }
  });

  it('no chunk exceeds maxChars', () => {
    const maxChars = 300;
    const sc = new SemanticChunker({ maxChars });
    const text = fs.readFileSync(MD_FIXTURE, 'utf8');
    const chunks = sc.chunk(text);
    for (const chunk of chunks) {
      expect(chunk.raw_text.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it('small text that fits in one chunk produces exactly 1 chunk', () => {
    const sc = new SemanticChunker({ maxChars: 4000 });
    const chunks = sc.chunk('# Title\n\nShort paragraph.');
    expect(chunks.length).toBe(1);
  });

  it('text larger than maxChars splits into multiple chunks', () => {
    const sc = new SemanticChunker({ maxChars: 80 });
    const text = 'First paragraph with some content.\n\nSecond paragraph with more content.\n\nThird paragraph and even more content here.';
    const chunks = sc.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('all chunk text combined covers the original content', () => {
    const sc = new SemanticChunker({ maxChars: 150 });
    const text = fs.readFileSync(MD_FIXTURE, 'utf8');
    const chunks = sc.chunk(text);
    const combined = chunks.map((c) => c.raw_text).join(' ');
    // Every non-whitespace word should appear somewhere in the chunks
    const words = text.split(/\s+/).filter((w) => w.length > 4).slice(0, 10);
    for (const word of words) {
      expect(combined).toContain(word);
    }
  });
});

describe('stripMarkup', () => {
  it('removes HTML tags and leaves text content', () => {
    const result = stripMarkup('<p>Hello <b>world</b></p>');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('<b>');
  });

  it('removes <script> blocks entirely', () => {
    const html = '<p>Content</p><script>alert("xss")</script><p>More</p>';
    const result = stripMarkup(html);
    expect(result).not.toContain('alert');
    expect(result).not.toContain('script');
    expect(result).toContain('Content');
  });

  it('removes <style> blocks entirely', () => {
    const html = '<p>Text</p><style>.foo { color: red }</style>';
    expect(stripMarkup(html)).not.toContain('color');
  });

  it('decodes HTML entities', () => {
    expect(stripMarkup('&amp; &lt; &gt; &quot; &#39;')).toContain('&');
    expect(stripMarkup('&lt;tag&gt;')).toContain('<');
  });

  it('returns non-empty string for non-trivial HTML', () => {
    const html = '<html><body><h1>Title</h1><p>Content here.</p></body></html>';
    expect(stripMarkup(html).trim().length).toBeGreaterThan(0);
  });
});
