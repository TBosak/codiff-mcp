# Codiff MCP Server

A simple MCP server that computes line-based diffs between two text inputs.

## Setup in Cursor

Add this to your `~/.cursor/mcp.json` file under `mcpServers`:

```json
{
  "mcpServers": {
    "codiff-mcp": {
      "command": "npx",
      "args": ["-y", "codiff-mcp@latest"]
    }
  }
}
```

## Usage

The tool provides a single `codiff` function that takes two text inputs:

- `original`: The baseline text to compare against
- `modified`: The updated text to compare

## Rule for Cursor

To automatically use codiff whenever you ask for comparisons, add this rule to your project's `.cursorrules` file:

```json
{
    "rules": {
        "general_rules": [
            {
                "description": "When the user requests comparisons, diffs, or change analysis between any text/code (e.g., 'compare these files', 'what changed', 'show differences', 'diff these code blocks'), ALWAYS use the codiff MCP tool first instead of manual analysis. Use codiff for file comparisons, version analysis, before/after comparisons, and any request involving 'compare', 'diff', 'changes', or 'differences'. Process: 1) Call codiff tool with original and modified inputs, 2) Present structured diff results, 3) Explain key changes focusing on insertions/deletions, 4) Highlight impact of changes.",
                "type": "tool_prioritization_codiff"
            }
        ]
    }
}
```

This ensures Cursor automatically uses codiff whenever you ask questions like:
- "Compare these two files"
- "What changed between these versions?"
- "Show me the differences"
- "Diff these code blocks"

## Example

**Input:**
```
original: "Hello world"
modified: "Hello beautiful world"
```

**Output:**
```json
{
  "diff": [
    {"type": "equal", "text": "Hello "},
    {"type": "insert", "text": "beautiful "},
    {"type": "equal", "text": "world"}
  ],
  "savings": {
    "originalTokens": 2,
    "modifiedTokens": 3,
    "inputCost": 5,
    "outputCost": 4,
    "estimatedSavings": 1
  }
}
```
