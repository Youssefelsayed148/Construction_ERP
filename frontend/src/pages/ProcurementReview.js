import React, { useState } from 'react';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const COLUMNS = [
  ['supplier_name', 'Supplier'], ['compliant', 'Compliant'], ['lead_time_days', 'Lead days'],
  ['unit_price', 'Unit price'], ['total_price', 'Total price'], ['payment_terms', 'Payment terms'],
  ['delivery_terms', 'Delivery terms'], ['tax_amount', 'Tax'], ['warranty_months', 'Warranty months'],
  ['deviations', 'Deviations'], ['technical_score', 'Technical score'], ['commercial_score', 'Commercial score'],
];

function cell(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ') || '—';
  return String(value);
}

export default function ProcurementReview() {
  const [rfqId, setRfqId] = useState('');
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async (event) => {
    event.preventDefault();
    setLoading(true); setError(''); setComparison(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/procurement/rfq/${Number(rfqId)}/comparison`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setComparison(body.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const documentUrl = (kind) => `${API_BASE_URL}/api/procurement/documents/${kind}/${Number(rfqId)}`;
  const download = async (kind) => {
    try {
      const response = await fetch(documentUrl(kind), { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || `Download failed (${response.status})`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `${kind}-${rfqId}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setError(e.message); }
  };

  return <div className="page-container">
    <h1>Procurement comparison</h1>
    <p>Compare invited suppliers for one RFQ before making an award decision.</p>
    <form onSubmit={load} className="portal-toolbar" style={{ marginBottom: 16 }}>
      <label htmlFor="rfq-id">RFQ ID</label>
      <input id="rfq-id" className="form-control" type="number" min="1" required value={rfqId} onChange={(e) => setRfqId(e.target.value)} />
      <button className="btn btn-primary" disabled={loading}>{loading ? 'Loading…' : 'Compare'}</button>
    </form>
    {error && <div className="alert alert-danger">{error}</div>}
    {comparison && <>
      <h2>{comparison.rfq_number}</h2>
      <div className="portal-actions">
        {['rfq', 'technical-evaluation', 'commercial-comparison', 'award-recommendation'].map((kind) =>
          <button key={kind} className="btn btn-secondary btn-sm" onClick={() => download(kind)}>{kind.replaceAll('-', ' ')} PDF</button>)}
      </div>
      {comparison.rows.length ? <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr>{COLUMNS.map(([, title]) => <th key={title}>{title}</th>)}</tr></thead>
        <tbody>{comparison.rows.map((row) => <tr key={row.quotation_id}>{COLUMNS.map(([key]) => <td key={key}>{cell(row[key])}</td>)}</tr>)}</tbody></table></div>
        : <p>No quotations have been submitted for this RFQ.</p>}
      {comparison.recommendation && <div className="alert alert-info">Recommended: {comparison.recommendation.supplier_name} — {cell(comparison.recommendation.reason)}</div>}
    </>}
  </div>;
}
