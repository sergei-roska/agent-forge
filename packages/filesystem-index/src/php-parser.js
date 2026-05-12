"use strict";
/**
 * PHP pattern matching utilities for Drupal codebase introspection.
 * Finds hooks, services, event subscribers, plugins, forms, controllers, and preprocess functions
 * using regex-based pattern matching on PHP source files.
 *
 * Note: This is not a full PHP parser — it uses regex heuristics optimized for common
 * Drupal coding patterns. For full AST analysis, consider integrating php-parser.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanPhpFile = scanPhpFile;
exports.findHooks = findHooks;
const promises_1 = require("node:fs/promises");
// ---------- Pattern Matchers ----------
const PATTERNS = {
    /** Drupal hook implementations: function modulename_hookname(...) */
    hook: /^function\s+(\w+?)_(hook_\w+|form_alter|theme|preprocess_\w+|install|uninstall|update_\d+|schema|requirements|entity_\w+|node_\w+|user_\w+|views_\w+|menu_\w+|cron|mail|tokens?|token_info)\s*\(/gm,
    /** Generic hook pattern: function *_*(...) in .module files */
    hookGeneric: /^function\s+(\w+)\s*\(/gm,
    /** Service definitions in *.services.yml patterns found in PHP */
    serviceClass: /class\s+(\w+)\s+(?:extends|implements)/g,
    /** Event subscriber: implements EventSubscriberInterface */
    eventSubscriber: /class\s+(\w+)\s+[^{]*\bEventSubscriberInterface\b/g,
    /** Plugin annotations: @\w+Plugin or @\w+( */
    pluginAnnotation: /@(\w+)\s*\(\s*$/gm,
    pluginAttribute: /#\[(\w+)\s*\(/gm,
    /** Form classes: extends FormBase, ConfirmFormBase, ConfigFormBase */
    formClass: /class\s+(\w+)\s+extends\s+(?:FormBase|ConfirmFormBase|ConfigFormBase|ContentEntityForm|EntityForm)\b/g,
    /** Controller classes: extends ControllerBase */
    controllerClass: /class\s+(\w+)\s+extends\s+ControllerBase\b/g,
    /** Theme preprocess functions */
    preprocessFunction: /^function\s+(\w+_preprocess_\w+)\s*\(/gm,
    /** Drush command classes */
    drushCommand: /class\s+(\w+)\s+extends\s+DrushCommands\b/g,
};
/**
 * Scan a PHP file for Drupal-specific patterns.
 */
async function scanPhpFile(filePath, relativePath) {
    let content;
    try {
        content = await (0, promises_1.readFile)(filePath, 'utf-8');
    }
    catch {
        return [];
    }
    const lines = content.split('\n');
    const results = [];
    // Check each pattern
    const matchers = [
        { regex: new RegExp(PATTERNS.eventSubscriber.source, 'g'), type: 'event_subscriber' },
        { regex: new RegExp(PATTERNS.formClass.source, 'g'), type: 'form' },
        { regex: new RegExp(PATTERNS.controllerClass.source, 'g'), type: 'controller' },
        { regex: new RegExp(PATTERNS.drushCommand.source, 'g'), type: 'drush_command' },
        { regex: new RegExp(PATTERNS.preprocessFunction.source, 'gm'), type: 'preprocess' },
    ];
    // Scan line by line for function-level patterns
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Hook implementations (in .module, .inc, .install files)
        if (relativePath.match(/\.(module|inc|install|theme)$/)) {
            const hookMatch = /^function\s+(\w+)\s*\(/.exec(line);
            if (hookMatch) {
                results.push({
                    name: hookMatch[1],
                    type: 'hook',
                    file: relativePath,
                    line: i + 1,
                    content: line.trim(),
                });
            }
        }
        // Preprocess functions
        const preprocessMatch = /^function\s+(\w+_preprocess_\w+)\s*\(/.exec(line);
        if (preprocessMatch) {
            results.push({
                name: preprocessMatch[1],
                type: 'preprocess',
                file: relativePath,
                line: i + 1,
                content: line.trim(),
            });
        }
    }
    // Scan full content for class-level patterns
    for (const { regex, type } of matchers) {
        let match;
        while ((match = regex.exec(content)) !== null) {
            const line = content.slice(0, match.index).split('\n').length;
            results.push({
                name: match[1],
                type,
                file: relativePath,
                line,
                content: match[0].trim(),
            });
        }
    }
    // Deduplicate by name+type+line
    const seen = new Set();
    return results.filter(r => {
        const key = `${r.name}:${r.type}:${r.line}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
/**
 * Find all hook implementations in a .module file.
 */
function findHooks(content, moduleName) {
    const lines = content.split('\n');
    const hooks = [];
    const prefix = `${moduleName}_`;
    for (let i = 0; i < lines.length; i++) {
        const match = /^function\s+(\w+)\s*\(/.exec(lines[i]);
        if (match && match[1].startsWith(prefix)) {
            hooks.push({
                hook: match[1].slice(prefix.length),
                line: i + 1,
            });
        }
    }
    return hooks;
}
