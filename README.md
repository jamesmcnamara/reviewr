# Reviewr - A TypeScript LLM Tool Execution Framework with Testing

This project provides a framework for sending prompts to LLMs (like Anthropic's Claude) and having them execute local tools. It uses Zod for schema validation and JSON Schema generation.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set your Anthropic API key in the `.env` file
4. (Optional) Set a log directory in the `.env` file: `LOG_DIRECTORY=./logs`
5. Build the project: `npm run build`

## Usage

### CLI

```bash
# Send a prompt to the LLM
node dist/index.js prompt "Read the file README.md and summarize it"

# Send a prompt with a custom system prompt
node dist/index.js prompt "Process this text: Hello World" -s "You are an expert at text processing"

# Send a prompt and log the conversation with a unique key
node dist/index.js prompt "Analyze this code" -k "code-analysis-1"

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
  -d '{"prompt":"Read the README.md file", "systemPrompt":"You are a helpful assistant.", "logKey":"readme-analysis"}'
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
6. If logging is enabled, the conversation is saved to a JSON file in the specified directory

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

## Git Diff Ordering Tool

This project includes a tool for ordering git diffs in a logical way to make them easier for humans to review. The tool uses an LLM to build a dependency graph of the changes, then topologically sorts them to present the most fundamental changes first.

### How It Works

1. The tool parses a git diff file into chunks
2. It processes each chunk with an LLM to determine dependencies between chunks
3. It builds a dependency graph where nodes are chunks and edges represent "depends on" relationships
4. It performs a topological sort on the graph to order changes from most fundamental to most dependent
5. It generates a Markdown output with the ordered diff chunks

### Usage

```bash
# Process a diff file with default options
node dist/index.js order-diff

# Process a specific diff file and save output to a custom location
node dist/index.js order-diff -i path/to/changes.diff -o ordered-review.md
```

### Algorithm Details

The dependency graph algorithm works by:

1. Processing each chunk individually with an LLM that analyzes what entities it modifies (functions, classes, interfaces)
2. Having the LLM identify dependencies between each chunk and previously processed chunks (e.g., "this implementation depends on that interface")
3. Building a directed graph structure where nodes are diff chunks and edges represent "depends on" relationships
4. Performing a topological sort to order the changes from most fundamental to most dependent
5. Handling cycles in the dependency graph gracefully by breaking them when needed

This approach works well even with very large diffs because it processes chunks incrementally, allowing the LLM to build a global understanding of the changes over time without needing to see the entire diff at once.

### Implementation Details

Our implementation in this project follows these specific steps:

1. Parse the git diff into chunks using the `parse-diff` library
2. For each chunk, extract the added content and create a proper patch representation
3. Process each chunk sequentially, asking the LLM to identify dependencies on previously processed chunks
4. Build a dependency graph where nodes are diff chunks and edges represent dependencies
5. Sort the graph topologically to get the optimal review order
6. Generate a formatted Markdown document with the ordered diff chunks

The topological sort algorithm is implemented to handle cycles gracefully, which can occur in real-world code changes with circular dependencies.