# Drupal MCP v2 — Tools Manifest

> **Purpose:** Authoritative, self-contained mapping of every tool to its target
> server in the v2 architecture. An AI agent building any server reads ONLY this
> file to know *which tools to implement, where, and with which execution model* —
> no codebase scan required.
>
> Source of truth for the architecture is `drupal_tools.md` (section "New MCP
> Server Architecture (v2)"). This manifest operationalizes it.

---

## 0. Server roster (quick reference)

| # | Server (project / package) | Execution model | Runs without... | Tool count |
|---|----------------------------|-----------------|-----------------|-----------:|
| 1 | `drupal-static`  (`drupal-mcp/static`)  | No bootstrap. `nikic/php-parser` + `symfony/finder` + `symfony/yaml` over files on disk | DB, Drush, web server | 12 |
| 2 | `drupal-config`  (`drupal-mcp/config`)  | Drush adapter (shell-out) | — | 10 |
| 3 | `drupal-content` (`drupal-mcp/content`) | Drush adapter (shell-out) | — | 16 |
| 4 | `drupal-ops`     (`drupal-mcp/ops`)     | Drush adapter (shell-out) | — | 14 |
| 5 | `drupal-render`  (`drupal-mcp/render`)  | Drush adapter (shell-out) | — | 10 |
| 6 | `drupal-db-ops`  (`drupal-mcp/db-ops`)  | Direct PDO from `settings.php`. **No `\Drupal` container** | container, Drush, web server | 14 |
| 7 | `drupal-browser` (`drupal-mcp/browser`) | Playwright driver (Node sidecar) via `symfony/process` | DB, Drush | 8 |

**Activation matrix (which servers an agent enables together):**

- `drupal-static` (1) is the always-on baseline during code work.
- Exactly **one** of the runtime servers (2 / 3 / 4 / 5) is usually enabled at a time, scoped to the task domain. They MAY be combined.
- `drupal-db-ops` (6) is the **mutually-exclusive lightweight alternative** to (2–5): enable it when only DB facts are needed and no kernel boot is available/desired. Never enable (6) together with (2–5).
- `drupal-browser` (7) is always standalone, orthogonal to all others.

---

## 1. Per-server build inventory

Each table is the complete checklist of tools to implement for that server.
`Origin` = the legacy server in `/servers` the tool/logic comes from (reference
only — DO NOT modify `/servers`). `Shared args` = applies `SharedArgsSchema::merge()`.

### MCP 1 — `drupal-static` (12 tools)

| Tool | Shared args | Origin | Notes |
|------|:-----------:|--------|-------|
| `list_custom_modules`       | — | drupal-codebase-introspect | Scan dir tree |
| `find_hook_implementations` | — | drupal-codebase-introspect | AST |
| `find_service_definitions`  | — | drupal-codebase-introspect | `*.services.yml` |
| `find_event_subscribers`    | — | drupal-codebase-introspect | services + AST |
| `find_plugin_classes`       | — | drupal-codebase-introspect | annotations/attributes |
| `find_form_classes`         | — | drupal-codebase-introspect | AST |
| `find_controller_handlers`  | — | drupal-codebase-introspect | `*.routing.yml` |
| `find_preprocess_functions` | — | drupal-codebase-introspect | `.theme`/`.module` |
| `find_drush_commands`       | — | drupal-codebase-introspect | AST |
| `trace_runtime_to_code`     | — | drupal-codebase-introspect | unified resolver |
| `summarize_code_inventory`  | — | drupal-codebase-introspect | narrative |
| `read_sync_config`          | yes | **NEW** | Reads `config/sync/*.yml` from disk. The static half of the "stereo view" vs MCP 2/6 active config. Args: `config_name` (string, opt — exact or prefix), `pattern` (string, opt) |

### MCP 2 — `drupal-config` (10 tools)

| Tool | Shared args | Origin | Notes |
|------|:-----------:|--------|-------|
| `inspect_config_object`     | — | drupal-config-intelligence | `source` default `active` |
| `trace_config_dependencies` | — | drupal-config-intelligence | |
| `find_config_owner`         | — | drupal-config-intelligence | |
| `analyze_config_impact`     | — | drupal-config-intelligence | |
| `inspect_config_split_state`| — | drupal-config-intelligence | |
| `inspect_recipe_state`      | — | drupal-config-intelligence | |
| `summarize_deployment_risk` | — | drupal-config-intelligence | narrative |
| `debug_state_system`        | — | drupal-operations-debug | **MIRROR** of MCP 6 — see note M1 |
| `diff_active_vs_sync`       | — | drupal-config-intelligence | **DEPRECATION CANDIDATE** — see note D1 |
| `detect_config_drift`       | yes | drupal-config-intelligence | **DEPRECATION CANDIDATE** — see note D1 |

### MCP 3 — `drupal-content` (16 tools)

| Tool | Shared args | Origin | Notes |
|------|:-----------:|--------|-------|
| `inspect_content_types`     | yes | drupal-content-model | |
| `inspect_media_types`       | yes | drupal-content-model | |
| `inspect_taxonomy_models`   | yes | drupal-content-model | |
| `inspect_field_usage`       | yes | drupal-content-model | |
| `inspect_reference_graph`   | — | drupal-content-model | |
| `summarize_editorial_model` | — | drupal-content-model | narrative |
| `inspect_display_modes`     | — | drupal-content-model | |
| `inspect_revisioning`       | — | drupal-content-model | |
| `inspect_translation`       | — | drupal-content-model | |
| `inspect_moderation`        | — | drupal-content-model | |
| `inspect_entity_types`      | yes | drupal-runtime-inspect | relocated |
| `inspect_bundles`           | yes | drupal-runtime-inspect | relocated |
| `inspect_fields`            | yes | drupal-runtime-inspect | relocated |
| `inspect_menus`             | yes | drupal-runtime-inspect | relocated |
| `inspect_vocabularies`      | yes | drupal-runtime-inspect | relocated |
| `inspect_permissions`       | yes | drupal-runtime-inspect | relocated — perms tie to entities/bundles |

### MCP 4 — `drupal-ops` (14 tools)

| Tool | Shared args | Origin | Notes |
|------|:-----------:|--------|-------|
| `debug_watchdog`            | — | drupal-operations-debug | container-based impl (vs SQL-only in MCP 6) |
| `debug_queue_state`         | — | drupal-operations-debug | |
| `debug_cron_state`          | — | drupal-operations-debug | |
| `debug_cache_state`         | — | drupal-operations-debug | |
| `debug_update_state`        | — | drupal-operations-debug | |
| `debug_environment_summary` | — | drupal-operations-debug | |
| `debug_state_system`        | — | drupal-operations-debug | |
| `debug_runtime_health`      | — | drupal-operations-debug | |
| `debug_failed_operations`   | — | drupal-operations-debug | |
| `inspect_modules`           | yes | drupal-runtime-inspect | relocated |
| `inspect_services`          | — | drupal-runtime-inspect | relocated — DI container |
| `inspect_plugins`           | yes | drupal-runtime-inspect | relocated |
| `inspect_routes`            | — | drupal-runtime-inspect | relocated — routing infra |
| `search_runtime_objects`    | — | drupal-runtime-inspect | relocated — global dead-end search |

### MCP 5 — `drupal-render` (10 tools)

| Tool | Shared args | Origin | Notes |
|------|:-----------:|--------|-------|
| `inspect_theme_state`         | — | drupal-render-theming | |
| `inspect_template_suggestions`| — | drupal-render-theming | |
| `trace_template_resolution`   | — | drupal-render-theming | |
| `find_preprocess_chain`       | — | drupal-render-theming | |
| `inspect_render_array`        | — | drupal-render-theming | |
| `inspect_library_attachments` | — | drupal-render-theming | |
| `inspect_blocks_and_regions`  | — | drupal-render-theming | |
| `inspect_sdc_components`      | — | drupal-render-theming | |
| `summarize_render_path`       | — | drupal-render-theming | narrative |
| `inspect_themes`              | yes | drupal-runtime-inspect | relocated — complements `inspect_theme_state` |

### MCP 6 — `drupal-db-ops` (14 tools, SQL-only)

> **HARD FILTER:** every tool here MUST run with direct PDO only. If a tool needs
> `\Drupal::getContainer()`, it does NOT belong here. See note F1.

| Tool | Shared args | Origin | SQL target |
|------|:-----------:|--------|-----------|
| `debug_watchdog`            | — | drupal-operations-debug | `watchdog` |
| `debug_queue_state`         | — | drupal-operations-debug | `queue` |
| `debug_cache_state`         | — | drupal-operations-debug | `cache_*` |
| `debug_state_system`        | — | drupal-operations-debug | `key_value` (**MIRROR**, note M1) |
| `debug_update_state`        | — | drupal-operations-debug | `key_value` coll. `system.schema` (NOT `UpdateRegistry`) |
| `debug_cron_state`          | — | drupal-operations-debug | `key_value` + `semaphore` |
| `debug_environment_summary` | — | drupal-operations-debug | connection driver introspection |
| `debug_runtime_health`      | — | drupal-operations-debug | composed of the above SQL reads |
| `debug_failed_operations`   | — | drupal-operations-debug | `watchdog` + `queue` + schema |
| `inspect_config_object`     | — | drupal-config-intelligence | `config` table, `source=active` only |
| `diff_active_vs_sync`       | — | drupal-config-intelligence | `config` table vs `config/sync` files |
| `detect_config_drift`       | yes | drupal-config-intelligence | whole `config` collection vs files |
| `analyze_config_impact`     | — | drupal-config-intelligence | diff-based |
| `summarize_deployment_risk` | — | drupal-config-intelligence | delta narrative |

### MCP 7 — `drupal-browser` (8 tools)

| Tool | Origin | Notes |
|------|--------|-------|
| `open_page_session`            | web-observe-capture | session lifecycle |
| `capture_full_page_screenshot` | web-observe-capture | |
| `capture_viewport_screenshot`  | web-observe-capture | |
| `capture_region_screenshot`    | web-observe-capture | |
| `inspect_dom_excerpt`          | web-observe-capture | |
| `inspect_layout`               | web-observe-capture | |
| `capture_page_snapshot`        | web-observe-capture | |
| `close_page_session`           | web-observe-capture | session lifecycle |

---

## 2. Reverse index — Tool → Server(s)

Alphabetical. `Server(s)` lists every server that ships the tool. When a tool
appears in two servers, the implementations differ by execution model (column
`Per-server impl`).

| Tool | Server(s) | Per-server impl |
|------|-----------|-----------------|
| `analyze_config_impact`        | 2 `drupal-config`, 6 `drupal-db-ops` | 2: Drush · 6: SQL diff |
| `capture_full_page_screenshot` | 7 `drupal-browser` | Playwright |
| `capture_page_snapshot`        | 7 `drupal-browser` | Playwright |
| `capture_region_screenshot`    | 7 `drupal-browser` | Playwright |
| `capture_viewport_screenshot`  | 7 `drupal-browser` | Playwright |
| `close_page_session`           | 7 `drupal-browser` | Playwright |
| `debug_cache_state`            | 4 `drupal-ops`, 6 `drupal-db-ops` | 4: Drush · 6: SQL |
| `debug_cron_state`             | 4 `drupal-ops`, 6 `drupal-db-ops` | 4: Drush · 6: SQL |
| `debug_environment_summary`    | 4 `drupal-ops`, 6 `drupal-db-ops` | 4: Drush · 6: SQL/driver |
| `debug_failed_operations`      | 4 `drupal-ops`, 6 `drupal-db-ops` | 4: Drush · 6: SQL |
| `debug_queue_state`            | 4 `drupal-ops`, 6 `drupal-db-ops` | 4: Drush · 6: SQL |
| `debug_runtime_health`         | 4 `drupal-ops`, 6 `drupal-db-ops` | 4: Drush · 6: SQL |
| `debug_state_system`           | 2 `drupal-config`, 4 `drupal-ops`, 6 `drupal-db-ops` | 2/4: Drush · 6: SQL |
| `debug_update_state`           | 4 `drupal-ops`, 6 `drupal-db-ops` | 4: Drush · 6: SQL (no UpdateRegistry) |
| `debug_watchdog`               | 4 `drupal-ops`, 6 `drupal-db-ops` | 4: Drush · 6: SQL |
| `detect_config_drift`          | 2 `drupal-config`, 6 `drupal-db-ops` | both SQL+files; MCP2 = dep. candidate |
| `diff_active_vs_sync`          | 2 `drupal-config`, 6 `drupal-db-ops` | both SQL+files; MCP2 = dep. candidate |
| `find_config_owner`            | 2 `drupal-config` | Drush |
| `find_controller_handlers`     | 1 `drupal-static` | AST/YAML |
| `find_drush_commands`          | 1 `drupal-static` | AST |
| `find_event_subscribers`       | 1 `drupal-static` | YAML/AST |
| `find_form_classes`            | 1 `drupal-static` | AST |
| `find_hook_implementations`    | 1 `drupal-static` | AST |
| `find_plugin_classes`          | 1 `drupal-static` | AST |
| `find_preprocess_chain`        | 5 `drupal-render` | Drush |
| `find_preprocess_functions`    | 1 `drupal-static` | AST |
| `find_service_definitions`     | 1 `drupal-static` | YAML |
| `inspect_blocks_and_regions`   | 5 `drupal-render` | Drush |
| `inspect_bundles`              | 3 `drupal-content` | Drush |
| `inspect_cache_state`          | — | (see `debug_cache_state`) |
| `inspect_config_object`        | 2 `drupal-config`, 6 `drupal-db-ops` | 2: Drush (active+overrides) · 6: SQL (active only) |
| `inspect_config_split_state`   | 2 `drupal-config` | Drush |
| `inspect_content_types`        | 3 `drupal-content` | Drush |
| `inspect_display_modes`        | 3 `drupal-content` | Drush |
| `inspect_dom_excerpt`          | 7 `drupal-browser` | Playwright |
| `inspect_entity_types`         | 3 `drupal-content` | Drush |
| `inspect_field_usage`          | 3 `drupal-content` | Drush |
| `inspect_fields`               | 3 `drupal-content` | Drush |
| `inspect_layout`               | 7 `drupal-browser` | Playwright |
| `inspect_library_attachments`  | 5 `drupal-render` | Drush |
| `inspect_media_types`          | 3 `drupal-content` | Drush |
| `inspect_menus`                | 3 `drupal-content` | Drush |
| `inspect_moderation`           | 3 `drupal-content` | Drush |
| `inspect_modules`              | 4 `drupal-ops` | Drush |
| `inspect_permissions`          | 3 `drupal-content` | Drush |
| `inspect_plugins`              | 4 `drupal-ops` | Drush |
| `inspect_recipe_state`         | 2 `drupal-config` | Drush |
| `inspect_reference_graph`      | 3 `drupal-content` | Drush |
| `inspect_render_array`         | 5 `drupal-render` | Drush |
| `inspect_revisioning`          | 3 `drupal-content` | Drush |
| `inspect_routes`               | 4 `drupal-ops` | Drush |
| `inspect_sdc_components`        | 5 `drupal-render` | Drush |
| `inspect_services`             | 4 `drupal-ops` | Drush |
| `inspect_taxonomy_models`      | 3 `drupal-content` | Drush |
| `inspect_template_suggestions` | 5 `drupal-render` | Drush |
| `inspect_theme_state`          | 5 `drupal-render` | Drush |
| `inspect_themes`               | 5 `drupal-render` | Drush |
| `inspect_translation`          | 3 `drupal-content` | Drush |
| `inspect_vocabularies`         | 3 `drupal-content` | Drush |
| `list_custom_modules`          | 1 `drupal-static` | dir scan |
| `open_page_session`            | 7 `drupal-browser` | Playwright |
| `read_sync_config`             | 1 `drupal-static` | YAML on disk |
| `search_runtime_objects`       | 4 `drupal-ops` | Drush |
| `summarize_code_inventory`     | 1 `drupal-static` | aggregate |
| `summarize_deployment_risk`    | 2 `drupal-config`, 6 `drupal-db-ops` | 2: Drush · 6: SQL |
| `summarize_editorial_model`    | 3 `drupal-content` | Drush |
| `summarize_render_path`        | 5 `drupal-render` | Drush |
| `trace_config_dependencies`    | 2 `drupal-config` | Drush |
| `trace_runtime_to_code`        | 1 `drupal-static` | resolver |
| `trace_template_resolution`    | 5 `drupal-render` | Drush |

---

## 3. Cross-cutting notes

- **M1 — `debug_state_system` mirroring.** Intentionally shipped in MCP 2, 4, and 6.
  Servers 2/4 and 6 are never co-enabled, so this is availability, not DRY violation.
  Each copy MUST carry the doc string: *"mirrored for availability in <context>; canonical SQL impl lives in drupal-db-ops."*

- **F1 — db-ops hard filter.** A tool qualifies for MCP 6 only if it answers YES to
  *"does this run with a raw PDO connection and zero Drupal kernel?"* `inspect_config_object`
  in MCP 6 reads the `config` BLOB table and decodes it manually; it does NOT compute
  `settings.php` overrides (that needs the container → MCP 2 only).

- **D1 — drift tools deprecation candidates.** `diff_active_vs_sync` and `detect_config_drift`
  in MCP 2 are redundant when MCP 1 (`read_sync_config`) + MCP 6 (`inspect_config_object`)
  are both available — the model derives the delta from the "stereo view." Keep them in
  MCP 6 (single-server convenience). In MCP 2, ship them ONLY if MCP 2 is expected to run
  without MCP 1/6 present; otherwise omit. Decision is per-deployment; default = omit from MCP 2.

- **Counts reconciliation.** v2 table in `drupal_tools.md` lists approximate counts
  (`~`). Exact counts here: 1→12, 2→10 (8 if D1 omits both drift tools), 3→16, 4→14,
  5→10, 6→14, 7→8. Total distinct tool *names* = 50; total *implementations* = 68
  (duplicates across execution models counted separately).
