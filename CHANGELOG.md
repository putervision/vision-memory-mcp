# Changelog

All notable changes to `@putervision/vision-memory-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.21] - 2026-08-03

### Changed
- **Node.js 18+ Prerequisite Alignment**: Expanded Node.js support boundary from `>=20.0.0` to `>=18.17.0 (LTS)` across `package.json`, GitHub Actions CI matrix, `README.md`, and `CONTRIBUTING.md`.
- **Test Framework Stability**: Aligned Vitest (`^3.0.7`) and ESLint (`^9.20.0`) dependencies to ensure zero-config test execution across Node 18, 20, and 22 without bundler native binding or `node:util` incompatibilities.
- **Version Bump (0.7.2 -> 0.7.21)**: Updated package version across all 14 manifests, fallback code constants, test suites, API reference docs, and website landing page metadata.

## [0.7.2] - 2026-08-03

### Added
- **Interactive Visual Baseline Capture Mode**: Implemented `vision-memory-mcp spec capture [url]` CLI command and `runInteractiveBaselineCapture()` core engine module for launching headful browser sessions, stepping through app views manually, and capturing baseline specs on demand.
- **`app_version` MCP Tool**: Added dedicated read-only MCP tool (`#23`) returning package name (`@putervision/vision-memory-mcp`), MCP identifier (`io.github.putervision/vision-memory-mcp`), version string, server description, and runtime environment.
- **`list_visual_specs` MCP Tool**: Added dedicated MCP tool (`#22`) allowing AI agents to list all registered visual spec baselines and their perceptual hash signatures across the project.
- **Visual Spec Suite Export & Manifests**: Added `exportVisualSpecSuite()` to serialize all visual spec baselines into a portable JSON manifest (`.vision-memory-mcp/specs-manifest.json`) for CI visual regression testing.
- **Batch Eviction Optimizations**: Implemented `deleteStates(ids: string[])` in `LanceDBStorage` (`src/core/storage.ts`) enabling single-query predicate deletion for visual states and cascaded transitions during eviction sweeps.
- **URL Query Parameter Sanitization**: Added `redactUrl()` to `src/utils/redact.ts` for sanitizing sensitive query parameters (`token`, `key`, `secret`, `password`, `auth`, `session`) from `source_url` fields.
- **Test Suite Expansion (195 Unit Tests)**: Expanded test suite across 36 test files, achieving **91% Function Coverage** and **90%+ Line Coverage** across core components and tool handlers.

### Changed
- **README Decomposition**: Modularized the 407-line `README.md` into a concise landing page and created 4 dedicated documentation guides in `docs/`: `features.md`, `mcp-integration.md`, `cli.md`, and `configuration.md`.
- **Patch Version Bump (0.7.1 -> 0.7.2)**: Updated package version across all 14 manifests, fallback code constants, test suites, API reference docs, and website badges.
- **Workflow State Memory Synchronization**: Resolved stale `in_progress` nodes and updated decision records in `state-memory-mcp`.

## [0.7.1] - 2026-08-01

### Changed
- **Patch Version Bump (0.7.0 -> 0.7.1)**: Updated version across all 11 manifests, code constants, documentation files, and state-memory nodes.
- **Updated Project Remediation Plan (`PLAN-8-1-26.md`)**: Added P0 task for `src/core/visual-spec.ts` TypeScript compilation fix, corrected PII regex file path (`src/core/privacy.ts`), and synced state memory completion stats.

## [0.7.0] - 2026-07-29

### Added
- **`wait_for_visual_state` MCP Tool (Tool #21)**: Added polling mechanism with configurable timeout and interval to await UI state transitions without agent spinning loops.
- **SDD Visual Verification Bridge**: Connected `verify_visual_spec` results to `state-memory-mcp` SDD requirement nodes (`sdd_requirement_id` parameter).
- **Unified Tool Registration**: Standardized tool registration syntax to `server.registerTool()` across all 21 Core MCP Tools.

### Security & Hardening
- **Command Injection Prevention**: Replaced `exec()` shell invocation with parameterized `execFile()` in `src/cli/commands/view.ts`.
- **DOM XSS Sanitization**: Applied `escapeHtml()` sanitization to `node.id`, `link.source.id`, `link.target.id`, and `link.action` rendering in `viewer.html` and `view.ts`.
- **Image Input Security**: Added workspace path bounds validation and `MAX_IMAGE_SIZE_MB` image/base64 payload size limit enforcement in `resolveImageInput`.
- **Web & Script Security**: Added CSP headers, SRI hashes, and consolidated JSON-LD schemas in `docs/index.html`.

### Performance & Error Resilience
- **Non-Blocking I/O**: Refactored directory size calculations and lock cleanup to async non-blocking execution.
- **Vision API Request Timeout**: Added 30-second `AbortSignal` timeout to LLM fetch calls in `src/vision/analyzer.ts`.
- **Memory Cache TTL Eviction Sweep**: Implemented background sweep for expired TTL cache entries in `MemoryCache`.
- **Per-Item Batch Error Resilience**: Wrapped `batch_analyze_screenshots` processing in per-item try-catch blocks to prevent single item failures from aborting the entire batch.
- **Defensive Structured Diff Parsing**: Enhanced `computeStructuredDiff` to handle non-object/array JSON primitives defensively.

## [0.6.2] - 2026-07-28

### Fixes & Stability
- **Home Directory Root Resolution Guard**: Hardened `resolveProjectRoot()` to ensure `.git` directory search excludes `os.homedir()`, preventing accidental home directory hijacking when walking parent directories.
- **In-Place Instruction Upgrades (`upsertInstructionBlock`)**: Added `upsertInstructionBlock()` to `src/cli/init.ts` to parse and update marked instruction blocks (`<!-- vision-memory-mcp:start -->` ... `<!-- vision-memory-mcp:end -->`) in-place when re-running `init` in existing projects.
- **CLI `doctor` Command Gitignore Path Fix**: Updated `src/cli/commands/doctor.ts` to resolve `.gitignore` against `resolveProjectRoot()` rather than `process.cwd()`.

## [0.6.1] - 2026-07-28

### Dual MCP Synergy & Governance Layer
- **Visual Blocker Expansion**: Expanded `create_visual_blocker` tool to output explicit `link_visual_state` call instructions for establishing `blocked_by_visual_state` graph relationships in `state-memory-mcp`.
- **Joint Trajectory Exporter**: Implemented `export_joint_trajectories` tool and CLI exporter interleaving visual observation transitions with workflow events correlated by trace ID.
- **Privacy & Governance Layer**: Integrated sensitive data redaction helper (`src/utils/redact.ts`) masking API keys, JWT tokens, passwords, bearer headers, email addresses, and credit cards in visual descriptions, OCR text, and accessibility trees.
- **Coordinated CLI Initialization**: Updated CLI initializer (`npx vision-memory-mcp init`) to support dual-memory scaffolding (`--with-state`) configuring both servers in `.vscode/mcp.json` and `.agents/AGENTS.md`.

## [0.5.1] - 2026-07-27

### Changed
- **Model Context Protocol Registry Specification Compliance**: Created and validated `server.json` manifest conforming to the official `2025-12-11` MCP Server Registry specification.
- **Server Manifest Description Refactoring**: Optimized `server.json` description string to 93 characters (< 100 character registry limit).
- **Version Bump**: Synchronized patch version `0.5.1` across `package.json`, `package-lock.json`, `server.json`, `src/index.ts`, `src/cli.ts`, `src/core/snapshots.ts`, documentation, and HTML assets.

## [0.5.0] - 2026-07-27

### Added
- **Storage Limits & Eviction Policy**: Configurable `MAX_LANCEDB_SIZE_MB` (default 1000MB) with automatic LRU and importance-score eviction down to 80% watermark.
- **Image Security & Decompression Bomb Protection**: Magic byte signature verification (`PNG`, `JPEG`, `WEBP`, `GIF`, `BMP`), pixel input limit guard (`LIMIT_INPUT_PIXELS: 16777216`), and EXIF stripping option (`STRIP_EXIF: true`).
- **Path Isolation & Strict Mode**: Strict path sanitization in `resolveImageInput` blocking system directories (`/etc`, `/proc`, `/sys`, `~/.ssh`, `.env`) and enforcing `projectRoot` boundaries when `STRICT_MODE=true`.
- **LanceDB Transaction Retries**: Exponential backoff retry with jitter for concurrent write conflicts (`Commit conflict for version X`).
- **Compaction Circuit Breaker**: 30s timeout on `storage.optimize()` with a circuit breaker tripping for 15 minutes after 3 consecutive failures to prevent event loop hangs.
- **Offline CLIP Model Execution**: Support for local model weights via `CLIP_MODEL_PATH`, `OFFLINE_MODE`, model integrity verification, and graceful fallback to perceptual hash matching.
- **Standalone Snapshot Archives**: Added `export_snapshot` and `restore_snapshot` tools to export and restore standalone `.tar.gz` snapshot archives.
- **Real-Time Observability**: Created `MetricsCollector` in `src/core/metrics.ts` tracking query stats, hit ratios, token savings, and exposed via `get_metrics` tool.
- **New MCP Tools**: Added 3 new tools (`get_metrics`, `export_snapshot`, `restore_snapshot`), bringing the total tool count to **19 Core MCP Tools**.
- **Testing & Benchmarking**: Added E2E pipeline integration tests (`pipeline.test.ts`), perceptual hash stability regression tests (`phash_stability.test.ts`), fuzz testing suite (`inputs.fuzz.test.ts`), and benchmarking utility (`src/cli/benchmark.ts`).
- **Documentation**: Created `docs/STORAGE_ENCRYPTION.md` with transparent filesystem encryption setup guides (`fscrypt`, LUKS, APFS encrypted sparse image).

### Fixed & Production Polish
- **Direct Binary Execution Pattern**: Standardized documentation, CLI help text, website guides, and manifests to use local binary execution (`vision-memory-mcp run`).
- **Production Documentation Polish**: Hardened installation guides, API reference docs, and package manifests across codebase.

## [0.4.7] - 2026-07-26

### Fixed & Production Polish
- **Direct Binary Execution Pattern**: Standardized documentation, CLI help text, website guides, and manifests to use local binary execution (`vision-memory-mcp run`).
- **Production Documentation Polish**: Hardened installation guides, API reference docs, and package manifests across codebase.

## [0.4.6] - 2026-07-26

### Fixed & Security / Performance
- **Non-Blocking Teardown & LanceDB Optimize Timeout**: Added `Promise.race` (800ms limit) and a 1-second unref'd force-exit safety timer to prevent LanceDB compaction hangs on process teardown.
- **Path Validation & Sanity Auditing**: Hardened path traversal checks and input payload sanitization.
- **Project Version Bump**: Bumped version across package manifests, CLI runtime, and documentation.

## [0.4.4] - 2026-07-24

### Added & Improved
- **First-Hop Visual Determinism Grounding**:
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
