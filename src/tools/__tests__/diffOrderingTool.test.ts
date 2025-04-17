import { expect, test } from '@jest/globals';
import { processDiffChunks } from '../diffOrderingTool';

test('processDiffChunks should build a dependency graph from diff chunks', async () => {
    // Mock diff chunks
    const chunks = [
      {
        id: 'chunk1',
        content: 'interface UserService { getUserById(id: string): User; }',
        filename: 'user-service.ts'
      },
      {
        id: 'chunk2',
        content: 'class UserServiceImpl implements UserService { getUserById(id: string): User { /* impl */ } }',
        filename: 'user-service-impl.ts'
      },
      {
        id: 'chunk3',
        content: 'import { UserService } from "./user-service";',
        filename: 'some-controller.ts'
      }
    ];

    const graph = await processDiffChunks(chunks);

    // The implementation should depend on the interface
    expect(graph.dependencies[chunks[1].id]).toContain(chunks[0].id);
    // The import should depend on the interface
    expect(graph.dependencies[chunks[2].id]).toContain(chunks[0].id);
});

test('processDiffChunks should handle empty chunks', async () => {
    const graph = await processDiffChunks([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.dependencies).toEqual({});
});