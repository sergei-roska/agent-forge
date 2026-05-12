import { PhpScanner } from '../repo/phpSymbols.js';

export class PluginResolver {
  constructor(private php: PhpScanner) {}

  async findClasses(pluginType?: string, pluginId?: string) {
    const symbols = await this.php.scan();
    let plugins = symbols.filter(s => s.type === 'plugin');

    if (pluginType) {
      plugins = plugins.filter(s => s.name.includes(pluginType) || (s.name + 'Plugin').includes(pluginType));
    }
    
    if (pluginId) {
      // Basic heuristic: check if content contains id="pluginId" or id: "pluginId"
      plugins = plugins.filter(s => s.content.includes(`"${pluginId}"`) || s.content.includes(`'${pluginId}'`));
    }

    return plugins.map(s => {
      // Very basic class name extraction from file path
      const fileParts = s.file.split('/');
      const className = fileParts[fileParts.length - 1].replace('.php', '');

      return {
        plugin_type: s.name,
        plugin_id: pluginId || 'extracted-via-static',
        class: className,
        file_path: s.file,
        module: s.file.split('/').find(p => p !== 'src' && p !== 'modules' && p !== 'custom' && p !== 'Plugin'),
        confidence: 0.8,
      };
    });
  }
}
