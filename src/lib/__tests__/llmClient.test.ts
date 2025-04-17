import { jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LlmClient } from '../llmClient';
import { ToolHandler, Tool, getToolSchema } from '../toolHandler';
import { z } from 'zod';

// Mock the getToolSchema function
jest.mock('../toolHandler', () => {
  const originalModule = jest.requireActual('../toolHandler');
  return {
    ...originalModule,
    getToolSchema: jest.fn().mockReturnValue({})
  };
});

// Mock Anthropic and fs modules
jest.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockImplementation(async ({ messages }) => {
          // Return a response that includes both text and tool_use blocks
          // depending on what we're testing
          return {
            content: [{ type: 'text', text: 'Test response' }],
            // Track that we would have added the message to conversation
            _simulateConversation: () => {
              // This is just to simulate that the client adds to messages array in the real implementation
              messages.push({ role: 'assistant', content: [{ type: 'text', text: 'Test response' }] });
            }
          };
        }),
        countTokens: jest.fn().mockResolvedValue({
          input_tokens: 10
        })
      }
    }))
  };
});

jest.mock('fs/promises');

describe('LlmClient', () => {
  let llmClient: LlmClient;
  let toolHandler: ToolHandler;
  const testLogDir = './test-logs';
  const mockApiKey = 'mock-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    
    toolHandler = new ToolHandler();
    // Mock the getToolsSchema method
    toolHandler.getToolsSchema = jest.fn().mockReturnValue([]);
    
    llmClient = new LlmClient(mockApiKey, toolHandler, testLogDir);
  });

  test('should create log directory if it does not exist', () => {
    expect(fs.mkdir).toHaveBeenCalledWith(testLogDir, { recursive: true });
  });

  test('should log conversation when logDirectory is provided', async () => {
    // Run with tools
    const response = await llmClient.runWithTools(
      'Test prompt',
      'Test system prompt',
      'test-key',
      [] // No additional tools
    );
    
    // Check response
    expect(response).toBe('Test response');
    
    // Check if writeFile was called
    expect(fs.writeFile).toHaveBeenCalled();
    
    // Get the arguments passed to writeFile
    const writeFileArgs = (fs.writeFile as jest.Mock).mock.calls[0];
    
    // First arg should be a path in the log directory
    const filePath = writeFileArgs[0];
    // Fix the path comparison since path.join might not include the exact string
    expect(filePath.includes(testLogDir.replace('./', ''))).toBe(true);
    expect(filePath).toContain('conversation-');
    expect(filePath).toContain('-test-key');
    expect(filePath.endsWith('.json')).toBe(true);
    
    // Second arg should be the JSON string
    const fileContent = JSON.parse(writeFileArgs[1]);
    expect(fileContent).toHaveProperty('systemPrompt', 'Test system prompt');
    expect(fileContent).toHaveProperty('logKey', 'test-key');
    expect(fileContent).toHaveProperty('messages');
    expect(fileContent.messages).toHaveLength(2); // user prompt and assistant response
  });

  test('should not log conversation when logDirectory is not provided', async () => {
    // Create a client without a log directory
    const clientWithoutLogging = new LlmClient(mockApiKey, toolHandler);
    
    // Run with tools
    await clientWithoutLogging.runWithTools('Test prompt');
    
    // Check that writeFile was not called
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});