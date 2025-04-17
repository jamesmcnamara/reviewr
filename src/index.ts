import dotenv from 'dotenv';
import { Command } from 'commander';
import express from 'express';
import fs from 'fs/promises';
import { ToolHandler } from './lib/toolHandler';
import { LlmClient } from './lib/llmClient';
import { fileTool, listFilesTool } from './tools/fileTool';
import { diffOrderingTool } from './tools/diffOrderingTool';
import { readDiffFile } from './tools/diffTool';

dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

// Set up tools
const toolHandler = new ToolHandler();
toolHandler.registerTool(fileTool);
toolHandler.registerTool(listFilesTool);
toolHandler.registerTool(diffOrderingTool);
// Get log directory from environment if specified
const logDirectory = process.env.LOG_DIRECTORY;

// Initialize LLM client
const llmClient = new LlmClient(apiKey, toolHandler, logDirectory);

const program = new Command();

program
  .version('1.0.0')
  .description(
    'A CLI tool and web server for interacting with LLMs and executing local tools'
  );

// CLI command for sending a prompt
program
  .command('prompt <text>')
  .description('Send a prompt to the LLM')
  .option('-s, --system <text>', 'System prompt to use')
  .option('-k, --key <key>', 'Log key to identify this conversation in logs')
  .action(async (text, options) => {
    try {
      const response = await llmClient.runWithTools(
        text,
        options.system,
        options.key
      );
      console.log('\nLLM Response:');
      console.log(response);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(0);
  });

program
  .command('tokens')
  .description('Get the number of tokens in a diff')
  .action(async () => {
    try {
      const diff = await fs.readFile('./patches/grader-patch.diff', 'utf-8');
      const tokens = await llmClient.countTokens(diff);
      console.log(`Number of tokens: ${tokens}`);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(0);
  });

program
  .command('read-diff')
  .description('Read a diff file and print as JSON')
  .option(
    '-p, --path <path>',
    'Path to the diff file',
    './patches/test-diff.diff'
  )
  .action(async (options) => {
    try {
      const result = await readDiffFile(options.path);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(0);
  });

program
  .command('order-diff')
  .description('Order a git diff file for optimal review')
  .option(
    '-i, --input <path>',
    'Path to the input diff file',
    './patches/grader-patch.diff'
  )
  .option(
    '-o, --output <path>',
    'Path to save the ordered diff',
    './ordered-diff.md'
  )
  .action(async (options) => {
    try {
      console.log(`Processing diff file: ${options.input}`);
      const result = await toolHandler.handleToolCalls([
        {
          tool_name: 'order_diff',
          parameters: {
            diffPath: options.input,
            outputPath: options.output
          }
        }
      ]);

      console.log(JSON.parse(result[0].content).message);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(0);
  });

// Command to display all tool schemas
program
  .command('show-schemas')
  .description('Display JSON schemas for all registered tools')
  .action(() => {
    const schemas = toolHandler.getToolsSchema();
    console.log(JSON.stringify(schemas, null, 2));
    process.exit(0);
  });

// Web server
program
  .command('serve')
  .description('Start the web server')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .action((options) => {
    const app = express();
    const port = parseInt(options.port, 10);

    app.use(express.json());

    // Create the router
    const router = express.Router();

    // Define the route on the router
    router.post('/prompt', (req, res) => {
      try {
        const { prompt, systemPrompt, logKey } = req.body;

        if (!prompt) {
          return res.status(400).json({ error: 'Prompt is required' });
        }

        llmClient
          .runWithTools(prompt, systemPrompt, logKey)
          .then((response) => res.json({ response }))
          .catch((error) =>
            res.status(500).json({
              error: error instanceof Error ? error.message : String(error)
            })
          );
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Use the router
    app.use('/api', router);

    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  });

// Parse the command line arguments
program.parse(process.argv);

// If no command is provided, display help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
