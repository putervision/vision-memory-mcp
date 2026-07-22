# Changelog

All notable changes to `@putervision/vision-memory-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
