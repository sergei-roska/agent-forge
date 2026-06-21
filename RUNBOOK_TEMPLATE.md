# Drupal MCP v2 — Server Build Runbook (Template)

> **Audience:** an AI agent implementing ONE MCP server end-to-end.
> **Promise:** this runbook is self-contained. Every decision an agent would
> otherwise discover by scanning code or sampling data is pre-resolved here or in
> `TOOLS_MANIFEST.md`. Do NOT explore `/servers` (read-only legacy reference) and
> do NOT sample the target Drupal site to "figure out how it works" — follow the steps.
>
> **How to use:** copy this file to the new server project as `RUNBOOK.md`,
> then replace every `{{PLACEHOLDER}}`. Placeholders are listed in §1.

---

## 0. Fill-in placeholders

| Placeholder | Source | Example |
|-------------|--------|---------|
| `{{SERVER_NUM}}`      | TOOLS_MANIFEST §0 | `1` |
| `{{SERVER_NAME}}`     | TOOLS_MANIFEST §0 | `drupal-static` |
| `{{PACKAGE_NAME}}`    | TOOLS_MANIFEST §0 | `drupal-mcp/static` |
| `{{EXECUTION_MODEL}}` | TOOLS_MANIFEST §0 | `none` \| `drush` \| `pdo` \| `playwright` |
| `{{TOOL_LIST}}`       | TOOLS_MANIFEST §1 | the per-server inventory table |
| `{{NAMESPACE}}`       | derived | `DrupalMcp\Static` |

---

## 1. Goal & scope

**Goal.** Deliver a working, installable MCP server `{{SERVER_NAME}}` that exposes
exactly the tools listed for MCP #`{{SERVER_NUM}}` in `TOOLS_MANIFEST.md §1` — no
more, no fewer — over **stdio transport**, using the PHP MCP SDK
(`modelcontextprotocol/php-sdk`, PHP ≥ 8.1).

**In scope:** project scaffold, dependency wiring, the execution adapter for
`{{EXECUTION_MODEL}}`, every tool handler, the shared response envelope, error
handling, the MCP client registration snippet, and a smoke test per tool.

**Out of scope:** modifying `/servers`; adding tools not in the manifest;
changing the architecture (`drupal_tools.md` is frozen); writing to the target
Drupal database (all tools are **read-only**).

**Definition of done:** §8 acceptance checklist passes.

---

## 2. Required inputs (gather before step 1)

The agent MUST have these resolved. If any is missing, STOP and emit
`ENV_NOT_READY` with the list of what's absent (see §7).

| Input | Needed by models | How to obtain | If absent |
|-------|------------------|---------------|-----------|
| `PROJECT_ROOT` — abs. path to the Drupal codebase | all | provided by caller / cwd | `ENV_NOT_READY` |
| `DRUPAL_ROOT` — web root (often `PROJECT_ROOT/web`) | all | detect `index.php` + `core/` | fall back to `PROJECT_ROOT` |
| Drush invocation | `drush` | §3.2 detection ladder | `DRUSH_NOT_FOUND` |
| DB credentials (`$databases`) | `pdo` | parse `DRUPAL_ROOT/sites/*/settings.php` | `DB_UNAVAILABLE` |
| Playwright driver | `playwright` | `node` + `@playwright/test` present | `ENV_NOT_READY` |
| `config/sync` path | `none` (static), `pdo` | read `$settings['config_sync_directory']` or default `../config/sync` | `NOT_FOUND` (degrade gracefully) |

> **No discovery beyond this table.** Do not enumerate modules, query the DB, or
> boot the kernel to "learn" the site. Tools do that at call time, per request.

---

## 3. Step-by-step build algorithm

Each step states: **Action · Inputs · Expected result · On error**.

### Step 1 — Scaffold the project
- **Action:** create the layout below; `composer init` with `name: {{PACKAGE_NAME}}`.
  ```
  {{SERVER_NAME}}/
  ├── bin/server.php            # stdio entrypoint
  ├── src/
  │   ├── Tools/                # one class per tool (PascalCase of tool name)
  │   ├── Adapter/              # execution adapter (see Step 3)
  │   └── Support/Envelope.php  # response envelope (see Step 5)
  ├── tests/Smoke/              # one smoke test per tool
  ├── composer.json
  └── RUNBOOK.md                # this file, placeholders filled
  ```
- **Inputs:** `{{PACKAGE_NAME}}`, `{{NAMESPACE}}`.
- **Expected result:** directories exist; `composer.json` autoloads `{{NAMESPACE}}\\` → `src/`.
- **On error:** filesystem write failure → abort, report path + errno.

### Step 2 — Wire dependencies
- **Action:** `composer require` the set for `{{EXECUTION_MODEL}}`:
  - **always:** `modelcontextprotocol/php-sdk`, `drupal-mcp/shared-args` (the `SharedArgsSchema` helper), `symfony/yaml`.
  - **`none`:** `+ nikic/php-parser`, `symfony/finder`.
  - **`drush`:** `+ symfony/process`.
  - **`pdo`:** `+ symfony/process` (only for settings parsing if needed); core PDO is built-in.
  - **`playwright`:** `+ symfony/process`; ensure Node `@playwright/test` available out-of-band.
- **Expected result:** `composer install` exits 0; `vendor/autoload.php` present.
- **On error:** version conflict → pin to PHP 8.1-compatible ranges (SDK requires `^8.1`); report the conflicting package.

### Step 3 — Implement the execution adapter (`src/Adapter`)
Pick the ONE matching `{{EXECUTION_MODEL}}`:

#### 3.1 `none` (static) — `FileAdapter`
- Reads files under `PROJECT_ROOT` via `symfony/finder`; parses PHP via `nikic/php-parser`, YAML via `symfony/yaml`.
- No process spawning, no DB. Idempotent and side-effect-free.

#### 3.2 `drush` — `DrushAdapter`
- **Detection ladder** (first hit wins), executed once and cached:
  1. `lando drush` if `.lando.yml` in `PROJECT_ROOT`.
  2. `ddev drush` if `.ddev/` in `PROJECT_ROOT`.
  3. `PROJECT_ROOT/vendor/bin/drush`.
  4. `drush` on `$PATH`.
- **Call convention:** run read-only PHP via `drush php:eval '<expr>'` or a bundled
  `drush php:script <tmpfile>`. The expression MUST `echo json_encode($result)` and
  nothing else. Adapter parses stdout as JSON.
- **Hardening:** 30s default timeout (`symfony/process`); capture stderr separately;
  reject if exit code ≠ 0 → map to `DRUSH_NOT_FOUND` / `DRUPAL_BOOTSTRAP_FAILED`.

#### 3.3 `pdo` (db-ops) — `PdoAdapter`
- Parse `$databases['default']['default']` from `settings.php` (and any
  `settings.local.php` include). Build a PDO DSN. **Never** load the Drupal container.
- All queries are `SELECT`/read-only. Prepared statements only. Enforce a row cap
  (`LIMIT`) derived from `SharedArgsSchema.limit`.
- **Hard filter (note F1):** if a tool's logic would require `\Drupal::*`, it is
  misassigned — STOP and report `MISASSIGNED_TOOL`.

#### 3.4 `playwright` — `BrowserAdapter`
- Manage a Node Playwright sidecar via `symfony/process`. Sessions keyed by
  `session_id`; store handles in-memory for the server lifetime.
- Enforce session count cap and per-action timeout. `close_page_session` and process
  exit MUST release browser contexts.

- **Expected result (all):** adapter exposes a single typed method the tool handlers
  call; returns decoded PHP arrays or throws a typed `AdapterException`.
- **On error:** see §7 taxonomy; the adapter NEVER returns partial/garbage JSON.

### Step 4 — Implement each tool (`src/Tools`)
Loop over `{{TOOL_LIST}}`. For EACH tool apply the **per-tool sub-runbook (§6)**.
- **Expected result:** one handler class per tool; registered in `bin/server.php`.
- **On error:** a single failing tool MUST NOT break server startup; log and skip
  registration only as a last resort (prefer fixing).

### Step 5 — Response envelope (`src/Support/Envelope.php`)
- **Action:** every tool returns its payload wrapped by `Envelope::ok()` /
  `Envelope::error()` and serialized to the MCP text content as JSON. Shape:
  ```json
  {
    "ok": true,
    "summary": "human-readable one-liner",
    "data": [],
    "counts": { "returned": 0, "total": 0, "truncated": false },
    "meta": { "server": "{{SERVER_NAME}}", "tool": "<name>", "execution": "{{EXECUTION_MODEL}}", "elapsed_ms": 0 },
    "errors": []
  }
  ```
  Error shape: `ok:false`, `data:[]`, `errors:[{code, message, hint}]` (codes from §7).
- **Expected result:** uniform output across all tools and all 7 servers.
- **On error:** serialization failure → emit a minimal hand-built `ok:false` JSON.

### Step 6 — Register server & build entrypoint (`bin/server.php`)
- **Action:**
  ```php
  $server = \Mcp\Server::builder()
      ->setServerInfo('{{SERVER_NAME}}', '0.1.0')
      // one ->addTool(...) per tool, inputSchema via SharedArgsSchema::merge() where marked
      ->build();
  $server->run(); // stdio transport (default)
  ```
- **Expected result:** `php bin/server.php` starts, responds to MCP `initialize`
  and `tools/list` with exactly the manifest's tool set.
- **On error:** missing handler class → fail fast with the offending tool name.

### Step 7 — Smoke tests (`tests/Smoke`)
- **Action:** per tool, one test invoking the handler with minimal valid args and
  asserting the envelope shape + `ok:true` against a known fixture/site.
- **Expected result:** all smoke tests green; `tools/list` count == manifest count.
- **On error:** record failures in the acceptance report (§8); do not silently pass.

---

## 4. Per-step expected-output summary

| Step | Concrete artifact | Verifiable by |
|------|-------------------|---------------|
| 1 | project tree + composer.json | `ls`, `composer validate` |
| 2 | vendor/ populated | `composer install` exit 0 |
| 3 | `src/Adapter/<X>Adapter.php` | unit-level adapter test |
| 4 | `src/Tools/*.php` (N == manifest) | file count |
| 5 | `src/Support/Envelope.php` | envelope unit test |
| 6 | `bin/server.php` | `tools/list` JSON |
| 7 | green smoke suite | test runner exit 0 |

---

## 5. MCP client registration (emit this for the user)

```json
{
  "mcpServers": {
    "{{SERVER_NAME}}": {
      "command": "php",
      "args": ["/abs/path/{{SERVER_NAME}}/bin/server.php"],
      "env": { "PROJECT_ROOT": "/abs/path/to/drupal" }
    }
  }
}
```

---

## 6. Per-tool sub-runbook (apply once per tool in §3 Step 4)

> Repeat this 8–16 times. It is intentionally mechanical so no per-tool research is needed.

1. **Read the spec** for the tool in `drupal_tools.md` (purpose + arguments) — that is the
   single source for name, semantics, and arguments. Do not invent arguments.
2. **Create** `src/Tools/<PascalName>.php` implementing the SDK tool handler.
3. **Declare the input schema:**
   - Tool marked "Shared args = yes" in `TOOLS_MANIFEST.md §1`:
     register via `inputSchema: SharedArgsSchema::merge([ ...tool-specific... ])`.
   - Otherwise: declare only the tool-specific arguments (type hints +
     `#[Schema]` attributes per the SDK reflection model).
4. **Implement logic** by delegating to the Step-3 adapter. Read-only always.
5. **Apply noise/verbosity controls** (`verbosity`, `exclude_noise`, `max_chars`,
   `truncate_strategy`) when the tool supports shared args — truncate large payloads,
   set `counts.truncated`.
6. **Wrap** the result in `Envelope::ok(summary, data, counts)`.
7. **Map failures** to §7 codes via `Envelope::error()`. Never throw out of the handler.
8. **Add** one smoke test in `tests/Smoke`.

---

## 7. Error handling & edge cases (canonical taxonomy)

Every server uses these codes. Each error carries `{code, message, hint}`.

| Code | Trigger | Handler response | `hint` to surface |
|------|---------|------------------|-------------------|
| `ENV_NOT_READY` | required input from §2 missing | refuse at startup or call time | list what's missing |
| `DRUSH_NOT_FOUND` | detection ladder exhausted | `ok:false` | "enable a runtime server or use drupal-db-ops" |
| `DRUPAL_BOOTSTRAP_FAILED` | drush exit≠0 / no bootstrap | `ok:false` | include drush stderr tail |
| `DB_UNAVAILABLE` | PDO connect fails | `ok:false` | check settings.php credentials |
| `MISASSIGNED_TOOL` | db-ops tool needs container (note F1) | abort build | "move tool to MCP 2–5" |
| `INVALID_ARGUMENT` | schema-valid but semantically bad | `ok:false` | name the bad arg |
| `NOT_FOUND` | target (config/route/entity) absent | `ok:true`, empty `data`, `counts.total:0` | not an error if legitimately empty |
| `AMBIGUOUS` | multiple matches where one expected | `ok:true` + ranked list | ask caller to disambiguate |
| `TIMEOUT` | adapter exceeds budget | `ok:false` | suggest narrower `filters`/`limit` |
| `PAYLOAD_TRUNCATED` | output > `max_chars` | `ok:true`, `counts.truncated:true` | suggest pagination |
| `PARSE_ERROR` | malformed YAML/PHP/JSON encountered | `ok:false` (static) / skip+continue (scans) | file path + line |

**Edge cases to handle explicitly in every relevant tool:**
- Empty result is success (`NOT_FOUND` semantics, not an error).
- Multisite: if multiple `sites/*` dirs, require/honor a `--uri` (drush) or explicit site selection; default to `sites/default`.
- Large tables (`watchdog`, `cache_*`): ALWAYS apply `limit`; never `SELECT *` unbounded.
- Stale/locked semaphores: report state, never attempt to clear (read-only).
- Config drift with no sync dir: degrade to `NOT_FOUND` on the sync side, still return active side.
- Mirrored `debug_state_system`: identical contract across MCP 2/4/6; only the adapter differs.

---

## 8. Acceptance checklist (Definition of Done)

- [ ] `composer validate` passes; `composer install` exit 0.
- [ ] `tools/list` returns EXACTLY the manifest tool set for MCP #`{{SERVER_NUM}}` (count + names).
- [ ] Every tool returns the §5 envelope; success and error paths both exercised.
- [ ] No tool performs a write to DB/filesystem (read-only proven by review).
- [ ] (db-ops only) zero references to `\Drupal::` / container — hard filter F1 holds.
- [ ] Shared-args tools register via `SharedArgsSchema::merge()`; non-shared do not.
- [ ] Error taxonomy (§7) wired; `ENV_NOT_READY` fires cleanly when inputs absent.
- [ ] Smoke suite green; one test per tool.
- [ ] MCP registration snippet (§5) emitted to the user with correct abs path.
- [ ] `RUNBOOK.md` in the project has all `{{PLACEHOLDERS}}` resolved.
