# 🧠 vision-memory-mcp

An MCP (Model Context Protocol) server and CLI tool designed to cache visual UI states using perceptual hashing, local CLIP embeddings, and state transitions. It helps AI agents remember seen screens, reducing frontier model token usage and execution latency by up to 90%.

---

## 🚀 Key Features

- **Zero-Token Fast Path (L1/L2):** Uses Difference Hash (dHash) and Average Hash (aHash) to recognize identical or near-duplicate layouts in <5ms without sending images to LLMs.
- **Semantic Retrieval (L3):** Runs local CLIP ViT-B/32 model inference to find conceptually similar screens (e.g. "billing configuration form").
- **State Transition Graph:** Tracks agent actions (e.g., clicking a button) and transition outcomes (success/failure rates) to guide path-finding and prevent agents from repeating mistakes.
- **Visual Checkpoints:** Save, list, and diff snapshots of memory to identify visual regressions or layout modifications.
- **Interactive Visualizer:** Open a local force-directed graph view of the memory in your browser.

---

## 📦 Architecture Blueprint

```
                     Incoming Screen
                            │
                            ▼
             ┌──────────────────────────────┐
             │ L1: In-Memory Cache Lookup   │ ──(Hit)──▶ Return Cached Description
             └──────────────┬───────────────┘
                            │ (Miss)
                            ▼
             ┌──────────────────────────────┐
             │ L2: Perceptual Hash Scan     │ ──(Hit)──▶ Return Cached Description
             └──────────────┬───────────────┘
                            │ (Miss)
                            ▼
             ┌──────────────────────────────┐
             │ L3: Local CLIP Vector Search │ ──(Hit)──▶ Return Semantically Close
             └──────────────┬───────────────┘
                            │ (Miss)
                            ▼
             ┌──────────────────────────────┐
             │ L4: Vision LLM Fallback      │ ──(Ingest)──▶ Save New State to DB
             └──────────────┬───────────────┘
```

---

## 🛠️ Quick Start

### 1. Global Installation

```bash
npm install -g @putervision/vision-memory-mcp
```

Or install from source for development:

```bash
git clone https://github.com/putervision/vision-memory-mcp.git
cd vision-memory-mcp
npm install
npm run build
npm install -g .
```

### 2. Workspace Initialization

Run the following command in your target project root:

```bash
vision-memory-mcp init
```

This scaffolds `.vision-memory-mcp`, generates a default `.env` template, and adds configuration properties to your `.gitignore`.

### 3. Configure MCP Clients

#### Cursor IDE (`.cursor/mcp.json`)

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

#### Claude Desktop (Linux: `~/.config/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "vision-memory-mcp": {
      "command": "vision-memory-mcp",
      "args": ["run"],
      "env": {
        "LANCEDB_PATH": "/absolute/path/to/your/project/.vision-memory-mcp"
      }
    }
  }
}
```

### 4. Configure Agent Permissions (Bypass Prompt Dialogs)

To allow AI agents to query the visual cache and manage brain images automatically without requesting permission prompts, configure the security grants:

#### Google Antigravity Client (`~/.gemini/config/config.json`)

Add the following permission entries to `"userSettings"` -> `"globalPermissionGrants"` -> `"allow"`:

```json
"command(vision-memory-mcp)",
"read_file(.*\\.gemini/antigravity/brain/.*)",
"write_file(.*\\.gemini/antigravity/brain/.*)"
```

#### VS Code / Cursor IDE (`settings.json`)

Ensure you allow:

- `command(vision-memory-mcp)`
- Read/write permissions for the local `.vision-memory-mcp/` workspace database.

---

## 🔌 MCP Tools (10 Available)

| Tool                        | Purpose                                                           | Key Inputs                                                                  |
| --------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `analyze_screenshot`        | Check visual cache / ingest new screen                            | `screenshot` (base64, req), `description` (opt), `accessibility_tree` (opt) |
| `recall_memory`             | Find past screens via query or image                              | `query` (text, opt), `screenshot` (base64, opt), `limit` (opt)              |
| `record_outcome`            | Log action success and build navigation path                      | `from_state_id` (req), `to_state_id` (req), `action` (req), `success` (req) |
| `get_navigation_paths`      | Find optimal BFS path between UI states                           | `from_state_id` (opt), `to_description` (opt)                               |
| `compare_states`            | Compare visual and structural diffs                               | `state_a_id` (req), `state_b_id` (req)                                      |
| `get_session_context`       | Retrieve summary context briefing                                 | `include_recent` (opt), `include_frequent` (opt)                            |
| `save_visual_snapshot`      | Save checkpoint of visual memory states                           | `name` (req), `description` (opt)                                           |
| `diff_visual_snapshots`     | Diff two checkpoints for visual drift                             | `snapshot_a_name` (req), `snapshot_b_name` (req)                            |
| `undo_last_visual_mutation` | Revert the last state or edge mutation                            | `type` ('state' \| 'transition' \| 'any')                                   |
| `create_visual_blocker`     | Generate structured visual blocker payload for `state-memory-mcp` | `visual_state_id` (req), `description` (req), `project` (opt)               |

---

## 💻 CLI Commands

- **`vision-memory-mcp run`**: Launches the MCP stdio server.
- **`vision-memory-mcp init`**: Bootstraps environment and IDE rules.
- **`vision-memory-mcp inspect`**: Prints an ASCII table of stored states.
- **`vision-memory-mcp metrics`**: Displays ROI metrics, token savings, and cached sizes.
- **`vision-memory-mcp view`**: Opens a local force-directed graph view of the memory in your browser.
- **`vision-memory-mcp snapshot <save|diff|list>`**: Manage visual checkpoints.
- **`vision-memory-mcp undo`**: Revert the last visual mutation.
- **`vision-memory-mcp optimize`**: Compacts LanceDB storage.
- **`vision-memory-mcp prune`**: Cleans up expired states.
- **`vision-memory-mcp backup --out <file>`**: Back up LanceDB to tarball.
- **`vision-memory-mcp restore <file>`**: Restore LanceDB from tarball.

---

## ⚙️ Configuration

Set these environment variables in your `.env` file:

```bash
LANCEDB_PATH=.vision-memory-mcp        # Storage path for LanceDB
LANCEDB_CACHE_SIZE=100                  # Maximum hot items in LRU Cache
HASH_EXACT_THRESHOLD=5                  # Hamming distance <= this = exact hit
HASH_SIMILAR_THRESHOLD=10               # Hamming distance <= this = similar hit
CLIP_MODEL=Xenova/clip-vit-base-patch32 # Embedding model name
EMBEDDING_DIMENSIONS=512                # CLIP embedding output dimension
VISION_MODEL_ENABLED=false              # Enable L4 vision fallback
VISION_MODEL_ENDPOINT=http://localhost:1234/v1 # Vision model server URL
VISION_MODEL_NAME=gpt-4o               # Vision model identifier
OPENAI_API_KEY=your-api-key-here        # Required if using OpenAI endpoints for L4 fallback
LOG_LEVEL=info                          # log levels (debug, info, warn, error)
TTL_DEFAULT_MS=604800000                # Eviction TTL (default: 7 days)
```

---

## 🤝 Contributing

Contributions are welcome! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) guide for details on development setup, architecture, and submission guidelines.

---

## 📄 License & Credits

Built by [PuterVision](https://putervision.com).

[MIT License](LICENSE) © 2026 PuterVision LLC
