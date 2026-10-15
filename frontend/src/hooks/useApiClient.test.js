import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useApiClient } from './useApiClient';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function RequestPage({ onRequest }) {
  const request = useApiClient();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => onRequest(request('/api/slow'))}>Start request</button>
      <button onClick={() => navigate('/next')}>Change route</button>
    </>
  );
}

test('aborts outstanding API work when the route changes', async () => {
  let capturedSignal;
  window.fetch = jest.fn((_url, options) => {
    capturedSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  });
  let pending;
  const onRequest = jest.fn(promise => { pending = promise; });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<RequestPage onRequest={onRequest} />} />
        <Route path="/next" element={<div>Next page</div>} />
      </Routes>
    </MemoryRouter>,
  ));

  await act(async () => container.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(capturedSignal.aborted).toBe(false);
  const abortedRequest = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await act(async () => container.querySelectorAll('button')[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(capturedSignal.aborted).toBe(true);
  await abortedRequest;
  await act(async () => root.unmount());
  container.remove();
});
