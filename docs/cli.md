# 💻 CLI Commands Reference — vision-memory-mcp

The `vision-memory-mcp` executable provides a full suite of management, diagnostic, visual spec, and snapshot utilities.

---

## 📋 Complete Command List

| Command | Description | Example Usage |
| ------- | ----------- | ------------- |
| `run` | Launches the MCP stdio server transport. | `vision-memory-mcp run` |
| `init` | Bootstraps workspace database, `.gitignore`, `.env`, and IDE rules. | `vision-memory-mcp init --yes` |
| `init-global` | Re-initializes across all registered projects in `~/.vision-memory-mcp/projects.json`. | `vision-memory-mcp init-global --clean-stale` |
| `doctor` | Health-checks LanceDB writability, Sharp bindings, Node runtime, Git repos, and .gitignore safety. | `vision-memory-mcp doctor --json` |
| `update` | Checks the npm registry and updates `@putervision/vision-memory-mcp` globally to latest. | `vision-memory-mcp update` |
| `audit` | Deep workspace audit of Git repos, submodules, database locations, and state counts. | `vision-memory-mcp audit --json` |
| `inspect` | Prints an ASCII table of stored visual states and metadata. | `vision-memory-mcp inspect` |
| `metrics` | Displays ROI metrics, token savings estimates, and cache sizes. | `vision-memory-mcp metrics` |
| `view` | Opens a local force-directed graph viewer of the visual memory in your browser. | `vision-memory-mcp view` |
| `spec` | Baseline design contract registration (`set`) and live visual regression verification (`verify`). | `vision-memory-mcp spec set --name "Login UI" --file ./login.png` |
| `snapshot` | Manage visual checkpoints (`save`, `diff`, `list`). | `vision-memory-mcp snapshot save --name "checkpoint-1"` |
| `undo` | Revert the last visual state or transition edge mutation. | `vision-memory-mcp undo` |
| `optimize` | Compacts LanceDB storage fragments and vacuum locks. | `vision-memory-mcp optimize` |
| `prune` | Purges expired TTL states from the storage database. | `vision-memory-mcp prune` |
| `backup` | Backs up LanceDB storage into a standalone tarball. | `vision-memory-mcp backup --out ./backup.tar.gz` |
| `restore` | Restores LanceDB storage from a tarball archive. | `vision-memory-mcp restore ./backup.tar.gz` |

---

## 🛠️ Common Workflows

### 1. Workspace Diagnostics

Verify installation and environment health:

```bash
vision-memory-mcp doctor
```

### 2. Visual Spec Regression Testing

Set a design baseline and verify against runtime screenshot:

```bash
# Register baseline design contract
vision-memory-mcp spec set --name "Dashboard" --file ./dashboard-spec.png

# Verify runtime screenshot against baseline
vision-memory-mcp spec verify --name "Dashboard" --file ./dashboard-runtime.png --tolerance 0.05
```

### 3. Checkpoint Snapshot Diffing

```bash
# Save milestone checkpoint
vision-memory-mcp snapshot save --name "v1.0-release"

# Diff two visual checkpoints
vision-memory-mcp snapshot diff --a "v1.0-release" --b "v1.1-release"
```
