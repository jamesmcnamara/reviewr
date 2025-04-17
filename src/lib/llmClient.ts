import { Anthropic } from '@anthropic-ai/sdk';

// Define our own types to match Anthropic's API
type MessageParam = {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  name?: string;
};

type TextBlock = {
  type: 'text';
  text: string;
};

type ToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type ToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
};

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
import { ToolHandler, ToolCall } from './toolHandler';

class LlmClient {
  private client: Anthropic;
  private toolHandler: ToolHandler;

  constructor(apiKey: string, toolHandler: ToolHandler) {
    this.client = new Anthropic({ apiKey });
    this.toolHandler = toolHandler;
  }

  async countTokens(diff: string): Promise<number> {
    return this.client.messages
      .countTokens({
        model: 'claude-3-7-sonnet-latest',
        messages: [{ role: 'user', content: diff }]
      })
      .then((response) => response.input_tokens);
  }

  async runWithTools(
    prompt: string,
    systemPrompt: string = 'You are a helpful assistant.'
  ): Promise<string> {
    const messages: MessageParam[] = [{ role: 'user', content: prompt }];

    let hasToolCalls = true;

    while (hasToolCalls) {
      const response = await this.client.messages.create({
        // Do not change
        model: 'claude-3-7-sonnet-latest',
        temperature: 0,
        max_tokens: 4096,
        messages,
        system: systemPrompt,
        tools: this.toolHandler.getToolsSchema()
      });

      // Find all tool use blocks
      const toolUseBlocks = response.content.filter(
        (block) => block.type === 'tool_use'
      );

      if (toolUseBlocks.length > 0) {
        console.log('Tool calls requested:', toolUseBlocks.map(block => block.name).join(', '));

        // Parse tool calls and execute them
        const toolCalls: ToolCall[] = toolUseBlocks.map(block => ({
          tool_name: block.name,
          parameters: block.input
        }));

        // Execute tools and get results
        const toolResults = await this.toolHandler.handleToolCalls(toolCalls);

        // Add assistant message to the conversation
        messages.push({ role: 'assistant', content: response.content });

        // Format the tool results as expected by Anthropic API
        const toolResultsContent = toolUseBlocks
          .map((block, index) => {
            if (!block.id) return null;
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: toolResults[index].content
            };
          })
          .filter(Boolean); // Remove any null entries

        if (toolResultsContent.length > 0) {
          messages.push({
            role: 'user',
            content: toolResultsContent
          });
        }
      } else {
        // No more tool calls, we're done
        hasToolCalls = false;
        // Find the text block
        const textBlock = response.content.find(
          (block): block is TextBlock => block.type === 'text'
        );
        return textBlock ? textBlock.text : 'No text response';
      }
    }

    return 'Conversation completed';
  }
}

export { LlmClient };
