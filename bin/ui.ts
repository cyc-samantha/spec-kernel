import { createUiServer } from '../ui/server.ts';

const requestedPort = Number(process.env['SPEC_UI_PORT'] ?? '3000');
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
  throw new Error('SPEC_UI_PORT must be an integer from 1 to 65535');
}

const server = createUiServer();
server.listen(requestedPort, '127.0.0.1', () => {
  console.log(`spec-kernel UI: http://127.0.0.1:${requestedPort}`);
});
