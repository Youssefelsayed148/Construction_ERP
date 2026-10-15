import { useCallback, useState } from 'react';
import { mapServerErrors, validateValues } from '../components/common/formUtils';

export function useManagedForm({ initialValues, rules = {}, onSubmit }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);

  const change = useCallback((name, value) => {
    setValues(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: undefined }));
    setSubmitError(null);
  }, []);

  const reset = useCallback((nextValues = initialValues) => {
    setValues(nextValues);
    setErrors({});
    setSubmitError(null);
    setSaving(false);
  }, [initialValues]);

  const submit = useCallback(async (event) => {
    event?.preventDefault?.();
    const validationErrors = validateValues(values, rules);
    setErrors(validationErrors);
    setSubmitError(null);
    if (Object.keys(validationErrors).length) return false;
    setSaving(true);
    try {
      await onSubmit(values);
      return true;
    } catch (error) {
      setErrors(mapServerErrors(error, Object.keys(rules)));
      setSubmitError(error);
      return false;
    } finally {
      setSaving(false);
    }
  }, [onSubmit, rules, values]);

  return { values, errors, submitError, saving, change, reset, submit };
}
