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

| Tool | Purpose | Key Parameters | Key Output Fields |
|---|---|---|---|
| `inspect_config_object` | Read config data as JSON from active DB, sync YAML, or both. | `config_name` (required), `source` enum `active`\|`sync`\|`both` (default: `active`), `include_overrides` bool (default: `true`, active only) | `active`, `sync`, `warnings[]` |
| `diff_active_vs_sync` | Diff one config object: active DB vs sync export. | `config_name` (required), `include_patch` bool (default: `false`) | `status`, `changed_keys[]`, `risk_level`, `patch?`, `warning?`, `method` |
| `trace_config_dependencies` | Trace config dependency graph (requires/required\_by). | `config_name` (required), `max_depth` int ≥1 (default: `3`), `direction` enum `requires`\|`required_by`\|`both` (default: `both`) | `requires`, `required_by[]`, `method` (`drush`\|`filesystem_fallback`), `warning?` |
| `find_config_owner` | Identify the providing module, profile, or recipe. | `config_name` (required) | `owner_type`, `owner_name`, `install_path?`, `confidence` |
| `detect_config_drift` | Find all active≠sync configs via Drupal StorageComparer. Returns `drift_count=null` with `warning` if Drush bootstrap fails. | `prefix` string (optional, e.g. `views.view.`) | `drift_count`, `items[]` (`name`, `operation`), `ignored_count`, `warning?` |
| `analyze_config_impact` | Estimate deployment risk and required follow-ups for one config. | `config_name` (required) | `target`, `impact_summary`, `touched_domains[]`, `risk_level`, `required_followups[]` |
| `inspect_config_split_state` | List Config Split definitions and their state (Config Split v2 field names). | `split_name` string (optional, omit to list all) | `name`, `label`, `status`, `folder`, `complete_list[]`, `partial_list[]`, `include_count`, `exclude_count` |
| `inspect_recipe_state` | **[Best-effort]** Report applied Drupal Recipes (D10.3+). Results are estimates — Drupal has no stable public API for applied recipe state. | `recipe_name` string (optional, omit for all) | `recipe_name`, `managed_config_count`, `missing_count`, `changed_count`, `supported` |
| `summarize_deployment_risk` | Aggregate deploy risk across all drift + active splits. Takes no arguments. | _(none)_ | `summary`, `highest_risk_items[]`, `blockers[]`, `suggested_checks[]` |

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

1. **`detect_config_drift`**: Run this first. Uses Drupal's `StorageComparer` API (not the `drush cst` CLI). If drift is found, verify it against actual manual changes. If `drift_count` is `null`, Drush bootstrap failed — check the `warning` field.
2. **`diff_active_vs_sync`**: Select a changed config object and evaluate the diff quality. Check `method` in the response — `filesystem_fallback` means active storage was unavailable and only sync was readable.
3. **`trace_config_dependencies`**: Pick a complex config (e.g. a View or a Field) and verify the dependency graph accurately lists modules and other config. Check `method` — `filesystem_fallback` means Drush failed and results came from sync YAML only.
4. **`summarize_deployment_risk`**: Review the narrative. Check `blockers[]` for Drush failures and `suggested_checks[]` for environment-specific follow-ups.

### 📝 Evaluation Criteria
For each tool:
- **Risk Precision**: Does the tool accurately identify "dangerous" config changes?
- **Relationship Integrity**: Are dependency relationships correctly resolved across active and sync storages?
- **Fallback Transparency**: Does the tool clearly indicate when it fell back from Drush to filesystem-only mode?

**Submit a "Configuration Lifecycle Audit" for each tool before moving to the next.**
