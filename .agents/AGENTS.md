# Custom Agent Rules for vision-memory-mcp

## Handling User-Uploaded Images

When the user uploads or attaches screenshots/images directly in the chat:

1. Locate the saved image files in the conversation's system-generated folder or artifact directory (e.g., `/home/beast/.gemini/antigravity/brain/<conversation-id>/media__*.png`).
2. ALWAYS use the `vision-memory-mcp` tools or CLI (e.g., running `vision-memory-mcp query <path>`) to check the visual cache _before_ executing native vision analysis.
3. If the cache returns a hit (`is_known: true`), rely on the cached description rather than querying native vision models.
4. If there is a cache miss (`is_known: false`), inspect the image with native vision, describe the layout, and then immediately ingest the description to seed the cache (e.g., running `vision-memory-mcp ingest <path> "<description>"`).

<!-- state-memory-mcp:start -->

# Workflow State Memory (state-memory-mcp)

This project uses `state-memory-mcp` with project slug `"vision-memory-mcp"` to track tasks, decisions, blockers, and progress.
ALWAYS update the state graph when performing work.

## Mandatory Workflow

1. **Start of session**: Call `start_session(agent_id: "...")`, then run `get_project_summary` and `next_tasks` BEFORE any coding.
2. **Before work**: Create or find the task node, set status to `in_progress`.
3. **During work**: Log decisions (`add_node type: decision`), blockers (`add_node type: blocker`), and notes (`add_note`).
4. **After work**: Run `validate_graph`, set task status to `done`, create artifact nodes, and call `end_session`.
5. **Initial Seeding**: If the project has no Plan or Milestone nodes, read the codebase and scaffold Plan, Milestone, and Decision nodes.

## Tool Priority Order

1. `start_session` — track all mutations under a unique session
2. `get_project_summary` — current state and progress
3. `next_tasks` — query prioritized runnable tasks
4. `find_blockers` — what's blocking progress
5. `validate_graph` — check for cycle or logic anomalies
6. `trace_dependencies` — understand task relationships

## Node Types

`task`, `decision`, `artifact`, `plan`, `milestone`, `blocker`, `observation`

## Edge Types

`depends_on`, `blocks`, `produces`, `references`, `updates`, `contradicts`, `part_of`, `child_of`, `implements`, `decided_in`

## Quick Reference

- **Batch updates**: `batch_update(ids: [...], status: "done")`
- **Quick notes**: `add_note(text: "...", attach_to: node_id)`
- **What changed**: `what_changed(since: "2h")` or `what_changed(session_id: "...")`
- **Stale nodes**: `get_stale_nodes(days: 7)`

> For the complete tool reference and workflow patterns, see the `state-memory-mcp` skill in `.agents/skills/state-memory-mcp/SKILL.md`.

<!-- state-memory-mcp:end -->
