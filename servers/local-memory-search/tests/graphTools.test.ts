import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SearchEngine } from '../src/search/SearchEngine.js';
import {
  makeFindCallersTool,
  makeFindCalleesTool,
  makeGetImportGraphTool,
  makeTracePathTool,
} from '../src/tools/graphTools.js';
import { sqliteDbPath } from '../src/storage/paths.js';

describe('Graph Search MCP Tools', () => {
  let projectPath: string;
  let engine: SearchEngine;
  let db: Database.Database;

  beforeEach(() => {
    projectPath = path.join(os.tmpdir(), `lms-graph-test-${Date.now()}-${Math.random()}`);
    // Ensure project path directory exists
    const dbPath = sqliteDbPath(projectPath);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS chunks_queue (
        chunk_id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS graph_nodes (
        node_id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        symbol_type TEXT NOT NULL,
        symbol_path TEXT NOT NULL,
        chunk_id TEXT,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS graph_edges (
        edge_id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        source_node_id TEXT NOT NULL,
        target_node_name TEXT NOT NULL,
        target_node_id TEXT,
        relationship_type TEXT NOT NULL
      );
    `);

    // Seed data
    db.prepare("INSERT INTO chunks_queue (chunk_id, project_path) VALUES ('c1', ?)").run(projectPath);
    
    // Nodes
    db.prepare(`
      INSERT INTO graph_nodes (node_id, project_path, file_path, symbol_name, symbol_type, symbol_path, chunk_id, start_line, end_line)
      VALUES 
        ('n_service', ?, 'src/service.ts', 'UserService', 'class', 'UserService', 'c1', 1, 10),
        ('n_getUser', ?, 'src/service.ts', 'getUser', 'method', 'UserService.getUser', 'c1', 4, 8),
        ('n_fetch', ?, 'src/utils.ts', 'fetchUser', 'function', 'fetchUser', 'c1', 1, 5)
    `).run(projectPath, projectPath, projectPath);

    // Edges
    db.prepare(`
      INSERT INTO graph_edges (edge_id, project_path, source_node_id, target_node_name, target_node_id, relationship_type)
      VALUES 
        ('e_call', ?, 'n_getUser', 'fetchUser', 'n_fetch', 'calls'),
        ('e_import', ?, 'n_service', './utils', NULL, 'imports')
    `).run(projectPath, projectPath);

    engine = new SearchEngine();
    // Prime the engines sqlite cache
    engine.sqlite(projectPath);
  });

  afterEach(() => {
    engine.close();
    db.close();
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('find_callers tool works correctly', async () => {
    const tool = makeFindCallersTool(engine);
    const res = await tool.handler({ symbol_name: 'fetchUser', project_path: projectPath });
    
    expect(res.summary).toContain("Found 1 caller");
    const data = res.data as { callers: any[] };
    expect(data.callers.length).toBe(1);
    expect(data.callers[0].source_symbol).toBe("UserService.getUser");
  });

  it('find_callees tool works correctly', async () => {
    const tool = makeFindCalleesTool(engine);
    const res = await tool.handler({ symbol_name: 'UserService.getUser', project_path: projectPath });
    
    expect(res.summary).toContain("Found 1 callee");
    const data = res.data as { callees: any[] };
    expect(data.callees.length).toBe(1);
    expect(data.callees[0].target_symbol).toBe("fetchUser");
  });

  it('get_import_graph tool works correctly', async () => {
    const tool = makeGetImportGraphTool(engine);
    const res = await tool.handler({ project_path: projectPath });
    
    expect(res.summary).toContain("Found 1 import");
    const data = res.data as { imports: any[] };
    expect(data.imports.length).toBe(1);
    expect(data.imports[0].source_file).toBe("src/service.ts");
    expect(data.imports[0].imported_module).toBe("./utils");
  });

  it('trace_path tool works correctly', async () => {
    const tool = makeTracePathTool(engine);
    const res = await tool.handler({
      source_symbol: 'UserService.getUser',
      target_symbol: 'fetchUser',
      project_path: projectPath,
    });
    
    expect(res.summary).toContain("Found execution path");
    const data = res.data as { path: any[] };
    expect(data.path.length).toBe(2);
    expect(data.path[0].symbol).toBe("UserService.getUser");
    expect(data.path[1].symbol).toBe("fetchUser");
  });
});
