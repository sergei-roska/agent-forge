import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import Go from 'tree-sitter-go';
import Rust from 'tree-sitter-rust';
import Java from 'tree-sitter-java';
import Cpp from 'tree-sitter-cpp';
import C from 'tree-sitter-c';

export interface AstChunk {
  text: string;
  startLine: number;
  endLine: number;
  nodeType: string;
  className?: string;
  functionName?: string;
  symbolPath?: string;
}

export class AstChunker {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  private setLanguage(ext: string): boolean {
    switch (ext) {
      case '.ts':
      case '.tsx':
        this.parser.setLanguage(TypeScript.typescript);
        return true;
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        this.parser.setLanguage(JavaScript);
        return true;
      case '.py':
        this.parser.setLanguage(Python);
        return true;
      case '.go':
        this.parser.setLanguage(Go);
        return true;
      case '.rs':
        this.parser.setLanguage(Rust);
        return true;
      case '.java':
        this.parser.setLanguage(Java);
        return true;
      case '.cpp':
      case '.hpp':
      case '.cc':
        this.parser.setLanguage(Cpp);
        return true;
      case '.c':
      case '.h':
        this.parser.setLanguage(C);
        return true;
      default:
        return false;
    }
  }

  chunk(text: string, ext: string, maxLines = 120): AstChunk[] {
    if (!this.setLanguage(ext)) {
      return []; // Fallback to other chunkers
    }

    const tree = this.parser.parse(text);
    const chunks: AstChunk[] = [];
    const lines = text.split('\n');

    const visit = (node: Parser.SyntaxNode, parentPath: string = '') => {
      const type = node.type;
      let isChunkable = false;
      let name: string | undefined;
      let className: string | undefined;

      // Identify chunkable nodes and extract names
      if (type === 'function_declaration' || type === 'method_definition' || type === 'function_definition') {
        isChunkable = true;
        name = node.childForFieldName('name')?.text;
      } else if (type === 'class_declaration' || type === 'class_definition') {
        isChunkable = true;
        name = node.childForFieldName('name')?.text;
        className = name;
      }

      const currentPath = name ? (parentPath ? `${parentPath}.${name}` : name) : parentPath;

      if (isChunkable) {
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;
        const chunkText = lines.slice(node.startPosition.row, node.endPosition.row + 1).join('\n');

        // Only chunk if it's not too small or if it's a primary unit
        if (endLine - startLine > 3 || name) {
          chunks.push({
            text: chunkText,
            startLine,
            endLine,
            nodeType: type,
            className,
            functionName: type.includes('function') || type.includes('method') ? name : undefined,
            symbolPath: currentPath,
          });
          // For now we don't recurse into chunked nodes to avoid duplicates, 
          // unless they are very large classes (but Spec 08 says snap to boundary).
          return; 
        }
      }

      for (const child of node.children) {
        visit(child, currentPath);
      }
    };

    visit(tree.rootNode);

    // Filter out nested chunks if needed or handle remains
    // If no chunks were found (e.g. just a script with top-level code), 
    // we return empty and the caller should fallback to line-based/semantic chunking.
    return chunks;
  }
}
