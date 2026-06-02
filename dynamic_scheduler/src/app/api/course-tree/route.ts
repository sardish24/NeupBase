import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';
// Initialize PostgreSQL connection pool
// For Next.js, we should reuse the pool.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace('prisma+postgres://', 'postgres://'),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});
// TypeScript interfaces ensuring type safety during traversal
interface TreeNode {
  label: string;
  level: number;
  resource_hint?: string;
  children?: TreeNode[];
}
interface FlatNode {
  node_id: string;
  course_id: string;
  parent_id: string | null;
  level: number;
  label: string;
  resource_hint: string | null;
  position: number;
}
/**
 * Recursively traverses the nested JSON tree and flattens it into an 
 * array of relational records suitable for bulk insertion.
 * Generates UUIDs locally to maintain relational mappings.
 */
function flattenTree(
  nodes: TreeNode[],
  courseId: string,
  parentId: string | null = null,
  flatList: FlatNode[] = []
): FlatNode[] {
  nodes.forEach((node, index) => {
    // Generate UUID at the application layer to map parent-child relationships
    // before the database transaction occurs.
    const nodeId = crypto.randomUUID(); 
    flatList.push({
      node_id: nodeId,
      course_id: courseId,
      parent_id: parentId,
      level: node.level,
      label: node.label,
      resource_hint: node.resource_hint || null,
      position: index, // Maintain chronological/pedagogical order
    });
    // Traverse deeper levels if children exist
    if (node.children && node.children.length > 0) {
      flattenTree(node.children, courseId, nodeId, flatList);
    }
  });
  return flatList;
}
/**
 * POST /api/course-tree
 * Next.js Route Handler for processing the POST request.
 * Handles JSON parsing, transformation, and database execution.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse incoming JSON request body natively
    const body = await request.json();
    const { courseId, treeData } = body;
    if (!courseId || !treeData) {
      return NextResponse.json(
        { error: 'Malformed request: Missing courseId or treeData' }, 
        { status: 400 }
      );
    }
    // Execute the flattening algorithm
    const flatNodes = flattenTree(treeData, courseId);
    // Construct highly optimized bulk insert parameterization strings
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;
    flatNodes.forEach(node => {
      placeholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );
      values.push(
        node.node_id,
        node.course_id,
        node.parent_id,
        node.level,
        node.label,
        node.resource_hint,
        node.position
      );
    });
    const insertQuery = `
      INSERT INTO course_tree 
      (node_id, course_id, parent_id, level, label, resource_hint, position)
      VALUES ${placeholders.join(', ')}
    `;
    // Execute bulk insert within a transaction block to guarantee atomicity
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Clear existing tree topology for this course before writing the new one
      await client.query('DELETE FROM course_tree WHERE course_id = $1', [courseId]);
      if (flatNodes.length > 0) {
        // Execute the parameterized bulk insertion query
        await client.query(insertQuery, values);
      }
      await client.query('COMMIT');
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }
    return NextResponse.json(
      { message: 'Tree architecture inserted successfully', nodeCount: flatNodes.length }, 
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Tree insertion pipeline failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
/**
 * GET /api/course-tree?courseId=...
 * Single-query retrieval of the complete hierarchical tree using Recursive CTE.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    if (!courseId) {
      return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
    }
    const query = `
      WITH RECURSIVE tree_traversal AS (
          -- Anchor Term: Retrieve Level 1 Module nodes for the target course
          SELECT 
              node_id,
              course_id,
              parent_id,
              level,
              label,
              resource_hint,
              week_number,
              position,
              -- Initialize an array tracking the positional path for topological sorting
              ARRAY[position] AS sort_path,
              -- Initialize a depth guard
              1 AS depth
          FROM course_tree
          WHERE course_id = $1 AND parent_id IS NULL AND level = 1
          UNION ALL
          -- Recursive Term: Join children to the accumulated working table
          SELECT 
              ct.node_id,
              ct.course_id,
              ct.parent_id,
              ct.level,
              ct.label,
              ct.resource_hint,
              ct.week_number,
              ct.position,
              -- Append the child's position to the parent's path array
              tt.sort_path || ct.position AS sort_path,
              -- Increment the depth guard counter
              tt.depth + 1 AS depth
          FROM course_tree ct
          -- Vital indexed join preventing sequential scans
          INNER JOIN tree_traversal tt ON ct.parent_id = tt.node_id
          -- Fail-safe guard against unbounded infinite recursion
          WHERE tt.depth < 10 
      )
      SELECT 
          node_id,
          parent_id,
          level,
          label,
          resource_hint,
          week_number,
          position
      FROM tree_traversal
      -- Order results topologically based on the accumulated multidimensional path array
      ORDER BY sort_path;
    `;
    const client = await pool.connect();
    try {
      const result = await client.query(query, [courseId]);
      return NextResponse.json({ treeData: result.rows }, { status: 200 });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Tree retrieval failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
