# 🔌 Multi-IDE & Client Integration Guide

This guide details how to configure `@putervision/vision-memory-mcp` across popular AI IDEs, CLI tools, and desktop clients.

---

## ⚡ Quick Setup (2 Steps)

### 1. Bootstrap Workspace

Run the initialization command in your target repository root to generate `.vision-memory-mcp/`, `.gitignore`, `.env`, and IDE agent rules:

```bash
vision-memory-mcp init --yes
```

### 2. Add MCP Server Configuration

---

## 💻 Client Configurations

### 1. Google Antigravity / Gemini CLI

**Config Location**: `~/.gemini/config/mcp_config.json`

```json
{
  "mcpServers": {
    "vision-memory-mcp": {
      "command": "vision-memory-mcp",
      "args": ["run"],
      "env": {
        "OPENAI_API_KEY": "sk-your-openai-key-optional"
      }
    }
  }
}
```

#### Security & Permission Grants (`~/.gemini/config/config.json`)

To allow AI agents to query the visual cache automatically without prompt dialogs, add these entries to `"userSettings"` -> `"globalPermissionGrants"` -> `"allow"`:

```json
"command(vision-memory-mcp)",
"read_file(.*\\.gemini/antigravity/brain/.*)",
"write_file(.*\\.gemini/antigravity/brain/.*)"
```

---

### 2. Cursor IDE

**Config Location**: `.cursor/mcp.json` or `Cursor Settings` ➔ `Features` ➔ `MCP`

```json
{
  "mcpServers": {
    "vision-memory-mcp": {
      "command": "vision-memory-mcp",
      "args": ["run"],
      "env": {
        "LANCEDB_PATH": ".vision-memory-mcp"
      }
    }
  }
}
```

---

### 3. Roo Code / Cline / Continue (VS Code)

**Config Location**: `.vscode/mcp.json` or `Global MCP Settings`

```json
{
  "servers": {
    "vision-memory-mcp": {
      "command": "vision-memory-mcp",
      "args": ["run"]
    }
  }
}
```

---

### 4. Windsurf IDE

**Config Location**: `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "vision-memory-mcp": {
      "command": "vision-memory-mcp",
      "args": ["run"]
    }
  }
}
```

---

### 5. Zed Editor

**Config Location**: `~/.config/zed/settings.json`

```json
{
  "context_servers": {
    "vision-memory-mcp": {
      "command": {
        "path": "vision-memory-mcp",
        "args": ["run"]
      }
    }
  }
}
```

---

### 6. Claude Desktop

**Config Location**:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vision-memory-mcp": {
      "command": "vision-memory-mcp",
      "args": ["run"]
    }
  }
}
```

---

## 🤖 Agent System Rules & Integration Prompt

To ensure your AI agent automatically leverages `vision-memory-mcp` before sending raw screenshots to vision LLMs, add this rule to your project's `.cursorrules`, `.windsurfrules`, `AGENTS.md`, or system prompt:

```markdown
<!-- vision-memory-mcp:start -->

# Visual Memory Rules

This project uses vision-memory-mcp to cache visual UI states and prevent redundant LLM vision calls.

## Mandatory Workflow

1. **Before visual checks**: Call `analyze_screenshot` with base64 screenshots.
2. **On Cache Hit (`is_known: true`)**: Do NOT query external vision models; reuse the cached `description`.
3. **On Cache Miss (`is_known: false`)**: Query your vision model, then call `analyze_screenshot` with the image and new description to seed the cache.
4. **Transition Tracking**: Call `record_outcome` after click/type/navigation steps.

<!-- vision-memory-mcp:end -->
```
