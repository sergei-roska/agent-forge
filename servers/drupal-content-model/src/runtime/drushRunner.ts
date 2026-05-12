import { exec, execFile, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * DrushRunner — The Bridge to Drupal.
 * Executes PHP code within the active Drupal environment.
 */
export class DrushRunner {
  private environment: 'lando' | 'ddev' | 'docker' | 'local' | null = null;
  private drupalDocroot: string;

  constructor(private rootDir: string) {
    const webRoot = resolve(rootDir, 'web');
    this.drupalDocroot = existsSync(resolve(webRoot, 'core')) ? webRoot : rootDir;
  }

  private async detectEnvironment(): Promise<'lando' | 'ddev' | 'docker' | 'local'> {
    if (this.environment) return this.environment;

    try {
      await execAsync('lando version', { cwd: this.rootDir });
      this.environment = 'lando';
      return 'lando';
    } catch { /* Fallback */ }

    try {
      await execAsync('ddev --version', { cwd: this.rootDir });
      this.environment = 'ddev';
      return 'ddev';
    } catch { /* Fallback */ }

    this.environment = 'local';
    return 'local';
  }

  /**
   * Evaluate dynamic PHP and return parsed JSON result.
   */
  async evaluate(phpCode: string): Promise<any> {
    const env = await this.detectEnvironment();
    
    // Base64 encode the payload to avoid shell escaping issues.
    // We expect phpCode to contain a 'return' statement if a result is needed.
    const base64Payload = Buffer.from(phpCode).toString('base64');

    const wrapper = `
      $bootstrap_ok = class_exists('\\\\Drupal') && \\\\Drupal::hasContainer();
      if (!$bootstrap_ok) {
        echo json_encode(['error' => 'DRUPAL_NOT_BOOTSTRAPPED', 'message' => 'Drupal container not initialized.']);
        exit;
      }
      try {
        $result = eval(base64_decode('${base64Payload}'));
        echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
      } catch (\\Throwable $e) {
        echo json_encode(['error' => 'PHP_EXECUTION_ERROR', 'message' => $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine()]);
      }
    `;

    try {
      let stdout = '';
      let stderr = '';
      
      const drushArgs = ['php-eval', wrapper];
      
      // Use relative path for --root so it works inside containers (e.g., Lando/DDEV)
      if (this.drupalDocroot !== this.rootDir) {
         const relPath = relative(this.rootDir, this.drupalDocroot);
         drushArgs.unshift(`--root=${relPath || '.'}`);
      }

      // Support for URI (multisite or specific environment)
      const drushUri = process.env.DRUSH_OPTIONS_URI || process.env.DRUSH_URI;
      if (drushUri) {
        drushArgs.unshift(`--uri=${drushUri}`);
      }

      if (env === 'lando') {
        ({ stdout, stderr } = await execFileAsync('lando', ['drush', ...drushArgs], { cwd: this.rootDir, maxBuffer: 10 * 1024 * 1024 }));
      } else if (env === 'ddev') {
        ({ stdout, stderr } = await execFileAsync('ddev', ['drush', ...drushArgs], { cwd: this.rootDir, maxBuffer: 10 * 1024 * 1024 }));
      } else {
        const vendorDrush = resolve(this.rootDir, 'vendor/bin/drush');
        const drushCmd = existsSync(vendorDrush) ? vendorDrush : 'drush';
        ({ stdout, stderr } = await execFileAsync(drushCmd, drushArgs, { cwd: this.rootDir, maxBuffer: 10 * 1024 * 1024 }));
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        throw new Error(`Empty response from Drush. Stderr: ${stderr}`);
      }

      const result = JSON.parse(trimmed);
      if (result && typeof result === 'object') {
        if (result.error === 'DRUPAL_NOT_BOOTSTRAPPED') {
          throw new Error(`Drupal Bootstrap Error: ${result.message}`);
        }
        if (result.error === 'PHP_EXECUTION_ERROR') {
          throw new Error(`PHP Error: ${result.message}`);
        }
      }
      return result;
    } catch (error: any) {
      const msg = error.stderr?.toString() || error.message || '';
      throw new Error(`Drush execution failed: ${msg}`);
    }
  }

  /**
   * Generic Command Execution Wrapper.
   */
  async exec(command: string): Promise<string> {
     const env = await this.detectEnvironment();
     const cmdParts = command.split(' ');
     
     const drushArgs = [...cmdParts];
     if (this.drupalDocroot !== this.rootDir) {
        const relPath = relative(this.rootDir, this.drupalDocroot);
        drushArgs.unshift(`--root=${relPath || '.'}`);
     }

     const drushUri = process.env.DRUSH_OPTIONS_URI || process.env.DRUSH_URI;
     if (drushUri) {
       drushArgs.unshift(`--uri=${drushUri}`);
     }

     try {
       if (env === 'lando') {
         const { stdout } = await execFileAsync('lando', ['drush', ...drushArgs], { cwd: this.rootDir });
         return stdout;
       } else if (env === 'ddev') {
         const { stdout } = await execFileAsync('ddev', ['drush', ...drushArgs], { cwd: this.rootDir });
         return stdout;
       } else {
         const vendorDrush = resolve(this.rootDir, 'vendor/bin/drush');
         const drushCmd = existsSync(vendorDrush) ? vendorDrush : 'drush';
         const { stdout } = await execFileAsync(drushCmd, drushArgs, { cwd: this.rootDir });
         return stdout;
       }
     } catch (error: any) {
       const msg = error.stderr?.toString() || error.message || '';
       throw new Error(`Drush command failed: ${msg}`);
     }
  }

  /**
   * Raw Shell Execution (no Drush prefix).
   * Executes commands inside the container if using Lando/DDEV.
   */
  async execRaw(command: string): Promise<string> {
    const env = await this.detectEnvironment();
    try {
      if (env === 'lando') {
        const { stdout } = await execAsync(`lando ssh -c "${command.replace(/"/g, '\\"')}"`, { cwd: this.rootDir });
        return stdout;
      } else if (env === 'ddev') {
        const { stdout } = await execAsync(`ddev ssh -c "${command.replace(/"/g, '\\"')}"`, { cwd: this.rootDir });
        return stdout;
      } else {
        const { stdout } = await execAsync(command, { cwd: this.rootDir });
        return stdout;
      }
    } catch (error: any) {
      throw new Error(`Raw command failed: ${error.message}`);
    }
  }
}
