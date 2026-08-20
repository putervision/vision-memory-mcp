# Changelog

All notable changes to `@putervision/vision-memory-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-19

### Major Release — High-Coherence Tool Consolidation (29 ➔ 15 Tools) & v1.0.0 GA

This major version release optimizes server coherence and eliminates tool disambiguation friction for AI coding agents (such as Cursor, Claude Code, Gemini, and Windsurf), achieving a streamlined 15-tool surface with full backward-compatibility migration documentation.

#### Consolidated 15 Tools Architecture (29 ➔ 15 Tools)
- **`analyze_screenshot` (Perception & Batch Ingestion)**: Absorbed `batch_analyze_screenshots` into `analyze_screenshot` via the `items` array parameter, providing unified single and batch screenshot ingestion with per-item error isolation.
- **`manage_visual_spec` (Visual SDD Baseline Contracts)**: Merged `set_visual_spec`, `verify_visual_spec`, and `list_visual_specs` into a single tool with `action: 'set' | 'verify' | 'list'`.
- **`manage_video` (Unified Video Memory Operations)**: Merged `ingest_video`, `search_video_memory`, and `get_video_timeline` into a single tool with `action: 'ingest' | 'search' | 'timeline'`.
- **`get_session_context` (Unified Context, Metrics & Version)**: Enriched `get_session_context` to provide recent/frequent states, transition graphs, disk stats, real-time cache hit ratios, token savings estimates, and server version/runtime information (absorbing standalone `get_metrics` and `get_version`).
- **`compare_states` (Visual Diffs & Video Trajectory Comparison)**: Absorbed `get_visual_diff` and `compare_video_trajectories` into `compare_states`. Returns `has_layout_change`, `layout_delta_ratio`, structural deltas, or video similarity and frame divergence (`video_a_id`, `video_b_id`).
- **`record_outcome` (Transitions & Visual Blockers)**: Absorbed `create_visual_blocker` into `record_outcome` with `action_type: 'blocker'`, generating structured instructions and visual blocker payloads for `@putervision/state-memory-mcp`.
- **`manage_snapshot` (Unified Checkpoint Management)**: Merged `save_visual_snapshot`, `diff_visual_snapshots`, `export_snapshot`, and `restore_snapshot` into a single tool with the `action` discriminator (`'save'`, `'diff'`, `'export'`, `'restore'`).
- **`export_trajectories` (Unified Multimodal Exporter)**: Merged `export_visual_trajectories` and `export_joint_trajectories` into `export_trajectories`, supporting `'json'`, `'llava'`, `'qwen2_vl'`, and `'joint'` formats.
- **`undo_visual_mutation` (Rollback)**: Cleanly renamed from `undo_last_visual_mutation` with support for state, transition, or any recent mutations.

#### Added & Improved
- **Official Glama Profile**: Added `glama.json` with MCP server schema, categorization, and keywords.
- **High-Disambiguation Tool Descriptions**: Calibrated descriptions and input schemas for LLM agent routing.
- **Test Suite**: Added `tests/unit/consolidated-tools.test.ts` validating all 15 consolidated tools end-to-end (253 / 253 tests passing across 56 test files).
- **Documentation & Rules Sync**: Synchronized `server.json`, `manifest.json`, `README.md`, `CLAUDE.md`, `docs/api-reference.md`, `docs/index.html`, `docs/llms.txt`, and all IDE rules (`.cursor`, `.gemini`, `.github`, `.vscode`, `.windsurf`).

---

## [0.9.0] - 2026-08-11

### Added (Minor Version Release — 29 Core MCP Tools, Video Ingestion & Evidence Packs)
- **WebM & MP4 Video Ingestion Engine**: Digest E2E test recordings and screen captures into searchable keyframe visual states & state transition graphs (`ingest_video`, `search_video_memory`, `get_video_timeline`, `compare_video_trajectories`).
- **Immutable Multi-Modal Evidence Packs**: Cryptographically hashable evidence pack generation (`create_evidence_pack`) linking video keyframes, state graph tasks, and visual state hashes.
- **Dual-MCP Synergy & Visual Blocker Handling**: Structured visual blocker integration with `@putervision/state-memory-mcp` (`create_visual_blocker`, `export_joint_trajectories`).
- **Visual Spec Regression Engine (Visual SDD)**: Mockup baseline verification and visual diff inspection (`list_visual_specs`, `get_visual_diff`, `batch_analyze_screenshots`).
- **Memory Checkpoints & Standalone Archives**: Full snapshot exports and restoration (`export_snapshot`, `restore_snapshot`, `wait_for_visual_state`, `app_version`).
- **CLI Subcommand Expansion**: Updated CLI help text for `spec capture`, `spec list`, and `spec export`.
- **Documentation & Claims Calibration**: Aligned all tool count references to 29 Core MCP Tools across `README.md`, `AGENTS.md`, `SKILL.md`, `docs/index.html`, and `docs/api-reference.md`, and calibrated claims to modest context overhead statements.

## [0.8.1] - 2026-08-11

### Security & Hardening
- **SQL Filter Injection Whitelist**: Hardened all 8 database query methods (`listStates`, `listStatesAll`, `listStateHashes`, `listStateHashesAll`, `countStates`, `countStatesAll`, `searchVector`, `searchVectorAll`, `listTransitions`, `listTransitionsAll`) with `validateFilter()` whitelist validation to reject raw SQL injection payloads.
- **URL Path Redaction**: Enhanced `redactUrl()` to redact numeric ID-like path segments (e.g., `/account/12345/` -> `/account/[REDACTED]/`).
- **Auxiliary DB Symlink Boundaries**: Enforced `fs.realpathSync()` checks in `discoverSubMemoryDatabases()` to reject symlinks pointing outside the project root.
- **Error Visibility**: Added `logger.debug()` logging to silent catch blocks in `saveVideoRecord` and `saveEvidencePack`.

### Performance Optimizations
- **Consolidated `getDirSize`**: Removed duplicate `getDirSize()` implementations from `storage.ts`, `doctor.ts`, and `metrics.ts`, consolidating on `getCachedDirSize()` from `src/utils/fs.ts`.
- **Eviction Sweep Acceleration**: Eliminated per-iteration recursive disk scanning in `checkStorageSizeAndEvict()`; uses cached initial size with per-state size delta estimations.
- **Image Processing Concurrency Limiter**: Added `MAX_CONCURRENT_IMAGE_PROCESSING` config option and a semaphore queue to prevent CPU starvation and OOM under heavy load.
- **Cache TTL Preservation**: Updated eviction sweep to call `memoryCache.sweepExpired()` instead of wiping the entire L1 cache.
- **Clustering Bucketing**: Added dHash prefix bucketing to `clusterVisualStates` to prune unnecessary cosine similarity computations.

### Added
- **`--skip-model-load` CLI Flag & `SKIP_MODEL_LOAD` Env Var**: Allows starting the MCP server or running CLI commands without downloading/initializing heavy CLIP models.
- **7 Expanded Unit, Integration & E2E Test Suites**: Added `concurrency-stress.test.ts`, `circuit-breaker.test.ts`, `stdio-protocol.test.ts`, `video-edge.test.ts`, `visual-spec-diff.test.ts`, `export-roundtrip.test.ts`, and `synergy-joint.test.ts` (bringing total test suite to 51 test files, 243 unit & integration tests passed).
- **Security & Storage Test Suites**: Added `storage-security.test.ts` and expanded `redact.test.ts` for URL path redaction.

---

## [0.8.0] - 2026-08-05

### Added
- **10 High-Leverage Dual-MCP Synergy Pillars**: Implemented deep integration between `@putervision/vision-memory-mcp` and `@putervision/state-memory-mcp`:
  1. Action-grounded visual transitions `(from_visual_state, grounded_action, to_visual_state)`.
  2. Cryptographically hashable evidence packs via `create_evidence_pack` MCP tool (#27).
  3. Visual blockers as first-class background reactors.
  4. Spec dual-binding linking Figma visual baselines with text SDD requirements.
  5. Temporal video paths aligned to task DAGs.
  6. Branch- and workspace-aware visual memory scoping.
  7. Visual novelty and anomaly risk signals.
  8. Unified joint trajectory schema with timing metrics (`timestamp_ms`, `time_delta_ms`, `action_duration_ms`).
  9. Predictive next-UI action ranking from `state-memory-mcp` context.
  10. Lightweight visual post-mortem attachments.
- **`create_evidence_pack` MCP Tool (#27)**: Packages keyframes, dHash/CLIP fingerprints, OCR snippets, and linked state-memory node IDs into immutable evidence pack payloads.
- **Smart Timestamp Sampling**: Enhanced `video-pipeline.ts` to sample keyframes at exact interaction timestamps `action_timestamps` combined with scene-change detection filters.
- **`doctor-global` CLI Command**: Added `vision-memory-mcp doctor-global` to run health checks, aggregate storage footprints, and report health metrics across all registered projects in `~/.vision-memory-mcp/projects.json` (with support for `--clean-stale`, `--scan <dir>`, and `--json`).
- **Dedicated Dual-MCP Synergy & Coverage Test Suites**: Added `dual-mcp-synergy.test.ts`, `coverage-boost.test.ts`, and `doctor-global.test.ts` (bringing total test suite to 46 test files, 224 unit tests).

### Changed
- **Minor Version Bump (0.7.21 -> 0.8.0)**: Updated package version across all manifests, code constants, test suites, API reference docs, and website landing page metadata.

## [0.7.21] - 2026-08-05

### Added
- **WebM & MP4 Video Frame Ingestion & Temporal Memory Engine**: Added `src/core/video-pipeline.ts` and `src/core/video-categorizer.ts` for extracting keyframes from `.webm` and `.mp4` video files using `ffmpeg`, running fast-path dHash deduplication to merge contiguous static screens into keyframe states, generating CLIP vector embeddings, and building chronological sequence transition graphs.
- **4 New MCP Tools (26 Total Core Tools)**: Added `ingest_video`, `search_video_memory`, `get_video_timeline`, and `compare_video_trajectories`.
- **CLI `video` Subcommands**: Added `vision-memory-mcp video ingest <filepath>`, `vision-memory-mcp video inspect <video_id>`, and `vision-memory-mcp video list`.
- **5 Dedicated Video Unit Test Suites**: Added `video-pipeline.test.ts`, `video-categorizer.test.ts`, `video-storage.test.ts`, `video-handlers.test.ts`, and `video-cli.test.ts` (bringing total test suite to 43 test files, 214 unit tests passed).
- **`test:matrix` Pipeline Script**: Added `"test:matrix": "npm run ci"` script to `package.json` to verify code formatting, ESLint, TypeScript typecheck, unit tests, and production `tsup` build.

### Security & Dependencies
- **Security Vulnerability Resolution (0 Vulnerabilities)**: Upgraded `sharp` to `^0.35.0` to resolve all inherited libvips security advisories (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591), reaching **0 vulnerabilities** on `npm audit`.

### Changed
- **Node.js 18+ Prerequisite Restoration**: Restored Node.js support boundary to `>=18.17.0 (LTS)` across `package.json`, GitHub Actions CI matrix (`[18.x, 20.x, 22.x]`), `README.md`, `CONTRIBUTING.md`, and `docs/index.html`.
- **Test & Linter Framework Stability**: Aligned Vitest (`^3.0.7`) and ESLint (`^9.20.0`) dependencies to resolve bundler native binding crashes (`@rolldown/binding`) and missing `node:util` API errors (`styleText`) on Node 18.
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
