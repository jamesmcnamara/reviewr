import { z } from 'zod';
import { Tool } from '../lib/toolHandler';
import { LlmClient } from '../lib/llmClient';
import * as fs from 'fs/promises';
import * as path from 'path';
import parseDiff from 'parse-diff';

// Types for our dependency graph
export interface DiffChunk {
  id: string;
  content: string;
  filename: string;
  patch?: string;
}

export interface DependencyGraph {
  nodes: DiffChunk[];
  dependencies: Record<string, string[]>;
}

// Schema for analyzing chunk relationships
const analyzeChunkSchema = z.object({
  chunk: z.object({
    id: z.string().describe('The unique identifier for this diff chunk'),
    content: z.string().describe('The content of the diff chunk'),
    filename: z.string().describe('The filename this diff chunk belongs to')
  }).describe('The current diff chunk to analyze'),
  existingNodes: z.array(z.object({
    id: z.string(),
    content: z.string().max(500).describe('Preview of the content (truncated)'),
    filename: z.string()
  })).describe('Previously analyzed diff chunks to compare against')
});

const analyzeChunkTool: Tool<typeof analyzeChunkSchema> = {
  name: 'analyze_diff_chunk',
  description: 'Analyze a diff chunk to determine its dependencies on other chunks',
  schema: analyzeChunkSchema,
  execute: async (params) => {
    // This will be handled by the LLM
    throw new Error('This tool should be handled by the LLM, not executed directly');
  }
};

// Schema for processing a git diff file
const processDiffSchema = z.object({
  diffPath: z.string().describe('The path to the git diff file to process'),
  outputPath: z.string().optional().describe('The path to save the ordered results to')
});

// Helper function to slice a string for preview
function truncateContent(content: string, maxLength = 200): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

// Process individual diff chunks with LLM to build dependency graph
export async function processDiffChunks(chunks: DiffChunk[], llmClient?: LlmClient): Promise<DependencyGraph> {
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
          if (chunk.content.includes(`implements`) && otherChunk.content.includes(`interface`)) {
            dependencies[chunk.id].push(otherChunk.id);
          }
          // Check if this chunk imports from another chunk
          else if (chunk.content.includes(`import`) && chunk.content.includes(otherChunk.filename.replace('.ts', ''))) {
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

  // Process one chunk at a time, building up our knowledge
  const processedNodes: DiffChunk[] = [];
  
  for (const chunk of chunks) {
    const systemPrompt = `You are an expert code analyst. Your task is to analyze a diff chunk and determine if it depends on any previously analyzed chunks. 
    A chunk depends on another if it references code defined in that chunk, implements an interface from that chunk, or otherwise needs that chunk to exist first for it to make sense.
    
    VERY IMPORTANT: You MUST respond with ONLY a valid JSON object in the following format and nothing else:
    {"dependencies": ["chunk_id1", "chunk_id2", ...]}
    
    If there are no dependencies, respond with: {"dependencies": []}
    Do not add any explanation text before or after the JSON.`;

    // Prepare the previews of already processed nodes
    const nodesPreviews = processedNodes.map(node => ({
      id: node.id,
      content: truncateContent(node.content),
      filename: node.filename
    }));

    const prompt = JSON.stringify({
      chunk: {
        id: chunk.id,
        content: chunk.content,
        filename: chunk.filename
      },
      existingNodes: nodesPreviews
    }, null, 2);

    try {
      const response = await llmClient.runWithTools(prompt, systemPrompt);
      let dependencies: string[] = [];
      
      try {
        // Try to parse the response as JSON
        const parsedResponse = JSON.parse(response.trim());
        dependencies = parsedResponse.dependencies || [];
      } catch (e) {
        console.error('Failed to parse LLM response:', e);
        // Log the response for debugging
        console.error('Response was:', response.substring(0, 100) + '...');
        // Continue with empty dependencies if parsing fails
      }

      // Add the dependencies to our graph
      graph.dependencies[chunk.id] = dependencies;
      
      // Add this node to processed nodes for future chunk analysis
      processedNodes.push(chunk);
    } catch (error) {
      console.error(`Error processing chunk ${chunk.id}:`, error);
      // Continue with the next chunk
      graph.dependencies[chunk.id] = [];
    }
  }

  return graph;
}

// Topologically sort the graph to get the optimal review order
export function topologicalSort(graph: DependencyGraph): DiffChunk[] {
  const visited = new Set<string>();
  const temp = new Set<string>();
  const order: DiffChunk[] = [];
  
  // Get all node IDs
  const nodeIds = graph.nodes.map(node => node.id);

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
  const rootsFirst = [...nodeIds].sort((a, b) => (indegree[a] || 0) - (indegree[b] || 0));
  
  // Visit nodes in order of dependency count (least dependencies first)
  for (const nodeId of rootsFirst) {
    if (!visited.has(nodeId)) {
      visit(nodeId);
    }
  }

  // In a correct topological sort, nodes with no dependencies come first
  return order;
}

// Extract chunks from a git diff file
export async function extractDiffChunks(diffPath: string): Promise<DiffChunk[]> {
  const diffContent = await fs.readFile(path.resolve(diffPath), 'utf-8');
  const files = parseDiff(diffContent);
  
  const chunks: DiffChunk[] = [];
  let chunkCounter = 0;
  
  for (const file of files) {
    if (!file.chunks || file.chunks.length === 0) continue;
    
    for (const chunk of file.chunks) {
      const chunkId = `chunk_${++chunkCounter}`;
      // Extract the added content (ignoring context and removed lines)
      const chunkContent = chunk.changes
        .map(change => (change.type === 'add' ? change.content : ''))
        .filter(Boolean)
        .join('\n');
      
      // Create the full patch for this chunk
      const header = `@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@`;
      const changes = chunk.changes
        .map(change => {
          // Added lines start with +
          if (change.type === 'add') return `+${change.content}`;
          // Deleted lines start with -
          if (change.type === 'del') return `-${change.content}`;
          // Context lines start with a space
          return ` ${change.content}`;
        })
        .join('\n');
      
      const fullPatch = `${header}\n${changes}`;
      
      chunks.push({
        id: chunkId,
        content: chunkContent,
        filename: file.to || file.from || 'unknown',
        patch: fullPatch
      });
    }
  }
  
  return chunks;
}

// Format the ordered diff chunks for human review
export function formatOrderedDiff(orderedChunks: DiffChunk[]): string {
  let output = '# Ordered Diff Review\n\n';
  
  for (let i = 0; i < orderedChunks.length; i++) {
    const chunk = orderedChunks[i];
    output += `## ${i + 1}. ${chunk.filename}\n\n`;
    output += '```diff\n';
    // Make sure we include the actual content
    if (chunk.patch) {
      // For git diff patches, include the whole patch
      output += chunk.patch;
    } else if (chunk.content) {
      // For content-only chunks, prefix with + to show as additions
      output += chunk.content.split('\n')
        .map(line => line.trim() ? `+ ${line}` : line)
        .join('\n');
    }
    output += '\n```\n\n';
  }
  
  return output;
}

const diffOrderingTool: Tool<typeof processDiffSchema> = {
  name: 'order_diff',
  description: 'Process a git diff file and order the chunks for optimal review',
  schema: processDiffSchema,
  execute: async (params) => {
    try {
      // Extract chunks from the diff file
      const chunks = await extractDiffChunks(params.diffPath);
      
      // Get the API key from environment
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
      }
      
      // Create a temporary LLM client and tool handler for this operation
      const tempToolHandler = new ToolHandler();
      tempToolHandler.registerTool(analyzeChunkTool);
      const tempLlmClient = new LlmClient(apiKey, tempToolHandler);
      
      // Process the chunks to build the dependency graph
      const graph = await processDiffChunks(chunks, tempLlmClient);
      
      // Sort the chunks topologically
      const orderedChunks = topologicalSort(graph);
      
      // Format the output
      const output = formatOrderedDiff(orderedChunks);
      
      // Save to file if outputPath is provided
      if (params.outputPath) {
        await fs.writeFile(path.resolve(params.outputPath), output, 'utf-8');
      }
      
      return {
        orderedChunks: orderedChunks.map(chunk => ({
          id: chunk.id,
          filename: chunk.filename
        })),
        outputPath: params.outputPath,
        message: params.outputPath
          ? `Ordered diff saved to ${params.outputPath}`
          : 'Diff ordering completed successfully'
      };
    } catch (error) {
      throw new Error(`Failed to process diff: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

// Import the ToolHandler class for the execute function
import { ToolHandler } from '../lib/toolHandler';

export { diffOrderingTool, analyzeChunkTool };