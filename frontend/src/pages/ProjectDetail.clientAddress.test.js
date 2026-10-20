// B4 — changing the client must never overwrite address/city the user typed or
// that an existing project already carries; the autofill only fills EMPTY fields.
import { clientAddressAutofill } from './ProjectDetail';

describe('ProjectDetail client address autofill (B4)', () => {
  const client = { id: 7, name: 'Client', address: '12 Tahrir St', city: 'Cairo' };

  test('an existing project keeps its own address and city when the client changes', () => {
    const next = clientAddressAutofill(
      { address: 'Project HQ Gate 2', city: 'Giza' },
      client,
    );
    expect(next.address).toBeUndefined(); // nothing written
    expect(next.city).toBeUndefined();
  });

  test('a new project with empty fields gets the client autofill', () => {
    const next = clientAddressAutofill({ address: '', city: '' }, client);
    expect(next.address).toBe('12 Tahrir St');
    expect(next.city).toBe('Cairo');
  });

  test('a value the user typed is never replaced', () => {
    const next = clientAddressAutofill(
      { address: 'User typed this', city: '' },
      client,
    );
    expect(next.address).toBeUndefined();
    expect(next.city).toBe('Cairo'); // the still-empty field is filled
  });

  test('no selection or blank client values write nothing', () => {
    expect(clientAddressAutofill({ address: '', city: '' }, undefined)).toEqual({});
    expect(clientAddressAutofill({ address: '', city: '' }, { id: 7, address: '', city: '' })).toEqual({});
  });
});
