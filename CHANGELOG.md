# Changelog

All notable changes to `@putervision/vision-memory-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.6] - 2026-07-26

### Fixed & Security / Performance
- **Non-Blocking Teardown & LanceDB Optimize Timeout**: Added `Promise.race` (800ms limit) and a 1-second unref'd force-exit safety timer to prevent LanceDB compaction hangs on process teardown.
- **Path Validation & Sanity Auditing**: Hardened path traversal checks and input payload sanitization.
- **Project Version Bump**: Bumped version across package manifests, CLI runtime, and documentation.

## [0.4.4] - 2026-07-24

### Added & Improved
- **First-Hop Visual Determinism Grounding** (Armstrong 2026, Section 7):
  - Updated visual cache architecture and documentation to highlight first-hop perceptual determinism and sub-5ms dHash fast-pathing.
  - Bumped project version to 0.4.4 across codebase, CLI, documentation, and package manifests.

## [0.4.3] - 2026-07-24

### Added
- **Visual Spec-Driven Development (Visual SDD)**:
  - Added visual baseline mockup management (`set_visual_spec`) allowing UI designs to be stored as visual contract baselines.
  - Implemented visual spec verification (`verify_visual_spec`) comparing live UI screenshots against design baselines using perceptual dHash, layout region boundaries, and structural diffing.
  - Added automated visual drift detection and visual blocker generation when live UI violates design contracts.

## [0.4.2] - 2026-07-24

### Added & Improved
- **Sub-Directory Git Repository Discovery**: Added workspace scanning utility (`src/utils/workspace.ts`) to discover root and sub-directory Git repositories & submodules, auditing branch alignment in `vision-memory-mcp doctor` and `vision-memory-mcp audit`.
- **Federated Multi-Database Visual Memory Retrieval**: Extended `StorageManager` with multi-connection LanceDB storage management (`listStatesAll`, `countStatesAll`, `searchVectorAll`) and updated `retrieveState()` to query and observe visual memory stored in sub-directory `.vision-memory-mcp` or `.vision-memory` databases.
- **Workspace Audit CLI Command (`vision-memory-mcp audit`)**: Added dedicated `audit` CLI command for comprehensive inspection of workspace Git repos, submodules, sub-directory database locations, and aggregated memory metrics.

## [0.4.1] - 2026-07-23

### Added & Improved
- **Code Standards & Architecture Harmonization**: Synchronized code structure, ESLint 9 configuration, Prettier rules (`printWidth: 100`, LF line endings), build pipeline versioning, process lifecycle resilience, and CLI command modularization (`src/cli/`) with `state-memory-mcp`.
- **Dependency Harmonization**: Upgraded `@modelcontextprotocol/sdk` to `^1.0.4` and aligned shared devDependencies (`@types/node` ^20.14.9, `prettier` ^3.9.6, `tsup` ^8.1.0, `typescript` ^5.5.2).
- **Branding & Navigation**: Added interactive PuterVision brand badge link in the top navigation header of documentation site (`docs/index.html`).
- **Template Scaffolding**: Added `PROJECT_INSTRUCTIONS_TEMPLATE.md` for fast workspace agent instruction setup.

## [0.4.0] - 2026-07-23

### Added

- **`file_path` Direct Image Loading**: Added `file_path` parameter to `analyze_screenshot`, `recall_memory`, and `batch_analyze_screenshots` to read local image files directly from disk, bypassing base64 encoding overhead.
- **Selective Compact Response Format (`ResponseFormat`)**: Added `response_format` parameter (`'compact'` | `'full'`) across all retrieval/memory tools. Compact mode prunes internal fields (`vector`, `accessibility_tree`, `dhash`, `ahash`, `thumbnail`, `original_dimensions`), reducing token consumption by 70–90%.
- **Background CLIP Model Pre-warming**: Asynchronous background initialization of CLIP embedding models on server startup to eliminate initial 3–5s cold-start latency.
- **MCP Tool Annotations (v1.29 SDK)**: Annotated all 12 MCP tools with `title`, `readOnlyHint`, `destructiveHint`, and `idempotentHint` metadata.
- **MCP Registered Prompts**: Created `src/tools/prompts.ts` registering standard MCP prompts (`analyze-ui-state`, `diagnose-visual-regression`, `navigate-to-goal`).
- **Next UI Action Predictor (`predict_next_action`)**: New MCP tool predicting the optimal next UI action based on transition success rates and goal alignment.
- **Batch Screenshot Processing (`batch_analyze_screenshots`)**: New MCP tool accepting 1–20 screenshots or file paths in a single batch call.
- **Accessibility Tree Compression**: Added `compressAccessibilityTree()` helper to prune non-interactive layout nodes.
- **Structured L4 Vision Output**: Updated L4 LLM vision fallback prompt to enforce JSON output format (`screen_type`, `page_title`, `key_interactive_elements`, `active_alerts`, `summary`).

### Changed

- **Granular Key-Level Visual State Diffing**: Upgraded `compare_states` to compute key-level JSON diffs (`added`, `removed`, `modified`) on `structured_data`.
- **Minified JSON Responses**: Replaced verbose multiline `JSON.stringify(..., null, 2)` responses with minified JSON strings.
- **Version Bump**: Bumped version from `0.3.0` to `0.4.0` across `package.json`, `package-lock.json`, `src/index.ts`, `docs/index.html`, and `SECURITY.md`.

### Fixed

- **Git Branch Scope Persistence Bug**: Fixed `getCurrentBranch()` variable scoping bug in `src/core/cache.ts` where `cachedBranch` was never updated in module state.
- **Dead Code Cleanup**: Removed unused duplicate tool handler file `src/tools/handlers/analyze.ts`.
- **Foreign Key Validation**: Added explicit state existence validation checks in `recordTransition()`.

## [0.3.0] - 2026-07-22

### Added

- **MCP Tool Handler Unit Test Suite (`tests/unit/handlers.test.ts`)**: Comprehensive coverage for all 10 MCP tool registrations (`analyze_screenshot`, `recall_memory`, `record_outcome`, `get_navigation_paths`, `compare_states`, `get_session_context`, `save_visual_snapshot`, `diff_visual_snapshots`, `undo_last_visual_mutation`, `create_visual_blocker`).
- **Error Path & Edge Case Test Suite (`tests/unit/error_paths.test.ts`)**: Rigorous unit tests for corrupt buffer handling, SQL injection escaping, non-existent storage lookups, and cache TTL expiration.
- **Environment Health-Check Command (`vision-memory-mcp doctor`)**: CLI command to verify Node.js runtime compatibility, LanceDB directory writability, Sharp native image engine bindings, and Git repository integration.
- **Structured JSON Logging (`LOG_FORMAT=json`)**: Added structured JSON log output option for production log aggregators and observability pipelines.
- **Accessibility & Motion Preference Support**: Added `@media (prefers-reduced-motion: reduce)` media query rules to the 3D force-directed graph HTML visualizer.
- **GitHub Community Health Templates**: Added bug report (`.github/ISSUE_TEMPLATE/bug_report.yml`), feature request (`.github/ISSUE_TEMPLATE/feature_request.yml`), and pull request template (`.github/PULL_REQUEST_TEMPLATE.md`).
- **Multi-IDE Configuration Guides**: Added copy-paste MCP configuration snippets in `README.md` for Google Antigravity, Cursor, VS Code, Roo Code, Cline, Windsurf, and Zed.
- **Local-First Privacy & Zero Telemetry Guarantee**: Documented 100% local storage policy in `README.md`.
- **`tsconfig.test.json`**: Integrated unit test files into `npm run typecheck` verification pipeline.
- **Base64 Input Validation**: Added `.refine()` regex validation schema for `screenshot` parameter in `analyze_screenshot` handler.
- **Flexible Embedding MIME Types**: Added optional `mimeType` parameter support to `generateImageEmbedding`.
- **Safe Output Filenames**: Added `-o`/`--out` flag support and timestamped `viewer-<timestamp>.html` export handling to prevent accidental file overwrites.
- **Interactive CLI Init Safeguard**: Added `--yes` (`-y`) prompt confirmation support for user homedir file scaffolding in `init`.
- **Early `OPENAI_API_KEY` Guard**: Added early check in vision LLM analyzer to throw a clear error when missing instead of passing `'no-key'`.
- **`CHANGELOG.md`**: Created project release history documentation.

### Changed

- **Modular Architecture Refactoring**: Split monolithic CLI router into modular command modules (`src/cli/commands/`) and tool handlers into dedicated handler files (`src/tools/handlers/`).
- **TSUP Bundle Optimization**: Set `shims: false` in `tsup.config.ts` to reduce bundle overhead.
- **Version Bump**: Bumped version string from `0.2.0` to `0.3.0` across `package.json`, `package-lock.json`, `src/index.ts`, `src/cli.ts`, `docs/index.html`, and `SECURITY.md`.

### Fixed

- **Vector Distance Cosine Conversion Math**: Corrected distance-to-similarity conversion formula ($\text{similarity} = 1 - \frac{\text{distance}}{2}$) for LanceDB unit vector $L_2^2$ distance metrics.
- **SQL Injection Escaping**: Hardened `escapeSql` utility against backslashes, single quotes, double quotes, backticks, and NUL characters across storage engine queries.
- **Image Hash Upscaling Distortion**: Preserved small image aspect ratios without forced 512px stretch during perceptual hash processing.
- **CLI Command Injection**: Replaced shell string interpolation `execSync` commands with safe `execFileSync('tar', [...])` argument arrays in backup and restore CLI commands.
- **Stdio Client Shutdown Handling**: Added `process.stdin.on('close')` and `transport.onclose` graceful shutdown listeners to ensure database compaction on client exit.
- **N+1 Database Queries**: Eliminated N+1 queries in `findNavigationPaths` graph traversal by pre-fetching state descriptions in batch.
- **Logger Error Traces**: Preserved `name`, `message`, and `stack` properties when logging `Error` objects.
- **MemoryCache Branch Normalization**: Standardized branch key resolution and fallback lookups in `MemoryCache`.
- **State Comparison Self-Check**: Guarded `compare_states` against comparing identical state IDs.
- **Unique Snapshot Names**: Enforced unique snapshot name checks in `saveSnapshot`.

### Security

- Eliminated command injection vectors in CLI backup and restore commands.
- Hardened SQL filter escaping against injection in storage engine queries.
- Maintained zero direct `zod` and `dotenv` dependencies in runtime `package.json`.
