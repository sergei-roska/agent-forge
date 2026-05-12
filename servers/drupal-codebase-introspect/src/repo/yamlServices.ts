import { YamlScanner } from './yamlFiles.js';

export interface ServiceInfo {
  service_id: string;
  class: string;
  tags: string[];
  file: string;
}

export class YamlServices {
  constructor(private yaml: YamlScanner) {}

  async listServices(): Promise<ServiceInfo[]> {
    const files = await this.yaml.scan('.services.yml');
    const services: ServiceInfo[] = [];

    for (const f of files) {
      if (f.data && f.data.services) {
        for (const [id, def] of Object.entries(f.data.services)) {
          if (id === '_defaults' || typeof def !== 'object' || !def) continue;

          const tags = [];
          if ((def as any).tags) {
            for (const tag of (def as any).tags) {
              if (tag.name) tags.push(tag.name);
            }
          }

          services.push({
            service_id: id,
            class: (def as any).class || '',
            tags,
            file: f.file,
          });
        }
      }
    }

    return services;
  }
}
