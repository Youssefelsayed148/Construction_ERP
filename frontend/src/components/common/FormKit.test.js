import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FormActions from './FormActions';
import FormField from './FormField';
import LoadMore from './LoadMore';
import { useManagedForm } from '../../hooks/useManagedForm';

jest.mock('../../hooks/useLocale', () => ({ useLocale: () => ({
  t: (key, params) => key === 'common.pagination.showing' ? `Showing ${params.loaded} of ${params.total}` : key,
}) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function ManagedForm({ onSubmit }) {
  const form = useManagedForm({
    initialValues: { name: '' },
    rules: { name: { required: true, maxLength: 20 } },
    onSubmit,
  });
  return (
    <form onSubmit={form.submit}>
      <FormField id="name" label="Name" required value={form.values.name}
        onChange={event => form.change('name', event.target.value)} error={form.errors.name} />
      <FormActions saving={form.saving} error={form.submitError} />
    </form>
  );
}

describe('shared form and paging kit', () => {
  let container;
  let root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('validates fields, displays server errors, and submits valid data', async () => {
    const submit = jest.fn().mockRejectedValueOnce({ translationKey: 'errors.databaseUnavailable' }).mockResolvedValueOnce();
    await act(async () => root.render(<ManagedForm onSubmit={submit} />));
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]').textContent).toBe('common.validation.required');
    expect(submit).not.toHaveBeenCalled();

    await act(async () => {
      const input = container.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Organization');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]').textContent).toBe('errors.databaseUnavailable');
    expect(submit).toHaveBeenCalledWith({ name: 'Organization' });

    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(submit).toHaveBeenCalledTimes(2);
  });

  test('shows the next-page action only when more rows exist', async () => {
    const onLoadMore = jest.fn();
    await act(async () => root.render(<LoadMore loadedCount={200} totalCount={248} onLoadMore={onLoadMore} />));
    expect(container.textContent).toContain('Showing 200 of 248');
    await act(async () => container.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<LoadMore loadedCount={248} totalCount={248} onLoadMore={onLoadMore} />));
    expect(container.querySelector('button')).toBeNull();
  });
});
