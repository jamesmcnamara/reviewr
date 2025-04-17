# Conversation Logging Example

## Environment Setup

To enable conversation logging, set the `LOG_DIRECTORY` environment variable in your `.env` file:

```
ANTHROPIC_API_KEY=your_api_key_here
LOG_DIRECTORY=./logs
```

## Usage from CLI

You can use the CLI with the `-k` or `--key` option to add a log key to your conversations:

```bash
# Run a prompt and log the conversation with a specific key
node dist/index.js prompt "Explain the concept of dependency injection" -k "di-explanation"

# The conversation will be logged to a file like: 
# ./logs/conversation-2025-04-17T09-46-43-449Z-di-explanation.json
```

## Usage from API

When using the API, you can include a `logKey` in your request:

```bash
curl -X POST http://localhost:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain how REST APIs work", 
    "systemPrompt": "You are a helpful assistant.", 
    "logKey": "rest-api-explanation"
  }'
```

## Log File Structure

The log files are JSON files with the following structure:

```json
{
  "timestamp": "2025-04-17T09:46:43.449Z",
  "systemPrompt": "You are a helpful assistant.",
  "messages": [
    {
      "role": "user",
      "content": "Explain how REST APIs work"
    },
    {
      "role": "assistant",
      "content": [...]
    },
    // Additional messages if there were tool calls
  ],
  "logKey": "rest-api-explanation"
}
```

## Programmatic Usage

You can also use the LlmClient with a log directory in your own code:

```typescript
import { LlmClient } from './lib/llmClient';
import { ToolHandler } from './lib/toolHandler';

// Initialize client with a log directory
const toolHandler = new ToolHandler();
const llmClient = new LlmClient(apiKey, toolHandler, './conversations');

// Use runWithTools with a logKey
const response = await llmClient.runWithTools(
  'Explain TypeScript generics',
  'You are a TypeScript expert',
  'typescript-generics'
);
```