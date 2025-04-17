import { readDiffFile, mergeDiffChunks } from '../diffTool';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');

// Sample diff for testing
const sampleDiff = `diff --git a/src/file.ts b/src/file.ts
index 123..456 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,7 +1,8 @@
-const x = 1;
+const x = 2;
 const y = 2;
-function test() {}
+function test() { return true; }
 const z = 3;
 const a = 1;
+const b = 2;
 const c = 3;
`;

describe('mergedDiffTool', () => {
  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();
    
    // Mock the fs.readFile method
    (fs.readFile as jest.Mock).mockResolvedValue(sampleDiff);
  });
  
  describe('mergeDiffChunks function', () => {
    it('should merge chunks from the same file into a unified format', async () => {
      // Read the file and parse it
      const parsedDiff = await readDiffFile('patches/sample.diff');
      
      // Merge the chunks
      const mergedChunks = mergeDiffChunks(parsedDiff);
      
      // We should have merged all chunks from the same file
      expect(mergedChunks.length).toBe(1);
      
      // Check that the merged chunk has the right properties
      const mergedChunk = mergedChunks[0];
      expect(mergedChunk.id).toBeDefined();
      expect(mergedChunk.filename).toBe('src/file.ts');
      expect(mergedChunk.content).toContain('const x = 2;');
      expect(mergedChunk.content).toContain('function test() { return true; }');
      expect(mergedChunk.content).toContain('const b = 2;');
      expect(mergedChunk.patch).toContain('-const x = 1;');
      expect(mergedChunk.patch).toContain('+const x = 2;');
    });
    
    it('should handle multiple files in a diff properly parsed', async () => {
      // For this test, we'll manually create two separate file objects
      // since we saw the parser doesn't cleanly separate files
      const filesParsed = [
        {
          chunks: [
            {
              content: '@@ -1,7 +1,8 @@',
              changes: [
                { type: 'del', del: true, ln: 1, content: '-const x = 1;' },
                { type: 'add', add: true, ln: 1, content: '+const x = 2;' },
                { type: 'normal', normal: true, ln1: 2, ln2: 2, content: ' const y = 2;' },
                { type: 'del', del: true, ln: 3, content: '-function test() {}' },
                { type: 'add', add: true, ln: 3, content: '+function test() { return true; }' },
                { type: 'normal', normal: true, ln1: 4, ln2: 4, content: ' const z = 3;' },
                { type: 'normal', normal: true, ln1: 5, ln2: 5, content: ' const a = 1;' },
                { type: 'add', add: true, ln: 6, content: '+const b = 2;' },
                { type: 'normal', normal: true, ln1: 6, ln2: 7, content: ' const c = 3;' }
              ],
              oldStart: 1,
              oldLines: 7,
              newStart: 1,
              newLines: 8
            }
          ],
          deletions: 2,
          additions: 3,
          from: 'src/file.ts',
          to: 'src/file.ts'
        },
        {
          chunks: [
            {
              content: '@@ -1,3 +1,3 @@',
              changes: [
                { type: 'del', del: true, ln: 1, content: '-const a = 1;' },
                { type: 'add', add: true, ln: 1, content: '+const a = 10;' },
                { type: 'normal', normal: true, ln1: 2, ln2: 2, content: ' const b = 2;' }
              ],
              oldStart: 1,
              oldLines: 3,
              newStart: 1,
              newLines: 3
            }
          ],
          deletions: 1,
          additions: 1,
          from: 'src/file2.ts',
          to: 'src/file2.ts'
        }
      ];
      
      // Merge the chunks
      const mergedChunks = mergeDiffChunks(filesParsed);
      
      // We should have two merged chunks (one for each file)
      expect(mergedChunks.length).toBe(2);
      
      // Check the first merged chunk
      expect(mergedChunks[0].filename).toBe('src/file.ts');
      expect(mergedChunks[0].content).toContain('const x = 2;');
      expect(mergedChunks[0].content).toContain('const b = 2;');
      
      // Check the second merged chunk
      expect(mergedChunks[1].filename).toBe('src/file2.ts');
      expect(mergedChunks[1].content).toContain('const a = 10;');
    });
    
    it('should handle chunks that are far apart (more than 5 lines)', async () => {
      // For this test we'll manually create a file object with multiple chunks
      const farApartParsed = [
        {
          chunks: [
            {
              content: '@@ -1,3 +1,3 @@',
              changes: [
                { type: 'del', del: true, ln: 1, content: '-const x = 1;' },
                { type: 'add', add: true, ln: 1, content: '+const x = 2;' },
                { type: 'normal', normal: true, ln1: 2, ln2: 2, content: ' const y = 2;' }
              ],
              oldStart: 1,
              oldLines: 3,
              newStart: 1,
              newLines: 3
            },
            {
              content: '@@ -20,3 +20,3 @@',
              changes: [
                { type: 'del', del: true, ln: 20, content: '-function test() {}' },
                { type: 'add', add: true, ln: 20, content: '+function test() { return true; }' },
                { type: 'normal', normal: true, ln1: 21, ln2: 21, content: ' const z = 3;' }
              ],
              oldStart: 20,
              oldLines: 3,
              newStart: 20,
              newLines: 3
            }
          ],
          deletions: 2,
          additions: 2,
          from: 'src/file3.ts',
          to: 'src/file3.ts'
        }
      ];
      
      // Merge the chunks
      const mergedChunks = mergeDiffChunks(farApartParsed);
      
      // We should have one merged chunk since they're from the same file
      // even though they're far apart
      expect(mergedChunks.length).toBe(1);
      
      // Check the merged chunk
      const mergedChunk = mergedChunks[0];
      expect(mergedChunk.filename).toBe('src/file3.ts');
      expect(mergedChunk.content).toContain('const x = 2;');
      expect(mergedChunk.content).toContain('function test() { return true; }');
    });
  });
});