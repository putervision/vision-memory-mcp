# 🚀 Features & Architecture Blueprint — vision-memory-mcp

`@putervision/vision-memory-mcp` is a persistent visual UI state cache for developer AI agents. It uses perceptual hashing, local vector search, element grounding, and state transition graphs to cut vision token costs and latency by up to 90%.

---

## 🛠️ Key Features

- **Zero-Token Fast Path (L1/L2):** Uses Difference Hash (dHash) and Average Hash (aHash) to recognize identical or near-duplicate layouts in <5ms without sending images to LLMs.
- **Element Grounding & Actionability Engine:** Returns structured accessibility tree elements (`grounded_elements`) with bounding boxes, ARIA roles, CSS selectors, and target handles (`grounded_target`) for deterministic UI clicks and typing.
- **Local OCR & Text-Layer Enrichment:** Extracts text tokens and computes n-gram Jaccard similarity to invalidate cache hits when status text differs (e.g., "Payment Succeeded" vs "Payment Failed").
- **Sensitive-Data Redaction & Privacy Scrubbing:** Detects and masks PII/passwords (emails, SSNs, credit cards, OpenAI/GitHub API keys) with solid composite SVG rectangles before saving or embedding screenshots. `forget_state` purges sensitive states on demand.
- **Semantic Retrieval (L3):** Runs local CLIP ViT-B/32 model inference to find conceptually similar screens (e.g., "billing configuration form").
- **Monorepo & Sub-Directory Discovery:** Automatically discovers nested Git repositories, submodules, and sub-directory `.vision-memory-mcp` databases, aggregating visual memory queries across packages.
- **State Transition Graph & Reliability Pathfinding:** Tracks agent actions and transition outcomes (success/failure rates, execution duration) to calculate reliable BFS/Dijkstra navigation paths.
- **First-Class CI/CD Visual Spec Engine:** Baseline design contracts and visual spec regression testing via `vision-memory-mcp spec verify` CLI and composite GitHub Action.
- **Visual Checkpoints:** Save, list, and diff snapshots of memory to identify visual regressions or layout modifications.
- **Interactive Visualizer:** Open a local force-directed graph view of the memory in your browser (`vision-memory-mcp view`).
- **WebM & MP4 Video Ingestion & Temporal Memory Engine:** Ingests WebM/MP4 video files (E2E test runs, screen captures, bug repros), extracts keyframes using `ffmpeg`, applies fast-path dHash deduplication to merge contiguous static screens into keyframe states, constructs chronological sequence transition graphs, and indexes video trajectories for semantic search and divergence comparison.
- **Dual MCP Synergy & Immutable Evidence Packs:** Deeply integrates with `@putervision/state-memory-mcp` to cross-link UI workflow tasks with perceptual caching, providing first-class bidirectional `renders_state` graph edges, synergistic token metrics, action-grounded triples `(from_visual_state, grounded_action, to_visual_state)`, cryptographically hashable evidence packs (`create_evidence_pack`), and unified multi-modal trajectory exports for agent training.



---

## 📦 Architecture Blueprint

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

### Retrieval Tier Breakdown

1. **L1 (In-Memory LRU Cache):** Immediate memory hit for recently traversed UI screens during an active session (0ms network/DB overhead).
2. **L2 (Perceptual Hash Scan):** Fast local dHash comparison against LanceDB storage (5ms latency, 0 LLM tokens).
3. **L3 (Local CLIP Vector Search):** Local ONNX Runtime execution of HuggingFace CLIP ViT-B/32 model to search vector embeddings (~50ms latency, 0 LLM tokens).
4. **L4 (Vision LLM Fallback):** Optional fallback endpoint (OpenAI / Ollama / LM Studio) triggered only when screen is completely novel. New visual state descriptions are auto-ingested to seed the cache for future agent runs.
