'use strict';

const Joi = require('joi');

function dateOnly() {
  return Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error('Expected a valid calendar date in YYYY-MM-DD format');
    }
    return value;
  });
}

module.exports = { dateOnly };
