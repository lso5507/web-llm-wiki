import { createNodeServer } from './infrastructure/http/server.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const server = createNodeServer();

server.listen(port, host, () => {
  console.log(`web-llm-wiki listening on http://${host}:${port}`);
});
