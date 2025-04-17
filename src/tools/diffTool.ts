import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { Tool } from '../lib/toolHandler';

// Define the schema for the parse_diff tool parameters
const parseDiffSchema = z.object({
  diff: z.string().min(1).describe('The diff string to parse'),
  maxLinesPerChunk: z.number().int().min(1).max(500).default(100).describe('Maximum lines per chunk')
});

// Tool to parse and split a diff string into chunks
const parseDiffTool: Tool<typeof parseDiffSchema> = {
  name: 'parse_diff',
  description: 'Parse a diff string and split it into manageable chunks',
  schema: parseDiffSchema,
  execute: async (params) => {
    try {
      const lines = params.diff.split('\n');
      const chunks: string[] = [];
      let currentChunk: string[] = [];
      
      // Split the diff into chunks based on maxLinesPerChunk
      for (let i = 0; i < lines.length; i++) {
        currentChunk.push(lines[i]);
        
        // When we reach the maximum lines, or the end of the diff, save the chunk
        if (currentChunk.length >= params.maxLinesPerChunk || i === lines.length - 1) {
          chunks.push(currentChunk.join('\n'));
          currentChunk = [];
        }
      }
      
      return {
        totalChunks: chunks.length,
        chunks
      };
    } catch (error) {
      throw new Error(`Failed to parse diff: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

// Define the schema for the read_diff_file tool parameters
const readDiffFileSchema = z.object({
  path: z.string().min(1).describe('The path to the diff file'),
  maxLinesPerChunk: z.number().int().min(1).max(500).default(100).describe('Maximum lines per chunk')
});

// Tool to read a diff file and split it into chunks
const readDiffFileTool: Tool<typeof readDiffFileSchema> = {
  name: 'read_diff_file',
  description: 'Read a diff file and split it into manageable chunks',
  schema: readDiffFileSchema,
  execute: async (params) => {
    try {
      const filePath = path.resolve(params.path);
      const diffContent = await fs.readFile(filePath, 'utf-8');
      
      // Use the parseDiffTool to process the diff content
      return parseDiffTool.execute({
        diff: diffContent,
        maxLinesPerChunk: params.maxLinesPerChunk
      });
    } catch (error) {
      throw new Error(`Failed to read diff file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

export { parseDiffTool, readDiffFileTool };