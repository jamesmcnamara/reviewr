import { parseGitDiff, splitDiffIntoChunks, formatDiffChunk } from '../diffParser';

// Sample diff for testing
const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index 123456..789abc 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -10,7 +10,7 @@ import { processTextTool } from './tools/processingTool';
 
 dotenv.config();
 
-const apiKey = process.env.ANTHROPIC_API_KEY;
+const apiKey = process.env.ANTHROPIC_API_KEY || '';
 
 if (!apiKey) {
   console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
@@ -20,6 +20,8 @@ const toolHandler = new ToolHandler();
 toolHandler.registerTool(fileTool);
 toolHandler.registerTool(listFilesTool);
 toolHandler.registerTool(processTextTool);
+toolHandler.registerTool(parseDiffTool);
+toolHandler.registerTool(readDiffFileTool);
 
 // Initialize LLM client
 const llmClient = new LlmClient(apiKey, toolHandler);`;

describe('diffParser', () => {
  describe('parseGitDiff', () => {
    it('should correctly parse a git diff into structured data', () => {
      const result = parseGitDiff(sampleDiff);
      
      // Verify the basic structure
      expect(result).toHaveLength(1); // One file changed
      expect(result[0].filePath).toBe('src/index.ts');
      expect(result[0].oldPath).toBe('src/index.ts');
      expect(result[0].newPath).toBe('src/index.ts');
      
      // Verify chunks
      expect(result[0].chunks).toHaveLength(2); // Two chunks in the diff
      
      // Check the first chunk
      const firstChunk = result[0].hunks[0];
      expect(firstChunk.changes).toHaveLength(8); // 8 lines in the first chunk
      
      // Check specific changes
      const deletedLine = firstChunk.changes.find(c => c.type === 'del');
      const addedLine = firstChunk.changes.find(c => c.type === 'add');
      
      expect(deletedLine).toBeDefined();
      expect(deletedLine?.content).toContain('-const apiKey = process.env.ANTHROPIC_API_KEY;');
      
      expect(addedLine).toBeDefined();
      expect(addedLine?.content).toContain('+const apiKey = process.env.ANTHROPIC_API_KEY || \'\';');
    });
    
    it('should handle empty diffs', () => {
      const result = parseGitDiff('');
      expect(result).toHaveLength(0);
    });
  });
  
  describe('splitDiffIntoChunks', () => {
    it('should split diff into chunks based on maxLines', () => {
      // Set a small chunk size to force splitting
      const chunks = splitDiffIntoChunks(sampleDiff, 5);
      
      // With a maxLines of 5, we should get more than 1 chunk
      expect(chunks.length).toBeGreaterThan(1);
      
      // Each chunk should be a valid diff
      for (const chunk of chunks) {
        expect(chunk).toContain('diff --git');
        expect(chunk).toContain('+++');
        expect(chunk).toContain('---');
      }
    });
    
    it('should not split if maxLines is larger than the diff', () => {
      // Set a chunk size larger than the diff
      const chunks = splitDiffIntoChunks(sampleDiff, 1000);
      
      // Should be just one chunk
      expect(chunks).toHaveLength(1);
      
      // Don't check exact string equality as formatting might change
      // Instead, check key parts of the diff
      expect(chunks[0]).toContain('diff --git a/src/index.ts b/src/index.ts');
      expect(chunks[0]).toContain('const apiKey = process.env.ANTHROPIC_API_KEY || \'\';');
      expect(chunks[0]).toContain('toolHandler.registerTool(parseDiffTool);');
    });
    
    it('should handle empty diffs', () => {
      const chunks = splitDiffIntoChunks('', 10);
      expect(chunks).toHaveLength(0);
    });
  });
  
  describe('formatDiffChunk', () => {
    it('should format a diff chunk back to a string', () => {
      // First parse the diff
      const parsed = parseGitDiff(sampleDiff);
      
      // Then format the first chunk
      const formatted = formatDiffChunk(parsed[0]);
      
      // The formatted result should be a valid diff
      expect(formatted).toContain('diff --git');
      expect(formatted).toContain('--- a/src/index.ts');
      expect(formatted).toContain('+++ b/src/index.ts');
      expect(formatted).toContain('@@ -10,7 +10,7 @@');
      expect(formatted).toContain('-const apiKey = process.env.ANTHROPIC_API_KEY;');
      expect(formatted).toContain('+const apiKey = process.env.ANTHROPIC_API_KEY || \'\';');
    });
  });
});