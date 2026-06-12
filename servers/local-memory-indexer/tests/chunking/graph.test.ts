import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { GraphExtractor } from '../../src/indexer/chunking/GraphExtractor.js';
import { GraphRepo } from '../../src/storage/repositories/GraphRepo.js';
import { SCHEMA_VERSION } from '../../src/constants.js';

describe('GraphExtractor', () => {
  const extractor = new GraphExtractor('/project');

  it('correctly extracts TypeScript classes, methods, functions and call/import edges', () => {
    const tsCode = `
import { helper } from './utils';

class UserService {
  getUser(id: string) {
    const data = fetchUser(id);
    return data;
  }
}

function fetchUser(id: string) {
  helper();
  return { id };
}
    `.trim();

    const chunks = [
      { chunk_id: 'c1', start_line: 1, end_line: 9 },
      { chunk_id: 'c2', start_line: 10, end_line: 15 },
    ];

    const result = extractor.extract('/project/UserService.ts', tsCode, chunks);

    // Verify Nodes
    expect(result.nodes.length).toBeGreaterThanOrEqual(3);
    const userServiceNode = result.nodes.find(n => n.symbol_name === 'UserService');
    expect(userServiceNode).toBeDefined();
    expect(userServiceNode!.symbol_type).toBe('class');
    expect(userServiceNode!.chunk_id).toBe('c1');

    const getUserNode = result.nodes.find(n => n.symbol_name === 'getUser');
    expect(getUserNode).toBeDefined();
    expect(getUserNode!.symbol_type).toBe('method');
    expect(getUserNode!.symbol_path).toBe('UserService.getUser');
    expect(getUserNode!.chunk_id).toBe('c1');

    const fetchUserNode = result.nodes.find(n => n.symbol_name === 'fetchUser');
    expect(fetchUserNode).toBeDefined();
    expect(fetchUserNode!.symbol_type).toBe('function');
    expect(fetchUserNode!.chunk_id).toBe('c2');

    // Verify Edges
    expect(result.edges.length).toBeGreaterThanOrEqual(3);
    const importEdge = result.edges.find(e => e.relationship_type === 'imports');
    expect(importEdge).toBeDefined();
    expect(importEdge!.target_node_name).toBe('./utils');

    const fetchCallEdge = result.edges.find(e => e.target_node_name === 'fetchUser' && e.relationship_type === 'calls');
    expect(fetchCallEdge).toBeDefined();

    const helperCallEdge = result.edges.find(e => e.target_node_name === 'helper' && e.relationship_type === 'calls');
    expect(helperCallEdge).toBeDefined();
  });

  it('correctly extracts Python classes and methods using regex-based extractor', () => {
    const pyCode = `
import os

class MathService:
    def add(self, a, b):
        helper()
        return a + b
    `.trim();

    const chunks = [
      { chunk_id: 'c1', start_line: 1, end_line: 10 },
    ];

    const result = extractor.extract('/project/math.py', pyCode, chunks);

    // Verify Nodes
    const mathServiceNode = result.nodes.find(n => n.symbol_name === 'MathService');
    expect(mathServiceNode).toBeDefined();
    expect(mathServiceNode!.symbol_type).toBe('class');

    const addNode = result.nodes.find(n => n.symbol_name === 'add');
    expect(addNode).toBeDefined();
    expect(addNode!.symbol_type).toBe('method');
    expect(addNode!.symbol_path).toBe('MathService.add');

    // Verify Edges
    const importEdge = result.edges.find(e => e.relationship_type === 'imports');
    expect(importEdge).toBeDefined();
    expect(importEdge!.target_node_name).toBe('os');

    const callEdge = result.edges.find(e => e.target_node_name === 'helper' && e.relationship_type === 'calls');
    expect(callEdge).toBeDefined();
  });
});

describe('GraphRepo', () => {
  it('correctly inserts, resolves and deletes nodes/edges', () => {
    const db = new Database(':memory:');
    
    // Create tables
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
        relationship_type TEXT NOT NULL,
        FOREIGN KEY (source_node_id) REFERENCES graph_nodes (node_id) ON DELETE CASCADE
      );
    `);

    const repo = new GraphRepo(db);

    // Insert dummy chunk
    db.prepare('INSERT INTO chunks_queue (chunk_id, project_path) VALUES (?, ?)').run('c1', '/project');

    // Test Node Insertion
    repo.insertNodes([
      {
        node_id: 'n1',
        project_path: '/project',
        file_path: '/project/a.ts',
        symbol_name: 'a',
        symbol_type: 'function',
        symbol_path: 'a',
        chunk_id: 'c1',
        start_line: 1,
        end_line: 5,
      },
      {
        node_id: 'n2',
        project_path: '/project',
        file_path: '/project/b.ts',
        symbol_name: 'b',
        symbol_type: 'function',
        symbol_path: 'b',
        chunk_id: 'c1',
        start_line: 1,
        end_line: 5,
      }
    ]);

    const nodeCount = db.prepare('SELECT COUNT(*) as n FROM graph_nodes').get() as { n: number };
    expect(nodeCount.n).toBe(2);

    // Test Edge Insertion (Unresolved)
    repo.insertEdges([
      {
        edge_id: 'e1',
        project_path: '/project',
        source_node_id: 'n1',
        target_node_name: 'b', // calls b
        target_node_id: null,
        relationship_type: 'calls',
      }
    ]);

    const edgeBefore = db.prepare('SELECT * FROM graph_edges WHERE edge_id = ?').get('e1') as any;
    expect(edgeBefore.target_node_id).toBeNull();

    // Test Resolution
    repo.resolveEdges('/project');
    const edgeAfter = db.prepare('SELECT * FROM graph_edges WHERE edge_id = ?').get('e1') as any;
    expect(edgeAfter.target_node_id).toBe('n2');

    // Test Deletion of file a.ts
    repo.deleteByFile('/project', '/project/a.ts');
    const nodeCountAfter = db.prepare('SELECT COUNT(*) as n FROM graph_nodes').get() as { n: number };
    expect(nodeCountAfter.n).toBe(1); // Only n2 left

    db.close();
  });
});
