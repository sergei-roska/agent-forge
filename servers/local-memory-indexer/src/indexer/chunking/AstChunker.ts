import fs from 'node:fs';
import { DEFAULT_CHUNK_MAX_LINES, DEFAULT_MAX_CHUNK_CHARS } from '../../constants.js';

export interface AstMetadata {
  language: string;
  node_type: string;
  class_name?: string;
  function_name?: string;
  symbol_path?: string;
}

export interface RawChunk {
  start_line: number; // 1-based
  end_line: number;   // 1-based, inclusive
  raw_text: string;
  ast_metadata: AstMetadata;
}

// ── Language definitions ──────────────────────────────────────────────────────

type LangKey = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'c' | 'cpp' | 'php';

const EXT_TO_LANG: Record<string, LangKey> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  php: 'php', module: 'php', install: 'php', theme: 'php', inc: 'php',
};

interface BoundaryMatch {
  node_type: string;
  name?: string;
  context?: string; // enclosing class name
}

// Patterns are tested against trimmed lines.
// Each returns { node_type, name } on match.
type BoundaryDetector = (line: string, trimmed: string) => BoundaryMatch | null;

const DETECTORS: Record<LangKey, BoundaryDetector> = {
  typescript: (_, t) => {
    // class
    let m = t.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (m) return { node_type: 'class_declaration', name: m[1] };
    // function declaration or arrow assigned to const
    m = t.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/);
    if (m) return { node_type: 'function_declaration', name: m[1] };
    m = t.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\()/);
    if (m) return { node_type: 'function_declaration', name: m[1] };
    // method (inside class — indented)
    m = t.match(/^(?:(?:public|private|protected|static|async|override|abstract|readonly)\s+)*(?:(?:get|set)\s+)?(\w+)\s*\(/);
    if (m && !['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(m[1]!))
      return { node_type: 'method_definition', name: m[1] };
    return null;
  },

  javascript: (_, t) => {
    let m = t.match(/^(?:export\s+)?(?:default\s+)?class\s+(\w+)/);
    if (m) return { node_type: 'class_declaration', name: m[1] };
    m = t.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/);
    if (m) return { node_type: 'function_declaration', name: m[1] };
    m = t.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\()/);
    if (m) return { node_type: 'function_declaration', name: m[1] };
    m = t.match(/^(?:(?:static|async|get|set)\s+)*(\w+)\s*\(/);
    if (m && !['if', 'for', 'while', 'switch', 'catch'].includes(m[1]!))
      return { node_type: 'method_definition', name: m[1] };
    return null;
  },

  python: (_, t) => {
    let m = t.match(/^(?:async\s+)?def\s+(\w+)/);
    if (m) return { node_type: 'function_definition', name: m[1] };
    m = t.match(/^class\s+(\w+)/);
    if (m) return { node_type: 'class_definition', name: m[1] };
    return null;
  },

  go: (_, t) => {
    let m = t.match(/^func\s+(?:\(\s*\w+\s+\*?\w+\s*\)\s+)?(\w+)/);
    if (m) return { node_type: 'function_declaration', name: m[1] };
    m = t.match(/^type\s+(\w+)\s+(?:struct|interface)/);
    if (m) return { node_type: 'type_declaration', name: m[1] };
    return null;
  },

  rust: (_, t) => {
    let m = t.match(/^(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (m) return { node_type: 'function_item', name: m[1] };
    m = t.match(/^(?:pub(?:\s*\([^)]*\))?\s+)?(?:struct|enum|trait|impl)\s+(\w+)/);
    if (m) return { node_type: 'item', name: m[1] };
    return null;
  },

  java: (_, t) => {
    let m = t.match(/^(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*(?:class|interface|enum|record)\s+(\w+)/);
    if (m) return { node_type: 'class_declaration', name: m[1] };
    m = t.match(/^(?:(?:public|private|protected|static|final|synchronized|native|abstract|default|override)\s+)+(?:[\w<>[\],\s]+\s+)?(\w+)\s*\(/);
    if (m) return { node_type: 'method_declaration', name: m[1] };
    return null;
  },

  c: (_, t) => {
    const m = t.match(/^(?:static\s+|inline\s+|extern\s+)?(?:[\w_*\s]+\s+)(\w+)\s*\(/);
    if (m && !['if', 'for', 'while', 'switch'].includes(m[1]!))
      return { node_type: 'function_definition', name: m[1] };
    return null;
  },

  cpp: (line, t) => {
    let m = t.match(/^(?:class|struct|namespace)\s+(\w+)/);
    if (m) return { node_type: 'class_specifier', name: m[1] };
    m = t.match(/^(?:(?:virtual|override|static|inline|explicit|constexpr|[[nodiscard]]\s+)*)?(?:[\w_:*<>\s]+\s+)(\w+)\s*\(/);
    if (m && !['if', 'for', 'while', 'switch'].includes(m[1]!))
      return { node_type: 'function_definition', name: m[1] };
    return null;
  },

  php: (_, t) => {
    let m = t.match(/^(?:(?:abstract|final)\s+)?class\s+(\w+)/);
    if (m) return { node_type: 'class_declaration', name: m[1] };
    m = t.match(/^interface\s+(\w+)/);
    if (m) return { node_type: 'interface_declaration', name: m[1] };
    m = t.match(/^trait\s+(\w+)/);
    if (m) return { node_type: 'trait_declaration', name: m[1] };
    m = t.match(/^(?:function\s+)(\w+)/);
    if (m) return { node_type: 'function_declaration', name: m[1] };
    m = t.match(/^(?:(?:public|protected|private|static|abstract|final)\s+)*(?:function\s+)(\w+)/);
    if (m && !['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(m[1]!))
      return { node_type: 'method_definition', name: m[1] };
    return null;
  },
};

// ── Chunker ───────────────────────────────────────────────────────────────────

const SNAP_WINDOW = 15; // lines to look back for a boundary snap

export class AstChunker {
  private readonly maxLines: number;
  private readonly maxChars: number;

  constructor(opts: { maxLines?: number; maxChars?: number } = {}) {
    this.maxLines = opts.maxLines ?? DEFAULT_CHUNK_MAX_LINES;
    this.maxChars = opts.maxChars ?? DEFAULT_MAX_CHUNK_CHARS;
  }

  async chunkFile(filePath: string): Promise<RawChunk[]> {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const lang = EXT_TO_LANG[ext];

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return [];
    }

    const lines = content.split('\n');
    const detector = lang ? DETECTORS[lang] : null;

    return this.buildChunks(lines, lang ?? 'unknown', detector);
  }

  private buildChunks(
    lines: string[],
    language: string,
    detector: BoundaryDetector | null,
  ): RawChunk[] {
    const chunks: RawChunk[] = [];
    let chunkStart = 0; // 0-based index
    let currentClass: string | undefined;

    // Pre-compute boundary positions
    const boundaries = new Set<number>();
    if (detector) {
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i]!.trimStart();
        const match = detector(lines[i]!, t);
        if (match) boundaries.add(i);
      }
    }

    while (chunkStart < lines.length) {
      let chunkEnd = Math.min(chunkStart + this.maxLines - 1, lines.length - 1);

      // Snap to nearest boundary before chunkEnd (within SNAP_WINDOW)
      if (detector && chunkEnd < lines.length - 1) {
        const snapFloor = Math.max(chunkStart + 1, chunkEnd - SNAP_WINDOW);
        let snapPoint = -1;
        for (let i = chunkEnd; i >= snapFloor; i--) {
          if (boundaries.has(i)) { snapPoint = i - 1; break; }
        }
        if (snapPoint > chunkStart) chunkEnd = snapPoint;
      }

      const chunkLines = lines.slice(chunkStart, chunkEnd + 1);
      const raw_text = chunkLines.join('\n').slice(0, this.maxChars);

      // Determine metadata from the first boundary line in this chunk
      let node_type = 'code_block';
      let function_name: string | undefined;
      let class_name: string | undefined;
      let symbol_path: string | undefined;

      if (detector) {
        for (let i = chunkStart; i <= chunkEnd; i++) {
          const rawLine = lines[i]!;
          const hasLeadingWhitespace = /^\s/.test(rawLine);
          const trimmed = rawLine.trim();
          if (!hasLeadingWhitespace && (trimmed.startsWith('function') || trimmed.startsWith('def') || trimmed.startsWith('func') || trimmed.startsWith('fn') || trimmed === '}')) {
            currentClass = undefined;
          }

          const t = lines[i]!.trimStart();
          const match = detector(lines[i]!, t);
          if (match) {
            node_type = match.node_type;
            if (match.node_type === 'class_declaration' || match.node_type === 'class_definition' ||
                match.node_type === 'class_specifier') {
              currentClass = match.name;
              class_name = match.name;
            } else if (match.name) {
              function_name = match.name;
              class_name = currentClass;
              symbol_path = currentClass ? `${currentClass}.${match.name}` : match.name;
            }
            break;
          }
        }
      }

      if (raw_text.trim().length > 0) {
        chunks.push({
          start_line: chunkStart + 1,
          end_line: chunkEnd + 1,
          raw_text,
          ast_metadata: { language, node_type, class_name, function_name, symbol_path },
        });
      }

      chunkStart = chunkEnd + 1;
    }

    return chunks;
  }
}
