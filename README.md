# @putervision/vision-memory-mcp

[![npm version](https://img.shields.io/npm/v/@putervision/vision-memory-mcp.svg)](https://www.npmjs.com/package/@putervision/vision-memory-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@putervision/vision-memory-mcp.svg)](https://www.npmjs.com/package/@putervision/vision-memory-mcp)
[![CI](https://github.com/putervision/vision-memory-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/putervision/vision-memory-mcp/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18.18.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Website](https://img.shields.io/badge/Website-visionmemorymcp.com-06b6d4.svg)](https://visionmemorymcp.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/putervision/vision-memory-mcp/blob/main/LICENSE)

`@putervision/vision-memory-mcp` is a zero-infrastructure, local-first Model Context Protocol (MCP) server and CLI tool that provides AI coding assistants (such as Cursor, Claude Code, Gemini, or Copilot) with visual state caching using perceptual hashing, local CLIP embeddings, and transition graphs to eliminate repetitive vision LLM calls.

🌐 **Official Documentation & Website**: [visionmemorymcp.com](https://visionmemorymcp.com)

---

## ⚡ Quick Start & Installation

> **Prerequisites**: Node.js **>= 18.18.0**

### 1. Installation

```bash
# Global installation via npm
npm install -g @putervision/vision-memory-mcp
```

### 2. Workspace Initialization

Run `init` in your project root to scaffold database directories, `.gitignore`, `.env`, and IDE rules:

```bash
vision-memory-mcp init --yes
```

### 3. Basic MCP Client Setup

Add to your MCP client config (e.g. `.cursor/mcp.json` or `.vscode/mcp.json`):

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

### Alternative Options & CLI Usage Examples

```bash
# Run stdio MCP server directly via binary (after global install)
vision-memory-mcp run

# Start server skipping heavy CLIP model downloads (air-gapped / offline mode)
vision-memory-mcp run --skip-model-load

# Re-initialize across all registered workspace projects
vision-memory-mcp init-global

# Health check dependencies, sharp bindings, and git safety
vision-memory-mcp doctor

# Run health diagnostics & aggregate metrics across all registered projects
vision-memory-mcp doctor-global

# Inspect stored visual states and metadata in terminal ASCII table
vision-memory-mcp inspect

# Register baseline design mockup contract (Visual SDD)
vision-memory-mcp spec set --name "Dashboard" --file ./dashboard-spec.png

# Save visual memory checkpoint snapshot
vision-memory-mcp snapshot save --name "v1.0-milestone"

# Ingest WebM / MP4 video recording into visual state memory timeline
vision-memory-mcp video ingest ./playwright-test.webm --category playwright_test

# Open interactive force-directed visual graph viewer in browser
vision-memory-mcp view
```

---

## 🌟 Key Highlights

- **👁️ Perceptual Visual Caching**: Sub-5ms L1/L2 dHash zero-token fast-path layout recognition.
- **🎬 WebM & MP4 Video Ingestion**: Digest E2E test recordings & screen captures into searchable keyframe visual states & state transition graphs.
- **⚡ 15 Core MCP Tools**: High-coherence consolidated toolset covering perception, video memory, evidence packs, trajectory comparison, semantic retrieval, element grounding, visual SDD, snapshots, and unified context & metrics.
- **🔗 Dual-MCP Synergy & Immutable Evidence Packs**: Deeply bridges `@putervision/state-memory-mcp` task DAGs with visual state memory, generating cryptographically hashable evidence packs for compliance and audit trails.
- **📉 Reduced Token Overhead**: Caches UI states locally using dHash, local CLIP vector search, and accessibility trees to maximize vision token savings.
- **🚀 Sub-5ms Fast-Path Latency**: Eliminates repetitive vision LLM API calls and avoids visual hallucination loops.
- **🎯 Element Grounding & Action Target Prediction**: Maps screen elements to CSS selectors and coordinates for deterministic UI interaction.
- **🎨 Visual Spec-Driven Development (Visual SDD)**: Register design mockups or screenshots as perceptual baseline contracts to verify visual regression.
- **🛡️ 100% Local-First Privacy**: Local LanceDB vector store, local CLIP model, zero cloud telemetry, and PII redaction guarantees.

---

## 🛠️ MCP Tool Suite

`@putervision/vision-memory-mcp` provides **15 production-grade consolidated MCP tools** structured across 4 core visual perception & automation domains:

- **Perception & Semantic Search**: `analyze_screenshot` (L1/L2 perceptual dHash & AX tree parsing, single/batch), `recall_memory` (text & image semantic vector search), `get_session_context` (aggregated cache hit metrics, recent states).
- **Element Grounding & Navigation**: `predict_next_action` (deterministic CSS selectors & bounding coordinates), `record_outcome` (UI action transitions & visual blockers), `get_navigation_paths` (BFS shortest-path planner), `wait_for_visual_state` (polling for target UI state).
- **Video Trajectories & Evidence Packs**: `manage_video` (WebM/MP4 keyframe ingestion, timeline search), `compare_states` (visual layout diffs & video trajectory comparison), `create_evidence_pack` (cryptographic audit proof linking video keyframes to state-memory DAGs), `export_trajectories` (multimodal fine-tuning datasets).
- **Snapshots & Visual SDD**: `manage_visual_spec` (mockup baseline contracts & regression checks), `manage_snapshot` (checkpoints, export, restore), `undo_visual_mutation` (revert state ingestion), `forget_state` (privacy & PII purging).

👉 For complete parameter specifications, return schemas, and example payloads, see the **[Formal API Reference](docs/api-reference.md)** and **[Features & Architecture Guide](docs/features.md)**.

---

## 🚀 Architecture At a Glance

```
                     Incoming Screen
                            │
                            ▼
              ┌──────────────────────────────┐
              │ L1: In-Memory Cache Lookup   │ ──(Hit)──▶ Return Cached Description & Grounded Elements
              └──────────────┬───────────────┘
                             │ (Miss)
                             ▼
              ┌──────────────────────────────┐
              │ L2: Perceptual Hash Scan     │ ──(Hit)──▶ Return Cached Description & Grounded Elements
              └──────────────┬───────────────┘
                             │ (Miss)
                             ▼
              ┌──────────────────────────────┐
              │ L3: Local CLIP Vector Search │ ──(Hit)──▶ Return Semantically Close
              └──────────────┬───────────────┘
                             │ (Miss)
                             ▼
              ┌──────────────────────────────┐
              │ L4: Vision LLM Fallback      │ ──(Ingest)──▶ Save Redacted State to DB
              └──────────────┬───────────────┘
```

---

## 📚 Documentation Directory

Explore dedicated guides and deep dives in the [`docs/`](docs/) directory:

| Guide | Description |
| :--- | :--- |
| 🏗️ **[Architecture & Codebase Distillation](docs/codebase-distillation.md)** | High-signal architectural overview, 4-tier pipeline, module inventory, and design decisions. |
| 🚀 **[Features & Architecture](docs/features.md)** | Key features, 4-tier retrieval pipeline, element grounding, and Dual MCP Synergy. |
| 📘 **[Formal API Reference](docs/api-reference.md)** | Complete specifications, parameters, and schemas for all 15 consolidated MCP tools. |
| 🔌 **[Multi-IDE Integration Guide](docs/mcp-integration.md)** | Step-by-step configs for Cursor, Claude Desktop, Antigravity, Windsurf, Zed, Roo Code & Agent Rules. |
| 💻 **[CLI Commands Reference](docs/cli.md)** | Full guide for all 16 CLI management, visual spec, and snapshot commands. |
| ⚙️ **[Configuration Guide](docs/configuration.md)** | Complete `.env` environment variables, thresholds, and L4 vision fallback setup. |
| 🔒 **[Storage Encryption & Security](docs/STORAGE_ENCRYPTION.md)** | Encryption details, local storage privacy, and PII masking guarantees. |
| 🤝 **[Contributing Guide](CONTRIBUTING.md)** | Development setup, codebase structure, and submission guidelines. |
| 🛡️ **[Security Policy](SECURITY.md)** | Security vulnerability reporting and privacy disclosures. |
| 📜 **[Changelog](CHANGELOG.md)** | Chronological record of release features, fixes, and patch updates. |

---

## ⚠️ When Not to Use This Server

While `vision-memory-mcp` is designed for visual frontend state caching, UI testing, and multimodal workflows, it may not be appropriate for:
- **Headless / Pure Backend Development**: Non-visual CLI tools, database scripts, or pure backend microservices with no UI rendering. (Use `state-memory-mcp` standalone instead).
- **High-Framerate Live Video Streaming**: Continuous 60 fps live video ingest without discrete keyframe or test action boundaries.
- **Ultra Low-Memory Embedded Environments (<512 MB RAM)**: Running full local CLIP neural embeddings requires ~300 MB RAM (use `--skip-model-load` for lightweight dHash-only perception if memory is constrained).

---

## 🧪 Testing

```bash
# Run full unit and integration test suite across all 69 test files (300 tests)
npm run test
```

---

## ⚖️ License & Disclaimers

Developed and maintained by [PuterVision](https://putervision.com). Released under the [MIT License](LICENSE).

- **Local Storage Guarantee**: Provided "as is" without warranty. Screenshots, perceptual hashes, vector embeddings, and transition graphs are stored locally unencrypted at the application level in `.vision-memory-mcp/`. Zero telemetry or analytics data is ever transmitted.
- **Trademarks & Non-Affiliation**: Product names (Cursor, Claude Code, Gemini, Windsurf, VS Code, Sharp, LanceDB, ONNX, HuggingFace) are property of their respective owners and used solely for compatibility identification.
