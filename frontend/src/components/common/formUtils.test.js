import { mapServerErrors, validateValues } from './formUtils';

describe('form utilities', () => {
  test('validates required, bounds, and format rules', () => {
    expect(validateValues({ title: ' ', quantity: 0, code: 'bad code' }, {
      title: { required: true }, quantity: { min: 1 }, code: { pattern: /^[A-Z0-9-]+$/ },
    })).toEqual({ title: 'required', quantity: 'min', code: 'format' });
  });

  test('maps known server field errors and ignores unknown field names when constrained', () => {
    expect(mapServerErrors({ response: { data: { code: 'validation', errors: { title: 'required', password: 'invalid' } } } }, ['title']))
      .toEqual({ title: 'required' });
  });

  test('maps structured server validation details', () => {
    expect(mapServerErrors({ code: 'validation', details: { fields: [{ field: 'quantity', code: 'min' }] } }))
      .toEqual({ quantity: 'min' });
  });
});
