// A foreign key refused a delete (SQLSTATE 23503): the record is still referenced by financial, procurement,
// contractual or other protected rows. Answer 409 with a readable message instead of a 500.
const isReferenceViolation = (error) => Boolean(error) && error.code === '23503';

const recordInUse = (res, what) => res.status(409).json({
  success: false,
  code: 'record_in_use',
  error: `${what} is referenced by other records and cannot be deleted`,
});

module.exports = { isReferenceViolation, recordInUse };
