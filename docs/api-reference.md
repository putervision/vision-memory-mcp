# 📘 @putervision/vision-memory-mcp Formal API Reference & Leveraged Usage Guide (v0.4.6)

This document provides formal API specifications, parameter schemas, return shapes, JSON payloads, and practical leverage descriptions for all 16 Model Context Protocol (MCP) tools provided by `@putervision/vision-memory-mcp`.

---

## 1. Visual Cache & Ingestion

### `analyze_screenshot`
- **Overview**: Performs sub-5ms perceptual hashing (dHash/aHash) and vector embedding lookup across LanceDB for a screenshot.
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
  "dhash": "a8f01c3e7b9201f4"
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
- **Overview**: Calculates optimal BFS shortest navigation path between two UI screens.
- **How to Leverage**: Leverage when an autonomous web agent needs to navigate from its current screen to a target goal screen. Returns the exact sequence of clicks and inputs required based on historical transition graphs.

---

## 3. Layout Diffs & Spec Compliance

### `set_visual_spec`
- **Overview**: Registers a baseline visual design mockup contract for a given route.
- **How to Leverage**: Leverage in UI testing pipelines. Store Figma design mockups as visual baseline specs before running frontend automated tests.
- **Request Payload**:
```json
{
  "route": "/checkout",
  "baseline_image": "/path/to/figma-checkout-spec.png",
  "title": "Figma Checkout Spec Baseline"
}
```

### `verify_visual_spec`
- **Overview**: Verifies live UI rendering against stored design contract baselines.
- **How to Leverage**: Call in Playwright / Cypress visual regression testing. Compares live UI screenshots against design baselines, returning exact region deltas and structural diff percentages.
- **Request Payload**:
```json
{
  "route": "/checkout",
  "live_screenshot": "/path/to/live-checkout-build.png"
}
```
- **Response Payload**:
```json
{
  "compliant": true,
  "structural_diff_pct": 0.8,
  "region_deltas": [],
  "message": "Live UI matches baseline spec contract within 1% threshold."
}
```

---

## 4. Checkpoints & Fine-Tuning

### `export_visual_trajectories`
- **Overview**: Exports multimodal UI state-action transition sequences in JSONL format.
- **How to Leverage**: Leverage to create dataset fine-tuning pairs for open-source 3B–8B local models, compiling UI navigation procedures directly into weights and lowering API execution costs by 100×.
- **Request Payload**:
```json
{ "format": "jsonl", "output_path": "./visual_trajectories.jsonl" }
```
