'use strict';

function poolMetrics(pool) {
  return {
    total: Number(pool.totalCount || 0),
    idle: Number(pool.idleCount || 0),
    waiting: Number(pool.waitingCount || 0),
    max: Number(pool.options?.max || 0),
  };
}

module.exports = { poolMetrics };
