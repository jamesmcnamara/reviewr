import { Anthropic } from '@anthropic-ai/sdk';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';

// Define our own types to match Anthropic's API
type MessageParam = {
  role: 'user' | 'assistant';
  content: string | any[];
  name?: string;
};

import { ToolHandler, ToolCall, Tool, getToolSchema } from './toolHandler';

class LlmClient {
  private client: Anthropic;
  private toolHandler: ToolHandler;

  constructor(apiKey: string, toolHandler: ToolHandler, private logDirectory?: string) {
    this.client = new Anthropic({ apiKey });
    this.toolHandler = toolHandler;
    
    // Create log directory if specified and doesn't exist
    if (this.logDirectory) {
      try {
        if (!fs.existsSync(this.logDirectory)) {
          fs.mkdirSync(this.logDirectory, { recursive: true });
        }
      } catch (err) {
        console.error(`Failed to create log directory: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
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
    systemPrompt: string = 'You are a helpful assistant.',
    logKey?: string,
    ...additionalTools: Tool<any>[]
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
        tools: this.toolHandler
          .getToolsSchema()
          .concat(additionalTools.map(getToolSchema))
      });
      
      // For testing purposes - allows our mock to simulate adding messages
      // @ts-ignore - This property is added by our test mock
      if (response._simulateConversation) {
        // @ts-ignore - This method is added by our test mock
        response._simulateConversation();
      }

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
        // Log the conversation if logDirectory is specified
        if (this.logDirectory) {
          this.logConversation(messages, systemPrompt, logKey);
        }
        
        return textBlock && textBlock.type === 'text'
          ? textBlock.text
          : 'No text response';
      }
    }

    return 'Conversation completed';
  }
  
  /**
   * Logs the conversation to a JSON file in the specified log directory
   */
  private async logConversation(messages: MessageParam[], systemPrompt: string, logKey?: string): Promise<void> {
    console.log(`Attempting to log conversation with ${messages.length} messages and key ${logKey || 'none'}`);  
    if (!this.logDirectory) return;
    
    try {
      // Create a unique filename incorporating date and optional key
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const keyPart = logKey ? `-${logKey.replace(/[^a-zA-Z0-9-]/g, '_')}` : '';
      const filename = `conversation-${timestamp}${keyPart}.json`;
      const filePath = path.join(this.logDirectory, filename);
      
      // Prepare the data to log
      const logData = {
        timestamp: new Date().toISOString(),
        systemPrompt,
        messages,
        logKey
      };
      
      // Convert any content arrays to strings for cleaner logging
      const sanitizedData = {
        ...logData,
        messages: logData.messages.map(msg => {
          if (Array.isArray(msg.content)) {
            // For assistant messages with complex content, simplify for logging
            return {
              ...msg,
              content: JSON.stringify(msg.content)
            };
          }
          return msg;
        })
      };
      
      // For debugging
      console.log(`Writing log to ${filePath}`);
      console.log(`Log data: ${JSON.stringify(sanitizedData).substring(0, 100)}...`);
      
      // Write the file
      try {
        // Use synchronous write to ensure completion before exiting
        fs.writeFileSync(filePath, JSON.stringify(sanitizedData, null, 2), 'utf-8');
        console.log(`Conversation logged to ${filePath}`);
      } catch (writeError) {
        console.error(`Failed to write log file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
      }
    } catch (error) {
      console.error('Failed to log conversation:', error);
    }
  }
}

export { LlmClient };
