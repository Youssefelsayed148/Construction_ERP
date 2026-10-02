import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { Search, Plus, Briefcase, ArrowRight, MapPin, DollarSign, Calendar, TrendingUp, TrendingDown, Receipt, X } from 'lucide-react';
import { formatCurrency, formatDate, formatPercent } from '../utils/formatters';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const STATUS_LABELS = {
  en: { planning: 'Planning', active: 'Active', on_hold: 'On Hold', completed: 'Completed', closed: 'Closed' },
  ar: { planning: 'تخطيط', active: 'نشط', on_hold: 'معلق', completed: 'مكتمل', closed: 'مغلق' }
};

const TYPE_LABELS = {
  en: { residential: 'Residential', commercial: 'Commercial', industrial: 'Industrial', infrastructure: 'Infrastructure', mixed: 'Mixed-Use' },
  ar: { residential: 'سكني', commercial: 'تجاري', industrial: 'صناعي', infrastructure: 'بنية تحتية', mixed: 'متعدد الاستخدامات' }
};

const STATUS_BADGE = {
  planning: 'badge-info', active: 'badge-success', on_hold: 'badge-warning', completed: 'badge-info', closed: 'badge-danger'
};

const TYPE_BADGE = {
  residential: 'badge-info', commercial: 'badge-success', industrial: 'badge-warning', infrastructure: 'badge-danger', mixed: 'badge-info'
};

const ALL_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'closed'];
const ALL_TYPES = ['residential', 'commercial', 'industrial', 'infrastructure', 'mixed'];

function Projects() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [financeData, setFinanceData] = useState({});

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('project_type', typeFilter);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/projects?${params}`);
      if (res.success) setProjects(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter, typeFilter, searchQuery]);

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/projects/portfolio`);
      if (res.success) setPortfolio(res.data || res);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);
  useEffect(() => {
    const loadFinance = async () => {
      if (projects.length === 0) return;
      const data = {};
      for (const p of projects) {
        try {
          const res = await fetchApi(`${API_URL}/finance/project/${p.id}`);
          if (res.success) data[p.id] = res.data;
        } catch (e) { /* ignore */ }
      }
      setFinanceData(prev => ({ ...prev, ...data }));
    };
    if (projects.length > 0) loadFinance();
  }, [projects]);

  // Phase 5: the single-form create dialog is replaced by the 11-step wizard
  // (pages/ProjectWizard.js), which provisions the project transactionally.
  const handleOpenWizard = () => navigate('/projects/new');

  const projectName = (p) => locale === 'ar' ? p.name_ar : p.name_en;
  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;
  const typeLabel = (tp) => TYPE_LABELS[locale]?.[tp] || tp;
  const clientName = (p) => locale === 'ar' ? (p.client_name_ar || p.client?.name_ar || p.client_name_en || p.client?.name_en || '-') : (p.client_name_en || p.client?.name_en || p.client_name_ar || p.client?.name_ar || '-');
  const pmName = (p) => (locale === 'ar' ? p.project_manager_name : (p.project_manager_name_en || p.project_manager_name)) || '-';

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{locale === 'ar' ? 'المشاريع' : 'Projects'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'إدارة محفظة المشاريع' : 'Project Portfolio Management'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenWizard}>
          <Plus size={16} />
          {locale === 'ar' ? 'مشروع جديد' : 'New Project'}
        </button>
      </div>

      <div className="level-line" />

      {/* Portfolio summary */}
      {portfolio && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{portfolio.total || projects.length}</div>
            <div className="stat-label">{locale === 'ar' ? 'إجمالي المشاريع' : 'Total Projects'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--color-success)' }}>
              {portfolio.active || projects.filter(p => p.status === 'active').length}
            </div>
            <div className="stat-label">{locale === 'ar' ? 'مشاريع نشطة' : 'Active Projects'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--color-accent)' }}>
              {formatCurrency(portfolio.total_value || projects.reduce((s, p) => s + (Number(p.contract_value) || 0), 0))}
            </div>
            <div className="stat-label">{locale === 'ar' ? 'إجمالي قيمة العقود' : 'Total Contract Value'}</div>
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${!statusFilter ? 'btn-primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setStatusFilter('')}
        >
          {t('common.all')}
        </button>
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px' }}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
          >
            {statusLabel(s)}
          </button>
        ))}
      </div>

      {/* Type filter + Search row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', maxWidth: '400px', flex: 1 }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن مشاريع...' : 'Search projects...'}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
          <select className="form-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">{locale === 'ar' ? 'كل الأنواع' : 'All Types'}</option>
            {ALL_TYPES.map(tp => (
              <option key={tp} value={tp}>{typeLabel(tp)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Project cards */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Briefcase size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد مشاريع. أضف أول مشروع.' : 'No projects found. Add your first project.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {projects.map(p => (
            <div
              key={p.id}
              className="card"
              style={{ cursor: 'pointer', padding: '20px', transition: 'border-color var(--transition-fast)' }}
              onClick={() => navigate(`/projects/${p.id}`)}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent-muted)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                    {p.code}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                    {projectName(p)}
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0, marginTop: '4px' }} />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span className={`badge ${TYPE_BADGE[p.project_type] || 'badge-info'}`}>
                  {typeLabel(p.project_type)}
                </span>
                <span className={`badge ${STATUS_BADGE[p.status] || 'badge-info'}`}>
                  {statusLabel(p.status)}
                </span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  <span>{locale === 'ar' ? 'نسبة الإنجاز' : 'Completion'}</span>
                  <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{formatPercent(p.completion_percentage)}</span>
                </div>
                <div style={{ height: '4px', background: 'var(--color-surface-raised)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(0, Number(p.completion_percentage) || 0))}%`,
                    background: 'var(--color-accent)',
                    borderRadius: '2px',
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Briefcase size={14} />
                  <span>{clientName(p)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={14} />
                  <span>{p.address || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DollarSign size={14} />
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{formatCurrency(p.contract_value)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={14} />
                    <span>{formatDate(p.start_date)}</span>
                  </div>
                </div>
                {financeData[p.id] && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Receipt size={14} />
                      <span style={{ color: 'var(--color-warning)', fontSize: '12px', fontWeight: 500 }}>
                        {locale === 'ar' ? 'مستحق: ' : 'Outstanding: '}{formatCurrency(financeData[p.id].outstanding_balance)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {(financeData[p.id].profit || 0) >= 0 ? <TrendingUp size={14} style={{ color: 'var(--color-success)' }} /> : <TrendingDown size={14} style={{ color: 'var(--color-danger)' }} />}
                      <span style={{
                        fontSize: '12px', fontWeight: 600,
                        color: (financeData[p.id].profit || 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                      }}>
                        {formatCurrency(financeData[p.id].profit)}
                      </span>
                    </div>
                  </div>
                )}
                {p.expected_completion && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={14} style={{ color: 'var(--color-warning)' }} />
                    <span>{locale === 'ar' ? 'متوقع: ' : 'Due: '}{formatDate(p.expected_completion)}</span>
                  </div>
                )}
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  PM: {pmName(p)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

export default Projects;
