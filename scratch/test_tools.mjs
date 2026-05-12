import { debugTools } from '../servers/drupal-operations-debug/dist/tools/debugTools.js';

async function run() {
  const rootDir = process.cwd(); // Run in agent-forge root
  console.log(`Running against: ${rootDir}`);

  const healthTool = debugTools.find((t) => t.name === 'debug_runtime_health');
  const watchdogTool = debugTools.find((t) => t.name === 'debug_watchdog');

  console.log('\n--- debug_runtime_health ---');
  try {
    const healthArgs = { project_root: rootDir, include_domains: true, include_recommendations: true };
    const healthRes = await healthTool.handler(healthArgs);
    console.log(JSON.stringify(healthRes, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }

  console.log('\n--- debug_watchdog ---');
  try {
    const watchdogArgs = { project_root: rootDir, severity: "3", limit: 10 };
    const watchdogRes = await watchdogTool.handler(watchdogArgs);
    console.log(JSON.stringify(watchdogRes, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

run();
