# Drupal MCP Servers: Available Tools Reference

This document provides a comprehensive list of all **68 tools** available across the **7 MCP (Model Context Protocol) servers** located in `/home/sr/Projects/Workspace/agent-forge/servers`.

The servers are divided into three main groups based on their requirements:
*   **Group 1: File-Only Tools (Static Analysis)** — Perform inspections directly on the codebase files. They do not require a booted Drupal site or database.
*   **Group 2: Runtime-Required Tools** — Interact with a bootstrapped Drupal instance or running site environment. They require an active, running site.
*   **Group 3: Database-Related Tools** — A subset of Group 2 tools that perform operations directly affecting or querying database tables (e.g., watchdog logs, queue items, cache bins, configuration tables, update hooks).

---

## Shared Arguments (SharedArgsSchema)

Many runtime-based tools inherit a common schema of optional pagination, query, projection, noise control, and windowing parameters. Rather than repeating these parameters for every tool, they are listed here. Tools that accept these parameters will be marked with **[Supports Shared Arguments]**.

*   `limit` (integer, default: `50`): Maximum number of items to return.
*   `cursor` (string, optional): Opaque cursor for keyset-based pagination.
*   `offset` (integer, optional): Offset-based pagination alternative to cursor.
*   `sort` (string, optional): Field name to sort by.
*   `sort_direction` (string, default: `ASC`): Sort direction (`ASC` or `DESC`).
*   `query` (string, optional): Free-text search query.
*   `filters` (object, optional): Key-value filters specific to the tool domain.
*   `fields` (array of strings, optional): Include only these fields in each item.
*   `exclude_fields` (array of strings, optional): Exclude these fields from each item.
*   `expand` (array of strings, optional): Expand nested references for these fields.
*   `verbosity` (string, default: `minimal`): Verbosity level (`minimal`, `normal`, `diagnostic`, `raw`).
*   `summary_only` (boolean, default: `false`): Return only the summary field, omitting the data array.
*   `include_counts` (boolean, default: `true`): Include count metadata in the response.
*   `exclude_noise` (boolean, default: `true`): Suppress common Drupal metadata noise.
*   `max_chars` (integer, default: `10000`): Maximum character length for large text payloads.
*   `start_char` (integer, default: `0`): Start offset within the text payload.
*   `end_char` (integer, optional): End offset within the text payload.
*   `truncate_strategy` (string, default: `tail`): Truncation position (`head`, `middle`, `tail`).

---

## Group 1: Tools Working Exclusively with Files (Static Analysis)

These 11 tools belong to the **`drupal-codebase-introspect`** server. They inspect configurations (`.yml`), module declarations (`.info.yml`), and class structures statically without booting Drupal.

### 1. `list_custom_modules`
*   **Purpose:** List installed custom modules and their paths by scanning the directory structure.
*   **Arguments:**
    *   `query` (string, optional): Filter results by module name or machine name.

### 2. `find_hook_implementations`
*   **Purpose:** Locate where a specific Drupal hook (e.g., `hook_node_insert`) is implemented across all custom/contrib modules.
*   **Arguments:**
    *   `hook_name` (string, required): Hook suffix to search for (e.g., `node_insert`, `form_alter`).
    *   `module` (string, optional): Limit search to a specific module.
    *   `limit` (number, optional): Limit the number of returned results.

### 3. `find_service_definitions`
*   **Purpose:** Map service IDs and PHP classes defined in `*.services.yml` files.
*   **Arguments:**
    *   `service_id` (string, optional): Exact service ID to search for.
    *   `class_name` (string, optional): Class name substring to filter results.

### 4. `find_event_subscribers`
*   **Purpose:** Identify Symfony event subscribers configured in service files or classes.
*   **Arguments:**
    *   `event_name` (string, optional): Target event name to filter subscribers.

### 5. `find_plugin_classes`
*   **Purpose:** Search for classes annotated or registered as plugins of a specific type.
*   **Arguments:**
    *   `plugin_type` (string, optional): Plugin type directory or namespace (e.g., `Block`, `FieldWidget`).
    *   `plugin_id` (string, optional): Specific plugin identifier to locate.

### 6. `find_form_classes`
*   **Purpose:** Map form class names to their PHP file paths.
*   **Arguments:**
    *   `class_name` (string, required): Full class name of the form to locate.

### 7. `find_controller_handlers`
*   **Purpose:** Map route definitions inside `*.routing.yml` files to their controller classes and methods.
*   **Arguments:**
    *   `route_name` (string, optional): Route name to trace.
    *   `path` (string, optional): Path substring (e.g., `/node/`) to search.

### 8. `find_preprocess_functions`
*   **Purpose:** Identify theme preprocess functions (e.g., `template_preprocess_node`) in `.theme` and `.module` files.
*   **Arguments:**
    *   `hook` (string, optional): Base hook name (e.g., `node`, `page`).
    *   `theme` (string, optional): Theme name to limit the search.

### 9. `find_drush_commands`
*   **Purpose:** Scan codebase for classes defining custom Drush commands.
*   **Arguments:**
    *   `command_name` (string, optional): Specific Drush command name to find.

### 10. `trace_runtime_to_code`
*   **Purpose:** Unified entry point to resolve a runtime symbol (route, service, hook, preprocess, plugin, form class, entity bundle) back to its static file location.
*   **Arguments:**
    *   `domain` (string, required): Domain type (must be one of: `route`, `service`, `hook`, `preprocess`, `plugin`, `form_class`, `entity_bundle`).
    *   `identifier` (string, required): Symbol name to trace (e.g., `system.site`, `node_insert`).
    *   `secondary_identifier` (string, optional): Extra filter context.
    *   `limit` (number, default: `5`): Maximum number of ranked locations to return.

### 11. `summarize_code_inventory`
*   **Purpose:** Generates a narrative overview summarizing custom modules, total routes, and services discovered.
*   **Arguments:** *None.*

---

## Group 2: Tools Requiring an Active Runtime (Bootstrapped Site)

These tools run PHP or shell scripts on a live Drupal environment (usually via Drush inside Lando, DDEV, or local vendor packages).

### A. Drupal Config Intelligence (`drupal-config-intelligence`)

*All tools here accept a root directory discovery but run command-line checks.*

#### 1. `inspect_config_object`
*   **Purpose:** Read configuration objects from active storage (database) or sync directory (files) with noise reduction.
*   **Arguments:**
    *   `config_name` (string, required): Full config name (e.g., `system.site`, `node.type.article`).
    *   `source` (string, default: `active`): Target storage (must be `active`, `sync`, or `both`).
    *   `include_overrides` (boolean, default: `true`): Include `settings.php` configuration overrides (applicable only to `active` source).

#### 2. `diff_active_vs_sync`
*   **Purpose:** Compare active configuration in the database against synchronized files.
*   **Arguments:**
    *   `config_name` (string, required): Config object to diff.
    *   `include_patch` (boolean, default: `false`): Include full diff patch output.

#### 3. `trace_config_dependencies`
*   **Purpose:** Determine direct and transitive dependencies of a configuration object.
*   **Arguments:**
    *   `config_name` (string, required): Config object to trace.
    *   `max_depth` (number, default: `3`): Transitive depth threshold.
    *   `direction` (string, default: `both`): Search direction (`requires`, `required_by`, or `both`).

#### 4. `find_config_owner`
*   **Purpose:** Trace which module, theme, or installation profile provides the default schema for a configuration object.
*   **Arguments:**
    *   `config_name` (string, required): Config object to inspect.

#### 5. `detect_config_drift` **[Supports Shared Arguments]**
*   **Purpose:** List all configuration objects where the active configuration differs from the synchronization files.
*   **Arguments:**
    *   `prefix` (string, optional): Prefix filter for configuration names.

#### 6. `analyze_config_impact`
*   **Purpose:** Analyze the risks and impacts of deploying changes to a specific configuration object.
*   **Arguments:**
    *   `config_name` (string, required): Target configuration object.

#### 7. `inspect_config_split_state`
*   **Purpose:** Query active configuration splits and determine which splits are currently enabled.
*   **Arguments:**
    *   `split_name` (string, optional): Filter by a specific split name.

#### 8. `inspect_recipe_state`
*   **Purpose:** Summarize applied Drupal Recipes and their configuration states.
*   **Arguments:**
    *   `recipe_name` (string, optional): Specific recipe name to filter.

#### 9. `summarize_deployment_risk`
*   **Purpose:** Provide a high-level narrative summary of configuration delta risks before deployment.
*   **Arguments:** *None.*

---

### B. Drupal Content Model (`drupal-content-model`)

*These tools extract content entity structures, relationships, and workflows.*

#### 1. `inspect_content_types` **[Supports Shared Arguments]**
*   **Purpose:** Summarize node bundles, labels, and content moderation association.
*   **Arguments:**
    *   `bundle` (string, optional): Filter by a specific node bundle name.

#### 2. `inspect_media_types` **[Supports Shared Arguments]**
*   **Purpose:** Summarize media bundles, source plugins, and translation status.
*   **Arguments:**
    *   `bundle` (string, optional): Filter by media bundle name.

#### 3. `inspect_taxonomy_models` **[Supports Shared Arguments]**
*   **Purpose:** List taxonomy vocabularies and structures.
*   **Arguments:**
    *   `vocabulary` (string, optional): Vocabulary machine name to filter.

#### 4. `inspect_field_usage` **[Supports Shared Arguments]**
*   **Purpose:** Query fields associated with an entity type across bundles.
*   **Arguments:**
    *   `entity_type_id` (string, required): Target entity type (e.g., `node`, `media`, `user`).
    *   `bundle` (string, optional): Filter by specific bundle name.

#### 5. `inspect_reference_graph`
*   **Purpose:** Track entity reference relationships (edges) between bundles.
*   **Arguments:**
    *   `entity_type_id` (string, required): Source entity type ID.
    *   `bundle` (string, optional): Source bundle name.

#### 6. `summarize_editorial_model`
*   **Purpose:** Produce a narrative summary of the content structure (bundles, fields, moderation).
*   **Arguments:**
    *   `entity_type_id` (string, required): Entity type category (`node`, `media`, `taxonomy`).
    *   `bundle` (string, optional): Focus bundle.

#### 7. `inspect_display_modes`
*   **Purpose:** Query active view modes and form modes enabled for a bundle.
*   **Arguments:**
    *   `entity_type_id` (string, required): Target entity type.
    *   `bundle` (string, optional): Target bundle.

#### 8. `inspect_revisioning`
*   **Purpose:** Report entity revision support and UI configuration.
*   **Arguments:**
    *   `entity_type_id` (string, required): Target entity type.
    *   `bundle` (string, optional): Target bundle.

#### 9. `inspect_translation`
*   **Purpose:** Check translation status and support configuration.
*   **Arguments:**
    *   `entity_type_id` (string, required): Target entity type.
    *   `bundle` (string, optional): Target bundle.

#### 10. `inspect_moderation`
*   **Purpose:** Map bundles to active Content Moderation states and workflows.
*   **Arguments:**
    *   `entity_type_id` (string, required): Target entity type.
    *   `bundle` (string, optional): Target bundle.

---

### C. Drupal Operations Debug (`drupal-operations-debug`)

*Tools designed for site operations, logs, and monitoring.*

#### 1. `debug_watchdog`
*   **Purpose:** Retrieve database logs (watchdog table) with custom severity and message filters.
*   **Arguments:**
    *   `wid` (number, optional): Lookup by log record numeric ID.
    *   `severity` (string, optional): Severity rating (`0` to `7`).
    *   `type` (string, optional): Category filter (e.g., `php`, `cron`, `mail`).
    *   `query` (string, optional): Text match inside log messages.
    *   `since` (string, optional): Earliest date filter (e.g., `"-1 day"`).
    *   `until` (string, optional): Latest date filter.
    *   `request_id` (string, optional): Filter by HTTP request ID.
    *   `uid` (number, optional): User ID who triggered the event.
    *   `limit` (number, default: `50`, max: `1000`): Log slice limit.

#### 2. `debug_queue_state`
*   **Purpose:** Check active queue backlogs and item counts.
*   **Arguments:**
    *   `queue_name` (string, optional): Select queue to inspect.
    *   `include_claimed` (boolean, optional): Show count of claimed/locked items.
    *   `include_failed_samples` (boolean, optional): Include samples of failed operations.

#### 3. `debug_cron_state`
*   **Purpose:** Read site cron execution timestamps and semaphore locks.
*   **Arguments:**
    *   `include_recent_runs` (boolean, optional): Retrieve historical run stamps.

#### 4. `debug_cache_state`
*   **Purpose:** Read status and entry sizes of active cache tables.
*   **Arguments:**
    *   `bin` (string, optional): Cache bin (e.g., `render`, `default`, `config`).
    *   `include_size_estimate` (boolean, optional): Compute count and stale ratio.
    *   `include_stale_samples` (boolean, optional): Return stale cache keys.

#### 5. `debug_update_state`
*   **Purpose:** Scan for pending database updates or entity schema updates.
*   **Arguments:**
    *   `include_pending` (boolean, optional): Show names of pending updates.
    *   `include_failed` (boolean, optional): Report past update execution failures.

#### 6. `debug_environment_summary`
*   **Purpose:** Safe runtime diagnostic details (Drupal version, database driver, cache backend).
*   **Arguments:**
    *   `include_runtime_versions` (boolean, optional): Print versions of PHP, Drupal, and database.

#### 7. `debug_state_system`
*   **Purpose:** Retrieve allowlisted key-value state values.
*   **Arguments:**
    *   `keys` (array of strings, optional): Specific state keys to fetch.
    *   `prefix` (string, optional): Retrieve matching key prefixes.
    *   `allowlist_profile` (string, optional): Key profiles (e.g., `cron`, `maintenance`).

#### 8. `debug_runtime_health`
*   **Purpose:** Perform health checks across database update registries, cron, and environment settings.
*   **Arguments:**
    *   `include_domains` (boolean, optional): Include breakdown of domains.
    *   `include_recommendations` (boolean, optional): Get actionable solutions.

#### 9. `debug_failed_operations`
*   **Purpose:** Aggregate recent system failures (watchdog errors, queue backlog, updates).
*   **Arguments:**
    *   `since` (string, optional): Earliest cutoff point (e.g., `"-1 day"`).
    *   `severity_threshold` (number, default: `3`): Watchdog severity filter.
    *   `domains` (array of strings, optional): Domains to scan (e.g., `["watchdog", "cron"]`).

---

### D. Drupal Render Theming (`drupal-render-theming`)

*Inspects themes, render arrays, and SDC components.*

#### 1. `inspect_theme_state`
*   **Purpose:** Retrieve active theme properties, base themes, and regional maps.
*   **Arguments:** *None.*

#### 2. `inspect_template_suggestions`
*   **Purpose:** List candidate template files for a rendering hook in priority order.
*   **Arguments:**
    *   `theme_hook` (string, required): The base theme hook (e.g., `node`, `block`).

#### 3. `trace_template_resolution`
*   **Purpose:** Determine which template is selected for a given render hook.
*   **Arguments:**
    *   `theme_hook` (string, required): Target render hook.

#### 4. `find_preprocess_chain`
*   **Purpose:** Track preprocess functions hooked into a specific render element.
*   **Arguments:**
    *   `theme_hook` (string, required): Target render hook.

#### 5. `inspect_render_array`
*   **Purpose:** View the structured render array of a block or node entity.
*   **Arguments:**
    *   `target_type` (string, required): Target element type (`node` or `block`).
    *   `target_id` (string, required): Entity ID or machine name.
    *   `view_mode` (string, optional): Display view mode (default: `full`).
    *   `max_depth` (number, optional): Maximum depth limit to truncate nested arrays.

#### 6. `inspect_library_attachments`
*   **Purpose:** List attached CSS/JS assets (libraries) linked to a node or block render structure.
*   **Arguments:**
    *   `target_type` (string, required): Target element type (`node` or `block`).
    *   `target_id` (string, required): Entity ID or machine name.

#### 7. `inspect_blocks_and_regions`
*   **Purpose:** Check placed blocks, their regions, and weights in the active theme.
*   **Arguments:**
    *   `region` (string, optional): Filter block layout by region name.

#### 8. `inspect_sdc_components`
*   **Purpose:** Retrieve Single Directory Component metadata and schema definitions.
*   **Arguments:**
    *   `component_id` (string, optional): Specific component to detail (e.g., `core:button`).

#### 9. `summarize_render_path`
*   **Purpose:** Compile rendering data, attached assets, and active template locations for an element.
*   **Arguments:**
    *   `target_type` (string, required): Target element type (`node` or `block`).
    *   `target_id` (string, required): Entity ID or machine name.

---

### E. Drupal Runtime Inspect (`drupal-runtime-inspect`)

*Performs introspection of services, hooks, entity mappings, and routes in memory.*

#### 1. `inspect_entity_types`
*   **Purpose:** List entity types registered on the site, their handlers, and classes.
*   **Arguments:**
    *   `limit` (number, optional, max: `500`): Maximum items.
    *   `offset` (number, optional): Skips offset amount.
    *   *Supports Shared Arguments*

#### 2. `inspect_bundles`
*   **Purpose:** Get defined bundles (subtypes) of a selected entity type.
*   **Arguments:**
    *   `entity_type_id` (string, required): Target entity (e.g., `node`, `taxonomy_term`).
    *   *Supports Shared Arguments*

#### 3. `inspect_fields`
*   **Purpose:** List fields (base and bundle configurable) registered on an entity.
*   **Arguments:**
    *   `entity_type_id` (string, required): Target entity type.
    *   `bundle` (string, optional): Target bundle name.
    *   *Supports Shared Arguments*

#### 4. `inspect_modules` **[Supports Shared Arguments]**
*   **Purpose:** Query the list of active modules and their version stamps.
*   **Arguments:** *None.*

#### 5. `inspect_themes` **[Supports Shared Arguments]**
*   **Purpose:** List installed themes and denote active/admin status.
*   **Arguments:** *None.*

#### 6. `inspect_routes`
*   **Purpose:** Locate routes, their controllers, requirements, and mapped paths.
*   **Arguments:**
    *   `limit` (number, optional, max: `500`): Maximum items.
    *   `offset` (number, optional): Skips offset amount.
    *   *Supports Shared Arguments*

#### 7. `inspect_services`
*   **Purpose:** Introspect the dependency injection service container.
*   **Arguments:**
    *   `limit` (number, optional, max: `500`): Maximum items.
    *   `offset` (number, optional): Skips offset amount.
    *   *Supports Shared Arguments*

#### 8. `inspect_permissions` **[Supports Shared Arguments]**
*   **Purpose:** Get defined user permissions and their provider modules.
*   **Arguments:** *None.*

#### 9. `inspect_menus` **[Supports Shared Arguments]**
*   **Purpose:** Retrieve the list of all system and custom menus.
*   **Arguments:** *None.*

#### 10. `inspect_vocabularies` **[Supports Shared Arguments]**
*   **Purpose:** Retrieve the list of active taxonomy vocabularies.
*   **Arguments:** *None.*

#### 11. `inspect_plugins` **[Supports Shared Arguments]**
*   **Purpose:** Scan definitions for plugin types (e.g., blocks, conditions, queues).
*   **Arguments:** *None.*

#### 12. `search_runtime_objects`
*   **Purpose:** Search for entity types, active modules, and routes by name matching.
*   **Arguments:**
    *   `query` (string, required): String query to search against entity IDs, routes, and modules.

---

### F. Web Observe & Capture (`web-observe-capture`)

*These tools are used to visually inspect pages of the running Drupal site and capture DOM/layout status.*

#### 1. `open_page_session`
*   **Purpose:** Start a new browser session for a URL.
*   **Arguments:**
    *   `url` (string, required): URL to open.
    *   `wait_until` (string, optional, default: `networkidle`): Wait condition for page loading (`load`, `domcontentloaded`, `networkidle`, or `commit`).
    *   `width` (number, default: `1280`): Viewport width.
    *   `height` (number, default: `720`): Viewport height.

#### 2. `capture_full_page_screenshot`
*   **Purpose:** Capture a high-resolution screenshot of the entire page for a session.
*   **Arguments:**
    *   `session_id` (string, required): Active session ID.

#### 3. `capture_viewport_screenshot`
*   **Purpose:** Capture a screenshot of the currently visible viewport.
*   **Arguments:**
    *   `session_id` (string, required): Active session ID.

#### 4. `capture_region_screenshot`
*   **Purpose:** Capture a screenshot of a specific element or coordinates.
*   **Arguments:**
    *   `session_id` (string, required): Active session ID.
    *   `selector` (string, optional): CSS selector to crop.
    *   `x` (number, optional): X coordinate.
    *   `y` (number, optional): Y coordinate.
    *   `width` (number, optional): Region width.
    *   `height` (number, optional): Region height.

#### 5. `inspect_dom_excerpt`
*   **Purpose:** Retrieve bounded HTML/text content for a selector with character truncation.
*   **Arguments:**
    *   `session_id` (string, required): Active session ID.
    *   `selector` (string, optional, default: `body`): Target CSS selector.
    *   `max_chars` (number, optional, default: `2000`): Character truncation limit.
    *   `include_outer_html` (boolean, optional, default: `false`): Include outer HTML.

#### 6. `inspect_layout`
*   **Purpose:** Retrieve bounding boxes and CSS styles for a list of selectors.
*   **Arguments:**
    *   `session_id` (string, required): Active session ID.
    *   `selectors` (array of strings, required): List of CSS selectors.

#### 7. `capture_page_snapshot`
*   **Purpose:** Generate a structured, narrative DOM snapshot summary.
*   **Arguments:**
    *   `session_id` (string, required): Active session ID.
    *   `max_nodes` (number, optional, default: `100`): Maximum DOM nodes to summarize.

#### 8. `close_page_session`
*   **Purpose:** Close an active browser session and release resources.
*   **Arguments:**
    *   `session_id` (string, required): Session ID to close.

---

## Group 3: Database-Related Tools (Subset of Group 2)

These 14 tools are Group 2 tools that actively read from, query, or check database tables (e.g., schema updates, configuration storage, watchdog tables, queue tables, lock semaphores, cache tables).

### 1. Operations & Logging Tables
*   **`debug_watchdog`** — Queries the database `watchdog` table directly using SQL to retrieve system events.
*   **`debug_queue_state`** — Queries the database `queue` table to count backlogs and oldest items.
*   **`debug_cache_state`** — Queries `cache_*` database tables directly to compute entry counts and stale ratios.
*   **`debug_state_system`** — Queries the database `key_value` table directly to scan state keys by prefix.
*   **`debug_update_state`** — Checks the database module schema version table (`key_value` collection `system.schema`) and compares entity definitions with actual database tables.
*   **`debug_cron_state`** — Reads the `key_value` state storage and checks locks in the `semaphore` database table.
*   **`debug_environment_summary`** — Detects and queries the database driver type (`mysql`, `pgsql`, etc.) from the active connection.
*   **`debug_runtime_health`** — Performs health analysis utilizing the environment, cron locks, and database schema updates.
*   **`debug_failed_operations`** — Aggregates issues from database logs, queues, and schema updates.

### 2. Configuration Database Storage
*   **`inspect_config_object`** — Reads active configuration objects directly from the database `config` table.
*   **`diff_active_vs_sync`** — Compares database-stored active configuration against synchronization files.
*   **`detect_config_drift`** — Compares the entire database configuration collection against local synchronization files.
*   **`analyze_config_impact`** — Traces impact using configuration diffs from the database.
*   **`summarize_deployment_risk`** — Computes deployment risk by analyzing active database configuration delta.

================================================================================

# Proposed MCP Server Division & Architecture

Below is the conceptual division of the Drupal tools into two dedicated MCP servers based on their execution requirements and operational states.

---

## 1. File-Based MCP Server (`drupal-static-analyzer`)

*   **Operation Condition:** Requires only access to the codebase source code on disk. A database and a running web server/Docker environment are not required.
*   **Included Tools:** Contains all 11 tools from **Group 1**, plus static configuration utilities:
    *   **Code Parsing:** Resolving hook implementations, service container references, event subscribers, and plugin definitions using AST analysis (via PHP SDK and library tools like `nikic/php-parser`).
    *   **Configuration Statics:** Direct reading of configuration files from the `config/sync` directory on disk. Allows analyzing the project's configuration state captured in Git without requesting database connectivity.
*   **Activity Profile:** Active whenever writing code, refactoring modules, or executing general codebase structure assessments.

---

## 2. Runtime MCP Server (`drupal-runtime-engine`)

*   **Operation Condition:** Requires a fully provisioned and active local environment (e.g., Lando, DDEV, Docker, or local stack) capable of bootstrapping the Drupal kernel, establishing a database connection, and serving the site.
*   **Included Tools:** Activated for live debugging, system introspection, and visual auditing:
    *   **Database State Introspection:** Querying logs (`watchdog`), queue backlog states, cache bins, and lock semaphores.
    *   **Active Configuration:** Reading configuration states directly from the `config` table in the database and computing dynamic overrides applied via `settings.php`.
    *   **Configuration Drift Analysis:** Tools like `diff_active_vs_sync` and `detect_config_drift` operate here. While they inspect local YAML files, database access is critical to perform comparison delta calculations.
    *   **Runtime Generation, Discovery & UI Observation:** Inspecting active render arrays (`inspect_render_array`), active routes, permissions, plugin managers loaded in memory, and performing browser-driven page/DOM observation (`web-observe-capture`).

---

## 3. Database Operations MCP Server (`drupal-db-ops`)

*   **Operation Condition:** A specialized, standalone server activated for targeted debugging of state, deployment validation, or operational failures.
*   **Context:** Direct operational access to the database backend tables.
*   **Included Tools:** Contains all 14 tools from **Group 3**:
    *   **Operational Tables:** Log inspection (`debug_watchdog`), queue status (`debug_queue_state`), cache state (`debug_cache_state`), and database updates (`debug_update_state`).
    *   **Database Configuration State:** Reading active configurations (`inspect_config_object` using the `active` source) and comparing configurations/drift detection (`detect_config_drift` and `diff_active_vs_sync`).
*   **Advantages:** Ideal for diagnostic scenarios such as troubleshooting why a queue failed after deployment, or auditing log entries for recent runtime errors. It provides the model with only database facts (state, active config, logs) while completely omitting codebase parsing or render array complexities.

================================================================================

# New MCP Server Architecture (v2)

Planned replacement servers — each as a separate project using the PHP MCP SDK.
Activation model: MCP 1 (static) and one of MCP 2–5 (runtime) are used together.
MCP 6 (DB-only) is a lightweight alternative to the runtime group for DB-only tasks.
MCP 7 (browser) is always standalone.

| # | Server | Role | ~Tools | Requires |
|---|--------|------|--------|----------|
| 1 | `drupal-static`  | Static code analysis (Group 1) + reading `config/sync` YAML from disk | ~12 | Files on disk only |
| 2 | `drupal-config`  | Active config read, drift detection, deploy risk | ~9  | Runtime + DB |
| 3 | `drupal-content` | Content model, fields, bundles, workflows, entity types, menus, vocabularies, permissions | ~17 | Runtime + DB |
| 4 | `drupal-ops`     | Debug: logs, queues, cache, health, modules, services, plugins, routes, search_runtime_objects | ~14 | Runtime + DB |
| 5 | `drupal-render`  | Themes, templates, render arrays, SDC, blocks + inspect_themes | ~10 | Runtime |
| 6 | `drupal-db-ops`  | DB-only subset (Group 3) — lightweight alternative to MCP 2–5 | ~14 | DB only |
| 7 | `drupal-browser` | Browser sessions, screenshots, DOM inspection | ~8  | Browser (Playwright) |

## Implementation constraints

### 1. Hard filter for `drupal-db-ops` (MCP 6)
Every tool in this server must pass the check: **"does this work without `\Drupal::getContainer()`?"**
If not — the tool does not belong here. All tools must operate via direct SQL only.
Example: `debug_update_state` must read from the `key_value` table (collection `system.schema`) directly, never via `UpdateRegistry`.

### 2. SharedArgsSchema — static helper class

The PHP MCP SDK builds tool input schema from method parameter reflection
(type hints + `#[Schema]` attributes). PHP traits cannot inject parameters
into a method signature, so a trait cannot share schema params across tools.

**Solution:** a static `SharedArgsSchema` helper class with a `merge()` method,
used at tool registration time via `addTool()`'s explicit `?array $inputSchema`
parameter.

```php
// src/Shared/SharedArgsSchema.php (shared across all 7 server projects via composer package)
class SharedArgsSchema {
    public static function merge(array $toolSpecific): array {
        return array_merge(self::base(), $toolSpecific);
    }

    private static function base(): array {
        return [
            'limit'           => ['type' => 'integer', 'default' => 50],
            'offset'          => ['type' => 'integer'],
            'sort'            => ['type' => 'string'],
            'sort_direction'  => ['type' => 'string', 'enum' => ['ASC', 'DESC'], 'default' => 'ASC'],
            'query'           => ['type' => 'string'],
            'verbosity'       => ['type' => 'string', 'enum' => ['minimal','normal','diagnostic','raw'], 'default' => 'minimal'],
            'summary_only'    => ['type' => 'boolean', 'default' => false],
            'exclude_noise'   => ['type' => 'boolean', 'default' => true],
            'max_chars'       => ['type' => 'integer', 'default' => 10000],
        ];
    }
}
```

Registration:
```php
$server->addTool(
    [$handler, 'execute'],
    name: 'debug_watchdog',
    inputSchema: SharedArgsSchema::merge([
        'wid'      => ['type' => 'integer'],
        'severity' => ['type' => 'string'],
        'since'    => ['type' => 'string'],
    ])
);
```

**Delivery:** publish `SharedArgsSchema` as a private composer package
(e.g. `drupal-mcp/shared-args`) so all 7 server projects require it
without copy-paste.

### 3. `debug_state_system` lives in both MCP 2 and MCP 6
`drupal-config` and `drupal-db-ops` are never active simultaneously, so intentional mirroring is not a DRY violation — it ensures tool availability in both contexts.
Each copy must document: *"mirrored from drupal-db-ops for availability in config context"*.

---

## Distribution of `drupal-runtime-inspect` tools
- `inspect_themes` → **drupal-render**: natively complements `inspect_theme_state`
- `inspect_permissions` → **drupal-content**: permissions are tied to entity types, content types, and vocabularies — part of site structure
- `inspect_modules`, `inspect_services`, `inspect_plugins` → **drupal-ops**: low-level system debug (DI container, broken plugins, active module versions)
- `inspect_routes` → **drupal-ops**: routing is system infrastructure, needed for diagnosing controllers and path access
- `search_runtime_objects` → **drupal-ops**: global search string for the agent when diagnosing a live site
