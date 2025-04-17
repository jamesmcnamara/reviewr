import { z } from 'zod';
import { Tool } from '../lib/toolHandler';

// Define an enum for operation type
const OperationType = z.enum(['uppercase', 'lowercase', 'reverse', 'count']);

// Define a schema with multiple fields and validation
const processTextSchema = z.object({
  text: z.string().min(1).describe('The text to process'),
  operation: OperationType.describe('The operation to perform on the text'),
  repeat: z.number().int().min(1).max(10).default(1).describe('Number of times to repeat the operation'),
});

// Create the tool with the schema
const processTextTool: Tool<typeof processTextSchema> = {
  name: 'process_text',
  description: 'Process text with various operations: uppercase, lowercase, reverse, or count characters',
  schema: processTextSchema,
  execute: async (params) => {
    let result = params.text;
    
    for (let i = 0; i < params.repeat; i++) {
      switch (params.operation) {
        case 'uppercase':
          result = result.toUpperCase();
          break;
        case 'lowercase':
          result = result.toLowerCase();
          break;
        case 'reverse':
          result = result.split('').reverse().join('');
          break;
        case 'count':
          result = String(result.length);
          break;
      }
    }
    
    return { result };
  }
};

export { processTextTool };