import { DrushRunner } from '../runtime/drushRunner.js';

export interface OwnershipResult {
  name: string;
  owner_type: string;
  owner_name: string;
  install_path?: string;
  confidence: number;
}

export class ConfigOwnership {
  constructor(private runner: DrushRunner) {}

  async findOwner(name: string): Promise<OwnershipResult> {
    const safeName = name.replace(/'/g, "\\'");
    try {
      const php = `
        $name = '${safeName}';
        $module_handler = \\Drupal::moduleHandler();
        foreach ($module_handler->getModuleList() as $module => $extension) {
          if (file_exists($extension->getPath() . '/config/install/' . $name . '.yml')) {
             return ['name' => $name, 'owner_type' => 'module', 'owner_name' => $module, 'install_path' => $extension->getPath(), 'confidence' => 1.0];
          }
          if (file_exists($extension->getPath() . '/config/optional/' . $name . '.yml')) {
             return ['name' => $name, 'owner_type' => 'module (optional)', 'owner_name' => $module, 'install_path' => $extension->getPath(), 'confidence' => 0.9];
          }
        }
        return ['name' => $name, 'owner_type' => 'unknown', 'owner_name' => 'unknown', 'confidence' => 0.1];
      `;
      return await this.runner.evaluate(php);
    } catch {
      return { name, owner_type: 'unknown', owner_name: 'unknown', confidence: 0 };
    }
  }
}
