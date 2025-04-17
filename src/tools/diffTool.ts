import * as fs from 'fs/promises';
import parseDiff, { type File } from 'parse-diff';
import * as path from 'path';

/**
 * Interface for a merged diff chunk
 */
export interface DiffChunk {
  id: string;
  content: string;
  filename: string;
  patch?: string;
}

/**
 * Reads a diff file and parses it using parseDiff
 */
export async function readDiffFile(filePath: string): Promise<DiffChunk[]> {
  try {
    const resolvedPath = path.resolve(filePath);
    const diffContent = await fs.readFile(resolvedPath, 'utf-8');

    // Use the parseDiff function to process the diff content
    return mergeDiffChunks(parseDiff(diffContent));
  } catch (error) {
    throw new Error(
      `Failed to read diff file: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Merges chunks from the same file into unified diff format
 * Chunks that are close together (less than 5 lines apart) are merged
 * @param files Array of File objects from parseDiff
 * @returns Array of merged DiffChunk objects
 */
export function mergeDiffChunks(files: File[]): DiffChunk[] {
  const mergedChunks: DiffChunk[] = [];
  const filenames = new Map<string, number>();

  // Process each file
  for (const file of files) {
    if (!file.chunks || file.chunks.length === 0) continue;

    const filename = file.to || file.from || 'unknown';
    const existingCount = filenames.get(filename) || 0;
    filenames.set(filename, existingCount + 1);
    let mergedContent = '';
    let mergedPatch = '';

    // First build the patch string with all changes
    for (const chunk of file.chunks) {
      // Add the chunk header to the patch
      const header = `@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@`;
      mergedPatch += `${header}\n`;

      // Process each change
      for (const change of chunk.changes) {
        // Add change to the patch
        const prefix =
          change.type === 'add' ? '+' : change.type === 'del' ? '-' : ' ';
        mergedPatch += `${prefix}${change.content}\n`;
      }
    }

    // Now build a reconstructed content that includes all normal lines and additions
    // This represents what the file will look like after the changes
    // We need a different approach to include all changes
    for (const chunk of file.chunks) {
      // Process each change to build the content
      for (const change of chunk.changes) {
        // For content, include normal lines and additions (to show the resulting file)
        if (change.type === 'add' || change.type === 'normal') {
          mergedContent += `${change.content}\n`;
        }
      }
    }

    // Create a merged chunk for this file
    mergedChunks.push({
      id: filename + '-' + (existingCount + 1),
      content: mergedContent.trim(),
      filename,
      patch: mergedPatch.trim()
    });
  }

  return mergedChunks;
}
