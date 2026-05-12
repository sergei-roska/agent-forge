import { YamlScanner } from './yamlFiles.js';

export interface ModuleInfo {
  machine_name: string;
  path: string;
  name: string;
  description: string;
  package: string;
}

export class ModuleRepository {
  constructor(private yaml: YamlScanner) {}

  async listCustomModules(query?: string): Promise<ModuleInfo[]> {
    const files = await this.yaml.scan('.info.yml');
    
    // Filter to custom modules by path heuristic
    const customFiles = files.filter(f => f.file.includes('/custom/') || f.file.includes('\\custom\\'));

    const modules: ModuleInfo[] = customFiles.map(f => {
      const machine_name = f.file.split('/').pop()?.replace('.info.yml', '') || 'unknown';
      return {
        machine_name,
        path: f.file,
        name: f.data.name || machine_name,
        description: f.data.description || '',
        package: f.data.package || 'Custom',
      };
    });

    if (query) {
      const q = query.toLowerCase();
      return modules.filter(m => 
        m.machine_name.toLowerCase().includes(q) || 
        m.name.toLowerCase().includes(q)
      );
    }

    return modules;
  }
}
