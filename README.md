# Reviewr - A TypeScript LLM Tool Execution Framework with Testing

This project provides a framework for sending prompts to LLMs (like Anthropic's Claude) and having them execute local tools. It uses Zod for schema validation and JSON Schema generation.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set your Anthropic API key in the `.env` file
4. Build the project: `npm run build`

## Usage

### CLI

```bash
# Send a prompt to the LLM
node dist/index.js prompt "Read the file README.md and summarize it"

# Send a prompt with a custom system prompt
node dist/index.js prompt "Process this text: Hello World" -s "You are an expert at text processing"

# Show all available tool schemas
node dist/index.js show-schemas

# Start the web server
node dist/index.js serve
```

### Web Server

Start the server:

```bash
node dist/index.js serve -p 3000
```

Send a request:

```bash
curl -X POST http://localhost:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Read the README.md file", "systemPrompt":"You are a helpful assistant."}'
```

## Creating Custom Tools

You can create custom tools by defining a Zod schema and an execution function. Here's an example:

```typescript
import { z } from 'zod';
import { Tool } from './lib/toolHandler';

// Define the schema for your tool parameters
const myToolSchema = z.object({
  input: z.string().min(1).describe('The input to process'),
  option: z.enum(['a', 'b', 'c']).describe('The processing option')
});

// Create the tool
const myTool: Tool<typeof myToolSchema> = {
  name: 'my_tool',
  description: 'Process input with different options',
  schema: myToolSchema,
  execute: async (params) => {
    // Your tool implementation here
    return { result: `Processed ${params.input} with option ${params.option}` };
  }
};

export { myTool };
```

Then register it in `src/index.ts`:

```typescript
import { myTool } from './tools/myTool';

// ...

toolHandler.registerTool(myTool);
```

## How It Works

1. The user sends a prompt to the LLM
2. The LLM may decide to use tools based on the prompt
3. Tool calls are intercepted, validated against their schemas, and executed
4. Results are sent back to the LLM
5. The LLM continues generating a response

The Zod schemas provide both runtime validation and generate JSON Schema for the LLM to understand the tool parameters.

## Testing

This project uses Jest for testing. The tests are located in the `__tests__` directories throughout the project.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Writing Tests

Tests are written using Jest. Each test file should be located next to the code it tests in an `__tests__` directory, with a `.test.ts` extension.

Example:

```typescript
// src/lib/__tests__/myModule.test.ts
import { myFunction } from '../myModule';

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe(expectedValue);
  });
});
```

### Test Coverage

The project aims to maintain high test coverage. Run `npm run test:coverage` to see the current coverage report.