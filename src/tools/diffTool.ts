import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { Tool } from '../lib/toolHandler';
import { parseGitDiff, splitDiffIntoChunks, formatDiffChunk } from '../lib/diffParser';

// Define the schema for the parse_diff tool
const parseDiffSchema = z.object({
  diff: z.string().min(1).describe('The git diff string to parse'),
  maxLinesPerChunk: z.number().int().min(1).max(500).default(50).describe('Maximum number of lines per chunk')
});

// Create the tool for parsing diffs
const parseDiffTool: Tool<typeof parseDiffSchema> = {
  name: 'parse_diff',
  description: 'Parse a git diff and split it into manageable chunks',
  schema: parseDiffSchema,
  execute: async (params) => {
    // Parse the diff into chunks
    const chunks = splitDiffIntoChunks(params.diff, params.maxLinesPerChunk);
    
    return { 
      totalChunks: chunks.length, 
      chunks
    };
  }
};

// Define the schema for reading a diff from a file
const readDiffFileSchema = z.object({
  path: z.string().min(1).describe('The path to the diff file'),
  maxLinesPerChunk: z.number().int().min(1).max(500).default(50).describe('Maximum number of lines per chunk')
});

// Create a tool for reading diffs from files
const readDiffFileTool: Tool<typeof readDiffFileSchema> = {
  name: 'read_diff_file',
  description: 'Read a diff file and split it into manageable chunks',
  schema: readDiffFileSchema,
  execute: async (params) => {
    try {
      // Read the diff file
      const filePath = path.resolve(params.path);
      const diffContent = await fs.readFile(filePath, 'utf-8');
      
      // Parse the diff into chunks
      const chunks = splitDiffIntoChunks(diffContent, params.maxLinesPerChunk);
      
      return { 
        totalChunks: chunks.length, 
        chunks
      };
    } catch (error) {
      throw new Error(`Failed to read diff file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

export { parseDiffTool, readDiffFileTool };