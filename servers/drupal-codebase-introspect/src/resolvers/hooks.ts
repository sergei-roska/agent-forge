import { PhpScanner } from '../repo/phpSymbols.js';

export class HookResolver {
  constructor(private php: PhpScanner) {}

  async findImplementations(hookName: string, moduleName?: string, limit?: number) {
    const symbols = await this.php.scan();
    
    // We look for type 'hook' where the name ends with the requested hook.
    // e.g. hookName = 'node_insert', we want 'my_module_node_insert'.
    const suffix = `_${hookName}`;
    
    let matches = symbols.filter(s => s.type === 'hook' && s.name.endsWith(suffix));
    
    let results = matches.map(s => {
      const module = s.name.slice(0, -suffix.length);
      return {
        symbol: s.name,
        file_path: s.file,
        line: s.line,
        module,
        confidence: 0.9, // 0.9 because regex might catch false positives
      };
    });

    if (moduleName) {
      results = results.filter(r => r.module === moduleName);
    }

    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    return results;
  }
}
