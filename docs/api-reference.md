# 📘 @putervision/vision-memory-mcp Formal API Reference & Leveraged Usage Guide (v0.6.2)

This document provides formal API specifications, parameter schemas, return shapes, JSON payloads, and practical leverage descriptions for all 20 Model Context Protocol (MCP) tools provided by `@putervision/vision-memory-mcp`.

---

## 1. Visual Cache, Ingestion & Element Grounding

### `analyze_screenshot`
- **Overview**: Performs sub-5ms perceptual hashing (dHash/aHash) and vector embedding lookup across LanceDB for a screenshot, returning layout descriptions and structured `grounded_elements` (bounding boxes, CSS selectors, ARIA roles).
- **How to Leverage**: Call *before* sending any screenshot to an expensive multimodal vision LLM (like Claude 3.5 Sonnet or GPT-4o). If `is_known: true`, the tool returns the cached layout description instantly in <5ms, saving 1,400+ vision tokens and 4+ seconds per turn!
- **Request Payload**:
```json
{
  "screenshot": "/path/to/app-login-screen.png",
  "description": "User login form with email input, password input, and Sign In button.",
  "route": "/login",
  "tags": ["auth", "forms"]
}
```
- **Response Payload**:
```json
{
  "is_known": true,
  "state_id": "state_login_01",
  "similarity": 0.992,
  "cached_description": "User login form with email input, password input, and Sign In button.",
  "dhash": "a8f01c3e7b9201f4",
  "grounded_elements": [
    {
      "role": "button",
      "label": "Sign In",
      "selector": "#submit-btn",
      "bounds": [120, 340, 100, 40],
      "center": [170, 360]
    }
  ]
}
```

### `recall_memory`
- **Overview**: Queries stored visual memory by semantic text search or visual similarity.
- **How to Leverage**: Leverage when an agent needs to recall a screen it saw earlier in a long browsing session (e.g. "where was the billing configuration table?"). Returns matching state IDs and layout descriptions.
- **Request Payload**:
```json
{
  "query": "pricing plans comparison table",
  "top_k": 3
}
```

### `predict_next_action`
- **Overview**: Predicts the optimal next UI action and action target (`grounded_target`) based on transition graph success rates.
- **How to Leverage**: Returns concrete `target_selector` and `target_coords` (`[x, y]`) so autonomous agents can click or type deterministically without guessing.

---

## 2. Trajectory & State Navigation

### `record_outcome`
- **Overview**: Logs an agent UI action and transition outcome between two visual state nodes.
- **How to Leverage**: Call after performing any browser interaction (e.g. clicking a button, filling a form, navigating). Builds a directed state transition graph showing which actions successfully navigate between UI screens.
- **Request Payload**:
```json
{
  "from_state_id": "state_login_01",
  "to_state_id": "state_dashboard_01",
  "action": "click('#submit-btn')",
  "success": true
}
```

### `get_navigation_paths`
- **Overview**: Calculates optimal BFS shortest navigation path between two UI screens, weighted by success rate and execution latency.
- **How to Leverage**: Leverage when an autonomous web agent needs to navigate from its current screen to a target goal screen. Returns the exact sequence of clicks and inputs required based on historical transition graphs.

---

## 3. Layout Diffs, Visual Specs & Privacy Scrubbing

### `set_visual_spec`
- **Overview**: Registers a baseline visual design mockup contract for a given route.
- **How to Leverage**: Leverage in UI testing pipelines. Store Figma design mockups as visual baseline specs before running frontend automated tests.

### `verify_visual_spec`
- **Overview**: Verifies live UI rendering against stored design contract baselines.
- **How to Leverage**: Call in Playwright / Cypress visual regression testing. Compares live UI screenshots against design baselines, returning exact region deltas and structural diff percentages.

### `forget_state`
- **Overview**: Purges a specific visual state and its vector embedding from storage.
- **How to Leverage**: Use for privacy compliance and scrubbing sensitive or secret data from disk.

---

## 4. Checkpoints & Fine-Tuning

### `export_visual_trajectories`
- **Overview**: Exports multimodal UI state-action transition sequences in JSONL (standard, LLaVA, or Qwen2-VL) format.
- **How to Leverage**: Leverage to create dataset fine-tuning pairs for open-source local vision models.

---

## 5. Disclaimer & Performance Notice

> **Disclaimer**: The software and tools described herein are provided "as is", without warranty of any kind. Token savings estimates (e.g. up to 90%), execution latency numbers (<5ms), and financial ROI metrics are benchmark estimates based on repeated UI state patterns. Actual performance and savings depend on workflow screen repetition, image resolution, model provider rates, and prompt structure.
