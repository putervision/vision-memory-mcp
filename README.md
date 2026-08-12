# @putervision/vision-memory-mcp

[![npm version](https://img.shields.io/npm/v/@putervision/vision-memory-mcp.svg)](https://www.npmjs.com/package/@putervision/vision-memory-mcp)
[![Website](https://img.shields.io/badge/Website-visionmemorymcp.com-06b6d4.svg)](https://visionmemorymcp.com)
[![License](https://img.shields.io/npm/l/@putervision/vision-memory-mcp.svg)](https://github.com/putervision/vision-memory-mcp/blob/main/LICENSE)

`@putervision/vision-memory-mcp` is a zero-infrastructure, local-first Model Context Protocol (MCP) server and CLI tool that provides AI coding assistants (such as Cursor, Claude Code, Gemini, or Copilot) with visual state caching using perceptual hashing, local CLIP embeddings, and transition graphs to eliminate repetitive vision LLM calls.

🌐 **Official Documentation & Website**: [visionmemorymcp.com](https://visionmemorymcp.com)

---

## ⚡ Quick Start & Installation

> **Prerequisites**: Node.js **>= 18.17.0**

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
- **⚡ 29 Core MCP Tools**: Full visual state ingestion, video memory parsing, evidence packs (`create_evidence_pack`), trajectory comparison, semantic vector retrieval, element grounding, visual SDD, and snapshot checkpoints.
- **🔗 Dual-MCP Synergy & Immutable Evidence Packs**: Deeply bridges `@putervision/state-memory-mcp` task DAGs with visual state memory, generating cryptographically hashable evidence packs for compliance and audit trails.
- **📉 Reduced Token Overhead**: Caches UI states locally using dHash, local CLIP vector search, and accessibility trees so some savings on vision tokens can be expected.
- **🚀 Sub-5ms Fast-Path Latency**: Eliminates repetitive vision LLM API calls and avoids visual hallucination loops.
- **🎯 Element Grounding & Action Target Prediction**: Maps screen elements to CSS selectors and coordinates for deterministic UI interaction.
- **🎨 Visual Spec-Driven Development (Visual SDD)**: Register design mockups or screenshots as perceptual baseline contracts to verify visual regression.
- **🛡️ 100% Local-First Privacy**: Local LanceDB vector store, local CLIP model, zero cloud telemetry, and PII redaction guarantees.


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
| 🚀 **[Features & Architecture](docs/features.md)** | Key features, 4-tier retrieval pipeline, element grounding, and Dual MCP Synergy. |
| 📘 **[Formal API Reference](docs/api-reference.md)** | Complete specifications, parameters, and schemas for all 23 MCP tools. |
| 🔌 **[Multi-IDE Integration Guide](docs/mcp-integration.md)** | Step-by-step configs for Cursor, Claude Desktop, Antigravity, Windsurf, Zed, Roo Code & Agent Rules. |
| 💻 **[CLI Commands Reference](docs/cli.md)** | Full guide for all 16 CLI management, visual spec, and snapshot commands. |
| ⚙️ **[Configuration Guide](docs/configuration.md)** | Complete `.env` environment variables, thresholds, and L4 vision fallback setup. |
| 🔒 **[Storage Encryption & Security](docs/STORAGE_ENCRYPTION.md)** | Encryption details, local storage privacy, and PII masking guarantees. |
| 🤝 **[Contributing Guide](CONTRIBUTING.md)** | Development setup, codebase structure, and submission guidelines. |
| 🛡️ **[Security Policy](SECURITY.md)** | Security vulnerability reporting and privacy disclosures. |
| 📜 **[Changelog](CHANGELOG.md)** | Chronological record of release features, fixes, and patch updates. |

---

## 🧪 Testing

```bash
# Run full unit and integration test suite across all 37 test suites
npm run test
```

---

## ⚖️ License & Disclaimers

Developed and maintained by [PuterVision LLC](https://putervision.com). Released under the [MIT License](LICENSE).

- **Local Storage Guarantee**: Provided "as is" without warranty. Screenshots, perceptual hashes, vector embeddings, and transition graphs are stored locally unencrypted at the application level in `.vision-memory-mcp/`. Zero telemetry or analytics data is ever transmitted.
- **Trademarks & Non-Affiliation**: Product names (Cursor, Claude Code, Gemini, Windsurf, VS Code, Sharp, LanceDB, ONNX, HuggingFace) are property of their respective owners and used solely for compatibility identification.
