const { Pool, Client } = require('pg');
const { storage: projectReadScope } = require('../services/projectReadScope');
const { pgPoolOptions, decorateDatabaseError } = require('../utils/databaseResilience');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'construction_erp',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  // 5s in every environment by default. Slow hosts (WSL2 port-forwarding to Docker Desktop) can
  // exceed it while a connection is opening and turn a pool wait into 'timeout exceeded when
  // trying to connect'; set DB_CONNECT_TIMEOUT_MS there instead of weakening the default.
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '5000', 10),
  ...pgPoolOptions(process.env),
});

pool.on('connect', () => {
  console.log('PostgreSQL database connected - Construction ERP');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

const rawQuery = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw decorateDatabaseError(error);
  }
};

const query = (text, params) => {
  const scope = projectReadScope.getStore();
  return scope ? scope.query(text, params) : rawQuery(text, params);
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection teardown may already have rolled back */ }
    throw decorateDatabaseError(error);
  } finally {
    client.release();
  }
};

async function queryCancellable(req, res, text, params, { onBackendPid } = {}) {
  const client = await pool.connect();
  if (typeof onBackendPid === 'function') onBackendPid(client.processID);
  let released = false;
  let disconnected = false;
  let cancellation = null;
  const release = (error) => {
    if (released) return;
    released = true;
    client.release(error);
  };
  const cancel = () => {
    if (res.writableEnded || disconnected) return;
    disconnected = true;
    cancellation = (async () => {
      const cancelClient = new Client({
        host: pool.options.host,
        port: pool.options.port,
        database: pool.options.database,
        user: pool.options.user,
        password: pool.options.password,
        ssl: pool.options.ssl,
        connectionTimeoutMillis: Math.min(pool.options.connectionTimeoutMillis || 5000, 2000),
      });
      try {
        await cancelClient.connect();
        const result = await cancelClient.query('SELECT pg_cancel_backend($1) AS cancelled', [client.processID]);
        if (!result.rows[0]?.cancelled) throw new Error('PostgreSQL did not cancel the disconnected read');
      } catch (_) {
        // Closing the original socket remains the fallback when a cancellation connection is unavailable.
        client.connection?.stream?.destroy();
      } finally {
        try { await cancelClient.end(); } catch (_) { /* an unconnected cancellation client has nothing to drain */ }
      }
    })();
  };
  if (req.aborted || res.destroyed) cancel();
  req.once('aborted', cancel);
  res.once('close', cancel);
  try {
    if (disconnected) throw Object.assign(new Error('Client disconnected'), { code: 'ECONNRESET' });
    const result = await client.query(text, params);
    if (disconnected) throw Object.assign(new Error('Client disconnected'), { code: 'ECONNRESET' });
    return result;
  } catch (error) {
    if (disconnected) {
      await cancellation;
      throw decorateDatabaseError(Object.assign(new Error('HTTP client disconnected'), { code: 'ECONNRESET' }));
    }
    throw decorateDatabaseError(error);
  } finally {
    req.removeListener('aborted', cancel);
    res.removeListener('close', cancel);
    release();
  }
}

const healthCheck = async () => {
  try {
    await pool.query('SELECT 1');
    return { status: 'healthy', message: 'Database connection successful' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

module.exports = { pool, query, rawQuery, transaction, queryCancellable, healthCheck };
