# 📘 @putervision/vision-memory-mcp Formal API Reference (v0.8.0)

This document provides formal API specifications, parameter schemas, return shapes, JSON payloads, and practical leverage descriptions for all 27 Model Context Protocol (MCP) tools provided by `@putervision/vision-memory-mcp`.

---


## 1. Perception, Ingestion & Element Grounding

### `analyze_screenshot`
- **Overview**: Ingests a screenshot or file path, checks visual state cache (L1-L4), and returns layout details and grounded elements.
- **How to Leverage**: Call *before* querying any front-end vision models. If `is_known: true`, returns cached description and grounded element handles in <5ms without sending images to LLMs.
- **Parameters**: `screenshot` (opt string), `file_path` (opt string), `description` (opt string), `accessibility_tree` (opt string), `source_url` (opt string), `tags` (opt array), `force_refresh` (opt boolean), `git_branch` (opt string), `trace_id` (opt string), `response_format` ('compact' | 'full').

### `recall_memory`
- **Overview**: Queries stored visual memory by natural language description query or base64 screenshot image.
- **How to Leverage**: Recall past screens from earlier turns (e.g. "pricing plans table") to retrieve state IDs and grounded element selectors.
- **Parameters**: `query` (opt string), `screenshot` (opt string), `file_path` (opt string), `git_branch` (opt string), `top_k` (opt number), `response_format` ('compact' | 'full').

### `batch_analyze_screenshots`
- **Overview**: Ingests or queries up to 20 screenshots or file paths in a single batch MCP tool call with per-item error isolation.
- **How to Leverage**: Process multi-screen sequences efficiently in batch test runs.
- **Parameters**: `items` (required array of screenshot/file_path objects), `git_branch` (opt string), `response_format` ('compact' | 'full').

### `predict_next_action`
- **Overview**: Predicts the optimal next UI action and target coordinates (`target_selector`, `target_coords`) based on transition graph success rates.
- **How to Leverage**: Provides deterministic handles for automated click and type execution.
- **Parameters**: `current_state_id` (required string), `goal_description` (opt string), `goal_state_id` (opt string).

---

## 2. Graph Navigation & State Transitions

### `record_outcome`
- **Overview**: Logs an agent UI action and transition outcome (success/failure, duration) between two visual states.
- **How to Leverage**: Call after browser interactions to build directed navigation graphs.
- **Parameters**: `from_state_id` (required string), `to_state_id` (required string), `action` (required string), `success` (required boolean), `duration_ms` (opt number), `action_type` (opt string), `metadata` (opt object).

### `get_navigation_paths`
- **Overview**: Calculates optimal BFS shortest navigation path between two UI screens weighted by success rate and latency.
- **How to Leverage**: Plan exact multi-step action sequences to reach target screens.
- **Parameters**: `from_state_id` (opt string), `to_state_id` (opt string), `to_description` (opt string), `max_depth` (opt number).

### `compare_states`
- **Overview**: Compares two visual states structurally, perceptually (dHash), and vector-semantically.
- **How to Leverage**: Detect layout shifts, missing buttons, or text updates between screen versions.
- **Parameters**: `state_a_id` (required string), `state_b_id` (required string), `response_format` ('compact' | 'full').

### `get_session_context`
- **Overview**: Retrieves summary context briefing of recent states, frequent states, and active transition edges.
- **How to Leverage**: Call at session start to align agent visual awareness.
- **Parameters**: `git_branch` (opt string), `include_recent` (opt boolean), `include_frequent` (opt boolean), `response_format` ('compact' | 'full').

---

## 3. Visual Specs, Diffs & Privacy Scrubbing

### `set_visual_spec`
- **Overview**: Registers a screenshot or design mockup as a Visual Spec baseline contract.
- **How to Leverage**: Store Figma design mockups as visual baseline contracts before automated UI tests.
- **Parameters**: `name` (required string), `screenshot` (opt string), `file_path` (opt string).

### `verify_visual_spec`
- **Overview**: Verifies a live captured UI screenshot against a registered Visual Spec baseline, with optional SDD requirement linking.
- **How to Leverage**: Run visual regression checks in CI pipelines. Optionally pass `sdd_requirement_id` to link results to `state-memory-mcp` requirement nodes.
- **Parameters**: `spec_name` (required string), `screenshot` (opt string), `file_path` (opt string), `tolerance` (opt number), `sdd_requirement_id` (opt string).

### `get_visual_diff`
- **Overview**: Calculates perceptual dHash distance and layout region deltas between two visual states.
- **How to Leverage**: Inspect exact Hamming distance and layout delta ratios between visual baselines.
- **Parameters**: `state_id_a` (required string), `state_id_b` (required string).

### `forget_state`
- **Overview**: Purges a specific visual state, vector embeddings, and perceptual hashes from storage.
- **How to Leverage**: Maintain privacy compliance by purging sensitive credentials or secret screens.
- **Parameters**: `state_id` (required string).

---

## 4. Checkpoints, Telemetry & Export

### `save_visual_snapshot`
- **Overview**: Saves a visual memory checkpoint containing all states on the active branch.
- **Parameters**: `name` (required string), `description` (opt string).

### `diff_visual_snapshots`
- **Overview**: Diff two checkpoint snapshots to detect visual regressions across test runs.
- **Parameters**: `snapshot_a_name` (required string), `snapshot_b_name` (required string).

### `undo_last_visual_mutation`
- **Overview**: Reverts the last state or edge ingestion mutation.
- **Parameters**: `type` ('state' | 'transition' | 'any').

### `create_visual_blocker`
- **Overview**: Generates structured visual blocker payloads for integration with `state-memory-mcp`.
- **Parameters**: `visual_state_id` (required string), `description` (required string), `project` (opt string).

### `export_visual_trajectories`
- **Overview**: Exports multimodal state transition trajectories for local model fine-tuning (JSON, LLaVA, Qwen2-VL).
- **Parameters**: `git_branch` (opt string), `limit` (opt number), `format` ('json' | 'llava' | 'qwen2_vl').

### `export_joint_trajectories`
- **Overview**: Exports interleaved visual state transitions and workflow state events correlated by trace ID.
- **Parameters**: `trace_id` (opt string), `limit` (opt number).

### `get_metrics`
- **Overview**: Queries real-time cache hit ratios, token savings estimates, and latency statistics.
- **Parameters**: None.

### `export_snapshot`
- **Overview**: Exports standalone `.tar.gz` snapshot archive JSON payload.
- **Parameters**: `name` (required string).

### `restore_snapshot`
- **Overview**: Restores visual memory database from a snapshot archive.
- **Parameters**: `archive_json` (required string).

---

## 5. Synchronization & Polling

### `wait_for_visual_state`
- **Overview**: Polls for a target visual state ID until it exists in storage or timeout occurs.
- **How to Leverage**: Eliminates agent spinning loops when awaiting UI rendering transitions.
- **Parameters**: `target_state_id` (required string), `timeout_ms` (opt number, default 10000), `poll_interval_ms` (opt number, default 500).

### `app_version`
- **Overview**: Returns server package name, MCP identifier string (`io.github.putervision/vision-memory-mcp`), build version, server description, and runtime environment.
- **How to Leverage**: Allows agents to programmatically verify server identity and capability versioning.
- **Parameters**: None.

---

## 6. Video Frame Digesting & Temporal Trajectories

### `ingest_video`
- **Overview**: Ingests a WebM or MP4 video file or base64 stream, extracts keyframes with `ffmpeg`, applies dHash deduplication fast path, generates CLIP vector embeddings and transition sequence paths.
- **How to Leverage**: Call on Playwright E2E test failure recordings or bug repro videos to convert video timelines into searchable visual state graphs.
- **Parameters**: `file_path` (opt string), `video_data` (opt string), `fps` (opt number), `scene_threshold` (opt number), `category` (opt string), `tags` (opt array), `source_agent` (opt string), `trace_id` (opt string).

### `search_video_memory`
- **Overview**: Searches stored video recordings by description query, category, tags, or file path.
- **How to Leverage**: Query past video recordings in natural language (e.g. "find Playwright test video where checkout modal opened").
- **Parameters**: `query` (required string), `category` (opt string), `limit` (opt number).

### `get_video_timeline`
- **Overview**: Fetches chronological keyframe state timeline and metadata for a video record ID.
- **How to Leverage**: Retrieve step-by-step keyframes, timestamps, OCR text, and grounded targets for a specific video run.
- **Parameters**: `video_id` (required string).

### `compare_video_trajectories`
- **Overview**: Compares two video recordings (e.g. passing test video vs failing test video) to calculate visual similarity score and pinpoint frame divergence point.
- **How to Leverage**: Instantly detect exact timestamp and state ID where a test run diverged visually from a baseline recording.
- **Parameters**: `video_a_id` (required string), `video_b_id` (required string).

### `create_evidence_pack`
- **Overview**: Packages keyframe IDs, dHash/CLIP fingerprints, OCR snippets, and linked state-memory node IDs into an immutable, cryptographically hashable evidence pack.
- **How to Leverage**: Produce verifiable audit evidence ("Decision D was based on keyframes F12-F18 of recording R") without reloading raw images into model context.
- **Parameters**: `keyframe_state_ids` (required array of strings), `source_video_id` (opt string), `linked_state_memory_nodes` (opt object).


---

## 7. Performance & ROI Notice

> **Notice**: Token savings estimates (up to 90%) and latency metrics (<5ms L1 fast-path) depend on visual repetition, screen resolution, and model rates. All memory data is kept 100% local in `.vision-memory-mcp`.

