import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { diffLines } from "diff";

const args = process.argv.slice(2);
const tokenSavingMode = args.includes('--save-tokens') || args.includes('-s');
const accuracyMode = args.includes('--accuracy') || args.includes('-a');

function estimateTokens(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function areTextsIdentical(original, modified) {
  return original === modified;
}

function shouldUseLLMForDiff(original, modified) {
  if (!tokenSavingMode) return false;
  
  const originalTokens = estimateTokens(original);
  const modifiedTokens = estimateTokens(modified);
  const inputCost = originalTokens + modifiedTokens;
  
  // Don't delegate if texts are large
  if (inputCost > 1000) return false;
  
  // Pre-compute what the actual diff would look like
  const diff = diffLines(original, modified);
  const changesOnly = diff.filter(part => part.added || part.removed);
  
  // If there are no changes, we'll return "identical" anyway, so don't delegate
  if (changesOnly.length === 0) return false;
  
  // Calculate the actual token cost of both approaches
  const delegationResponse = {
    result: "delegate_to_llm",
    message: "For optimal token efficiency, please analyze these texts directly rather than using the diff tool. The texts appear to have minor differences that you can identify more cost-effectively.",
    recommendation: "Compare the texts manually by scanning for differences in IDs, formatting, or content. Focus on semantic changes rather than cosmetic ones.",
    input_info: {
      originalTokens,
      modifiedTokens,
      inputCost,
      estimated_diff_tool_cost: inputCost + 50
    }
  };
  
  const diffResponse = {
    diff: changesOnly.map(part => ({
      type: part.added ? "insert" : part.removed ? "delete" : "equal",
      text: part.value
    })),
    mode: "standard",
    savings: {
      originalTokens,
      modifiedTokens,
      inputCost,
      outputCost: 0,
      estimatedSavings: 0
    }
  };
  
  const delegationCost = estimateTokens(JSON.stringify(delegationResponse, null, 2));
  const diffCost = estimateTokens(JSON.stringify(diffResponse, null, 2));
  
  // Only delegate if the delegation response is actually cheaper AND 
  // the similarity is very high (meaning the diff would be complex to understand)
  const similarity = calculateSimilarity(original, modified);
  
  return (delegationCost < diffCost && similarity > 0.9 && inputCost < 200);
}

function calculateSimilarity(text1, text2) {
  const len1 = text1.length;
  const len2 = text2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 1;
  
  let matches = 0;
  const minLen = Math.min(len1, len2);
  
  for (let i = 0; i < minLen; i++) {
    if (text1[i] === text2[i]) matches++;
  }
  
  return matches / maxLen;
}

function processDiffResult(diff, includeEqual = false) {
  const result = diff.map(part => ({
    type: part.added ? "insert" : part.removed ? "delete" : "equal",
    text: part.value
  }));

  if (!includeEqual) {
    return result.filter(part => part.type !== "equal");
  }
  
  return result;
}

function addCostWarnings(responseData, inputCost) {
  const outputCost = responseData.savings.outputCost;
  const estimatedSavings = responseData.savings.estimatedSavings;
  
  const warnings = [];
  
  if (accuracyMode) {
    warnings.push("ACCURACY MODE: Including unchanged text ('equal' parts) may increase token costs significantly.");
  }
  
  if (estimatedSavings <= 0) {
    if (estimatedSavings === 0) {
      warnings.push("NO TOKEN SAVINGS: This diff provides no token savings over sending the original texts.");
    } else {
      warnings.push(`INCREASED COST: This diff costs ${Math.abs(estimatedSavings)} more tokens than sending the original texts.`);
    }
  }
  
  if (warnings.length > 0) {
    responseData.warnings = warnings;
  }
  
  return responseData;
}

function codiffTool({ original, modified }) {
  try {
    if (typeof original !== 'string' || typeof modified !== 'string') {
      return {
        content: [{
          type: "text",
          text: "Invalid input format: Both original and modified texts must be provided as strings"
        }],
        isError: true
      };
    }

    if (areTextsIdentical(original, modified)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            result: "identical",
            message: "The provided texts are identical - no differences found.",
            savings: {
              originalTokens: estimateTokens(original),
              modifiedTokens: estimateTokens(modified),
              inputCost: estimateTokens(original) + estimateTokens(modified),
              outputCost: 15,
              estimatedSavings: estimateTokens(original) + estimateTokens(modified) - 15
            }
          }, null, 2)
        }]
      };
    }

    if (shouldUseLLMForDiff(original, modified)) {
      const originalTokens = estimateTokens(original);
      const modifiedTokens = estimateTokens(modified);
      const inputCost = originalTokens + modifiedTokens;
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            result: "delegate_to_llm",
            message: "For optimal token efficiency, please analyze these texts directly rather than using the diff tool. The texts appear to have minor differences that you can identify more cost-effectively.",
            recommendation: "Compare the texts manually by scanning for differences in IDs, formatting, or content. Focus on semantic changes rather than cosmetic ones.",
            input_info: {
              originalTokens,
              modifiedTokens,
              inputCost,
              estimated_diff_tool_cost: inputCost + 50
            }
          }, null, 2)
        }]
      };
    }

    const diff = diffLines(original, modified);
    const result = processDiffResult(diff, accuracyMode);

    const originalTokens = estimateTokens(original);
    const modifiedTokens = estimateTokens(modified);
    const inputCost = originalTokens + modifiedTokens;
    
    const responseData = {
      diff: result,
      mode: accuracyMode ? "accuracy" : "standard",
      savings: {
        originalTokens,
        modifiedTokens,
        inputCost,
        outputCost: 0,
        estimatedSavings: 0
      }
    };
    
    const outputCost = estimateTokens(JSON.stringify(responseData, null, 2));
    const estimatedSavings = Math.max(0, inputCost - outputCost);
    
    responseData.savings.outputCost = outputCost;
    responseData.savings.estimatedSavings = estimatedSavings;

    addCostWarnings(responseData, inputCost);

    return {
      content: [{
        type: "text",
        text: JSON.stringify(responseData, null, 2)
      }]
    };
  } catch (error) {
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
    let serverName = "codiff-mcp";
    let version = "0.2.7";
    
    if (tokenSavingMode && accuracyMode) {
      serverName = "codiff-mcp (token-saving + accuracy mode)";
      version = "0.2.6-ts-acc";
    } else if (tokenSavingMode) {
      serverName = "codiff-mcp (token-saving mode)";
      version = "0.2.6-ts";
    } else if (accuracyMode) {
      serverName = "codiff-mcp (accuracy mode)";
      version = "0.2.6-acc";
    }
    
    const server = new McpServer({
      name: serverName,
      version: version
    });

    let toolDescription;

    if (tokenSavingMode && accuracyMode) {
      toolDescription = `Computes line-based differences with token optimization and full accuracy.
      
• Returns "identical" for identical texts
• Delegates small/similar texts to LLM for efficiency  
• Includes unchanged text ("equal" parts) for complete context
• Warns about token cost implications`;
    } else if (tokenSavingMode) {
      toolDescription = `Computes line-based differences with token efficiency prioritization.

• Returns "identical" for identical texts
• Delegates small/similar texts to LLM when more efficient
• Shows only changes (insertions/deletions) to minimize tokens
• Only uses full diffing when it provides significant savings`;
    } else if (accuracyMode) {
      toolDescription = `Computes line-based differences with full accuracy mode.

• Includes unchanged text ("equal" parts) for complete context
• Always performs full diff analysis regardless of token costs
• Provides comprehensive change analysis
• ⚠️ WARNING: May significantly increase token costs`;
    } else {
      toolDescription = `Computes line-based differences, showing only changes to minimize token usage.

• Shows only insertions and deletions (excludes unchanged text)
• Returns "identical" for identical texts
• Warns when diff costs more tokens than original texts
• Use --accuracy to include unchanged text`;
    }

    server.tool(
      "codiff",
      toolDescription,
      {
        original: z.string().describe("The original/baseline text content to compare against"),
        modified: z.string().describe("The modified/updated text content to compare with the original")
      },
      async (args) => codiffTool(args)
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    let modeMessage = '';
    if (tokenSavingMode && accuracyMode) {
      modeMessage = ' (token-saving + accuracy mode enabled)';
    } else if (tokenSavingMode) {
      modeMessage = ' (token-saving mode enabled)';
    } else if (accuracyMode) {
      modeMessage = ' (accuracy mode enabled)';
    }
    
    console.error(`Codiff MCP Server running on stdio${modeMessage}`);
  } catch (error) {
    console.error('Fatal error initializing server:', error);
    process.exit(1);
  }
}

runServer();