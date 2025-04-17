import parseDiff, { File, Chunk, Change } from 'parse-diff';

// Interface for a diff chunk that can be printed
export interface DiffChunk {
  filePath: string;
  oldPath?: string;
  newPath?: string;
  chunks: Chunk[];
  isBinary?: boolean;
  hunks: {
    content: string;
    changes: {
      type: 'add' | 'del' | 'normal';
      content: string;
      lineNumber?: number;
    }[];
  }[];
}

/**
 * Parse a git diff string into chunks based on files
 * @param diffString The git diff string to parse
 * @returns An array of DiffChunk objects
 */
export function parseGitDiff(diffString: string): DiffChunk[] {
  // Parse the diff
  const files = parseDiff(diffString);
  
  // Convert to our DiffChunk format
  return files.map(file => ({
    filePath: file.to || '',
    oldPath: file.from,
    newPath: file.to,
    chunks: file.chunks,
    isBinary: (file as any).binary || false,
    hunks: file.chunks.map(chunk => ({
      content: buildHunkHeader(chunk),
      changes: chunk.changes.map(change => ({
        type: change.type as 'add' | 'del' | 'normal',
        content: change.content,
        lineNumber: getLineNumber(change)
      }))
    }))
  }));
}

/**
 * Split a diff into smaller chunks based on hunks
 * @param diffString The git diff string to parse
 * @param maxLines Maximum number of lines per chunk
 * @returns An array of diff strings
 */
export function splitDiffIntoChunks(diffString: string, maxLines: number = 50): string[] {
  const files = parseDiff(diffString);
  const chunks: string[] = [];
  
  for (const file of files) {
    // Start with file header
    let currentChunk = `diff --git a/${file.from} b/${file.to}\n`;
    currentChunk += file.index ? `index ${file.index}\n` : '';
    
    if ((file as any).binary) {
      currentChunk += 'Binary files differ\n';
      chunks.push(currentChunk);
      continue;
    }
    
    currentChunk += `--- a/${file.from}\n`;
    currentChunk += `+++ b/${file.to}\n`;
    
    let currentLineCount = 0;
    let hunkText = '';
    
    // Process each hunk
    for (const chunk of file.chunks) {
      const hunkHeader = buildHunkHeader(chunk);
      
      // If adding this hunk would exceed maxLines, add current chunk to results and start a new one
      if (currentLineCount + chunk.changes.length > maxLines && hunkText.length > 0) {
        chunks.push(currentChunk + hunkText);
        currentChunk = `diff --git a/${file.from} b/${file.to}\n`;
        currentChunk += `--- a/${file.from}\n`;
        currentChunk += `+++ b/${file.to}\n`;
        hunkText = '';
        currentLineCount = 0;
      }
      
      hunkText += hunkHeader + '\n';
      
      // Add each line from the hunk
      for (const change of chunk.changes) {
        const prefix = change.type === 'add' ? '+' : change.type === 'del' ? '-' : ' ';
        hunkText += `${prefix}${change.content}\n`;
      }
      
      currentLineCount += chunk.changes.length;
    }
    
    if (hunkText.length > 0) {
      chunks.push(currentChunk + hunkText);
    }
  }
  
  return chunks;
}

/**
 * Format a diff chunk as a string
 * @param chunk The DiffChunk to format
 * @returns Formatted diff string
 */
export function formatDiffChunk(chunk: DiffChunk): string {
  // Start with file header
  let result = `diff --git a/${chunk.oldPath} b/${chunk.newPath}\n`;
  
  if (chunk.isBinary) {
    result += 'Binary files differ\n';
    return result;
  }
  
  result += `--- a/${chunk.oldPath}\n`;
  result += `+++ b/${chunk.newPath}\n`;
  
  // Add each hunk
  for (const hunk of chunk.hunks) {
    result += hunk.content + '\n';
    
    // Add each line in the hunk
    for (const change of hunk.changes) {
      const prefix = change.type === 'add' ? '+' : change.type === 'del' ? '-' : ' ';
      result += `${prefix}${change.content}\n`;
    }
  }
  
  return result;
}

/**
 * Build a hunk header from a chunk
 * @param chunk The chunk to build a header for
 * @returns Hunk header string
 */
function buildHunkHeader(chunk: Chunk): string {
  return `@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@`;
}

/**
 * Helper function to get the line number from a change
 * @param change The change to get the line number from
 * @returns The line number or undefined
 */
function getLineNumber(change: Change): number | undefined {
  if (change.type === 'normal' && 'ln1' in change) {
    return change.ln1;
  } else if (change.type === 'add' && 'ln' in change) {
    return change.ln;
  } else if (change.type === 'del' && 'ln' in change) {
    return change.ln;
  }
  return undefined;
}