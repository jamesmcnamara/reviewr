import { z } from 'zod';
import { Tool, ToolHandler } from '../lib/toolHandler';
import { LlmClient } from '../lib/llmClient';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DiffChunk, readDiffFile } from './diffTool';

export interface DependencyGraph {
  nodes: DiffChunk[];
  dependencies: Record<string, string[]>;
}

// Schema for processing a git diff file
const processDiffSchema = z.object({
  diffPath: z.string().describe('The path to the git diff file to process'),
  outputPath: z
    .string()
    .optional()
    .describe('The path to save the ordered results to')
});

// Helper function to slice a string for preview
function truncateContent(content: string, maxLength = 200): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

export async function getDiffSlugs(
  chunks: DiffChunk[],
  llmClient: LlmClient
): Promise<Map<string, ChunkMeta>> {
  if (!chunks.length) {
    return new Map();
  }
  const chunkMetadata: Map<string, ChunkMeta> = new Map();
  const tags = new Set<string>();
  const assignChunkMetadata = assignChunkMetadataTool(chunkMetadata, tags);
  const systemPrompt = `You are an expert code analyst. Your task is to analyze a diff chunk and determine if a set of tags that describe the responsibilities of the code change within. 

    You will also see a list of existing tags that previous chunks have reported. If the tags you determine are similar to any of the existing tags, you should use the existing tags instead to allow grouping.

    Additionally, you must report the priority of the chunk, in terms of if it contains impactful changes to the code base, as compared to mechanical changes to generated files or downstream changes from an interface update. If you are uncertain the priority should be reported as 'unknown'. 

    As a general rule of thumb, less than 10% of chunks will include a high priority change.
    
    Some examples of tags are:
    - telemetry
    - error handling
    - diff chunker interface
    - customer sales database
    
    VERY IMPORTANT: You MUST report your analysis using the assign_chunk_metadata tool
    
    `;

  for (const chunk of chunks) {
    const prompt = JSON.stringify(
      {
        chunk: {
          id: chunk.id,
          content: chunk.content,
          filename: chunk.filename
        },
        existingTags: Array.from(tags)
      },
      null,
      2
    );

    await llmClient.runWithTools(
      prompt,
      systemPrompt,
      chunk.id, // Use chunk id as log key
      ...[assignChunkMetadata] // Spread array to pass as rest parameters
    );

    // Add this node to processed nodes for future chunk analysis
  }

  await fs.writeFile(
    './meta.json',
    JSON.stringify(Object.fromEntries(chunkMetadata.entries()), null, 2),
    'utf-8'
  );

  return chunkMetadata;
}
// Process individual diff chunks with LLM to build dependency graph
export async function processDiffChunks(
  chunks: DiffChunk[],
  llmClient?: LlmClient
): Promise<DependencyGraph> {
  if (!chunks.length) {
    return { nodes: [], dependencies: {} };
  }

  if (!llmClient) {
    // If no LLM client is provided, return a simple graph with no dependencies
    // This is useful for testing
    const dependencies: Record<string, string[]> = {};

    // In test mode, we'll set up some basic dependencies based on content analysis
    for (const chunk of chunks) {
      dependencies[chunk.id] = [];

      // Simple heuristic: if a chunk mentions another chunk's filename, it probably depends on it
      for (const otherChunk of chunks) {
        if (chunk.id !== otherChunk.id) {
          // Check if this chunk implements an interface from another chunk
          if (
            chunk.content.includes(`implements`) &&
            otherChunk.content.includes(`interface`)
          ) {
            dependencies[chunk.id].push(otherChunk.id);
          }
          // Check if this chunk imports from another chunk
          else if (
            chunk.content.includes(`import`) &&
            chunk.content.includes(otherChunk.filename.replace('.ts', ''))
          ) {
            dependencies[chunk.id].push(otherChunk.id);
          }
        }
      }
    }

    return {
      nodes: chunks,
      dependencies
    };
  }

  const graph: DependencyGraph = {
    nodes: chunks,
    dependencies: {}
  };
  const reportDependencies = reportDependenciesTool(graph);

  // Process one chunk at a time, building up our knowledge
  const processedNodes: DiffChunk[] = [];

  for (const chunk of chunks) {
    const systemPrompt = `You are an expert code analyst. Your task is to analyze a diff chunk and determine if it depends on any previously analyzed chunks. 
    A chunk depends on another if it references code defined in that chunk, implements an interface from that chunk, or otherwise needs that chunk to exist first for it to make sense.
    
    VERY IMPORTANT: You MUST report dependencies using the report_dependency tool`;

    // Prepare the previews of already processed nodes
    const nodesPreviews = processedNodes.map((node) => ({
      id: node.id,
      content: truncateContent(node.content),
      filename: node.filename
    }));

    const prompt = JSON.stringify(
      {
        chunk: {
          id: chunk.id,
          content: chunk.content,
          filename: chunk.filename
        },
        existingNodes: nodesPreviews
      },
      null,
      2
    );

    try {
      await llmClient.runWithTools(
        prompt,
        systemPrompt,
        chunk.id, // Use chunk id as log key
        ...[reportDependencies] // Spread array to pass as rest parameters
      );

      // Add this node to processed nodes for future chunk analysis
      processedNodes.push(chunk);
    } catch (error) {
      console.error(`Error processing chunk ${chunk.id}:`, error);
      // Continue with the next chunk
      graph.dependencies[chunk.id] = [];
    }
  }
  const graphJSON = JSON.stringify(graph, null, 2);
  await fs.writeFile('./graph.json', graphJSON, 'utf-8');

  return graph;
}

// Define the schema for the parse_diff tool parameters
const reportDependenciesSchema = z.object({
  dependencies: z
    .array(z.string())
    .describe('The list of dependencies for this diff chunk'),
  chunkId: z
    .string()
    .describe('The ID of the diff chunk whose dependencies are being reported')
});

// Tool to parse and split a diff string into chunks
function reportDependenciesTool(
  graph: DependencyGraph
): Tool<typeof reportDependenciesSchema> {
  return {
    name: 'report_dependencies',
    description: 'Report the dependencies of a diff chunk',
    schema: reportDependenciesSchema,
    execute: async (params) => {
      graph.dependencies[params.chunkId] = params.dependencies;
    }
  };
}

const assignChunkMetadataSchema = z.object({
  tags: z
    .array(z.string())
    .describe('The list of tags to associate with this chunk.'),
  priority: z
    .enum(['high', 'low', 'unknown'])
    .describe(
      'The priority of this chunk in terms of if it contains impactful changes to the code base, as compared to mechanical changes to generated files or downstream changes from an interface update. If you are uncertain add unknown to the list of tags'
    ),
  chunkId: z
    .string()
    .describe('The ID of the diff chunk whose dependencies are being reported')
});

interface ChunkMeta {
  tags: string[];
  priority: 'high' | 'low' | 'unknown';
}

// Tool to parse and split a diff string into chunks
function assignChunkMetadataTool(
  meta: Map<string, ChunkMeta>,
  tags: Set<string>
): Tool<typeof assignChunkMetadataSchema> {
  return {
    name: 'assign_chunk_metadata',
    description: 'Associate a diff chunk with a list of tags',
    schema: assignChunkMetadataSchema,
    execute: async (params) => {
      meta.set(params.chunkId, {
        tags: params.tags,
        priority: params.priority
      });
      for (const tag of params.tags) {
        tags.add(tag);
      }
    }
  };
}

// Topologically sort the graph to get the optimal review order
export function topologicalSort(graph: DependencyGraph): DiffChunk[] {
  const visited = new Set<string>();
  const temp = new Set<string>();
  const order: DiffChunk[] = [];

  // Get all node IDs
  const nodeIds = graph.nodes.map((node) => node.id);

  // Create a mapping of node IDs to node objects
  const nodeMap = new Map<string, DiffChunk>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  function visit(nodeId: string) {
    // Detect cycles
    if (temp.has(nodeId)) {
      console.warn(`Cycle detected at node ${nodeId}. Breaking cycle.`);
      return;
    }

    // Skip if already visited
    if (visited.has(nodeId)) return;

    // Mark as temporary visited
    temp.add(nodeId);

    // Visit all dependencies first
    const deps = graph.dependencies[nodeId] || [];
    for (const depId of deps) {
      visit(depId);
    }

    // Mark as visited and add to order
    temp.delete(nodeId);
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node) {
      order.push(node);
    }
  }

  // First compute indegrees (number of dependencies pointing to each node)
  const indegree: Record<string, number> = {};
  for (const nodeId of nodeIds) {
    indegree[nodeId] = 0;
  }

  for (const nodeId of nodeIds) {
    const deps = graph.dependencies[nodeId] || [];
    for (const depId of deps) {
      indegree[depId] = (indegree[depId] || 0) + 1;
    }
  }

  // First process nodes that have no dependencies (leaf nodes)
  const rootsFirst = [...nodeIds].sort(
    (a, b) => (indegree[a] || 0) - (indegree[b] || 0)
  );

  // Visit nodes in order of dependency count (least dependencies first)
  for (const nodeId of rootsFirst) {
    if (!visited.has(nodeId)) {
      visit(nodeId);
    }
  }

  // In a correct topological sort, nodes with no dependencies come first
  return order;
}

const diffOrderingTool: Tool<typeof processDiffSchema> = {
  name: 'order_diff',
  description:
    'Process a git diff file and order the chunks for optimal review',
  schema: processDiffSchema,
  execute: async (params) => {
    try {
      // Extract chunks from the diff file
      const chunks = await readDiffFile(params.diffPath);

      // Get the API key from environment
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
      }

      // Create a temporary LLM client and tool handler for this operation
      const tempToolHandler = new ToolHandler();
      const tempLlmClient = new LlmClient(
        apiKey,
        tempToolHandler,
        process.env.LOG_DIRECTORY
      );

      await getDiffSlugs(chunks, tempLlmClient);
      process.exit(0);
    } catch (error) {
      throw new Error(
        `Failed to process diff: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
};

export { diffOrderingTool };
