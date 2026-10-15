import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../services/apiClient';

export function useApiClient() {
  const location = useLocation();
  const controllers = useRef(new Set());

  useEffect(() => {
    const active = controllers.current;
    return () => {
      active.forEach(controller => controller.abort());
      active.clear();
    };
  }, [location.pathname, location.search, location.key]);

  useEffect(() => () => {
    controllers.current.forEach(controller => controller.abort());
    controllers.current.clear();
  }, []);

  return useCallback(async (input, options = {}) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
    try {
      return await apiFetch(input, { ...options, signal: controller.signal });
    } finally {
      controllers.current.delete(controller);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  }, []);
}
