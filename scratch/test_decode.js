const { execSync } = require('child_process');
const base64Payload = Buffer.from("return 'hello';").toString('base64');
const wrapper = `
  $bootstrap_ok = class_exists('\\\\Drupal') && \\Drupal::hasContainer();
  if (!$bootstrap_ok) {
    echo "\\n---MCP-BEGIN---\\n";
    echo json_encode(['error' => 'DRUPAL_NOT_BOOTSTRAPPED', 'message' => 'Drupal container not initialized.']);
    echo "\\n---MCP-END---\\n";
    exit;
  }
  try {
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

const base64Wrapper = Buffer.from(wrapper).toString('base64');
const phpCmd = `php -r "eval(base64_decode('${base64Wrapper}'));"`;
console.log("Running PHP command:", phpCmd);
try {
  const output = execSync(phpCmd);
  console.log("PHP Output:", output.toString());
} catch (e) {
  console.log("PHP Error:", e.stdout.toString(), e.stderr.toString());
}
