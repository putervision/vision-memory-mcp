# 📘 @putervision/vision-memory-mcp Formal API Reference (v1.0.0)

This document provides formal API specifications, parameter schemas, return shapes, and practical leverage descriptions for all **15 Core Model Context Protocol (MCP) tools** provided by `@putervision/vision-memory-mcp`.

---

## 🧭 Tool Index (15 Consolidated Tools)

| Category | Tools |
| :--- | :--- |
| **1. Perception & Search** | `analyze_screenshot`, `recall_memory`, `predict_next_action` |
| **2. Graph & Transitions** | `record_outcome`, `get_navigation_paths`, `compare_states`, `get_session_context` |
| **3. Visual SDD & Specs** | `manage_visual_spec` |
| **4. Snapshots & Maintenance** | `manage_snapshot`, `undo_visual_mutation`, `forget_state`, `wait_for_visual_state` |
| **5. Trajectories & Export** | `export_trajectories` |
| **6. Video Ingest & Audit** | `manage_video`, `create_evidence_pack` |

---

## 🔄 Tool Migration Guide (v0.9.0 → v1.0.0)

| Legacy Tool (v0.9.0) | Consolidated Tool (v1.0.0) | Key Migration Changes |
| :--- | :--- | :--- |
| `batch_analyze_screenshots` | `analyze_screenshot` | Pass `items: [...]` array for batch mode. |
| `get_visual_diff` | `compare_states` | Returns `has_layout_change` and `layout_delta_ratio`. |
| `compare_video_trajectories` | `compare_states` | Pass `video_a_id` and `video_b_id`. |
| `create_visual_blocker` | `record_outcome` | Call with `action_type: 'blocker'`. |
| `set_visual_spec` | `manage_visual_spec` | Call with `action: 'set'`. |
| `verify_visual_spec` | `manage_visual_spec` | Call with `action: 'verify'`. |
| `list_visual_specs` | `manage_visual_spec` | Call with `action: 'list'`. |
| `ingest_video` | `manage_video` | Call with `action: 'ingest'`. |
| `search_video_memory` | `manage_video` | Call with `action: 'search'`. |
| `get_video_timeline` | `manage_video` | Call with `action: 'timeline'`. |
| `get_metrics` | `get_session_context` | Real-time metrics included in `get_session_context` output. |
| `get_version` / `app_version` | `get_session_context` | Version & runtime info included in `get_session_context` output. |
| `export_visual_trajectories` | `export_trajectories` | Formats: `'json'`, `'llava'`, `'qwen2_vl'`, `'joint'`. |
| `export_joint_trajectories` | `export_trajectories` | Call with `format: 'joint'`. |
| `save_visual_snapshot` | `manage_snapshot` | Call with `action: 'save'`. |
| `diff_visual_snapshots` | `manage_snapshot` | Call with `action: 'diff'`. |
| `export_snapshot` | `manage_snapshot` | Call with `action: 'export'`. |
| `restore_snapshot` | `manage_snapshot` | Call with `action: 'restore'`. |
| `undo_last_visual_mutation` | `undo_visual_mutation` | Renamed for cleaner namespace. |

---

## 1. Perception, Ingestion & Element Grounding

### `analyze_screenshot`
- **Overview**: Ingests screenshot(s) via base64 or local file path, checks visual state cache (L1–L4), and returns layout details and grounded elements. Supports both single screenshot and batch ingestion modes.
- **How to Leverage**: Call *before* querying any front-end vision models. If `is_known: true`, returns cached description and grounded element handles in <5ms without sending images to LLMs. For multiple screenshots, pass the `items` array.
- **Parameters**:
  - `screenshot` (optional string): Base64-encoded image string.
  - `file_path` (optional string): Absolute file path to local image.
  - `description` (optional string): Screen description (used to seed cache on miss).
  - `accessibility_tree` (optional string): Simplified AX tree JSON string.
  - `source_url` (optional string): URL or application view path.
  - `tags` (optional string[]): Classification tags.
  - `force_refresh` (optional boolean): Bypass L1/L2 cache and force new ingestion.
  - `git_branch` (optional string): Override active git branch scope.
  - `trace_id` (optional string): Trace/session correlation ID.
  - `response_format` (optional `'compact'` | `'full'`): Response verbosity.
  - `items` (optional array): 1–20 items for batch ingestion mode.

### `recall_memory`
- **Overview**: Read-only query of stored visual memory by natural language description or base64 screenshot image.
- **How to Leverage**: Search past screens (e.g. "pricing plans table") to retrieve state IDs and grounded element selectors without creating new state entries.
- **Parameters**: `screenshot` (optional string), `file_path` (optional string), `query` (optional string), `strategy` (optional `'fast'` | `'semantic'` | `'thorough'`), `limit` (optional number), `accessibility_tree` (optional string), `git_branch` (optional string), `response_format` (optional `'compact'` | `'full'`).

### `predict_next_action`
- **Overview**: Predicts the optimal next UI action and target coordinates based on transition success rates and goal alignment.
- **How to Leverage**: Provides deterministic handles (`target_selector`, `target_coords`) for automated click and type execution.
- **Parameters**: `current_state_id` (required string), `goal_description` (optional string), `goal_state_id` (optional string).

---

## 2. Graph Navigation & State Transitions

### `record_outcome`
- **Overview**: Logs an agent UI action transition outcome between two visual states, OR generates a structured visual blocker payload for `state-memory-mcp` when `action_type: 'blocker'`.
- **How to Leverage**: Call after browser interactions to build navigation graphs. When a visual bug is detected, call with `action_type: 'blocker'` to generate blocker node instructions.
- **Parameters**: `from_state_id` (required string), `to_state_id` (optional string, required for transitions), `action` (required string), `action_type` (optional `'click'` | `'type'` | `'navigate'` | `'scroll'` | `'custom'` | `'blocker'`), `success` (optional boolean), `duration_ms` (optional number), `git_branch` (optional string), `project` (optional string), `response_format` (optional `'compact'` | `'full'`).

### `get_navigation_paths`
- **Overview**: Calculates BFS shortest navigation path between two UI screens weighted by historical success rate and latency.
- **Parameters**: `from_state_id` (optional string), `to_state_id` (optional string), `to_description` (optional string), `max_hops` (optional number), `response_format` (optional `'compact'` | `'full'`).

### `compare_states`
- **Overview**: Compares two visual states (dHash, CLIP cosine, layout delta ratio, JSON structured diff) OR two video recordings (`video_a_id` and `video_b_id` for timeline similarity & frame divergence).
- **Parameters**: `state_a_id` (optional string), `state_b_id` (optional string), `video_a_id` (optional string), `video_b_id` (optional string), `response_format` (optional `'compact'` | `'full'`).

### `get_session_context`
- **Overview**: Retrieves aggregated context briefing of recent states, frequent states, active transition edges, memory disk stats, real-time cache hit ratios, token savings estimates, and server version info.
- **Parameters**: `include_recent` (optional number), `include_frequent` (optional number), `response_format` (optional `'compact'` | `'full'`).

---

## 3. Visual Specs & UI Compliance (Visual SDD)

### `manage_visual_spec`
- **Overview**: Unified management of Visual Spec baseline contracts (Visual SDD).
  - `action: 'set'` registers a screenshot or design mockup as a baseline contract.
  - `action: 'verify'` tests a live UI screenshot against a baseline, returning perceptual match distance and compliance boolean.
  - `action: 'list'` returns all registered visual specs.
- **Parameters**: `action` (required `'set'` | `'verify'` | `'list'`), `name` (optional string), `spec_name` (optional string), `screenshot` (optional string), `file_path` (optional string), `tolerance` (optional number), `sdd_requirement_id` (optional string).

---

## 4. Snapshots, Maintenance & Observability

### `manage_snapshot`
- **Overview**: Unified snapshot management. Actions: `'save'` creates a named checkpoint; `'diff'` compares two checkpoints for drift; `'export'` serializes to portable JSON; `'restore'` imports from an archive.
- **Parameters**: `action` (required `'save'` | `'diff'` | `'export'` | `'restore'`), `name` (optional string), `description` (optional string), `snapshot_a_name` (optional string), `snapshot_b_name` (optional string), `archive_json` (optional string).

### `undo_visual_mutation`
- **Overview**: Reverts the most recent visual state ingestion or transition edge addition.
- **Parameters**: `type` (optional `'state'` | `'transition'` | `'any'`).

### `forget_state`
- **Overview**: Purges a specific visual state, vector embeddings, and perceptual hashes from storage.
- **Parameters**: `state_id` (required string).

### `wait_for_visual_state`
- **Overview**: Polls for a target visual state ID until it exists in storage or timeout occurs.
- **Parameters**: `target_state_id` (required string), `timeout_ms` (optional number, default 10000), `poll_interval_ms` (optional number, default 500).

---

## 5. Multimodal Trajectory Export

### `export_trajectories`
- **Overview**: Exports visual state transition trajectories. Formats: `'json'` (raw state steps), `'llava'` / `'qwen2_vl'` (VLM fine-tuning datasets), and `'joint'` (interleaved workflow events correlated by trace ID for `state-memory-mcp`).
- **Parameters**: `format` (optional `'json'` | `'llava'` | `'qwen2_vl'` | `'joint'`), `git_branch` (optional string), `trace_id` (optional string), `limit` (optional number).

---

## 6. Video Ingest & Cryptographic Evidence

### `manage_video`
- **Overview**: Unified video memory operations:
  - `action: 'ingest'` ingests a WebM, MP4, or GIF recording, extracts keyframes, deduplicates via dHash fast path, and builds sequence transitions.
  - `action: 'search'` searches across video recordings by natural language query, category, or tags.
  - `action: 'timeline'` retrieves the chronological keyframe timeline for a specific `video_id`.
- **Parameters**: `action` (required `'ingest'` | `'search'` | `'timeline'`), `file_path` (optional string), `video_data` (optional string), `fps` (optional number), `scene_threshold` (optional number), `category` (optional string), `tags` (optional string[]), `source_agent` (optional string), `trace_id` (optional string), `query` (optional string), `video_id` (optional string), `limit` (optional number).

### `create_evidence_pack`
- **Overview**: Packages keyframe IDs, dHash/CLIP fingerprints, OCR snippets, and linked state-memory node IDs into an immutable, cryptographically hashable evidence pack.
- **Parameters**: `keyframe_state_ids` (required string[]), `source_video_id` (optional string), `linked_state_memory_nodes` (optional object).

---

> **Notice**: Token savings estimates and latency performance depend on visual repetition, screen resolution, and model rates. All memory data is kept 100% local in `.vision-memory-mcp`.

