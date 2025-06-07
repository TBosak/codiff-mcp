# Codiff MCP Server

A Model Context Protocol (MCP) server for intelligent text diffing with token optimization.

## Features

- **Smart Change Detection**: Shows only insertions/deletions by default to minimize tokens
- **Identical Text Optimization**: Returns "identical" immediately for identical texts
- **Token-Saving Mode**: Delegates small/similar diffs to LLM when more efficient
- **Accuracy Mode**: Optional full context including unchanged text (with cost warnings)
- **Cost Transparency**: Warns when diff tool costs more than original texts

## Quick Setup

### Standard Mode (Recommended)
Shows only changes, minimizes token usage:

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

### Token-Saving Mode
Smart delegation to LLM for efficiency:

```json
{
  "mcpServers": {
    "codiff-mcp": {
      "command": "npx",
      "args": ["-y", "codiff-mcp@latest", "--save-tokens"]
    }
  }
}
```

### Accuracy Mode
⚠️ Includes unchanged text (may increase costs):

```json
{
  "mcpServers": {
    "codiff-mcp": {
      "command": "npx",
      "args": ["-y", "codiff-mcp@latest", "--accuracy"]
    }
  }
}
```

## Usage

The `codiff` tool compares two text inputs:
- `original`: Baseline text
- `modified`: Updated text

### Modes

| Mode | Flags | Behavior |
|------|-------|----------|
| **Standard** | (default) | Shows only changes, warns about costs |
| **Token-Saving** | `--save-tokens`, `-s` | Delegates small/similar diffs to LLM |
| **Accuracy** | `--accuracy`, `-a` | Includes unchanged text ⚠️ |
| **Combined** | `-s -a` | Smart delegation + full context |

## Examples

### Identical Texts
```json
{
  "result": "identical",
  "message": "The provided texts are identical - no differences found.",
  "savings": { "estimatedSavings": 5 }
}
```

### Standard Mode (Changes Only)
```json
{
  "diff": [
    {"type": "delete", "text": "Hello world\n"},
    {"type": "insert", "text": "Hello beautiful world\n"}
  ],
  "mode": "standard",
  "savings": { "estimatedSavings": 5 }
}
```

### Cost Warning
```json
{
  "warnings": [
    "INCREASED COST: This diff costs 5 more tokens than sending the original texts."
  ]
}
```

### Token-Saving Delegation
```json
{
  "result": "delegate_to_llm",
  "message": "For optimal token efficiency, please analyze these texts directly...",
  "recommendation": "Compare manually by scanning for differences..."
}
```

## Auto-Usage Rule

Add to `.cursorrules` for automatic diffing:

```json
{
  "rules": {
    "general_rules": [
      {
        "description": "When the user requests comparisons, diffs, or change analysis, ALWAYS use the codiff MCP tool first. Use for file comparisons, version analysis, and any request involving 'compare', 'diff', 'changes', or 'differences'.",
        "type": "tool_prioritization_codiff"
      }
    ]
  }
}
```

## Development

```bash
npm run start              # Standard mode
npm run start:save-tokens  # Token-saving mode  
npm run start:accuracy    # Accuracy mode
npm run start:full        # Combined mode
```
