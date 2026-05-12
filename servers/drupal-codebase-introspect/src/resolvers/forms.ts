import { PhpScanner } from '../repo/phpSymbols.js';
import { YamlRoutes } from '../repo/routes.js';

export class FormResolver {
  constructor(private php: PhpScanner, private routes: YamlRoutes) {}

  async findClasses(className?: string) {
    const symbols = await this.php.scan();
    let forms = symbols.filter(s => s.type === 'form');

    if (className) {
      forms = forms.filter(s => s.name === className);
    }

    const routesList = await this.routes.listRoutes();

    return forms.map(s => {
      // Find routes that use this form
      const usedRoutes = routesList
        .filter(r => r.controller && r.controller.includes(s.name))
        .map(r => r.route_name);

      return {
        class: s.name,
        form_base: 'FormBase (Static Assumption)',
        file_path: s.file,
        route_names: usedRoutes,
        confidence: 0.9,
      };
    });
  }
}
