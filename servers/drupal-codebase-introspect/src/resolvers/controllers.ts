import { PhpScanner } from '../repo/phpSymbols.js';
import { YamlRoutes } from '../repo/routes.js';

export class ControllerResolver {
  constructor(private php: PhpScanner, private routes: YamlRoutes) {}

  async findHandlers(routeName?: string, path?: string) {
    let routes = await this.routes.listRoutes();

    if (routeName) {
      routes = routes.filter(r => r.route_name === routeName);
    }
    if (path) {
      routes = routes.filter(r => r.path && r.path.includes(path));
    }

    const symbols = await this.php.scan();
    const controllers = symbols.filter(s => s.type === 'controller');

    return routes.map(r => {
      let method = '';
      let controllerClass = r.controller;
      
      if (r.controller && r.controller.includes('::')) {
        const parts = r.controller.split('::');
        controllerClass = parts[0];
        method = parts[1];
      }
      
      // Try to find the file path for the controller
      // Simple heuristic: match class name with filename
      const classParts = controllerClass.split('\\');
      const shortName = classParts[classParts.length - 1];
      
      const fileMatch = controllers.find(c => c.name === shortName);
      
      return {
        route_name: r.route_name,
        path: r.path,
        controller: controllerClass,
        method: method || '__invoke',
        file_path: fileMatch ? fileMatch.file : 'unknown (static lookup failed)',
        confidence: fileMatch ? 0.9 : 0.4,
      };
    });
  }
}
