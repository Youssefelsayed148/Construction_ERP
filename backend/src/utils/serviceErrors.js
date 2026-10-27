'use strict';

// F1: typed business-rule errors for services. routeFail/typedFail (utils/typedRoute.js) answer a 4xx error
// that carries .status under its stable .error_code; a plain Error would fall through to a misleading 500.
// The codes are generic on purpose (the English message stays for logs/old clients; the UI localizes by code):
//   record_not_found (404) | invalid_state (409) | insufficient_stock (400) | invalid_input (400)
//   amount_exceeds_limit (400) | not_authorized_for_action (403)
function svcError(status, errorCode, message, params = {}) {
  const err = new Error(message);
  err.status = status;
  err.error_code = errorCode;
  err.error_params = params;
  return err;
}

module.exports = { svcError };
