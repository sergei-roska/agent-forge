import type Database from 'better-sqlite3';
import { withImmediate } from '../sqlite.js';

export interface GraphNodeRow {
  node_id: string;
  project_path: string;
  file_path: string;
  symbol_name: string;
  symbol_type: string;
  symbol_path: string;
  chunk_id: string | null;
  start_line: number;
  end_line: number;
}

export interface GraphEdgeRow {
  edge_id: string;
  project_path: string;
  source_node_id: string;
  target_node_name: string;
  target_node_id: string | null;
  relationship_type: string;
}

export class GraphRepo {
  constructor(private readonly db: Database.Database) {}

  insertNodes(nodes: GraphNodeRow[]): void {
    if (nodes.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT INTO graph_nodes
        (node_id, project_path, file_path, symbol_name, symbol_type, symbol_path, chunk_id, start_line, end_line)
       VALUES
        (@node_id, @project_path, @file_path, @symbol_name, @symbol_type, @symbol_path, @chunk_id, @start_line, @end_line)
       ON CONFLICT(node_id) DO UPDATE SET
        chunk_id = excluded.chunk_id,
        start_line = excluded.start_line,
        end_line = excluded.end_line`,
    );

    withImmediate(this.db, () => {
      for (const node of nodes) {
        stmt.run(node);
      }
    });
  }

  insertEdges(edges: GraphEdgeRow[]): void {
    if (edges.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT INTO graph_edges
        (edge_id, project_path, source_node_id, target_node_name, target_node_id, relationship_type)
       VALUES
        (@edge_id, @project_path, @source_node_id, @target_node_name, @target_node_id, @relationship_type)
       ON CONFLICT(edge_id) DO UPDATE SET
        target_node_id = excluded.target_node_id`,
    );

    withImmediate(this.db, () => {
      for (const edge of edges) {
        stmt.run(edge);
      }
    });
  }

  deleteByFile(projectPath: string, filePath: string): void {
    withImmediate(this.db, () => {
      // Deleting nodes will trigger cascade delete on graph_edges where source_node_id is node_id
      this.db
        .prepare(`DELETE FROM graph_nodes WHERE project_path = ? AND file_path = ?`)
        .run(projectPath, filePath);
    });
  }

  resolveEdges(projectPath: string): void {
    // Attempt to link unresolved target_node_id where target_node_name is unique in the project
    withImmediate(this.db, () => {
      // Find symbols that are uniquely named within the project path
      this.db.exec(
        `UPDATE graph_edges
         SET target_node_id = (
           SELECT node_id FROM graph_nodes
           WHERE graph_nodes.project_path = graph_edges.project_path
             AND graph_nodes.symbol_name = graph_edges.target_node_name
           LIMIT 1
         )
         WHERE project_path = '${projectPath}' AND target_node_id IS NULL`
      );
    });
  }
}
