# Project Instructions Template

> **Note**: This template provides standard instructions for integrating `vision-memory-mcp` into agent instructions (`.cursorrules`, `.windsurfrules`, `AGENTS.md`, `CLAUDE.md`).

---

# Project Instructions

## Visual Memory (vision-memory-mcp)

This project uses `vision-memory-mcp` to cache visual states, perceptual hashes, and UI screenshot embeddings to minimize vision LLM token consumption and track visual state transitions.

### 1. Mandatory Workflow
1. **Before Visual Analysis**: Call `analyze_screenshot` with base64 screenshots.
2. **On Cache Hit (`is_known: true`)**: Do NOT pass screenshots to visual LLMs. Use the returned cached state description.
3. **On Cache Miss (`is_known: false`)**: Perform visual analysis with your vision model, then immediately call `analyze_screenshot` with the image and description to seed the visual cache.
4. **Transition Tracking**: Call `record_outcome` after interactive steps (clicks, typing, navigation) to record state transitions in the visual graph.

### 2. Available Tools
- `analyze_screenshot` — Query or ingest visual layout snapshots
- `recall_memory` — Search visual memories by text query or perceptual similarity
- `record_outcome` — Record action and outcome transitions between states
- `get_navigation_paths` — Retrieve shortest navigation paths between visual states
- `compare_states` — Diff two visual states to detect UI changes
