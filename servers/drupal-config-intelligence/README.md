# 🧠 Drupal Config Intelligence (Spec 03)

MCP server for deep analysis of Drupal configuration lifecycle, drift detection, and deployment safety.

## ✨ Features

- **Active vs Sync Comparison**: Compare live database state with exported YAML files.
- **Drift Detection**: Identify uncommitted changes in the administrative interface.
- **Dependency Tracing**: Visualize requirements and dependents for any config object.
- **Ownership Analysis**: Heuristic detection of which module/profile provided a config.
- **Deployment Safety**: Automated impact scoring and risk classification.
- **Config Split & Ignore**: Introspect modern multi-environment configuration strategies.
- **Recipes Support**: Understand state of applied Drupal Recipes (D10.3+).
- **Drush-Powered**: Zero-configuration, context-aware Project Root discovery.

## 🧰 Available Tools (9)

| Tool | Purpose |
|---|---|
| `inspect_config_object` | Read config data from active, sync, or both storages. |
| `diff_active_vs_sync` | Strategic comparison with changed-key summaries. |
| `trace_config_dependencies` | Explain requirements and dependents graph. |
| `find_config_owner` | Identify the providing module, profile, or recipe. |
| `detect_config_drift` | Find mismatches between active and sync storage. |
| `analyze_config_impact` | Estimate deployment risk and required follow-ups. |
| `inspect_config_split_state` | Summarize enabled Splits and inclusion patterns. |
| `inspect_recipe_state` | Summarize Recipe states and managed config. |
| `summarize_deployment_risk` | Produce a narrative risk summary of the current delta. |

## 🚀 Quick Start (Forge)

```bash
# From the root of agent-forge
npm install
cd servers/drupal-config-intelligence
npm run build
```

### Configure MCP Client
Point your client to `dist/index.js`. It will **automatically detect** the Drupal project root.

```json
{
  "mcpServers": {
    "drupal-config-intelligence": {
      "command": "node",
      "args": [
        "/absolute/path/to/drupal-config-intelligence/dist/index.js"
      ]
    }
  }
}
```

## 🧪 AI Agent Verification & Stress Test

If you are an AI agent tasked with verifying this server, follow this protocol strictly:

### 🎯 Objective
Validate the configuration drift detection and deployment risk analysis intelligence of the config server.

### 🛠 Sequential Testing Protocol
Audit one tool at a time for maximum fidelity.

1. **`detect_config_drift`**: Run this first. If drift is found, verify it against actual manual changes or `drush cst`.
2. **`diff_active_vs_sync`**: Select a changed config object and evaluate the diff quality. Is it too noisy or perfectly focused on changes?
3. **`trace_config_dependencies`**: Pick a complex config (e.g. a View or a Field) and verify the dependency graph accurately lists modules and other config.
4. **`summarize_deployment_risk`**: Review the narrative. Does it correctly flag potential breaking changes or missing dependencies?

### 📝 Evaluation Criteria
For each tool:
- **Risk Precision**: Does the tool accurately identify "dangerous" config changes?
- **Relationship Integrity**: Are dependency relationships correctly resolved across active and sync storages?

**Submit a "Configuration Lifecycle Audit" for each tool before moving to the next.**
```
