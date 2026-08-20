# 🚀 Migration Guide: v0.9 → v1.0

This guide explains how to migrate client integrations, custom agents, and tool callers from `@putervision/vision-memory-mcp` v0.9 to the consolidated **v1.0 API**.

---

## Overview of Changes

In `v1.0.0`, the tool surface has been consolidated from **29 individual tools** into **15 high-coherence consolidated tools** (≤ 15 tools).

- **Why?** To maximize AI model routing accuracy, eliminate tool disambiguation friction, achieve top-tier Glama Server Coherence standards (Score A), and provide a clean, unified interface.
- **Zero Functionality Lost**: 100% of underlying perceptual hashing, CLIP vector search, video ingestion, element grounding, visual SDD specs, and multimodal synergy capabilities are preserved.
- **Removed Standalone Redundant Tools**: Standalone tools (`get_metrics`, `get_version`, `batch_analyze_screenshots`, `get_visual_diff`, etc.) have been merged into unified tools.

---

## Complete Legacy Mapping Table

| Old Tool Name (v0.9) | New Tool Name (v1.0) | Key Changes / Migration Notes |
| :--- | :--- | :--- |
| `batch_analyze_screenshots` | `analyze_screenshot` | Pass `items: [...]` array parameter for batch screenshot analysis. |
| `get_visual_diff` | `compare_states` | Returns `has_layout_change` and `layout_delta_ratio` in response. |
| `compare_video_trajectories` | `compare_states` | Pass `video_a_id` and `video_b_id` parameters. |
| `create_visual_blocker` | `record_outcome` | Call with `action_type: 'blocker'`. |
| `set_visual_spec` | `manage_visual_spec` | Call with `action: 'set'`. |
| `verify_visual_spec` | `manage_visual_spec` | Call with `action: 'verify'`. |
| `list_visual_specs` | `manage_visual_spec` | Call with `action: 'list'`. |
| `ingest_video` | `manage_video` | Call with `action: 'ingest'`. |
| `search_video_memory` | `manage_video` | Call with `action: 'search'`. |
| `get_video_timeline` | `manage_video` | Call with `action: 'timeline'`. |
| `get_metrics` | `get_session_context` | Real-time cache metrics & token savings returned in context. |
| `get_version` / `app_version` | `get_session_context` | Version, MCP identifier, and node runtime returned in context. |
| `export_visual_trajectories` | `export_trajectories` | Use `format: 'json'` / `'llava'` / `'qwen2_vl'` / `'joint'`. |
| `export_joint_trajectories` | `export_trajectories` | Call with `format: 'joint'`. |
| `save_visual_snapshot` | `manage_snapshot` | Call with `action: 'save'`. |
| `diff_visual_snapshots` | `manage_snapshot` | Call with `action: 'diff'`. |
| `export_snapshot` | `manage_snapshot` | Call with `action: 'export'`. |
| `restore_snapshot` | `manage_snapshot` | Call with `action: 'restore'`. |
| `undo_last_visual_mutation` | `undo_visual_mutation` | Renamed for cleaner namespace (`type: 'state' \| 'transition' \| 'any'`). |

---

## Example Migration Walkthrough

### 1. Ingesting Screenshots (Single & Batch)

#### Before (v0.9):
```typescript
// Batch analysis
await client.callTool({
  name: "batch_analyze_screenshots",
  arguments: {
    items: [
      { screenshot: "base64...", description: "Login Screen" },
      { screenshot: "base64...", description: "Dashboard" }
    ]
  }
});
```

#### After (v1.0):
```typescript
// Unified analyze_screenshot with items array
await client.callTool({
  name: "analyze_screenshot",
  arguments: {
    items: [
      { screenshot: "base64...", description: "Login Screen" },
      { screenshot: "base64...", description: "Dashboard" }
    ]
  }
});
```

---

### 2. Visual Spec Verification (Visual SDD)

#### Before (v0.9):
```typescript
// Set spec
await client.callTool({
  name: "set_visual_spec",
  arguments: { name: "Dashboard", screenshot: "base64..." }
});

// Verify spec
await client.callTool({
  name: "verify_visual_spec",
  arguments: { name: "Dashboard", screenshot: "base64..." }
});
```

#### After (v1.0):
```typescript
// Set spec
await client.callTool({
  name: "manage_visual_spec",
  arguments: { action: "set", name: "Dashboard", screenshot: "base64..." }
});

// Verify spec
await client.callTool({
  name: "manage_visual_spec",
  arguments: { action: "verify", name: "Dashboard", screenshot: "base64..." }
});
```

---

### 3. Video Operations

#### Before (v0.9):
```typescript
await client.callTool({
  name: "ingest_video",
  arguments: { file_path: "./test-run.webm" }
});
```

#### After (v1.0):
```typescript
await client.callTool({
  name: "manage_video",
  arguments: { action: "ingest", file_path: "./test-run.webm" }
});
```
