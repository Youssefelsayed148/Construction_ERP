import React, { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';
import { formatCurrency } from '../../utils/formatters';
import { translateStatus } from '../../i18n/enums';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

async function request(path, method = 'GET', payload) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: headers(),
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error_code || 'request_failed');
  return body.data;
}

const EMPTY = { applications: [], certificates: [], budgets: [], forecasts: [], creditNotes: [], batches: [], releases: [], supplierInvoices: [] };
const numberValue = (value) => value === '' ? null : Number(value);

export default function ProjectFinanceWorkbench({ projectId, invoices = [] }) {
  const { t } = useLocale();
  const [tab, setTab] = useState('applications');
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [application, setApplication] = useState({ party_type: 'client', contract_id: '', claimed_work: '', claimed_variations: '', claimed_materials: '' });
  const [budget, setBudget] = useState({ name: '', cost_code_id: '', amount: '' });
  const [forecastName, setForecastName] = useState('');
  const [forecastLines, setForecastLines] = useState([{ cost_code_id: '', forecast_amount: '' }]);
  const [creditNote, setCreditNote] = useState({ party_type: 'client', invoice_id: '', supplier_invoice_id: '', amount: '', reason: '' });
  const [batch, setBatch] = useState({ supplier_invoice_id: '', amount: '', currency: 'EGP', payment_date: '' });
  const [retentionRelease, setRetentionRelease] = useState({ party_type: 'client', amount: '' });
  const [retentionKey, setRetentionKey] = useState('');
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const paths = {
      applications: `/commercial/payment-applications?project_id=${projectId}`,
      certificates: `/commercial/payment-certificates?project_id=${projectId}`,
      budgets: `/commercial/project/${projectId}/budget-versions`,
      forecasts: `/commercial/project/${projectId}/forecast-versions`,
      creditNotes: `/finance-ledger/credit-notes?project_id=${projectId}`,
      batches: '/finance-ledger/payment-batches',
      releases: `/finance-ledger/retention/releases?project_id=${projectId}`,
      supplierInvoices: `/procurement/invoices?project_id=${projectId}`,
    };
    const results = await Promise.all(Object.entries(paths).map(async ([key, path]) => {
      try { return [key, await request(path), null]; } catch (error) { return [key, [], error.message]; }
    }));
    const next = { ...EMPTY }; const nextErrors = {};
    results.forEach(([key, value, error]) => { next[key] = value || []; if (error) nextErrors[key] = error; });
    setData(next); setErrors(nextErrors); setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const run = async (key, path, method = 'POST', payload = {}, successKey = 'saved') => {
    setBusy(key); setErrors((old) => ({ ...old, action: '' })); setNotice('');
    try {
      await request(path, method, payload);
      setNotice(t(`finance.workbench.${successKey}`));
      await load();
    } catch (error) {
      setErrors((old) => ({ ...old, action: t(`errors.${error.message}`, { defaultValue: t('finance.workbench.actionError') }) }));
    } finally { setBusy(''); }
  };

  const createApplication = (event) => {
    event.preventDefault();
    const body = {
      party_type: application.party_type,
      project_id: Number(projectId),
      client_contract_id: application.party_type === 'client' ? Number(application.contract_id) : null,
      sub_contract_id: application.party_type === 'subcontractor' ? Number(application.contract_id) : null,
      claimed_work: Number(application.claimed_work || 0),
      claimed_variations: Number(application.claimed_variations || 0),
      claimed_materials: Number(application.claimed_materials || 0),
    };
    run('application:create', '/commercial/payment-applications', 'POST', body, 'created');
  };

  const createBudget = (event) => {
    event.preventDefault();
    run('budget:create', '/commercial/budget-versions', 'POST', {
      project_id: Number(projectId), name: budget.name,
      lines: [{ cost_code_id: numberValue(budget.cost_code_id), amount: Number(budget.amount) }],
    }, 'created');
  };

  const createForecast = (event) => {
    event.preventDefault();
    run('forecast:create', '/commercial/forecast-versions', 'POST', {
      project_id: Number(projectId), name: forecastName,
      lines: forecastLines.map((line) => ({ cost_code_id: numberValue(line.cost_code_id), forecast_amount: Number(line.forecast_amount) })),
    }, 'created');
  };

  const createCreditNote = (event) => {
    event.preventDefault();
    run('credit:create', '/finance-ledger/credit-notes', 'POST', {
      party_type: creditNote.party_type,
      ...(creditNote.party_type === 'client' ? { invoice_id: Number(creditNote.invoice_id) } : { supplier_invoice_id: Number(creditNote.supplier_invoice_id) }),
      amount: Number(creditNote.amount), reason: creditNote.reason,
    }, 'created');
  };

  const createBatch = (event) => {
    event.preventDefault();
    run('batch:create', '/finance-ledger/payment-batches', 'POST', {
      currency: batch.currency.toUpperCase(), payment_date: batch.payment_date || null,
      items: [{ supplier_invoice_id: Number(batch.supplier_invoice_id), amount: Number(batch.amount), project_id: Number(projectId) }],
    }, 'created');
  };

  const createRetentionRelease = async (event) => {
    event.preventDefault();
    const idempotencyKey = retentionKey || window.crypto.randomUUID();
    setRetentionKey(idempotencyKey); setBusy('retention:create'); setErrors((old) => ({ ...old, action: '' })); setNotice('');
    try {
      await request('/finance-ledger/retention/releases', 'POST', {
        project_id: Number(projectId), party_type: retentionRelease.party_type,
        amount: Number(retentionRelease.amount), idempotency_key: idempotencyKey,
      });
      setRetentionKey(''); setNotice(t('finance.workbench.released')); await load();
    } catch (error) {
      setErrors((old) => ({ ...old, action: t(`errors.${error.message}`, { defaultValue: t('finance.workbench.actionError') }) }));
    } finally { setBusy(''); }
  };

  const tabs = ['applications', 'versions', 'creditNotes', 'batches', 'retention'];
  if (loading) return <div className="card" role="status" aria-busy="true" style={{ padding: 32, textAlign: 'center' }}><span className="spinner" /></div>;

  return (
    <section className="finance-workbench" aria-labelledby="finance-workbench-title">
      <h2 id="finance-workbench-title">{t('finance.workbench.title')}</h2>
      <p className="alert alert-warning" role="note">{t('finance.workbench.provisionalNotice')}</p>
      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {errors.action && <p className="alert alert-danger" role="alert">{errors.action}</p>}
      <div className="operations-tabs" role="tablist" aria-label={t('finance.workbench.tabsLabel')}>
        {tabs.map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key}
          className={`btn ${tab === key ? 'btn-primary' : ''}`} onClick={() => setTab(key)}>
          {t(`finance.workbench.tabs.${key}`)}
        </button>)}
      </div>

      {tab === 'applications' && <div className="finance-record-grid">
        <form className="card form-grid" onSubmit={createApplication}>
          <h3>{t('finance.workbench.newApplication')}</h3>
          <label>{t('finance.workbench.party')}
            <select value={application.party_type} onChange={(event) => setApplication({ ...application, party_type: event.target.value })}>
              <option value="client">{t('finance.workbench.client')}</option><option value="subcontractor">{t('finance.workbench.subcontractor')}</option>
            </select>
          </label>
          <label>{t('finance.workbench.contractId')}<input required type="number" min="1" value={application.contract_id} onChange={(event) => setApplication({ ...application, contract_id: event.target.value })} /></label>
          {['claimed_work', 'claimed_variations', 'claimed_materials'].map((field) => <label key={field}>{t(`finance.workbench.${field}`)}
            <input type="number" min="0" step="0.01" value={application[field]} onChange={(event) => setApplication({ ...application, [field]: event.target.value })} />
          </label>)}
          <button className="btn btn-primary" disabled={busy === 'application:create'}>{t('finance.workbench.create')}</button>
        </form>
        <div className="table-container"><h3>{t('finance.workbench.applications')}</h3><table className="table"><thead><tr>
          <th>{t('finance.workbench.number')}</th><th>{t('finance.workbench.party')}</th><th>{t('common.status')}</th><th>{t('finance.workbench.claimed')}</th><th>{t('common.actions')}</th>
        </tr></thead><tbody>{data.applications.map((row) => <tr key={row.id}>
          <td>{row.application_number}</td><td>{t(`finance.workbench.${row.party_type}`)}</td><td>{translateStatus(t, row.status)}</td>
          <td>{formatCurrency(Number(row.claimed_work || 0) + Number(row.claimed_variations || 0) + Number(row.claimed_materials || 0))}</td>
          <td>{row.status === 'draft' && <button className="btn btn-sm" disabled={busy === `application:${row.id}`} onClick={() => run(`application:${row.id}`, `/commercial/payment-applications/${row.id}/submit`, 'POST', {}, 'submitted')}>{t('finance.workbench.submit')}</button>}
            {row.status === 'submitted' && <button className="btn btn-sm btn-primary" disabled={busy === `application:${row.id}`} onClick={() => run(`application:${row.id}`, `/commercial/payment-applications/${row.id}/certify`, 'POST', { certified_work: Number(row.claimed_work || 0), certified_variations: Number(row.claimed_variations || 0), certified_materials: Number(row.claimed_materials || 0) }, 'certified')}>{t('finance.workbench.certify')}</button>}</td>
        </tr>)}</tbody></table>{!data.applications.length && <p className="empty-state">{t('finance.workbench.empty')}</p>}{errors.applications && <p role="alert">{t('finance.workbench.projectDataUnavailable')}</p>}</div>
        <div className="table-container"><h3>{t('finance.workbench.certificates')}</h3><table className="table"><thead><tr><th>{t('finance.workbench.number')}</th><th>{t('finance.workbench.net')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead><tbody>
          {data.certificates.map((row) => <tr key={row.id}><td>{row.certificate_number}</td><td>{formatCurrency(row.net_certificate || 0)}</td><td>{translateStatus(t, row.status)}</td><td>
            {row.status === 'draft' && <button className="btn btn-sm" disabled={busy === `certificate:${row.id}`} onClick={() => run(`certificate:${row.id}`, `/commercial/payment-certificates/${row.id}/start`, 'POST', {}, 'started')}>{t('finance.workbench.startWorkflow')}</button>}
            {row.workflow_instance_id && !['certified', 'rejected', 'void'].includes(row.status) && <button className="btn btn-sm btn-primary" disabled={busy === `certificate:${row.id}`} onClick={() => run(`certificate:${row.id}`, `/commercial/payment-certificates/${row.id}/decide`, 'POST', { decision: 'approve' }, 'approved')}>{t('finance.workbench.approve')}</button>}
          </td></tr>)}
        </tbody></table>{!data.certificates.length && <p className="empty-state">{t('finance.workbench.empty')}</p>}</div>
      </div>}

      {tab === 'versions' && <div className="finance-record-grid">
        <form className="card form-grid" onSubmit={createBudget}><h3>{t('finance.workbench.newBudget')}</h3>
          <label>{t('common.name')}<input required value={budget.name} onChange={(event) => setBudget({ ...budget, name: event.target.value })} /></label>
          <label>{t('finance.workbench.costCodeId')}<input type="number" min="1" value={budget.cost_code_id} onChange={(event) => setBudget({ ...budget, cost_code_id: event.target.value })} /></label>
          <label>{t('finance.workbench.amount')}<input required type="number" min="0" step="0.01" value={budget.amount} onChange={(event) => setBudget({ ...budget, amount: event.target.value })} /></label>
          <button className="btn btn-primary">{t('finance.workbench.create')}</button>
        </form>
        <form className="card form-grid" onSubmit={createForecast}><h3>{t('finance.workbench.newForecast')}</h3>
          <label>{t('common.name')}<input required value={forecastName} onChange={(event) => setForecastName(event.target.value)} /></label>
          {forecastLines.map((line, index) => <div className="finance-forecast-line" key={index}>
            <label>{t('finance.workbench.costCodeId')}<input type="number" min="1" value={line.cost_code_id} onChange={(event) => setForecastLines((rows) => rows.map((row, i) => i === index ? { ...row, cost_code_id: event.target.value } : row))} /></label>
            <label>{t('finance.workbench.estimateToComplete')}<input required type="number" min="0" step="0.01" value={line.forecast_amount} onChange={(event) => setForecastLines((rows) => rows.map((row, i) => i === index ? { ...row, forecast_amount: event.target.value } : row))} /></label>
            {forecastLines.length > 1 && <button type="button" className="btn" onClick={() => setForecastLines((rows) => rows.filter((_, i) => i !== index))}>{t('finance.workbench.removeLine')}</button>}
          </div>)}
          <button type="button" className="btn" onClick={() => setForecastLines((rows) => [...rows, { cost_code_id: '', forecast_amount: '' }])}>{t('finance.workbench.addLine')}</button>
          <button className="btn btn-primary">{t('finance.workbench.create')}</button>
        </form>
        <VersionTable title={t('finance.workbench.budgets')} rows={data.budgets} valueKey="total" t={t}
          action={(row) => row.status === 'draft'
            ? run(`budget:${row.id}`, `/commercial/budget-versions/${row.id}/submit`, 'POST', {}, 'submitted')
            : row.status === 'submitted' && run(`budget:${row.id}`, `/commercial/budget-versions/${row.id}/decide`, 'POST', { decision: 'approve' }, 'approved')}
          actionLabel={(row) => row.status === 'draft' ? t('finance.workbench.submit') : t('finance.workbench.approve')} />
        <VersionTable title={t('finance.workbench.forecasts')} rows={data.forecasts} valueKey="total_forecast" t={t}
          action={(row) => row.status === 'draft' && run(`forecast:${row.id}`, `/commercial/forecast-versions/${row.id}/approve`, 'POST', {}, 'approved')}
          actionLabel={() => t('finance.workbench.approve')} />
        {errors.budgets && <p role="alert">{t('finance.workbench.projectDataUnavailable')}</p>}
      </div>}

      {tab === 'creditNotes' && <div className="finance-record-grid">
        <form className="card form-grid" onSubmit={createCreditNote}><h3>{t('finance.workbench.newCreditNote')}</h3>
          <label>{t('finance.workbench.party')}<select value={creditNote.party_type} onChange={(event) => setCreditNote({ ...creditNote, party_type: event.target.value, invoice_id: '', supplier_invoice_id: '' })}>
            <option value="client">{t('finance.workbench.client')}</option><option value="supplier">{t('finance.workbench.supplier')}</option>
          </select></label>
          <label>{t('finance.workbench.invoice')}<select required value={creditNote.party_type === 'client' ? creditNote.invoice_id : creditNote.supplier_invoice_id}
            onChange={(event) => setCreditNote({ ...creditNote, [creditNote.party_type === 'client' ? 'invoice_id' : 'supplier_invoice_id']: event.target.value })}>
            <option value="">{t('finance.workbench.selectInvoice')}</option>
            {creditNote.party_type === 'client'
              ? invoices.filter((invoice) => !['void', 'cancelled'].includes(invoice.status)).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · {formatCurrency(invoice.amount)}</option>)
              : data.supplierInvoices.filter((invoice) => ['approved', 'partially_credited'].includes(invoice.status)).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · {formatCurrency(invoice.total_amount)}</option>)}
          </select></label>
          <label>{t('finance.workbench.amount')}<input required type="number" min="0.01" step="0.01" value={creditNote.amount} onChange={(event) => setCreditNote({ ...creditNote, amount: event.target.value })} /></label>
          <label>{t('finance.workbench.reason')}<input required minLength="3" value={creditNote.reason} onChange={(event) => setCreditNote({ ...creditNote, reason: event.target.value })} /></label>
          <button className="btn btn-primary">{t('finance.workbench.create')}</button>
        </form>
        <div className="table-container"><h3>{t('finance.workbench.creditNotes')}</h3><table className="table"><thead><tr><th>{t('finance.workbench.number')}</th><th>{t('finance.workbench.amount')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead><tbody>
          {data.creditNotes.map((row) => <tr key={row.id}><td>{row.credit_note_number}</td><td>{formatCurrency(row.amount)}</td><td>{translateStatus(t, row.status)}</td><td>{row.status === 'draft' && <button className="btn btn-sm btn-primary" onClick={() => run(`credit:${row.id}`, `/finance-ledger/credit-notes/${row.id}/issue`, 'POST', {}, 'issued')}>{t('finance.workbench.issue')}</button>}</td></tr>)}
        </tbody></table>{!data.creditNotes.length && <p className="empty-state">{t('finance.workbench.empty')}</p>}{errors.creditNotes && <p role="alert">{t('finance.workbench.projectDataUnavailable')}</p>}</div>
      </div>}

      {tab === 'batches' && <div className="finance-record-grid">
        <form className="card form-grid" onSubmit={createBatch}><h3>{t('finance.workbench.newBatch')}</h3>
          <p>{t('finance.workbench.batchHelp')}</p>
          <label>{t('finance.workbench.supplierInvoiceId')}<input required type="number" min="1" value={batch.supplier_invoice_id} onChange={(event) => setBatch({ ...batch, supplier_invoice_id: event.target.value })} /></label>
          <label>{t('finance.workbench.amount')}<input required type="number" min="0.01" step="0.01" value={batch.amount} onChange={(event) => setBatch({ ...batch, amount: event.target.value })} /></label>
          <label>{t('finance.workbench.currency')}<input required maxLength="3" value={batch.currency} onChange={(event) => setBatch({ ...batch, currency: event.target.value })} /></label>
          <label>{t('finance.workbench.paymentDate')}<input type="date" value={batch.payment_date} onChange={(event) => setBatch({ ...batch, payment_date: event.target.value })} /></label>
          <button className="btn btn-primary">{t('finance.workbench.create')}</button>
        </form>
        <div className="table-container"><h3>{t('finance.workbench.batches')}</h3><table className="table"><thead><tr><th>{t('finance.workbench.number')}</th><th>{t('finance.workbench.amount')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead><tbody>
          {data.batches.map((row) => <tr key={row.id}><td>{row.batch_number}</td><td>{formatCurrency(row.total_amount)}</td><td>{translateStatus(t, row.status)}</td><td>
            {row.status === 'draft' && <button className="btn btn-sm" onClick={() => run(`batch:${row.id}`, `/finance-ledger/payment-batches/${row.id}/submit`, 'POST', {}, 'submitted')}>{t('finance.workbench.submit')}</button>}
            {row.status === 'submitted' && <button className="btn btn-sm btn-primary" onClick={() => run(`batch:${row.id}`, `/finance-ledger/payment-batches/${row.id}/approve`, 'POST', {}, 'approved')}>{t('finance.workbench.approve')}</button>}
            {row.status === 'approved' && <button className="btn btn-sm btn-primary" onClick={() => run(`batch:${row.id}`, `/finance-ledger/payment-batches/${row.id}/release`, 'POST', {}, 'released')}>{t('finance.workbench.release')}</button>}
          </td></tr>)}
        </tbody></table>{!data.batches.length && <p className="empty-state">{t('finance.workbench.empty')}</p>}{errors.batches && <p role="alert">{t('finance.workbench.batchScope')}</p>}</div>
      </div>}

      {tab === 'retention' && <div className="finance-record-grid">
        <form className="card form-grid" onSubmit={createRetentionRelease}><h3>{t('finance.workbench.newRetentionRelease')}</h3>
          <p>{t('finance.workbench.retentionHelp')}</p>
          <label>{t('finance.workbench.party')}<select value={retentionRelease.party_type} onChange={(event) => setRetentionRelease({ ...retentionRelease, party_type: event.target.value })}>
            <option value="client">{t('finance.workbench.client')}</option><option value="subcontractor">{t('finance.workbench.subcontractor')}</option>
          </select></label>
          <label>{t('finance.workbench.amount')}<input required type="number" min="0.01" step="0.01" value={retentionRelease.amount} onChange={(event) => setRetentionRelease({ ...retentionRelease, amount: event.target.value })} /></label>
          <button className="btn btn-primary" disabled={busy === 'retention:create'}>{t('finance.workbench.release')}</button>
        </form>
        <div className="table-container"><h3>{t('finance.workbench.retentionReleases')}</h3>
          <label>{t('finance.workbench.voidReason')}<input minLength="3" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></label>
          <table className="table"><thead><tr><th>{t('finance.workbench.number')}</th><th>{t('finance.workbench.party')}</th><th>{t('finance.workbench.amount')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead><tbody>
            {data.releases.map((row) => <tr key={row.id}><td>REL-{row.id}</td><td>{t(`finance.workbench.${row.party_type}`)}</td><td>{formatCurrency(row.amount)}</td><td>{row.voided_at ? t('finance.workbench.voided') : t('finance.workbench.posted')}</td><td>
              {!row.voided_at && <button className="btn btn-sm btn-danger" disabled={voidReason.trim().length < 3} onClick={() => run(`release:${row.id}`, `/finance-ledger/retention/releases/${row.id}/void`, 'POST', { reason: voidReason }, 'voided')}>{t('finance.workbench.void')}</button>}
            </td></tr>)}
          </tbody></table>{!data.releases.length && <p className="empty-state">{t('finance.workbench.empty')}</p>}{errors.releases && <p role="alert">{t('finance.workbench.projectDataUnavailable')}</p>}
        </div>
      </div>}

      <button className="btn" type="button" onClick={load} disabled={loading}>{t('finance.workbench.refresh')}</button>
    </section>
  );
}

function VersionTable({ title, rows, valueKey, t, action, actionLabel }) {
  return <div className="table-container"><h3>{title}</h3><table className="table"><thead><tr><th>{t('finance.workbench.version')}</th><th>{t('common.status')}</th><th>{t('finance.workbench.amount')}</th><th>{t('common.actions')}</th></tr></thead><tbody>
    {rows.map((row) => <tr key={row.id}><td>{row.name} · {row.version_no}</td><td>{translateStatus(t, row.status)}</td><td>{formatCurrency(row[valueKey] || 0)}</td><td>{['draft', 'submitted'].includes(row.status) && <button className="btn btn-sm" onClick={() => action(row)}>{actionLabel(row)}</button>}</td></tr>)}
  </tbody></table>{!rows.length && <p className="empty-state">{t('finance.workbench.empty')}</p>}</div>;
}
