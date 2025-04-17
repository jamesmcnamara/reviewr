import { z } from 'zod';
import { parseDiff, readDiffFile, readDiffFileIntoChunks, parseDiffTool, readDiffFileTool } from '../diffTool';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');

// Sample diff for testing
const sampleDiff = `diff --git a/src/file.ts b/src/file.ts
index 123..456 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,5 +1,5 @@
-const x = 1;
+const x = 2;
 const y = 2;
 `;

describe('diffTools', () => {
  describe('parseDiff function', () => {
    it('should parse a diff string and split it into chunks', async () => {
      const result = await parseDiff(sampleDiff, 10);
      
      expect(result).toHaveProperty('totalChunks');
      expect(result).toHaveProperty('chunks');
      expect(result.totalChunks).toBe(1); // Only one chunk since the diff is small
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0]).toContain('diff --git');
    });
    
    it('should split a diff into multiple chunks if needed', async () => {
      // Create a longer diff by repeating the sample
      const longDiff = sampleDiff.repeat(5);
      
      const result = await parseDiff(longDiff, 5);
      
      expect(result.totalChunks).toBeGreaterThan(1);
      expect(result.chunks.length).toBeGreaterThan(1);
    });
  });
  
  describe('readDiffFile function', () => {
    beforeEach(() => {
      // Reset mocks
      jest.resetAllMocks();
      
      // Mock the fs.readFile method
      (fs.readFile as jest.Mock).mockResolvedValue(sampleDiff);
    });
    
    it('should read a diff from a file', async () => {
      const result = await readDiffFile('patches/sample.diff');
      
      expect(fs.readFile).toHaveBeenCalledWith(expect.any(String), 'utf-8');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('chunks');
      expect(result[0].chunks.length).toBeGreaterThan(0);
    });
    
    it('should handle file read errors', async () => {
      // Mock a file read error
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      
      await expect(readDiffFile('nonexistent.diff'))
        .rejects.toThrow('Failed to read diff file');
    });
  });
  
  describe('readDiffFileIntoChunks function', () => {
    beforeEach(() => {
      // Reset mocks
      jest.resetAllMocks();
      
      // Mock the fs.readFile method
      (fs.readFile as jest.Mock).mockResolvedValue(sampleDiff);
    });
    
    it('should read a diff from a file and split it into chunks', async () => {
      const result = await readDiffFileIntoChunks('patches/sample.diff', 10);
      
      expect(fs.readFile).toHaveBeenCalledWith(expect.any(String), 'utf-8');
      expect(result).toHaveProperty('totalChunks');
      expect(result).toHaveProperty('chunks');
      expect(result.totalChunks).toBe(1);
      expect(result.chunks).toHaveLength(1);
    });
    
    it('should handle file read errors', async () => {
      // Mock a file read error
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      
      await expect(readDiffFileIntoChunks('nonexistent.diff', 10))
        .rejects.toThrow('Failed to read diff file');
    });
  });
  
  describe('parseDiffTool', () => {
    it('should parse a diff string and split it into chunks', async () => {
      const result = await parseDiffTool.execute({
        diff: sampleDiff,
        maxLinesPerChunk: 10
      });
      
      expect(result).toHaveProperty('totalChunks');
      expect(result).toHaveProperty('chunks');
      expect(result.totalChunks).toBe(1); // Only one chunk since the diff is small
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0]).toContain('diff --git');
    });
    
    it('should split a diff into multiple chunks if needed', async () => {
      // Create a longer diff by repeating the sample
      const longDiff = sampleDiff.repeat(5);
      
      const result = await parseDiffTool.execute({
        diff: longDiff,
        maxLinesPerChunk: 5
      });
      
      expect(result.totalChunks).toBeGreaterThan(1);
      expect(result.chunks.length).toBeGreaterThan(1);
    });
    
    it('should validate the schema', () => {
      expect(parseDiffTool.schema).toBeInstanceOf(z.ZodObject);
      
      // Valid params should pass
      const validParams = { diff: 'some diff', maxLinesPerChunk: 10 };
      expect(() => parseDiffTool.schema.parse(validParams)).not.toThrow();
      
      // Invalid params should fail
      expect(() => parseDiffTool.schema.parse({ diff: '' })).toThrow();
      expect(() => parseDiffTool.schema.parse({ diff: 'diff', maxLinesPerChunk: 0 })).toThrow();
      expect(() => parseDiffTool.schema.parse({ diff: 'diff', maxLinesPerChunk: 1000 })).toThrow();
    });
  });
  
  describe('readDiffFileTool', () => {
    beforeEach(() => {
      // Reset mocks
      jest.resetAllMocks();
      
      // Mock the fs.readFile method
      (fs.readFile as jest.Mock).mockResolvedValue(sampleDiff);
    });
    
    it('should read a diff from a file and split it into chunks', async () => {
      const result = await readDiffFileTool.execute({
        path: 'patches/sample.diff',
        maxLinesPerChunk: 10
      });
      
      expect(fs.readFile).toHaveBeenCalledWith(expect.any(String), 'utf-8');
      expect(result).toHaveProperty('totalChunks');
      expect(result).toHaveProperty('chunks');
      expect(result.totalChunks).toBe(1);
      expect(result.chunks).toHaveLength(1);
    });
    
    it('should handle file read errors', async () => {
      // Mock a file read error
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      
      await expect(readDiffFileTool.execute({
        path: 'nonexistent.diff',
        maxLinesPerChunk: 10
      })).rejects.toThrow('Failed to read diff file');
    });
    
    it('should validate the schema', () => {
      expect(readDiffFileTool.schema).toBeInstanceOf(z.ZodObject);
      
      // Valid params should pass
      const validParams = { path: 'file.diff', maxLinesPerChunk: 10 };
      expect(() => readDiffFileTool.schema.parse(validParams)).not.toThrow();
      
      // Invalid params should fail
      expect(() => readDiffFileTool.schema.parse({ path: '' })).toThrow();
      expect(() => readDiffFileTool.schema.parse({ path: 'file.diff', maxLinesPerChunk: 0 })).toThrow();
    });
  });
});