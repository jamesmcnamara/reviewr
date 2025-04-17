import { Anthropic } from '@anthropic-ai/sdk';

// Define our own types to match Anthropic's API
type MessageParam = {
  role: 'user' | 'assistant';
  content: string | any[];
  name?: string;
};

type ContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: any;
};
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

      // Check if there are any tool use blocks
      const toolUseBlock = response.content.find(
        (block) => block.type === 'tool_use'
      );

      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        console.log('Tool calls requested:', toolUseBlock.id);

        // Parse tool calls and execute them
        const toolCalls: ToolCall[] = [
          {
            tool_name: toolUseBlock.name,
            parameters: toolUseBlock.input
          }
        ];

        // Execute tools and get results
        const toolResults = await this.toolHandler.handleToolCalls(toolCalls);

        // Add assistant message to the conversation
        messages.push({ role: 'assistant', content: response.content });

        // Format the tool result as expected by Anthropic API
        if (toolUseBlock.id) {
          const toolResult = toolResults[0]; // We currently only handle one tool call at a time
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUseBlock.id,
                content: toolResult.content
              }
            ]
          });
        }
      } else {
        // No more tool calls, we're done
        hasToolCalls = false;
        // Find the text block
        const textBlock = response.content.find(
          (block) => block.type === 'text'
        );
        return textBlock && textBlock.type === 'text'
          ? textBlock.text
          : 'No text response';
      }
    }

    return 'Conversation completed';
  }
}

export { LlmClient };
