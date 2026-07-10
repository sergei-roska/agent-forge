import { exec, execFile, execSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

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

    if (existsSync(join(this.rootDir, '.lando.yml'))) {
      this.environment = 'lando';
      return 'lando';
    }

    if (existsSync(join(this.rootDir, '.ddev'))) {
      this.environment = 'ddev';
      return 'ddev';
    }

    this.environment = 'local';
    return 'local';
  }

  /**
   * Evaluate dynamic PHP and return parsed JSON result.
   */
  async evaluate(phpCode: string): Promise<any> {
    return this.evaluateWithParams(phpCode, []);
  }

  /**
   * Evaluate dynamic PHP with parameters passed securely via JSON.
   * The PHP code receives a $params array.
   */
  async evaluateWithParams(phpCode: string, params: any): Promise<any> {
    const env = await this.detectEnvironment();
    
    const base64Payload = Buffer.from(phpCode).toString('base64');
    const base64Params = Buffer.from(JSON.stringify(params)).toString('base64');

    const scriptContent = `<?php
      $is_bootstrapped = class_exists('Drupal') && \\Drupal::hasContainer();
      if (!$is_bootstrapped) {
        echo "\\n---MCP-BEGIN---\\n";
        echo json_encode(['error' => 'DRUPAL_NOT_BOOTSTRAPPED', 'message' => 'Drupal container not initialized.']);
        echo "\\n---MCP-END---\\n";
        exit;
      }
      try {
        $params = json_decode(base64_decode('${base64Params}'), true);
        $result = eval(base64_decode('${base64Payload}'));
        echo "\\n---MCP-BEGIN---\\n";
        echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        echo "\\n---MCP-END---\\n";
      } catch (\\Throwable $e) {
        echo "\\n---MCP-BEGIN---\\n";
        echo json_encode(['error' => 'PHP_EXECUTION_ERROR', 'message' => $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine()]);
        echo "\\n---MCP-END---\\n";
      }
    `;

    const scriptName = `.mcp-query-${randomUUID()}.php`;
    const scriptPath = join(this.drupalDocroot, scriptName);
    
    try {
      // Write the script to the docroot so it's accessible within the container
      writeFileSync(scriptPath, scriptContent, 'utf-8');

      let stdout = '';
      let stderr = '';
      
      const drushArgs = ['php-script', scriptName];
      
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

      const match = stdout.match(/---MCP-BEGIN---\s*([\s\S]*?)\s*---MCP-END---/);
      
      if (!match || !match[1]) {
        throw new Error(`Could not extract JSON from Drush response. Output: ${stdout.trim()} | Stderr: ${stderr.trim()}`);
      }

      const result = JSON.parse(match[1].trim());

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
    } finally {
      // Always clean up the temporary script
      if (existsSync(scriptPath)) {
        try {
          unlinkSync(scriptPath);
        } catch { /* ignore cleanup errors */ }
      }
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
