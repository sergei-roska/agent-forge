import { YamlServices } from '../repo/yamlServices.js';

export class ServiceResolver {
  constructor(private yaml: YamlServices) {}

  async findDefinitions(serviceId?: string, className?: string) {
    let services = await this.yaml.listServices();
    
    if (serviceId) {
      services = services.filter(s => s.service_id === serviceId);
    }
    if (className) {
      services = services.filter(s => s.class && s.class.includes(className));
    }
    
    return services.map(s => ({
      service_id: s.service_id,
      class: s.class,
      file_path: s.file, // This points to the services.yml file. A more advanced version would use PhpScanner to find the actual PHP class file.
      tags: s.tags,
      module: s.file.split('/').find(p => p !== 'src' && p !== 'modules' && p !== 'custom'),
      confidence: 1.0,
    }));
  }
}
