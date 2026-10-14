'use strict';

module.exports = {
  'POST /api/commercial/currency-rates': async ({ tag }) => ({
    path: '/api/commercial/currency-rates',
    body: { from_currency: 'USD', to_currency: 'EGP', rate: 48.5, effective_date: '2026-10-14', source: `r02-${tag}` },
    status: 201,
  }),
};
