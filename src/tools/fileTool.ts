import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { Tool } from '../lib/toolHandler';

// Define the schema for the read_file tool parameters
const readFileSchema = z.object({
  path: z.string().min(1).describe('The path to the file to read')
});

const fileTool: Tool<typeof readFileSchema> = {
  name: 'read_file',
  description: 'Read the contents of a file',
  schema: readFileSchema,
  execute: async (params) => {
    try {
      const filePath = path.resolve(params.path);
      const content = await fs.readFile(filePath, 'utf-8');
      return { content };
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

// Define the schema for the list_files tool parameters
const listFilesSchema = z.object({
  directory: z.string().optional().default('.').describe('The directory path to list files from')
});

const listFilesTool: Tool<typeof listFilesSchema> = {
  name: 'list_files',
  description: 'List files in a directory',
  schema: listFilesSchema,
  execute: async (params) => {
    try {
      const dirPath = path.resolve(params.directory);
      const files = await fs.readdir(dirPath);
      return { files };
    } catch (error) {
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

export { fileTool, listFilesTool };