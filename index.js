import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { diffLines } from "diff";

function estimateTokens(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function codiffTool({ original, modified }) {
  console.error('DEBUG: Processing inputs');
  
  try {
    if (typeof original !== 'string' || typeof modified !== 'string') {
      console.error('DEBUG: Invalid input format');
      return {
        content: [{
          type: "text",
          text: "Invalid input format: Both original and modified texts must be provided as strings"
        }],
        isError: true
      };
    }

    const diff = diffLines(original, modified);
    console.error('DEBUG: Diff computed successfully');

    const result = diff.map(part => ({
      type: part.added ? "insert" : part.removed ? "delete" : "equal",
      text: part.value
    }));

    const originalTokens = estimateTokens(original);
    const modifiedTokens = estimateTokens(modified);
    const inputCost = originalTokens + modifiedTokens;
    
    // Create the response data structure first
    const responseData = {
      diff: result,
      savings: {
        originalTokens,
        modifiedTokens,
        inputCost,
        outputCost: 0, // Will be calculated below
        estimatedSavings: 0 // Will be calculated below
      }
    };
    
    // Calculate the actual cost of sending this JSON response to an LLM
    const outputCost = estimateTokens(JSON.stringify(responseData, null, 2));
    const estimatedSavings = Math.max(0, inputCost - outputCost);
    
    // Update the response with actual costs
    responseData.savings.outputCost = outputCost;
    responseData.savings.estimatedSavings = estimatedSavings;

    const response = {
      content: [{
        type: "text",
        text: JSON.stringify(responseData, null, 2)
      }]
    };

    console.error('DEBUG: Response prepared');
    return response;
  } catch (error) {
    console.error('DEBUG: Error processing diff:', error);
    return {
      content: [{
        type: "text",
        text: `Error processing diff: ${error.message}`
      }],
      isError: true
    };
  }
}

async function runServer() {
  try {
    const server = new McpServer({
      name: "codiff-mcp",
      version: "0.2.2"
    });

    server.tool(
      "codiff",
      `Computes line-based differences between two text inputs, identifying additions, deletions, and unchanged content.

      Use this tool to:
      - Compare different versions of source code files
      - Analyze changes between text iterations
      - Track modifications in configuration files
      - Understand differences in any text content

      Returns structured JSON with diff array showing change types ('insert', 'delete', 'equal') and the actual text content.`,
      {
        original: z.string().describe("The original/baseline text content to compare against"),
        modified: z.string().describe("The modified/updated text content to compare with the original")
      },
      async (args) => codiffTool(args)
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Codiff MCP Server running on stdio');
  } catch (error) {
    console.error('Fatal error initializing server:', error);
    process.exit(1);
  }
}

runServer();