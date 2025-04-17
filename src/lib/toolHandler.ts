import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Define our own Message type to match Anthropic's API
type Message = {
  role: 'assistant' | 'user' | 'tool';
  content: any;
  name?: string;
};

type Tool<T extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: T;
  execute: (params: z.infer<T>) => Promise<any>;
};

type ToolCall = {
  tool_name: string;
  parameters: any;
};

class ToolHandler {
  private tools: Record<string, Tool<any>> = {};

  registerTool<T extends z.ZodType>(tool: Tool<T>): void {
    this.tools[tool.name] = tool;
  }

  async handleToolCalls(toolCalls: ToolCall[]): Promise<{name: string, content: string}[]> {
    const results: {name: string, content: string}[] = [];
    
    for (const toolCall of toolCalls) {
      try {
        const tool = this.tools[toolCall.tool_name];
        
        if (!tool) {
          throw new Error(`Tool '${toolCall.tool_name}' not found`);
        }
        
        // Validate parameters against the schema
        const validatedParams = tool.schema.parse(toolCall.parameters);
        
        // Execute the tool with validated parameters
        const result = await tool.execute(validatedParams);
        
        results.push({
          name: toolCall.tool_name,
          content: JSON.stringify(result)
        });
      } catch (error) {
        results.push({
          name: toolCall.tool_name,
          content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
        });
      }
    }
    
    return results;
  }

  getToolsSchema(): any[] {
    return Object.values(this.tools).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.schema),
    }));
  }
}

export { ToolHandler, Tool, ToolCall };