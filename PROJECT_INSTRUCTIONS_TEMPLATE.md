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

### 2. Available MCP Tools (22 Core Tools)
- `analyze_screenshot` — Query or ingest visual layout snapshots, returning description & grounded elements
- `recall_memory` — Search visual memories by text query or perceptual similarity
- `record_outcome` — Record action and outcome transitions between states
- `get_navigation_paths` — Retrieve shortest navigation paths between visual states
- `compare_states` — Diff two visual states to detect UI changes
- `get_session_context` — Retrieve summary context briefing of recent/frequent states
- `predict_next_action` — Predict optimal next UI action and target coordinates from current state
- `batch_analyze_screenshots` — Ingest or query up to 20 screenshots in a single batch call
- `set_visual_spec` — Establish design mockup or screenshot as a Visual Spec baseline contract
- `verify_visual_spec` — Verify live runtime screenshots against a Visual Spec baseline
- `get_visual_diff` — Calculate perceptual dHash diff and region deltas between states
- `save_visual_snapshot` / `diff_visual_snapshots` — Manage visual checkpoints and detect visual regression
- `undo_last_visual_mutation` — Revert accidental state or transition edge ingestions
- `create_visual_blocker` — Generate structured visual blocker payload for `state-memory-mcp`
- `forget_state` — Purge a specific state and vector embedding from storage for privacy
- `export_visual_trajectories` / `export_joint_trajectories` — Export multimodal transition & joint workflow trajectories
- `get_metrics` — Query cache hit ratios, token savings estimates, and latency statistics
- `export_snapshot` / `restore_snapshot` — Export and restore full standalone snapshot archives
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

