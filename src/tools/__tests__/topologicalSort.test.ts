import { expect, test } from '@jest/globals';
import { topologicalSort, DiffChunk, DependencyGraph } from '../diffOrderingTool';

test('topologicalSort should correctly order nodes based on dependencies', () => {
  // Create a test graph with dependencies
  const chunks: DiffChunk[] = [
    { id: 'chunk1', content: 'interface UserService', filename: 'user-service.ts' },
    { id: 'chunk2', content: 'class UserServiceImpl', filename: 'user-service-impl.ts' },
    { id: 'chunk3', content: 'import { UserService }', filename: 'some-controller.ts' },
    { id: 'chunk4', content: 'independent change', filename: 'unrelated.ts' }
  ];
  
  const graph: DependencyGraph = {
    nodes: chunks,
    dependencies: {
      'chunk1': [],                // Interface depends on nothing
      'chunk2': ['chunk1'],        // Implementation depends on interface
      'chunk3': ['chunk1'],        // Controller depends on interface
      'chunk4': []                 // Unrelated change
    }
  };
  
  const orderedChunks = topologicalSort(graph);
  
  // The interface should come first since others depend on it
  expect(orderedChunks[0].id).toBe('chunk1');
  
  // The implementation and controller should come after the interface
  expect(orderedChunks.findIndex(c => c.id === 'chunk2')).toBeGreaterThan(
    orderedChunks.findIndex(c => c.id === 'chunk1')
  );
  
  expect(orderedChunks.findIndex(c => c.id === 'chunk3')).toBeGreaterThan(
    orderedChunks.findIndex(c => c.id === 'chunk1')
  );
});

test('topologicalSort should handle cycles gracefully', () => {
  // Create a test graph with a cycle
  const chunks: DiffChunk[] = [
    { id: 'chunk1', content: 'component A', filename: 'a.ts' },
    { id: 'chunk2', content: 'component B', filename: 'b.ts' },
    { id: 'chunk3', content: 'component C', filename: 'c.ts' }
  ];
  
  const graph: DependencyGraph = {
    nodes: chunks,
    dependencies: {
      'chunk1': ['chunk3'],  // A depends on C
      'chunk2': ['chunk1'],  // B depends on A
      'chunk3': ['chunk2']   // C depends on B - creates a cycle
    }
  };
  
  // This should not throw an error
  const orderedChunks = topologicalSort(graph);
  
  // All chunks should be in the result
  expect(orderedChunks.length).toBe(chunks.length);
  
  // Each chunk should appear exactly once
  const ids = orderedChunks.map(c => c.id);
  expect(new Set(ids).size).toBe(ids.length);
});