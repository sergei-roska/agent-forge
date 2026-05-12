import { PhpScanner } from '../repo/phpSymbols.js';

export class PreprocessResolver {
  constructor(private php: PhpScanner) {}

  async findFunctions(hook?: string, themeName?: string) {
    const symbols = await this.php.scan();
    let preprocess = symbols.filter(s => s.type === 'preprocess');

    if (hook) {
      preprocess = preprocess.filter(s => s.name.includes(hook));
    }
    
    if (themeName) {
      // Typically theme_name_preprocess_hook
      preprocess = preprocess.filter(s => s.name.startsWith(`${themeName}_`));
    }

    return preprocess.map(s => {
      // Basic owner extraction
      const parts = s.name.split('_preprocess_');
      const owner = parts[0] || 'unknown';

      return {
        function_name: s.name,
        file_path: s.file,
        line: s.line,
        owner,
        confidence: 0.9,
      };
    });
  }
}
