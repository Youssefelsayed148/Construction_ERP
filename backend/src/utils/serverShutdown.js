'use strict';

function createShutdownHandler({ server, stopBackground = async () => {}, pool, timeoutMs = 25_000, exit = process.exit, logger = console }) {
  let shutdownPromise = null;
  return function shutdown(signal = 'SIGTERM') {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      logger.info?.(`[shutdown] ${signal} received; draining HTTP requests`);
      let deadlineTimer;
      try {
        let deadline;
        const drained = new Promise((resolve) => {
          try { server.close(() => resolve(true)); } catch (_) { resolve(true); }
        });
        deadline = new Promise((resolve) => {
          deadlineTimer = setTimeout(() => resolve(false), timeoutMs);
          deadlineTimer.unref?.();
        });
        await stopBackground();
        const graceful = await Promise.race([drained, deadline]);
        if (!graceful) {
          server.closeAllConnections?.();
          logger.error?.('[shutdown] HTTP drain deadline exceeded; active connections were closed');
        }
        let poolTimer;
        const poolClosed = await Promise.race([
          pool.end().then(() => true),
          new Promise((resolve) => { poolTimer = setTimeout(() => resolve(false), Math.min(timeoutMs, 5_000)); poolTimer.unref?.(); }),
        ]);
        clearTimeout(poolTimer);
        clearTimeout(deadlineTimer);
        logger.info?.(`[shutdown] complete graceful=${graceful} pool_closed=${poolClosed}`);
        if (!poolClosed) logger.error?.('[shutdown] database pool did not close before the deadline');
        exit(graceful && poolClosed ? 0 : 1);
      } catch (error) {
        logger.error?.(`[shutdown] cleanup failed: ${error.message}`);
        exit(1);
      }
    })();
    return shutdownPromise;
  };
}

module.exports = { createShutdownHandler };
