const { spawn } = require('child_process');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

server.stderr.on('data', (data) => {
  console.error(`STDERR: ${data}`);
});

let output = '';
server.stdout.on('data', (data) => {
  output += data;
  console.log(`STDOUT: ${data}`);
  if (output.includes('}')) {
    server.kill();
  }
});

const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
};

server.stdin.write(JSON.stringify(request) + '\n');
