import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import type { GraphNodeRow, GraphEdgeRow } from '../../storage/repositories/GraphRepo.js';

function sha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export interface ExtractedGraph {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
}

export interface ChunkInfo {
  chunk_id: string;
  start_line: number;
  end_line: number;
}

export class GraphExtractor {
  constructor(private readonly projectPath: string) {}

  extract(filePath: string, content: string, chunks: ChunkInfo[]): ExtractedGraph {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    
    if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' || ext === 'mts' || ext === 'cts') {
      return this.extractTypeScript(filePath, content, chunks);
    } else {
      return this.extractRegexBased(filePath, content, chunks, ext);
    }
  }

  private extractTypeScript(filePath: string, content: string, chunks: ChunkInfo[]): ExtractedGraph {
    const nodes: GraphNodeRow[] = [];
    const edges: GraphEdgeRow[] = [];
    
    let sourceFile: ts.SourceFile;
    try {
      sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    } catch {
      return { nodes, edges };
    }

    const currentScopes: string[] = [];
    const symbolToNodeId = new Map<string, string>();
    const nodeStartEndLines = new Map<string, { start: number; end: number }>();

    // Helper to find which chunk a line belongs to
    const findChunkId = (line: number): string | null => {
      for (const chunk of chunks) {
        if (line >= chunk.start_line && line <= chunk.end_line) {
          return chunk.chunk_id;
        }
      }
      return null;
    };

    const visit = (node: ts.Node) => {
      let isScope = false;
      let symbolNode: GraphNodeRow | null = null;

      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        const symbolPath = currentScopes.concat(name).join('.');
        const start = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1;
        const end = ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd()).line + 1;
        const nodeId = sha256(this.projectPath + filePath + symbolPath);

        symbolNode = {
          node_id: nodeId,
          project_path: this.projectPath,
          file_path: filePath,
          symbol_name: name,
          symbol_type: 'class',
          symbol_path: symbolPath,
          chunk_id: findChunkId(start),
          start_line: start,
          end_line: end,
        };

        currentScopes.push(name);
        isScope = true;
      } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        const symbolPath = currentScopes.concat(name).join('.');
        const start = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1;
        const end = ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd()).line + 1;
        const nodeId = sha256(this.projectPath + filePath + symbolPath);

        symbolNode = {
          node_id: nodeId,
          project_path: this.projectPath,
          file_path: filePath,
          symbol_name: name,
          symbol_type: 'method',
          symbol_path: symbolPath,
          chunk_id: findChunkId(start),
          start_line: start,
          end_line: end,
        };

        currentScopes.push(name);
        isScope = true;
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        const symbolPath = currentScopes.concat(name).join('.');
        const start = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1;
        const end = ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd()).line + 1;
        const nodeId = sha256(this.projectPath + filePath + symbolPath);

        symbolNode = {
          node_id: nodeId,
          project_path: this.projectPath,
          file_path: filePath,
          symbol_name: name,
          symbol_type: 'function',
          symbol_path: symbolPath,
          chunk_id: findChunkId(start),
          start_line: start,
          end_line: end,
        };

        currentScopes.push(name);
        isScope = true;
      } else if (ts.isImportDeclaration(node)) {
        // Extract import dependencies as file-level edge
        const source = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
        const fileNodeId = sha256(this.projectPath + filePath + 'file');
        
        // Ensure parent file node exists
        if (!symbolToNodeId.has('file')) {
          const fileNode: GraphNodeRow = {
            node_id: fileNodeId,
            project_path: this.projectPath,
            file_path: filePath,
            symbol_name: path.basename(filePath),
            symbol_type: 'file',
            symbol_path: 'file',
            chunk_id: chunks[0]?.chunk_id ?? null,
            start_line: 1,
            end_line: content.split('\n').length || 1,
          };
          nodes.push(fileNode);
          symbolToNodeId.set('file', fileNodeId);
        }

        const edgeId = sha256(this.projectPath + fileNodeId + source + 'imports');
        edges.push({
          edge_id: edgeId,
          project_path: this.projectPath,
          source_node_id: fileNodeId,
          target_node_name: source,
          target_node_id: null,
          relationship_type: 'imports',
        });
      }

      if (symbolNode) {
        nodes.push(symbolNode);
        symbolToNodeId.set(symbolNode.symbol_path, symbolNode.node_id);
        nodeStartEndLines.set(symbolNode.node_id, { start: symbolNode.start_line, end: symbolNode.end_line });
      }

      // Check for calls inside scopes
      if (ts.isCallExpression(node)) {
        let targetName = '';
        if (ts.isIdentifier(node.expression)) {
          targetName = node.expression.text;
        } else if (ts.isPropertyAccessExpression(node.expression)) {
          targetName = node.expression.name.text;
        }

        if (targetName && currentScopes.length > 0) {
          const currentScopePath = currentScopes.join('.');
          const sourceNodeId = symbolToNodeId.get(currentScopePath) || sha256(this.projectPath + filePath + currentScopePath);
          const startLine = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart()).line + 1;

          // Double check that call is within the node's line range
          const linesInfo = nodeStartEndLines.get(sourceNodeId);
          if (!linesInfo || (startLine >= linesInfo.start && startLine <= linesInfo.end)) {
            const edgeId = sha256(this.projectPath + sourceNodeId + targetName + 'calls');
            edges.push({
              edge_id: edgeId,
              project_path: this.projectPath,
              source_node_id: sourceNodeId,
              target_node_name: targetName,
              target_node_id: null,
              relationship_type: 'calls',
            });
          }
        }
      }

      ts.forEachChild(node, visit);

      if (isScope) {
        currentScopes.pop();
      }
    };

    visit(sourceFile);
    return { nodes, edges };
  }

  private extractRegexBased(filePath: string, content: string, chunks: ChunkInfo[], language: string): ExtractedGraph {
    const nodes: GraphNodeRow[] = [];
    const edges: GraphEdgeRow[] = [];
    const lines = content.split('\n');

    let currentClass: string | null = null;
    const classStartLines: Record<string, number> = {};
    const isPhp = ['php', 'module', 'install', 'theme', 'inc'].includes(language);

    const findChunkId = (line: number): string | null => {
      for (const chunk of chunks) {
        if (line >= chunk.start_line && line <= chunk.end_line) {
          return chunk.chunk_id;
        }
      }
      return null;
    };

    // 1. First Pass: Extract Nodes (Definitions)
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const t = lines[i]!.trim();
      const rawLine = lines[i]!;

      // Reset class scope when encountering top-level functions or scope closing braces
      const hasLeadingWhitespace = /^\s/.test(rawLine);
      if (!hasLeadingWhitespace && (t.startsWith('function') || t.startsWith('def') || t.startsWith('func') || t.startsWith('fn') || t === '}')) {
        currentClass = null;
      }

      // Class detector
      let m = isPhp
        ? t.match(/^(?:(?:abstract|final)\s+)?(?:class|interface|trait)\s+(\w+)/)
        : t.match(/^(?:class|type\s+\w+\s+struct|type\s+\w+\s+interface)\s+(\w+)/);

      if (m) {
        currentClass = m[1]!;
        classStartLines[currentClass] = lineNum;
        const nodeId = sha256(this.projectPath + filePath + currentClass);
        nodes.push({
          node_id: nodeId,
          project_path: this.projectPath,
          file_path: filePath,
          symbol_name: currentClass,
          symbol_type: 'class',
          symbol_path: currentClass,
          chunk_id: findChunkId(lineNum),
          start_line: lineNum,
          end_line: lineNum + 10, // Approximation
        });
        continue;
      }

      // Function/Method detector
      if (isPhp) {
        m = t.match(/^(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+(?:&\s*)?(\w+)/);
      } else {
        m = t.match(/^(?:def|func|fn)\s+(\w+)/) || t.match(/^func\s+\(\s*\w+\s+\*?(\w+)\s*\)\s+(\w+)/);
      }

      if (m) {
        let name = m[1]!;
        let parentClass = currentClass;

        if (!isPhp && m[2]) {
          // Go method receiver syntax: func (r *MyClass) MyMethod()
          parentClass = m[1]!;
          name = m[2]!;
        }

        const symbolPath = parentClass ? `${parentClass}.${name}` : name;
        const nodeId = sha256(this.projectPath + filePath + symbolPath);
        nodes.push({
          node_id: nodeId,
          project_path: this.projectPath,
          file_path: filePath,
          symbol_name: name,
          symbol_type: parentClass ? 'method' : 'function',
          symbol_path: symbolPath,
          chunk_id: findChunkId(lineNum),
          start_line: lineNum,
          end_line: lineNum + 5, // Approximation
        });
      }
    }

    // 2. Second Pass: Extract Edges (Calls & Imports)
    const fileNodeId = sha256(this.projectPath + filePath + 'file');
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const t = lines[i]!.trim();

      // Simple import detector
      let m = isPhp
        ? t.match(/^use\s+([\w\\_]+)/) || t.match(/^(?:require|require_once|include|include_once)\s+['"]([\w./_-]+)['"]/)
        : t.match(/^(?:import|from)\s+([\w./_-]+)/) || t.match(/require\(['"]([\w./_-]+)['"]\)/);

      if (m) {
        const source = m[1]!;
        // Ensure file node exists
        if (!nodes.some(n => n.symbol_path === 'file')) {
          nodes.push({
            node_id: fileNodeId,
            project_path: this.projectPath,
            file_path: filePath,
            symbol_name: path.basename(filePath),
            symbol_type: 'file',
            symbol_path: 'file',
            chunk_id: chunks[0]?.chunk_id ?? null,
            start_line: 1,
            end_line: lines.length,
          });
        }
        const edgeId = sha256(this.projectPath + fileNodeId + source + 'imports');
        edges.push({
          edge_id: edgeId,
          project_path: this.projectPath,
          source_node_id: fileNodeId,
          target_node_name: source,
          target_node_id: null,
          relationship_type: 'imports',
        });
        continue;
      }

      // Simple call detector: match functionName(...)
      const callMatches = t.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
      for (const callMatch of callMatches) {
        const targetName = callMatch[1]!;
        const phpKeywords = ['function', 'use', 'array', 'echo', 'print', 'require', 'require_once', 'include', 'include_once', 'empty', 'isset', 'unset', 'eval', 'list'];
        if (['if', 'for', 'while', 'switch', 'catch', 'def', 'func', 'fn', 'import', ...phpKeywords].includes(targetName)) {
          continue;
        }

        // Find which node encompasses this call line
        const sourceNode = nodes.find(n => n.symbol_type !== 'file' && lineNum >= n.start_line && lineNum <= n.end_line + 10);
        if (sourceNode) {
          const edgeId = sha256(this.projectPath + sourceNode.node_id + targetName + 'calls');
          edges.push({
            edge_id: edgeId,
            project_path: this.projectPath,
            source_node_id: sourceNode.node_id,
            target_node_name: targetName,
            target_node_id: null,
            relationship_type: 'calls',
          });
        }
      }
    }

    return { nodes, edges };
  }
}
