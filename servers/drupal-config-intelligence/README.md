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

## 🎬 Interactive Demonstration Scenario

Follow this exploratory scenario to discover how the server helps you understand, audit, and safely deploy Drupal configuration changes.

### 🗺️ The Explorer's Journey: Assessing a Drupal Site's Configuration State

Imagine you are a developer onboarding a Drupal project. Before preparing the next deployment, you want to inspect the configuration state, identify local overrides, check dependencies, and verify deployment safety.

#### Step 1: Scanning for Local Configuration Changes
Start by checking if any configuration has modified in the active database but hasn't been exported to code yet.
* **Tool**: `detect_config_drift`
* **Action**: Run `detect_config_drift` (optionally filtering by a prefix like `views.view.`).
* **Discovery**: You get a quick count of modified configurations and a list of specific items that are out of sync.

#### Step 2: Peeking Into a Drifted Config Object
Now that you know which files are out of sync, inspect the raw structure of one of those items (e.g., `system.site`).
* **Tool**: `inspect_config_object`
* **Action**: Run `inspect_config_object` with `config_name: "system.site"` and `source: "both"`.
* **Discovery**: Compare the active configuration structure side-by-side with the sync YAML file representation to inspect their actual properties.

#### Step 3: Examining the Detailed Differences
To get a precise line-by-line understanding of what has changed in this configuration, generate a patch.
* **Tool**: `diff_active_vs_sync`
* **Action**: Run `diff_active_vs_sync` with `config_name: "system.site"` and `include_patch: true`.
* **Discovery**: View the exact lines added or removed, see a calculated risk level for the modification, and learn which keys changed.

#### Step 4: Finding the Origin and Provider
Where did this configuration originally come from? Is it owned by Drupal core, a custom module, a profile, or was it imported by a recipe?
* **Tool**: `find_config_owner`
* **Action**: Run `find_config_owner` with `config_name: "system.site"`.
* **Discovery**: Identify the owner type, module/recipe name, and installation path with a heuristic confidence score.

#### Step 5: Tracing the Config Dependency Web
Before making edits, check what other configurations depend on this item, and what this item requires to function.
* **Tool**: `trace_config_dependencies`
* **Action**: Run `trace_config_dependencies` with `config_name: "system.site"` and `direction: "both"`.
* **Discovery**: Traverse the configuration dependency graph to see requirements and dependents to avoid breaking related functionality.

#### Step 6: Analyzing Individual Deployment Impact
You want to evaluate the potential impact of deploying these changes. What domains are affected, and are there any required post-deployment steps?
* **Tool**: `analyze_config_impact`
* **Action**: Run `analyze_config_impact` with `config_name: "system.site"`.
* **Discovery**: Get an estimated risk classification, affected domains (e.g., theme, security, views), and recommended manual checks or follow-ups.

#### Step 7: Inspecting Multi-Environment Configuration Splits
Large sites often split configurations based on environments (e.g., enabling development modules only in local development).
* **Tool**: `inspect_config_split_state`
* **Action**: Run `inspect_config_split_state` without arguments (or specify a split name).
* **Discovery**: See which configuration splits are active, their folder paths, and the lists of configurations they conditionally complete or partially exclude.

#### Step 8: Auditing Applied Drupal Recipes
If the site leverages Drupal Recipes, inspect whether the configuration managed by those recipes is intact or has diverged.
* **Tool**: `inspect_recipe_state`
* **Action**: Run `inspect_recipe_state` to retrieve the recipe configuration health.
* **Discovery**: See how many config files are managed by each recipe, which ones are missing, and which ones have changed relative to their original definitions.

#### Step 9: Creating a Global Deployment Safety Summary
Before running the deployment, aggregate all configuration drift, active environment splits, and risks into a single unified report.
* **Tool**: `summarize_deployment_risk`
* **Action**: Run `summarize_deployment_risk`.
* **Discovery**: Review the generated deployment safety narrative, highlighting critical blockers, high-risk items, and a checklist of recommended checks to perform before pushing.

