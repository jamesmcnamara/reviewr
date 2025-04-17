import { z } from 'zod';
import { Tool, ToolHandler } from '../lib/toolHandler';
import { LlmClient } from '../lib/llmClient';
import * as fs from 'fs/promises';
import { DiffChunk, readDiffFile } from './diffTool';

export interface DependencyGraph {
  nodes: DiffChunk[];
  dependencies: Record<string, string[]>;
}

// Schema for processing a git diff file
// Helper function to slice a string for preview
function truncateContent(content: string, maxLength = 200): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

interface Diff {
  id: string;
  content: string;
  filename: string;
  patch?: string;
  tags: string[];
  priority: 'high' | 'low' | 'unknown';
}

export async function orderChunksForTag(
  llmClient: LlmClient,
  chunks: Diff[],
  tag: string
): Promise<Diff[]> {
  const systemPrompt = `You are an expert code reviewer assistant specializing in organizing related code changes into a coherent narrative. Your task is to analyze a set of diff chunks that all relate to a single concept (identified by a tag like 'user-repository', 'security', or 'query parser') and determine the optimal order in which they should be reviewed.

When ordering the diffs, follow these principles to create a logical progression that tells a coherent story:

1. FOUNDATIONAL CHANGES FIRST:
   - Start with architecture/interface definitions that other changes depend on
   - Place core implementation before code that uses it
   - Position changes to data models or schemas early when they define structure

2. FOLLOW DEVELOPMENT FLOW:
   - Implementation of new functionality should precede its tests
   - Tests should come before downstream adaptations to the new functionality
   - Configuration changes should precede their usage

3. DEPENDENCY ORDER:
   - If change B depends on change A, place A before B
   - If understanding change Y requires knowledge from change X, place X before Y

4. END WITH PERIPHERAL/MECHANICAL CHANGES:
   - Place generated code last
   - Put purely mechanical refactors toward the end
   - Documentation updates typically come after their referenced implementation

5. GROUP RELATED FILES:
   - Keep changes to the same component or feature together
   - Front-end and back-end pairs can be grouped (API endpoint then its UI)

For example, when reviewing a new feature, an ideal order might be:
1. Interface/API definitions
2. Core implementation of the feature
3. Tests for the new implementation
4. Updates to existing components that use the new feature
5. Database migrations or schema changes
6. Updates to HTTP handlers or API endpoints
7. Documentation or comment updates
8. Generated code changes

You will receive a series of diff chunks, each with a unique ID. Your task is to analyze these diffs and determine the optimal review order of their IDs.

VERY IMPORTANT: You MUST submit your final ordering using the submit_ordering tool with the list of diff IDs in the recommended review sequence.
  `;

  let prompt = `All of the following chunks are related to ${tag}\n`;
  for (const diff of chunks) {
    prompt += `<diff id="${diff.id}">${diff.patch}</diff>\n`;
  }
  const ordering = {
    done: false,
    ordering: chunks
  };
  const submitOrdering = reorderTool(ordering);

  let recursionLimit = 5;

  while (!ordering.done && recursionLimit-- > 0) {
    await llmClient.runWithTools(
      prompt,
      systemPrompt,
      `reordering-diffs-${recursionLimit}`, // Use a fixed log key for reordering
      ...[submitOrdering]
    );
  }
  if (recursionLimit == 0) {
    console.error('Recursion limit reached, aborting');
  }
  return ordering.ordering;
}

export async function getDiffSlugs(
  chunks: DiffChunk[],
  llmClient: LlmClient
): Promise<Diff[]> {
  if (!chunks.length) {
    return [];
  }
  const chunkMetadata: Diff[] = [];
  const tags = new Set<string>();
  const assignChunkMetadata = assignChunkMetadataTool(
    chunkMetadata,
    tags,
    chunks
  );
  const systemPrompt = `You are an expert code analyst. Your task is to analyze a diff chunk and determine a set of tags that describe the responsibilities of the code change within. You will also see a list of existing tags that previous chunks have reported. If the tags you determine are similar to any of the existing tags, you should use the existing tags instead to allow grouping.

Additionally, you must report the priority of the chunk as either 'high', 'low', or 'unknown' based on the following criteria:

HIGH PRIORITY changes (less than 10% of all chunks) are those that:
- Introduce significant new functionality or business logic
- Modify critical security mechanisms (not just comments about security)
- Change core algorithms that affect system behavior
- Substantively alter database schemas or data handling
- Fix critical bugs that could cause system failure or data corruption
- Implement complex architectural changes

LOW PRIORITY changes (the majority of chunks) include:
- Mechanical refactorings (e.g., changing a collection, updating a function signature due to upstream changes, renaming variables)
- Style or formatting changes
- Documentation updates or comment changes
- Generated code or boilerplate
- Configuration tweaks
- Test additions that don't reveal bugs
- Downstream adaptations to interface changes made elsewhere
- Simple dependency updates
- Changes that follow an obvious pattern applied throughout the codebase

If you are genuinely uncertain about the priority, report it as 'unknown'.

Some examples of tags are:
- telemetry
- error handling
- diff chunker interface
- customer sales database

If a specific new data type is added and referenced in many places, use the name of the data type in the tags.

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

// Define the schema for the parse_diff tool parameters
const reorderSchema = z.object({
  order: z
    .array(z.string())
    .describe(
      'A list of ids of the chunks provided in the order they should be reviewed to be most intelligible'
    ),
  done: z
    .boolean()
    .describe(
      'pass true for this value if the order provided in the prompt is already the best linear ordering of the information'
    )
});

// Tool to parse and split a diff string into chunks

interface Ordering {
  ordering: Diff[];
  done: boolean;
}
function reorderTool(ordering: Ordering): Tool<typeof reorderSchema> {
  return {
    name: 'reorder',
    description: 'Reorder a list of diff chunks',
    schema: reorderSchema,
    execute: async (params) => {
      if (params.done) {
        ordering.done = true;
        return;
      }
      const reorderedChunks: DiffChunk[] = [];
      for (const id of params.order) {
        const chunk = ordering.ordering.find((c) => c.id === id);
        if (chunk) {
          reorderedChunks.push(chunk);
        }
      }
      return reorderedChunks;
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

// Tool to parse and split a diff string into chunks
function assignChunkMetadataTool(
  meta: Diff[],
  tags: Set<string>,
  diffs: DiffChunk[]
): Tool<typeof assignChunkMetadataSchema> {
  return {
    name: 'assign_chunk_metadata',
    description: 'Associate a diff chunk with a list of tags',
    schema: assignChunkMetadataSchema,
    execute: async (params) => {
      const diffChunk = diffs.find((chunk) => chunk.id === params.chunkId);
      if (diffChunk) {
        meta.push({
          ...diffChunk,
          tags: params.tags,
          priority: params.priority
        });
      }
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

async function diffOrderingTool(diffPath: string, outputPath: string) {
  try {
    // Extract chunks from the diff file
    const chunks = await readDiffFile(diffPath);

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

    const diffs = await getDiffSlugs(chunks, tempLlmClient);

    // Build a map of tags to diffs
    const tagToDiffsMap: Record<string, Diff[]> = {};

    // Populate the map
    for (const diff of diffs) {
      for (const tag of diff.tags) {
        if (!tagToDiffsMap[tag]) {
          tagToDiffsMap[tag] = [];
        }
        tagToDiffsMap[tag].push(diff);
      }
    }

    // Process each tag with orderChunksForTag
    const orderedResults: Record<string, Diff[]> = {};
    for (const tag of Object.keys(tagToDiffsMap)) {
      console.log(`Ordering diffs for tag: ${tag}`);
      orderedResults[tag] = await orderChunksForTag(
        tempLlmClient,
        tagToDiffsMap[tag],
        tag
      );
    }

    // Save the results if outputPath is provided
    await fs.writeFile(
      outputPath,
      JSON.stringify(orderedResults, null, 2),
      'utf-8'
    );
    console.log(`Ordered results saved to ${outputPath}`);

    return orderedResults;
  } catch (error) {
    throw new Error(
      `Failed to process diff: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export { diffOrderingTool };
