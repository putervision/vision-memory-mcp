# Project Instructions Template

> **Note**: This template provides standard instructions for integrating `vision-memory-mcp` into agent instructions (`.cursorrules`, `.windsurfrules`, `AGENTS.md`, `CLAUDE.md`).

---

# Project Instructions

## Visual Memory (vision-memory-mcp)

This project uses `vision-memory-mcp` to cache visual states, perceptual hashes, and UI screenshot embeddings to minimize vision LLM token consumption, track visual state transitions, and provide deterministic element grounding.

### 1. Mandatory Workflow & Priority
1. **Orient**: Call `get_session_context` to align your visual state context at the start of work.
2. **Search**: Call `recall_memory` (text/image search) before recreating duplicate UI state paths.
3. **Before Visual Analysis**: ALWAYS call `analyze_screenshot` before querying front-end vision models.
   - **Cache Hit (`is_known: true`)**: Do NOT pass screenshots to visual LLMs. Read the returned `description` and use `grounded_elements` (selectors, coordinates) for action target selection.
   - **Cache Miss (`is_known: false`)**: Perform visual analysis with your vision model, then immediately call `analyze_screenshot` with the image and description to seed the visual cache.
4. **Action Target Execution**: Use `predict_next_action` to retrieve `grounded_target` handles (`target_selector`, `target_coords`) for deterministic UI clicks and typing.
5. **Transition Tracking**: Call `record_outcome` after interactive steps (clicks, typing, navigation) to record state transitions in the visual graph.
6. **Privacy Scrubbing**: Call `forget_state` to purge sensitive or secret states from disk storage.

### 2. Available MCP Tools (15 Core Tools)
- `analyze_screenshot` — Query or ingest visual layout snapshots (single or batch `items`), returning description & grounded elements
- `recall_memory` — Search visual memories by text query or perceptual similarity (read-only)
- `record_outcome` — Record action and outcome transitions between states or log visual blockers (`action_type: 'blocker'`)
- `get_navigation_paths` — Retrieve shortest navigation paths between visual states
- `predict_next_action` — Predict optimal next UI action and target coordinates from current state
- `compare_states` — Diff two visual states or compare video trajectories (`video_a_id`/`video_b_id`)
- `get_session_context` — Retrieve summary context briefing of recent/frequent states, cache metrics, and version info
- `manage_snapshot` — Unified snapshot management (`save`, `diff`, `export`, `restore`) for visual checkpoints
- `manage_visual_spec` — Register, verify, and list Visual Spec baseline design contracts (Visual SDD)
- `manage_video` — Ingest WebM/MP4 recordings, search video keyframes, and retrieve timelines
- `create_evidence_pack` — Package cryptographic evidence packs linking video keyframes to state-memory DAGs
- `export_trajectories` — Export multimodal transition & joint workflow trajectories (`json`, `llava`, `qwen2_vl`, `joint`)
- `undo_visual_mutation` — Revert accidental state or transition edge ingestions
- `forget_state` — Purge a specific state and vector embedding from storage for privacy
- `wait_for_visual_state` — Poll for target visual state until present or timeout occurs

### 3. Agent Auto-Run Permissions
To allow AI agents to query the visual cache and manage brain images automatically without requesting permission prompts:
- **Google Antigravity (`~/.gemini/config/config.json`)**: Add to `"globalPermissionGrants"` -> `"allow"`:
  ```json
  "command(vision-memory-mcp)",
  "read_file(.*\\.gemini/antigravity/brain/.*)",
  "write_file(.*\\.gemini/antigravity/brain/.*)"
  ```
- **VS Code / Cursor IDE (`settings.json`)**: Allow `command(vision-memory-mcp)` and read/write access to `.vision-memory-mcp/`.

