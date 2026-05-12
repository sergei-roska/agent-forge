import { YamlScanner } from './yamlFiles.js';

export interface RouteInfo {
  route_name: string;
  path: string;
  controller: string;
  file: string;
}

export class YamlRoutes {
  constructor(private yaml: YamlScanner) {}

  async listRoutes(): Promise<RouteInfo[]> {
    const files = await this.yaml.scan('.routing.yml');
    const routes: RouteInfo[] = [];

    for (const f of files) {
      if (f.data && typeof f.data === 'object') {
        for (const [id, def] of Object.entries(f.data)) {
          if (typeof def !== 'object' || !def) continue;
          
          let controller = '';
          if ((def as any).defaults) {
            controller = (def as any).defaults._controller || (def as any).defaults._form || '';
          }

          routes.push({
            route_name: id,
            path: (def as any).path || '',
            controller,
            file: f.file,
          });
        }
      }
    }

    return routes;
  }
}
