import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, FileText, RefreshCw, Send, ShoppingCart, Truck } from 'lucide-react';
import { useLocale } from '../../hooks/useLocale';
import { useToast } from '../common/Toast';
import FormField from '../common/FormField';
import ReasonDialog from '../common/ReasonDialog';
import { EmptyState, ErrorState, LoadingState } from '../common/States';

const API = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;
const sections = ['requests', 'rfqs', 'awards', 'orders', 'receipts', 'invoices', 'analytics'];
function tokenHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` };
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: tokenHeaders(), ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(body.error || 'requestFailed');
    error.code = body.error_code || body.code;
    error.status = response.status;
    error.params = body.error_params || {};
    throw error;
  }
  return body.data;
}

const send = (path, method, body) => api(path, { method, body: JSON.stringify(body) });
const idOf = (row) => Number(row?.id);
const refOf = (row) => row?.request_number || row?.rfq_number || row?.order_number || row?.delivery_number || row?.mir_number || row?.grn_number || row?.invoice_number || `#${row?.id}`;

function SelectField({ id, name, label, value, onChange, options, required = true, emptyLabel }) {
  return <div className="form-group"><label className="form-label" htmlFor={id}>{label}{required ? ' *' : ''}</label>
    <select id={id} name={name} className="form-input" required={required} defaultValue={value} onChange={onChange}>
      <option value="">{emptyLabel}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></div>;
}

function EntityTable({ rows, title, columns, empty }) {
  if (!rows?.length) return <EmptyState message={empty} />;
  return <div className="table-container" role="region" aria-label={title} tabIndex="0"><table className="table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>{columns.map(([key]) => <td key={key}>{key === 'reference' ? refOf(row) : (row[key] ?? '—')}</td>)}</tr>)}</tbody></table></div>;
}

function ProcurementWorkspace({ projectId }) {
  const { t } = useLocale();
  const { showToast } = useToast();
  const [active, setActive] = useState('requests');
  const [data, setData] = useState({});
  const [options, setOptions] = useState({ suppliers: [], warehouses: [], invoices: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [selectedRfq, setSelectedRfq] = useState('');
  const [rfqDetail, setRfqDetail] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [selectedPo, setSelectedPo] = useState('');
  const [poDetail, setPoDetail] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const workspace = await api(`/procurement/project/${projectId}`);
      const optional = await Promise.all([
        api('/suppliers?limit=500&is_active=true').catch(() => []),
        api(`/warehouses?project_id=${projectId}`).catch(() => []),
        api(`/procurement/analytics/spend?project_id=${projectId}`).catch(() => []),
        api(`/procurement/analytics/vendor-performance?project_id=${projectId}`).catch(() => []),
        api(`/procurement/award-recommendations?project_id=${projectId}`).catch(() => []),
        api(`/procurement/invoices?project_id=${projectId}`).catch(() => []),
      ]);
      const [suppliers, warehouses, spend, performance, awards, invoices] = optional;
      const spendRows = (Array.isArray(spend) ? spend : spend?.rows || []).map((row) => ({ ...row, supplier_name: row.name, order_count: row.orders, committed_amount: row.committed, actual_amount: row.invoiced }));
      const performanceRows = (Array.isArray(performance) ? performance : performance?.rows || []).map((row) => ({ ...row,
        supplier_name: row.supplier_name_en || row.supplier_name_ar || row.supplier_code, order_count: row.po_count,
        on_time_pct: row.on_time_rate == null ? null : Math.round(row.on_time_rate * 100), quality_pct: row.acceptance_rate == null ? null : Math.round(row.acceptance_rate * 100),
      }));
      setData({ ...workspace, award_recommendations: awards || [], spend: spendRows, performance: performanceRows });
      setOptions({ suppliers: suppliers || [], warehouses: warehouses || [], invoices: invoices || [] });
    } catch (error) {
      setLoadError(t(`errors.${error.code || 'requestFailed'}`, { defaultValue: t('errors.requestFailed') }));
    } finally { setLoading(false); }
  }, [projectId, t]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    let live = true;
    if (!selectedRfq) { setRfqDetail(null); setComparison(null); return undefined; }
    Promise.all([
      api(`/procurement/rfq/${selectedRfq}`),
      api(`/procurement/rfq/${selectedRfq}/comparison`).catch(() => null),
    ]).then(([detail, result]) => { if (live) { setRfqDetail(detail); setComparison(result); } })
      .catch((error) => { if (live) setFormError(t(`errors.${error.code || 'requestFailed'}`, { defaultValue: t('errors.requestFailed') })); });
    return () => { live = false; };
  }, [selectedRfq, t]);
  useEffect(() => {
    let live = true;
    if (!selectedPo) { setPoDetail(null); return undefined; }
    api(`/procurement/po/${selectedPo}`).then((result) => { if (live) setPoDetail(result); }).catch((error) => { if (live) setFormError(error.message); });
    return () => { live = false; };
  }, [selectedPo]);

  const run = async (operation, successKey = 'saved') => {
    setBusy(true); setFormError('');
    try {
      await operation();
      showToast(t(`procurement.messages.${successKey}`));
      await reload();
      if (selectedRfq) {
        const [detail, compared] = await Promise.all([api(`/procurement/rfq/${selectedRfq}`).catch(() => null), api(`/procurement/rfq/${selectedRfq}/comparison`).catch(() => null)]);
        setRfqDetail(detail); setComparison(compared);
      }
      if (selectedPo) setPoDetail(await api(`/procurement/po/${selectedPo}`).catch(() => null));
      return true;
    } catch (error) {
      const code = error.code || 'requestFailed';
      setFormError(t(`errors.${code}`, { defaultValue: t('errors.requestFailed') }));
      return false;
    } finally { setBusy(false); }
  };

  const postAction = (path, body = {}) => run(() => send(path, 'POST', body));
  const supplierOptions = useMemo(() => options.suppliers.map((row) => ({ value: row.id, label: row.name_en || row.name_ar || row.code })), [options.suppliers]);
  const rfqOptions = useMemo(() => (data.rfqs || []).map((row) => ({ value: row.id, label: `${refOf(row)} · ${row.title}` })), [data.rfqs]);
  const poOptions = useMemo(() => (data.purchase_orders || []).map((row) => ({ value: row.id, label: `${refOf(row)} · ${row.status}` })), [data.purchase_orders]);
  const grnOptions = useMemo(() => (data.goods_receipt_notes || []).map((row) => ({ value: row.id, label: `${refOf(row)} · ${row.status}` })), [data.goods_receipt_notes]);
  const prOptions = useMemo(() => (data.purchase_requests || []).map((row) => ({ value: row.id, label: `${refOf(row)} · ${row.title}` })), [data.purchase_requests]);
  const warehouses = useMemo(() => options.warehouses.map((row) => ({ value: row.id, label: row.name })), [options.warehouses]);
  const selectedLine = (items, id) => (items || []).find((item) => idOf(item) === Number(id));
  const sectionLabel = (key) => t(`procurement.workspace.sections.${key}`);
  const renderRequests = () => <div className="procurement-grid">
    <section className="card"><h2>{t('procurement.workspace.createPr')}</h2><form onSubmit={(event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const body = { project_id: Number(projectId), title: form.get('title'), priority: form.get('priority'), needed_by: form.get('needed_by') || null,
        lines: [{ description: form.get('description'), quantity: Number(form.get('quantity')), unit: form.get('unit'), estimated_unit_price: Number(form.get('price')) }] };
      run(async () => { await send('/procurement/pr', 'POST', body); event.currentTarget?.reset?.(); }, 'created');
    }}>
      <FormField id="pr-title" name="title" label={t('procurement.fields.title')} required maxLength={200} />
      <FormField id="pr-description" name="description" label={t('procurement.fields.description')} required />
      <div className="procurement-form-row"><FormField id="pr-qty" name="quantity" label={t('common.quantity')} required type="number" min="0.001" step="any" defaultValue="1" />
        <FormField id="pr-unit" name="unit" label={t('common.unit')} defaultValue="each" />
        <FormField id="pr-price" name="price" label={t('procurement.fields.estimatedPrice')} type="number" min="0" step="0.01" defaultValue="0" /></div>
      <SelectField id="pr-priority" name="priority" label={t('procurement.fields.priority')} required emptyLabel={t('common.none')} value="normal"
        options={['low', 'normal', 'high', 'urgent'].map((value) => ({ value, label: t(`procurement.values.${value}`) }))} />
      <button className="btn btn-primary" disabled={busy}>{t('procurement.actions.createPr')}</button>
    </form></section>
    <section className="card"><h2>{t('procurement.workspace.purchaseRequests')}</h2><EntityTable rows={data.purchase_requests} title={t('procurement.workspace.purchaseRequests')} empty={t('procurement.messages.noPrs')}
      columns={[["reference", t('procurement.fields.reference')], ['title', t('procurement.fields.title')], ['status', t('common.status')], ['amount', t('common.amount')]]} />
      <div className="procurement-action-row">{(data.purchase_requests || []).map((row) => <div className="procurement-action procurement-request-actions" key={row.id}>
        <b>{refOf(row)} · {row.title}</b>
        {row.status === 'draft' && <form className="procurement-inline-form" onSubmit={(event) => { event.preventDefault(); const title = new FormData(event.currentTarget).get('title'); run(() => send(`/procurement/pr/${row.id}`, 'PUT', { title }), 'saved'); }}>
          <input className="form-input" aria-label={t('procurement.fields.title')} name="title" defaultValue={row.title} required maxLength={200} />
          <button className="btn btn-sm" disabled={busy}>{t('procurement.actions.save')}</button>
        </form>}
        {row.status === 'draft' && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => postAction(`/procurement/pr/${row.id}/submit`)}><Send size={14} />{t('procurement.actions.submit')}</button>}
        {['budget_check', 'authority_approval'].includes(row.status) && <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => postAction(`/procurement/pr/${row.id}/decide`, { decision: 'approve' })}>{t('procurement.actions.approve')}</button>}
        {!['approved', 'rejected', 'cancelled'].includes(row.status) && <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => setCancelTarget({ kind: 'pr', id: row.id, reference: refOf(row) })}>{t('procurement.actions.cancel')}</button>}
      </div>)}</div>
    </section>
  </div>;

  const renderRfqs = () => <div className="procurement-grid">
    <section className="card"><h2>{t('procurement.workspace.createRfq')}</h2><form onSubmit={(event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      postAction('/procurement/rfq', { project_id: Number(projectId), purchase_request_id: Number(form.get('pr_id')) || null, title: form.get('title'), due_date: form.get('due_date') || null,
        lines: [{ description: form.get('description'), quantity: Number(form.get('quantity')), unit: form.get('unit') || null }] });
    }}>
      <FormField id="rfq-title" name="title" label={t('procurement.fields.title')} required />
      <SelectField id="rfq-pr" name="pr_id" label={t('procurement.fields.purchaseRequest')} required={false} emptyLabel={t('common.none')} value="" options={prOptions} />
      <FormField id="rfq-description" name="description" label={t('procurement.fields.description')} required />
      <div className="procurement-form-row"><FormField id="rfq-qty" name="quantity" label={t('common.quantity')} required type="number" min="0.001" step="any" defaultValue="1" />
        <FormField id="rfq-unit" name="unit" label={t('common.unit')} defaultValue="each" /><FormField id="rfq-due" name="due_date" label={t('procurement.fields.dueDate')} type="date" /></div>
      <button className="btn btn-primary" disabled={busy}>{t('procurement.actions.createRfq')}</button>
    </form>
    <h3>{t('procurement.workspace.inviteSuppliers')}</h3><form onSubmit={(event) => { event.preventDefault(); const values = [...event.currentTarget.querySelectorAll('input[name="supplier_ids"]:checked')].map((el) => Number(el.value));
      if (!selectedRfq || !values.length) { setFormError(t('procurement.messages.selectRfqAndSupplier')); return; } postAction(`/procurement/rfq/${selectedRfq}/vendors`, { supplier_ids: values }); }}>
      <SelectField id="rfq-select" label={t('procurement.fields.rfq')} value={selectedRfq} onChange={(e) => setSelectedRfq(e.target.value)} options={rfqOptions} emptyLabel={t('common.none')} />
      <div className="procurement-check-list">{options.suppliers.map((supplier) => <label key={supplier.id}><input type="checkbox" name="supplier_ids" value={supplier.id} /> {supplier.name_en || supplier.name_ar || supplier.code}</label>)}</div>
      <button className="btn" disabled={busy}>{t('procurement.actions.invite')}</button>
    </form></section>
    <section className="card"><h2>{t('procurement.workspace.rfqList')}</h2><EntityTable rows={data.rfqs} title={t('procurement.workspace.rfqList')} empty={t('procurement.messages.noRfqs')}
      columns={[["reference", t('procurement.fields.reference')], ['title', t('procurement.fields.title')], ['status', t('common.status')], ['quotation_count', t('procurement.fields.quotations')]]} />
      <SelectField id="quote-rfq" label={t('procurement.fields.rfq')} value={selectedRfq} onChange={(e) => setSelectedRfq(e.target.value)} options={rfqOptions} emptyLabel={t('common.none')} />
      {rfqDetail && <><h3>{t('procurement.workspace.submitQuote')}</h3><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget);
        const rfqLine = selectedLine(rfqDetail.lines, form.get('line_id')); if (!rfqLine) { setFormError(t('procurement.messages.selectRfqLine')); return; }
        postAction(`/procurement/rfq/${rfqDetail.id}/quotations`, { supplier_id: Number(form.get('supplier_id')), payment_terms: form.get('payment_terms'), delivery_terms: form.get('delivery_terms'), lead_time_days: Number(form.get('lead_time_days')) || null,
          lines: [{ rfq_line_id: rfqLine.id, material_id: rfqLine.material_id, quantity: Number(rfqLine.quantity), unit_price: Number(form.get('unit_price')), delivery_days: Number(form.get('lead_time_days')) || null }] }); }}>
      <SelectField id="quote-supplier" name="supplier_id" label={t('common.suppliers')} value="" options={supplierOptions} emptyLabel={t('common.none')} />
        <SelectField id="quote-line" name="line_id" label={t('procurement.fields.rfqLine')} value="" options={(rfqDetail.lines || []).map((item) => ({ value: item.id, label: `${item.description || item.material_id} · ${item.quantity} ${item.unit || ''}` }))} emptyLabel={t('common.none')} />
        <div className="procurement-form-row"><FormField id="quote-price" name="unit_price" label={t('procurement.fields.unitPrice')} type="number" min="0" step="0.01" required />
          <FormField id="quote-lead" name="lead_time_days" label={t('procurement.fields.leadTime')} type="number" min="0" step="1" /></div>
        <div className="procurement-form-row"><FormField id="quote-pay-terms" name="payment_terms" label={t('procurement.fields.paymentTerms')} />
          <FormField id="quote-delivery-terms" name="delivery_terms" label={t('procurement.fields.deliveryTerms')} /></div>
        <button className="btn btn-primary" disabled={busy}>{t('procurement.actions.submitQuote')}</button></form>
        <EntityTable rows={rfqDetail.quotations} title={t('procurement.workspace.quotes')} empty={t('procurement.messages.noQuotes')}
          columns={[["id", t('procurement.fields.reference')], ['supplier_id', t('common.suppliers')], ['total_price', t('common.total')], ['status', t('common.status')]]} />
      </>}
    </section>
  </div>;

  const renderAwards = () => <div className="procurement-grid">
    <section className="card"><h2>{t('procurement.workspace.comparison')}</h2>
      <SelectField id="comparison-rfq" label={t('procurement.fields.rfq')} value={selectedRfq} onChange={(e) => setSelectedRfq(e.target.value)} options={rfqOptions} emptyLabel={t('common.none')} />
      {comparison?.rows?.length ? <div className="table-container" role="region" aria-label={t('procurement.workspace.comparison')} tabIndex="0"><table className="table"><thead><tr>
        {['supplier_name', 'compliant', 'lead_time_days', 'unit_price', 'total_price', 'payment_terms', 'delivery_terms', 'tax_amount', 'warranty_months', 'deviations', 'technical_score', 'commercial_score'].map((key) => <th key={key}>{t(`procurement.fields.${key}`)}</th>)}
      </tr></thead><tbody>{comparison.rows.map((row) => <tr key={row.quotation_id}>
        <td>{row.supplier_name}</td><td>{row.compliant ? t('common.yes') : t('common.no')}</td><td>{row.lead_time_days ?? '—'}</td><td>{row.unit_price ?? '—'}</td><td>{row.total_price ?? '—'}</td>
        <td>{row.payment_terms || '—'}</td><td>{row.delivery_terms || '—'}</td><td>{row.tax_amount ?? '—'}</td><td>{row.warranty_months ?? '—'}</td>
        <td>{Array.isArray(row.deviations) ? row.deviations.join(', ') : row.deviations || '—'}</td><td>{row.technical_score ?? '—'}</td><td>{row.commercial_score ?? '—'}</td>
      </tr>)}</tbody></table></div> : rfqDetail?.quotations?.length ? <EmptyState message={t('procurement.messages.comparisonUnavailable')} /> : <EmptyState message={t('procurement.messages.noQuotes')} />}
      {comparison?.recommendation && <div className="alert alert-info">{t('procurement.messages.recommendedVendor', { supplier: comparison.recommendation.supplier_name || '' })}</div>}
    </section>
    <section className="card"><h2>{t('procurement.workspace.awardRecommendation')}</h2>
      {rfqDetail?.quotations?.length ? <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget);
        run(async () => { const created = await send(`/procurement/rfq/${selectedRfq}/award-recommendations`, 'POST', { quotation_id: Number(form.get('quotation_id')), basis: form.get('basis'), justification: form.get('justification') }); await send(`/procurement/award-recommendations/${created.id}/submit`, 'POST', {}); }, 'submitted'); }}>
        <SelectField id="award-quote" name="quotation_id" label={t('procurement.fields.selectedQuote')} value="" options={rfqDetail.quotations.map((quote) => ({ value: quote.id, label: `${supplierOptions.find((x) => Number(x.value) === Number(quote.supplier_id))?.label || quote.supplier_id} · ${quote.total_price}` }))} emptyLabel={t('common.none')} />
        <SelectField id="award-basis" name="basis" label={t('procurement.fields.basis')} value="comparison" options={['comparison', 'technical', 'commercial', 'direct_award'].map((value) => ({ value, label: t(`procurement.values.${value}`) }))} emptyLabel={t('common.none')} />
        <FormField id="award-justification" name="justification" as="textarea" label={t('procurement.fields.justification')} required maxLength={2000} />
        <button className="btn btn-primary" disabled={busy}>{t('procurement.actions.submitRecommendation')}</button></form> : <EmptyState message={t('procurement.messages.noQuotes')} />}
      <EntityTable rows={data.award_recommendations || []} title={t('procurement.workspace.awardRecommendation')} empty={t('procurement.messages.noAwards')}
        columns={[["recommendation_number", t('procurement.fields.reference')], ['supplier_id', t('common.suppliers')], ['total_price', t('common.total')], ['status', t('common.status')]]} />
      {(data.award_recommendations || []).filter((row) => row.status === 'submitted').map((row) => <div className="procurement-action" key={row.id}><b>{row.recommendation_number}</b>
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => postAction(`/procurement/award-recommendations/${row.id}/decide`, { decision: 'approve' })}><Check size={14} />{t('procurement.actions.approve')}</button>
        <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => postAction(`/procurement/award-recommendations/${row.id}/decide`, { decision: 'reject' })}>{t('procurement.actions.reject')}</button></div>)}
    </section>
  </div>;

  const renderOrders = () => <div className="procurement-grid">
    <section className="card"><h2>{t('procurement.workspace.createPo')}</h2><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget);
      run(async () => { const rfq = await api(`/procurement/rfq/${form.get('rfq_id')}`); const quote = rfq.quotations.find((item) => Number(item.id) === Number(form.get('quotation_id')));
        if (!quote) throw new Error('requestFailed'); await send('/procurement/po', 'POST', { project_id: Number(projectId), supplier_id: quote.supplier_id, purchase_request_id: Number(form.get('pr_id')) || null,
          payment_terms: quote.payment_terms, delivery_terms: quote.delivery_terms, taxes: Number(form.get('tax_amount')) || 0,
          lines: quote.lines.map((quoteLine) => ({ material_id: quoteLine.material_id, description: quoteLine.description, quantity: Number(quoteLine.quantity), unit: quoteLine.unit, unit_rate: Number(quoteLine.unit_price), discount: 0 })) }); }, 'created'); }}>
      <SelectField id="po-rfq" name="rfq_id" label={t('procurement.fields.rfq')} value={selectedRfq} onChange={(e) => setSelectedRfq(e.target.value)} options={rfqOptions} emptyLabel={t('common.none')} />
      <SelectField id="po-quote" name="quotation_id" label={t('procurement.fields.selectedQuote')} value="" options={(rfqDetail?.quotations || []).map((quote) => ({ value: quote.id, label: `${supplierOptions.find((x) => Number(x.value) === Number(quote.supplier_id))?.label || quote.supplier_id} · ${quote.total_price}` }))} emptyLabel={t('common.none')} />
      <SelectField id="po-pr" name="pr_id" label={t('procurement.fields.purchaseRequest')} required={false} value="" options={prOptions} emptyLabel={t('common.none')} />
      <FormField id="po-tax" name="tax_amount" label={t('procurement.fields.taxAmount')} type="number" min="0" step="0.01" defaultValue="0" />
      <button className="btn btn-primary" disabled={busy || !rfqDetail?.quotations?.length}>{t('procurement.actions.createPo')}</button></form>
      <h3>{t('procurement.workspace.purchaseOrders')}</h3><EntityTable rows={data.purchase_orders} title={t('procurement.workspace.purchaseOrders')} empty={t('procurement.messages.noPos')}
        columns={[["reference", t('procurement.fields.reference')], ['supplier_id', t('common.suppliers')], ['status', t('common.status')], ['total_amount', t('common.total')]]} />
    </section>
    <section className="card"><h2>{t('procurement.workspace.orderActions')}</h2>
      <SelectField id="po-action-select" label={t('procurement.fields.purchaseOrder')} value={selectedPo} onChange={(e) => setSelectedPo(e.target.value)} options={poOptions} emptyLabel={t('common.none')} />
      {poDetail && <><p>{refOf(poDetail)} · {poDetail.status}</p><EntityTable rows={poDetail.lines} title={t('procurement.workspace.orderLines')} empty={t('procurement.messages.noLines')}
        columns={[["id", t('procurement.fields.line')], ['description', t('procurement.fields.description')], ['quantity', t('common.quantity')], ['unit_rate', t('procurement.fields.unitPrice')]]} />
        <div className="procurement-action-row">
          {['draft', 'submitted', 'authority_approval'].includes(poDetail.status) && <button className="btn btn-primary" disabled={busy} onClick={() => postAction(`/procurement/po/${poDetail.id}/decide`, { decision: 'approve' })}>{t('procurement.actions.approveIssue')}</button>}
          {poDetail.status === 'draft' && <button className="btn" disabled={busy} onClick={() => run(() => send(`/procurement/po/${poDetail.id}`, 'PUT', { payment_terms: poDetail.payment_terms || '' }))}>{t('procurement.actions.save')}</button>}
          {!['cancelled', 'received'].includes(poDetail.status) && <button className="btn btn-danger" disabled={busy} onClick={() => setCancelTarget({ kind: 'po', id: poDetail.id, reference: refOf(poDetail) })}>{t('procurement.actions.cancel')}</button>}
        </div></>}
    </section>
  </div>;

  const renderReceipts = () => <div className="procurement-grid">
    <section className="card"><h2>{t('procurement.workspace.recordDelivery')}</h2><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const po = selectedLine(data.purchase_orders, form.get('purchase_order_id'));
      if (!po) { setFormError(t('procurement.messages.selectPurchaseOrder')); return; }
      run(async () => { const detail = await api(`/procurement/po/${po.id}`); const poLine = detail.lines.find((row) => Number(row.id) === Number(form.get('purchase_order_line_id')));
        if (!poLine) throw new Error('requestFailed'); await send('/procurement/deliveries', 'POST', { purchase_order_id: po.id, warehouse_id: Number(form.get('warehouse_id')), delivery_date: form.get('delivery_date') || null,
          lines: [{ purchase_order_line_id: poLine.id, quantity: Number(form.get('quantity')), lot_number: form.get('lot_number') || null, expiry_date: form.get('expiry_date') || null }] }); }, 'created'); }}>
      <SelectField id="delivery-po" name="purchase_order_id" label={t('procurement.fields.purchaseOrder')} value={selectedPo} onChange={(e) => setSelectedPo(e.target.value)} options={poOptions} emptyLabel={t('common.none')} />
      <SelectField id="delivery-line" name="purchase_order_line_id" label={t('procurement.fields.orderLine')} value="" options={(poDetail?.lines || []).map((item) => ({ value: item.id, label: `${item.description || item.material_id} · ${item.quantity}` }))} emptyLabel={t('common.none')} />
      <SelectField id="delivery-warehouse" name="warehouse_id" label={t('procurement.fields.warehouse')} value="" options={warehouses} emptyLabel={t('common.none')} />
      <div className="procurement-form-row"><FormField id="delivery-qty" name="quantity" label={t('common.quantity')} required type="number" min="0.001" step="any" />
        <FormField id="delivery-date" name="delivery_date" label={t('procurement.fields.deliveryDate')} type="date" /></div>
      <div className="procurement-form-row"><FormField id="delivery-lot" name="lot_number" label={t('procurement.fields.lotNumber')} />
        <FormField id="delivery-expiry" name="expiry_date" label={t('procurement.fields.expiryDate')} type="date" /></div>
      <button className="btn btn-primary" disabled={busy}>{t('procurement.actions.recordDelivery')}</button></form>
      <EntityTable rows={data.deliveries} title={t('procurement.workspace.deliveries')} empty={t('procurement.messages.noDeliveries')}
        columns={[["reference", t('procurement.fields.reference')], ['purchase_order_id', t('procurement.fields.purchaseOrder')], ['status', t('common.status')], ['delivery_date', t('procurement.fields.deliveryDate')]]} />
    </section>
    <section className="card"><h2>{t('procurement.workspace.inspectAndReceive')}</h2>
      <div className="procurement-action-row">{(data.deliveries || []).filter((row) => !(data.material_inspection_requests || []).some((mir) => Number(mir.delivery_id) === Number(row.id))).map((row) => <div className="procurement-action" key={row.id}><b>{refOf(row)}</b><button className="btn btn-sm" disabled={busy} onClick={() => postAction(`/procurement/deliveries/${row.id}/mir`)}>{t('procurement.actions.createMir')}</button></div>)}</div>
      {(data.material_inspection_requests || []).map((row) => <div className="procurement-action" key={`mir-${row.id}`}><b>{refOf(row)} · {row.status}</b>
        {row.status === 'pending' && <><button className="btn btn-sm" disabled={busy} onClick={() => postAction(`/procurement/mir/${row.id}/decide`, { decision: 'accept' })}>{t('procurement.actions.accept')}</button>
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => postAction(`/procurement/mir/${row.id}/decide`, { decision: 'reject' })}>{t('procurement.actions.reject')}</button></>}
        {row.status === 'accepted' && <button className="btn btn-sm" disabled={busy} onClick={() => postAction(`/procurement/mir/${row.id}/grn`)}>{t('procurement.actions.createGrn')}</button>}</div>)}
      <EntityTable rows={data.goods_receipt_notes} title={t('procurement.workspace.goodsReceipts')} empty={t('procurement.messages.noGrns')}
        columns={[["reference", t('procurement.fields.reference')], ['purchase_order_id', t('procurement.fields.purchaseOrder')], ['status', t('common.status')], ['created_at', t('common.createdAt')]]} />
      <h3>{t('procurement.workspace.supplierReturn')}</h3><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const grn = selectedLine(data.goods_receipt_notes, form.get('grn_id'));
        if (!grn) { setFormError(t('procurement.messages.selectGrn')); return; }
        postAction(`/procurement/grn/${grn.id}/returns`, { reason: form.get('reason'), lines: [{ material_id: Number(form.get('material_id')), quantity: Number(form.get('quantity')), notes: form.get('notes') }] }); }}>
        <SelectField id="return-grn" name="grn_id" label={t('procurement.fields.goodsReceipt')} value="" options={grnOptions} emptyLabel={t('common.none')} />
        <div className="procurement-form-row"><FormField id="return-material" name="material_id" label={t('procurement.fields.materialId')} type="number" min="1" required />
          <FormField id="return-qty" name="quantity" label={t('common.quantity')} type="number" min="0.001" step="any" required /></div>
        <FormField id="return-reason" name="reason" label={t('procurement.fields.reason')} required />
        <button className="btn btn-danger" disabled={busy}>{t('procurement.actions.createReturn')}</button></form>
    </section>
  </div>;

  const renderInvoices = () => <div className="procurement-grid">
    <section className="card"><h2>{t('procurement.workspace.supplierInvoice')}</h2><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const po = selectedLine(data.purchase_orders, form.get('purchase_order_id'));
      if (!po) { setFormError(t('procurement.messages.selectPurchaseOrder')); return; }
      run(async () => { const detail = await api(`/procurement/po/${po.id}`); const lineItem = detail.lines.find((row) => Number(row.id) === Number(form.get('line_id')));
        if (!lineItem) throw new Error('requestFailed'); await send('/procurement/invoices', 'POST', { supplier_id: Number(detail.supplier_id), purchase_order_id: detail.id,
          invoice_number: form.get('invoice_number'), invoice_date: form.get('invoice_date') || null, total_amount: Number(form.get('total_amount')), tax_amount: Number(form.get('tax_amount')) || 0, vat_recoverable: true,
          lines: [{ purchase_order_line_id: lineItem.id, material_id: lineItem.material_id, quantity: Number(form.get('quantity')), unit_price: Number(form.get('unit_price')) }] }); }, 'created'); }}>
      <SelectField id="invoice-po" name="purchase_order_id" label={t('procurement.fields.purchaseOrder')} value={selectedPo} onChange={(e) => setSelectedPo(e.target.value)} options={poOptions} emptyLabel={t('common.none')} />
      <SelectField id="invoice-line" name="line_id" label={t('procurement.fields.orderLine')} value="" options={(poDetail?.lines || []).map((item) => ({ value: item.id, label: `${item.description || item.material_id} · ${item.quantity}` }))} emptyLabel={t('common.none')} />
      <div className="procurement-form-row"><FormField id="invoice-number" name="invoice_number" label={t('procurement.fields.invoiceNumber')} required />
        <FormField id="invoice-date" name="invoice_date" label={t('procurement.fields.invoiceDate')} type="date" required /></div>
      <div className="procurement-form-row"><FormField id="invoice-qty" name="quantity" label={t('common.quantity')} type="number" min="0.001" step="any" required />
        <FormField id="invoice-price" name="unit_price" label={t('procurement.fields.unitPrice')} type="number" min="0" step="0.01" required /></div>
      <div className="procurement-form-row"><FormField id="invoice-total" name="total_amount" label={t('common.total')} type="number" min="0" step="0.01" required />
        <FormField id="invoice-tax" name="tax_amount" label={t('procurement.fields.taxAmount')} type="number" min="0" step="0.01" defaultValue="0" /></div>
      <p className="form-hint">{t('procurement.messages.threeWayMatch')}</p><button className="btn btn-primary" disabled={busy}>{t('procurement.actions.recordInvoice')}</button></form>
    </section>
    <section className="card"><h2>{t('procurement.workspace.apReview')}</h2><p>{t('procurement.messages.apReviewHelp')}</p>
      <EntityTable rows={options.invoices} title={t('procurement.workspace.apReview')} empty={t('procurement.messages.noInvoices')}
        columns={[["id", t('procurement.fields.invoiceId')], ['invoice_number', t('procurement.fields.invoiceNumber')], ['match_status', t('procurement.fields.matchStatus')], ['total_amount', t('common.total')], ['status', t('common.status')]]} />
      <div className="procurement-action-row">{options.invoices.filter((invoice) => invoice.status === 'received' && invoice.match_status === 'matched').map((invoice) => <div className="procurement-action" key={invoice.id}>
        <b>{invoice.invoice_number} · {t(`procurement.values.match_${invoice.match_status || 'pending'}`)}</b>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => postAction(`/procurement/invoices/${invoice.id}/approve`)}>{t('procurement.actions.approveInvoice')}</button></div>)}</div>
      <h3>{t('procurement.workspace.recordPayment')}</h3><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget);
        run(async () => { const payment = await send('/payments', 'POST', { direction: 'ap', project_id: Number(projectId), supplier_id: Number(form.get('supplier_id')), amount: Number(form.get('amount')),
          payment_date: form.get('payment_date'), payment_method: form.get('payment_method'), reference_number: form.get('reference_number') });
          const invoiceId = Number(form.get('supplier_invoice_id')); if (invoiceId) await send(`/finance-ledger/payments/${payment.id}/allocate`, 'POST', { allocations: [{ target_type: 'supplier_invoice', supplier_invoice_id: invoiceId, amount: Number(form.get('amount')) }] }); }, 'paymentRecorded'); }}>
        <SelectField id="payment-supplier" name="supplier_id" label={t('common.suppliers')} value="" options={supplierOptions} emptyLabel={t('common.none')} />
        <div className="procurement-form-row"><FormField id="payment-amount" name="amount" label={t('common.amount')} required type="number" min="0.01" step="0.01" />
          <FormField id="payment-date" name="payment_date" label={t('procurement.fields.paymentDate')} required type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
        <SelectField id="payment-invoice" name="supplier_invoice_id" label={t('procurement.fields.invoiceId')} required={false} value="" options={options.invoices.map((invoice) => ({ value: invoice.id, label: `${invoice.invoice_number} · ${invoice.total_amount} · ${invoice.status}` }))} emptyLabel={t('common.none')} />
        <div className="procurement-form-row"><SelectField id="payment-method" name="payment_method" label={t('procurement.fields.paymentMethod')} value="bank_transfer" options={['bank_transfer', 'check', 'cash', 'other'].map((value) => ({ value, label: t(`procurement.values.${value}`) }))} emptyLabel={t('common.none')} />
          <FormField id="payment-ref" name="reference_number" label={t('procurement.fields.reference')} /></div>
        <button className="btn btn-primary" disabled={busy}>{t('procurement.actions.recordPayment')}</button></form>
    </section>
  </div>;

  const renderAnalytics = () => <div className="procurement-grid">
    <section className="card"><h2>{t('procurement.workspace.spendAnalytics')}</h2><EntityTable rows={data.spend} title={t('procurement.workspace.spendAnalytics')} empty={t('procurement.messages.noAnalytics')}
      columns={[["supplier_name", t('common.suppliers')], ['order_count', t('procurement.fields.purchaseOrders')], ['committed_amount', t('procurement.fields.committedSpend')], ['actual_amount', t('procurement.fields.actualSpend')]]} /></section>
    <section className="card"><h2>{t('procurement.workspace.vendorPerformance')}</h2><EntityTable rows={data.performance} title={t('procurement.workspace.vendorPerformance')} empty={t('procurement.messages.noAnalytics')}
      columns={[["supplier_name", t('common.suppliers')], ['order_count', t('procurement.fields.purchaseOrders')], ['on_time_pct', t('procurement.fields.onTime')], ['quality_pct', t('procurement.fields.quality')]]} /></section>
  </div>;

  const finishCancel = async (reason) => {
    if (!cancelTarget) return;
    const route = cancelTarget.kind === 'pr' ? `/procurement/pr/${cancelTarget.id}/cancel` : `/procurement/po/${cancelTarget.id}/cancel`;
    const completed = await run(() => send(route, 'POST', { reason }), 'cancelled');
    if (completed) setCancelTarget(null);
  };

  const sectionContent = { requests: renderRequests, rfqs: renderRfqs, awards: renderAwards, orders: renderOrders, receipts: renderReceipts, invoices: renderInvoices, analytics: renderAnalytics };
  if (loading) return <LoadingState message={t('procurement.messages.loadingWorkspace')} />;
  if (loadError) return <ErrorState message={t('errors.requestFailed')} onRetry={reload} />;

  return <div className="procurement-workspace">
    <header className="procurement-workspace-header"><div><h2>{t('procurement.workspace.title')}</h2><p>{t('procurement.workspace.subtitle')}</p></div>
      <button className="btn" type="button" onClick={reload} disabled={busy}><RefreshCw size={16} aria-hidden="true" />{t('common.buttons.refresh')}</button></header>
    <nav className="procurement-section-nav" aria-label={t('procurement.workspace.navigation')}>
      {sections.map((key, index) => { const Icon = [ClipboardList, FileText, Check, ShoppingCart, Truck, FileText, ClipboardList][index];
        return <button key={key} type="button" className={`btn ${active === key ? 'btn-primary' : ''}`} aria-current={active === key ? 'page' : undefined} onClick={() => { setActive(key); setFormError(''); }}><Icon size={15} aria-hidden="true" />{sectionLabel(key)}</button>; })}
    </nav>
    {formError && <ErrorState message={formError} />}
    {sectionContent[active]()}
    <ReasonDialog open={Boolean(cancelTarget)} title={t('procurement.actions.cancel')} message={t('procurement.messages.cancelConfirm', { reference: cancelTarget?.reference || '' })}
      reasonRequired destructive busy={busy} onCancel={() => setCancelTarget(null)} onConfirm={finishCancel} />
  </div>;
}

export default ProcurementWorkspace;
