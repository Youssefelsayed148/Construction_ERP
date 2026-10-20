// C2: render a caught request error as a localized string. An ApiError always
// carries a translationKey resolved from its stable error_code; a plain local
// Error (catalog load, abort, programming mistake) has no server code, so it
// keeps its own message rather than a misleading generic one. The goal: a raw
// server English string is never rendered in the Arabic UI.
import { ApiError } from '../services/apiClient';

export function errorMessage(error, t) {
  if (error == null) return '';
  if ((error instanceof ApiError || error.translationKey) && typeof t === 'function') {
    return t(error.translationKey || 'errors.unknown');
  }
  if (typeof error === 'string') return error;
  if (typeof error?.message === 'string' && error.message !== '') return error.message;
  if (typeof t === 'function') return t('errors.unknown');
  return '';
}
