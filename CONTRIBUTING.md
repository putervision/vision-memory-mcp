# 🤝 Contributing to vision-memory-mcp

Thank you for your interest in contributing to `vision-memory-mcp`! We welcome bug reports, feature requests, documentation improvements, and code contributions.

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed locally:

- **Node.js**: `v18.0.0` or higher (`node -v`)
- **npm**: `v9.0.0` or higher (`npm -v`)
- **Git**

---

## 🚀 Getting Started

1. **Fork & Clone the Repository**

   ```bash
   git clone https://github.com/putervision/vision-memory-mcp.git
   cd vision-memory-mcp
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Build the Project**

   ```bash
   npm run build
   ```

4. **Run Unit Tests**
   ```bash
   npm test
   ```

---

## 🏗️ Project Architecture

- **`src/index.ts`**: MCP server entry point and resource registration.
- **`src/cli.ts`**: Antigravity/MCP CLI tool commands (`init`, `inspect`, `metrics`, `view`, etc.).
- **`src/config.ts`**: Environment configuration and Zod validation schema.
- **`src/core/`**: Core memory and vector search engines:
  - `storage.ts`: LanceDB vector database connection and CRUD methods.
  - `retrieval.ts`: Tiered L1-L4 retrieval engine (hash, vector, AX-tree).
  - `hash.ts`: dHash and aHash perceptual calculation algorithms.
  - `embeddings.ts`: Local CLIP ViT-B/32 ONNX embedding inference engine.
  - `cache.ts`: LRU in-memory state caching and git branch resolution.
  - `graph.ts`: UI transition graph recording and BFS navigation pathfinding.
  - `snapshots.ts`: Checkpointing and snapshot diffing logic.
  - `image-pipeline.ts`: Image resizing, 512-alignment, and thumbnail generation.
- **`src/tools/handlers.ts`**: Implementations for all 19 MCP tools.
- **`src/vision/analyzer.ts`**: Optional L4 vision model fallback describer.
- **`docs/`**: Project landing page website and interactive ROI calculator.
- **`tests/`**: Vitest unit test suite.

---

## 🧪 Development Workflow & Quality Commands

When making changes, always run the quality check commands before creating a pull request:

| Command                | Action                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run dev`          | Watch mode build with `tsup`                                         |
| `npm run build`        | Bundle ESM output and generate `.d.ts` declaration files             |
| `npm run typecheck`    | Strict TypeScript validation without emitting files (`tsc --noEmit`) |
| `npm test`             | Run the Vitest unit test suite                                       |
| `npm run format`       | Auto-format files using Prettier                                     |
| `npm run format:check` | Check code formatting against Prettier rules                         |

---

## 📝 Coding Standards

- **TypeScript Strict Mode**: All code must pass `npm run typecheck` with strict mode enabled.
- **Formatting**: Prettier is configured in `.prettierrc`. Always run `npm run format` prior to committing.
- **Security**: Do not write raw SQL/LanceDB queries using unescaped string inputs—always use sanitized parameters via `escapeSql()`.
- **Async Handling**: Handle promise rejections gracefully and log errors through `logger`.

---

## 🧪 Writing Tests

- Unit test files are located in `tests/unit/*.test.ts`.
- Run `npm test` or `npm run test:watch` while developing.
- Ensure any new MCP tools or core methods include unit tests verifying success and failure edge cases.

---

## 📬 Submitting a Pull Request (PR)

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-cool-feature
   ```
2. Commit your changes with descriptive commit messages.
3. Ensure all automated quality checks pass:
   ```bash
   npm run format:check && npm run typecheck && npm run build && npm test
   ```
4. Push your branch to GitHub and open a Pull Request.

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
