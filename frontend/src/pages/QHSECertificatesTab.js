import React, { useCallback, useEffect, useState } from 'react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;
const emptyForm = {
  certificate_type: 'material', title: '', issuer: '', issue_date: '', expiry_date: '',
  project_document_id: '', mir_id: '', notes: '',
};

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...authHeaders(), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error_code || 'request_failed');
  return body.data;
}

export default function QHSECertificatesTab({ projectId, t }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await request(`${API_URL}/qhse/certificates?project_id=${encodeURIComponent(projectId)}`));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const change = (event) => setForm((old) => ({ ...old, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const payload = {
      ...form,
      project_id: Number(projectId),
      project_document_id: form.project_document_id ? Number(form.project_document_id) : null,
      mir_id: form.mir_id ? Number(form.mir_id) : null,
      issue_date: form.issue_date || null,
      expiry_date: form.expiry_date || null,
    };
    try {
      await request(`${API_URL}/qhse/certificates`, { method: 'POST', body: JSON.stringify(payload) });
      setForm(emptyForm);
      setNotice(t('qhse.certificates.created'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (row, status) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`${API_URL}/qhse/certificates/${row.id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      setNotice(t('qhse.certificates.updated'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="qaqc-certificate-title">
      <h2 id="qaqc-certificate-title">{t('qhse.certificates.title')}</h2>
      {notice && <p role="status" className="alert alert-success">{notice}</p>}
      {error && <p role="alert" className="alert alert-danger">{t(`errors.${error}`, { defaultValue: t('qhse.certificates.error') })}</p>}
      <form className="card form-grid" onSubmit={submit}>
        <h3>{t('qhse.certificates.new')}</h3>
        <label>{t('qhse.certificates.type')}
          <select name="certificate_type" value={form.certificate_type} onChange={change}>
            {['material', 'test', 'equipment', 'calibration', 'safety', 'other'].map((type) => <option key={type} value={type}>{t(`qhse.certificates.types.${type}`)}</option>)}
          </select>
        </label>
        <label>{t('qhse.certificates.name')}<input required maxLength="255" name="title" value={form.title} onChange={change} /></label>
        <label>{t('qhse.certificates.issuer')}<input maxLength="255" name="issuer" value={form.issuer} onChange={change} /></label>
        <label>{t('qhse.certificates.issueDate')}<input type="date" name="issue_date" value={form.issue_date} onChange={change} /></label>
        <label>{t('qhse.certificates.expiryDate')}<input type="date" name="expiry_date" value={form.expiry_date} onChange={change} /></label>
        <label>{t('qhse.certificates.documentId')}<input type="number" min="1" name="project_document_id" value={form.project_document_id} onChange={change} /></label>
        <label>{t('qhse.certificates.mirId')}<input type="number" min="1" name="mir_id" value={form.mir_id} onChange={change} /></label>
        <label>{t('qhse.certificates.notes')}<textarea maxLength="10000" name="notes" value={form.notes} onChange={change} /></label>
        <button className="btn btn-primary" disabled={busy || loading}>{t('qhse.certificates.create')}</button>
      </form>

      {loading ? <p role="status">{t('qhse.certificates.loading')}</p> : (
        <div className="table-container">
          <table className="table"><thead><tr>
            <th>{t('qhse.certificates.number')}</th><th>{t('qhse.certificates.name')}</th>
            <th>{t('qhse.certificates.type')}</th><th>{t('qhse.certificates.expiryDate')}</th>
            <th>{t('qhse.certificates.status')}</th><th>{t('common.actions')}</th>
          </tr></thead><tbody>
            {rows.map((row) => <tr key={row.id}>
              <td>{row.certificate_number}</td><td>{row.title}</td>
              <td>{t(`qhse.certificates.types.${row.certificate_type}`)}</td>
              <td>{row.expiry_date || '—'}</td><td>{t(`qhse.certificates.statuses.${row.status}`)}</td>
              <td>
                {row.project_document_id && <span>{t('qhse.certificates.documentLink', { title: row.document_title || row.project_document_id })} </span>}
                {row.mir_id && <span>{t('qhse.certificates.mirLink', { number: row.mir_number || row.mir_id })} </span>}
                {row.status === 'active' && <>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setStatus(row, 'superseded')}>{t('qhse.certificates.supersede')}</button>
                  <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => setStatus(row, 'revoked')}>{t('qhse.certificates.revoke')}</button>
                </>}
              </td>
            </tr>)}
          </tbody></table>
          {!rows.length && <p className="empty-state">{t('qhse.certificates.empty')}</p>}
        </div>
      )}
    </section>
  );
}
