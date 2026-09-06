const net = require('net');

const PROXY_PORT = 5433;
const PG_HOST = '127.0.0.1';
const PG_PORT = 5432;

const server = net.createServer((clientSocket) => {
  const pgSocket = net.createConnection(PG_PORT, PG_HOST, () => {
    clientSocket.pipe(pgSocket);
    pgSocket.pipe(clientSocket);
  });
  pgSocket.on('error', (err) => {
    console.error('PG error:', err.message);
    clientSocket.end();
  });
  clientSocket.on('error', (err) => {
    console.error('Client error:', err.message);
    pgSocket.end();
  });
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`PostgreSQL proxy listening on 127.0.0.1:${PROXY_PORT} -> ${PG_HOST}:${PG_PORT}`);
  process.stdout.write('READY\n');
});
