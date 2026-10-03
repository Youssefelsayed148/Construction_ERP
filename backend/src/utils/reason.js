// The reason a record is voided or deleted: JSON body `reason` (DELETE bodies are parsed) or ?reason=.
const reasonFrom = (req) => String((req.body && req.body.reason) || (req.query && req.query.reason) || '').trim().slice(0, 500);
module.exports = { reasonFrom };
