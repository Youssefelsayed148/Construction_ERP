import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Edit, Plus, Users, Calendar, Flag, MapPin, X, Briefcase, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, formatDate, formatPercent } from '../utils/formatters';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

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

const PHASE_STATUS_LABELS = {
  en: { planning: 'Planning', active: 'Active', completed: 'Completed', on_hold: 'On Hold' },
  ar: { planning: 'تخطيط', active: 'نشط', completed: 'مكتمل', on_hold: 'معلق' }
};

const PHASE_STATUS_BADGE = {
  planning: 'badge-info', active: 'badge-success', completed: 'badge-success', on_hold: 'badge-warning'
};

const TEAM_ROLES = {
  en: { project_manager: 'Project Manager', site_engineer: 'Site Engineer', qs: 'Quantity Surveyor', safety_officer: 'Safety Officer', supervisor: 'Supervisor', foreman: 'Foreman' },
  ar: { project_manager: 'مدير المشروع', site_engineer: 'مهندس موقع', qs: 'مساح كميات', safety_officer: 'مسؤول سلامة', supervisor: 'مشرف', foreman: 'رئيس عمال' }
};

const ALL_PHASE_STATUSES = ['planning', 'active', 'completed', 'on_hold'];
const ALL_TEAM_ROLES = ['project_manager', 'site_engineer', 'qs', 'safety_officer', 'supervisor', 'foreman'];
const ALL_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'closed'];
const ALL_TYPES = ['residential', 'commercial', 'industrial', 'infrastructure', 'mixed'];

function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [project, setProject] = useState(null);
  const [phases, setPhases] = useState([]);
  const [team, setTeam] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState([]);
  const [managers, setManagers] = useState([]);
  const [clients, setClients] = useState([]);
  const [finance, setFinance] = useState(null);

  const [phaseModal, setPhaseModal] = useState(null);
  const [teamModal, setTeamModal] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState(null);
  const [editModal, setEditModal] = useState(false);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApi(`${API_URL}/projects/${id}`);
      if (res.success) {
        setProject(res.data || res);
        setPhases(res.data?.phases || res.phases || []);
        setTeam(res.data?.team || res.team || []);
        setMilestones(res.data?.milestones || res.milestones || []);
      } else {
        setError(res.error || 'Failed to load project');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/hr/employees?limit=200`);
      if (res.success) setEmployees(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/clients?limit=200`);
      if (res.success) setClients(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const loadManagers = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/hr/employees?is_manager=true&limit=200`);
      if (res.success) setManagers(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadProject(); }, [loadProject]);
  useEffect(() => {
    const loadFinance = async () => {
      try {
        const res = await fetchApi(`${API_URL}/finance/project/${id}`);
        if (res.success) setFinance(res.data);
      } catch (e) { /* ignore */ }
    };
    loadFinance();
  }, [id, loadProject]);

  const projectName = () => {
    if (!project) return '';
    return locale === 'ar' ? project.name_ar : project.name_en;
  };

  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;
  const typeLabel = (tp) => TYPE_LABELS[locale]?.[tp] || tp;
  const phaseStatusLabel = (s) => PHASE_STATUS_LABELS[locale]?.[s] || s;
  const teamRoleLabel = (r) => TEAM_ROLES[locale]?.[r] || r;
  const clientName = () => {
    if (!project) return '-';
    return locale === 'ar' ? (project.client_name_ar || project.client?.name_ar || project.client_name_en || project.client?.name_en || '-') : (project.client_name_en || project.client?.name_en || project.client_name_ar || project.client?.name_ar || '-');
  };

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <span className="spinner" />
        </div>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="page-container">
        <button className="btn" onClick={() => navigate('/projects')} style={{ marginBottom: '20px' }}>
          <ArrowLeft size={16} />
          {locale === 'ar' ? 'العودة للمشاريع' : 'Back to Projects'}
        </button>
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  if (!project) return null;

  const infoCards = [
    { icon: Briefcase, label: locale === 'ar' ? 'العميل' : 'Client', value: clientName() },
    { icon: Users, label: locale === 'ar' ? 'مدير المشروع' : 'Project Manager', value: (locale === 'ar' ? project.project_manager_name : (project.project_manager_name_en || project.project_manager_name)) || '-' },
    { icon: MapPin, label: locale === 'ar' ? 'العنوان' : 'Address', value: project.address || '-' },
    { icon: Flag, label: locale === 'ar' ? 'قيمة العقد' : 'Contract Value', value: formatCurrency(project.contract_value), accent: true },
    { icon: Flag, label: locale === 'ar' ? 'الميزانية' : 'Budget', value: formatCurrency(project.budget), accent: true },
    { icon: Calendar, label: locale === 'ar' ? 'تاريخ البدء' : 'Start Date', value: formatDate(project.start_date) },
    { icon: Calendar, label: locale === 'ar' ? 'المتوقع' : 'Expected', value: project.expected_completion ? formatDate(project.expected_completion) : '-' },
  ];

  if (finance) {
    infoCards.push(
      { icon: TrendingUp, label: locale === 'ar' ? 'المدفوعات' : 'Payments Collected', value: formatCurrency(finance.total_paid), accent: true },
      { icon: Flag, label: locale === 'ar' ? 'المستحق' : 'Outstanding', value: formatCurrency(finance.outstanding_balance), accent: true },
      { icon: TrendingDown, label: locale === 'ar' ? 'المصروفات' : 'Expenses', value: formatCurrency(finance.total_expenses), accent: true },
      { icon: finance.profit >= 0 ? TrendingUp : TrendingDown, label: locale === 'ar' ? 'الربح' : 'Profit', value: formatCurrency(finance.profit), accent: true,
        color: finance.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }
    );
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate('/projects')}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '14px', fontWeight: 600 }}>
              {project.code}
            </span>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600 }}>{projectName()}</h1>
            <span className={`badge ${STATUS_BADGE[project.status] || 'badge-info'}`}>
              {statusLabel(project.status)}
            </span>
            <span className={`badge badge-info`}>
              {typeLabel(project.project_type)}
            </span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { loadClients(); loadManagers(); setEditModal(true); }}>
          <Edit size={16} />
          {locale === 'ar' ? 'تعديل' : 'Edit'}
        </button>
      </div>

      <div className="level-line" />

      {/* Module quick links */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { path: 'boq', label: locale === 'ar' ? 'جدول الكميات' : 'BOQ' },
          { path: 'work-orders', label: locale === 'ar' ? 'أوامر العمل' : 'Work Orders' },
          { path: 'site', label: locale === 'ar' ? 'إدارة الموقع' : 'Site Management' },
          { path: 'qhse', label: locale === 'ar' ? 'الجودة والسلامة' : 'Quality & HSE' },
          { path: 'documents', label: locale === 'ar' ? 'المستندات' : 'Documents' },
          { path: 'units', label: locale === 'ar' ? 'الوحدات والمبيعات' : 'Units & Sales' },
        ].map(m => (
          <button key={m.path} className="btn" style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => navigate(`/projects/${id}/${m.path}`)}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Info cards row */}
      <div className="stats-grid">
        {infoCards.map((card, i) => (
          <div className="stat-card" key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <card.icon size={14} style={{ color: 'var(--color-text-secondary)' }} />
              <div className="stat-label">{card.label}</div>
            </div>
            <div style={{
              fontSize: card.accent ? '16px' : '18px',
              fontWeight: 600,
              color: card.color || (card.accent ? 'var(--color-accent)' : 'var(--color-text-primary)'),
              fontVariantNumeric: 'tabular-nums'
            }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Overall progress */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {locale === 'ar' ? 'نسبة الإنجاز الإجمالية' : 'Overall Completion'}
          </span>
          <span style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: '14px' }}>
            {formatPercent(project.completion_percentage)}
          </span>
        </div>
        <div style={{ height: '6px', background: 'var(--color-surface-raised)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, Number(project.completion_percentage) || 0))}%`,
            background: 'var(--color-accent)',
            borderRadius: '3px',
            transition: 'width 0.5s ease'
          }} />
        </div>
      </div>

      {/* Phase tracker */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{locale === 'ar' ? 'مراحل المشروع' : 'Project Phases'}</h3>
          <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => setPhaseModal({})}>
            <Plus size={14} />
            {locale === 'ar' ? 'إضافة مرحلة' : 'Add Phase'}
          </button>
        </div>
        {phases.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', padding: '20px 0', textAlign: 'center' }}>
            {locale === 'ar' ? 'لا توجد مراحل بعد.' : 'No phases yet.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {phases.map(ph => {
              const phaseName = locale === 'ar' ? (ph.name_ar || ph.name) : (ph.name_en || ph.name);
              return (
                <div key={ph.id} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ minWidth: '140px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{phaseName}</div>
                    <span className={`badge ${PHASE_STATUS_BADGE[ph.status] || 'badge-info'}`} style={{ marginTop: '4px' }}>
                      {phaseStatusLabel(ph.status)}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      <span>{formatPercent(ph.completion_percentage)}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--color-surface-raised)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, Number(ph.completion_percentage) || 0))}%`,
                        background: 'var(--color-accent)',
                        borderRadius: '3px',
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setPhaseModal(ph)}>
                      <Edit size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team section */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{locale === 'ar' ? 'فريق المشروع' : 'Project Team'}</h3>
          <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => { loadEmployees(); setTeamModal(true); }}>
            <Plus size={14} />
            {locale === 'ar' ? 'إضافة عضو' : 'Add Member'}
          </button>
        </div>
        {team.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', padding: '20px 0', textAlign: 'center' }}>
            {locale === 'ar' ? 'لا يوجد أعضاء في الفريق.' : 'No team members yet.'}
          </p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{locale === 'ar' ? 'الاسم' : 'Name'}</th>
                  <th>{locale === 'ar' ? 'الدور' : 'Role'}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {team.map(tm => {
                  const memberName = (locale === 'ar'
                    ? (tm.employee_name_ar || tm.employee_name)
                    : (tm.employee_name_en || tm.employee_name)) || '-';
                  return (
                  <tr key={tm.id}>
                    <td>
                      {memberName}
                      {tm.designation && (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px', marginInlineStart: '8px' }}>
                          {tm.designation}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-info">{teamRoleLabel(tm.role)}</span>
                    </td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={async () => {
                        try {
                          await fetchApi(`${API_URL}/projects/${id}/team/${tm.id}`, { method: 'DELETE' });
                          loadProject();
                        } catch (e) { alert(e.message); }
                      }}>
                        <X size={12} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Milestone timeline */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{locale === 'ar' ? 'المعالم الرئيسية' : 'Milestones'}</h3>
          <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => setMilestoneModal({})}>
            <Plus size={14} />
            {locale === 'ar' ? 'إضافة معلم' : 'Add Milestone'}
          </button>
        </div>
        {milestones.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', padding: '20px 0', textAlign: 'center' }}>
            {locale === 'ar' ? 'لا توجد معالم رئيسية بعد.' : 'No milestones yet.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {milestones.map((m, idx) => (
              <div key={m.id} style={{ display: 'flex', gap: '16px', position: 'relative' }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px', flexShrink: 0
                }}>
                  <div style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: m.achieved_date ? 'var(--color-success)' : 'var(--color-accent)',
                    marginTop: '4px', flexShrink: 0, border: '2px solid',
                    borderColor: m.achieved_date ? 'var(--color-success)' : 'var(--color-accent)'
                  }} />
                  {idx < milestones.length - 1 && (
                    <div style={{ width: '2px', flex: 1, background: 'var(--color-surface-raised)', minHeight: '32px' }} />
                  )}
                </div>
                <div style={{ paddingBottom: '20px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
                        {locale === 'ar' ? (m.title_ar || m.title) : (m.title_en || m.title)}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        <Calendar size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                        {formatDate(m.target_date)}
                        {m.achieved_date && (
                          <span style={{ color: 'var(--color-success)', marginLeft: '12px' }}>
                            <Flag size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            {formatDate(m.achieved_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className={`badge ${m.achieved_date ? 'badge-success' : 'badge-warning'}`}>
                        {m.achieved_date ? (locale === 'ar' ? 'مكتمل' : 'Done') : (locale === 'ar' ? 'معلق' : 'Pending')}
                      </span>
                      <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setMilestoneModal(m)}>
                        <Edit size={12} />
                      </button>
                    </div>
                  </div>
                  {m.description && (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                      {m.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Phase Modal */}
      {phaseModal && (
        <PhaseModal
          phase={phaseModal}
          locale={locale}
          t={t}
          projectId={id}
          onClose={() => setPhaseModal(null)}
          onSave={loadProject}
        />
      )}

      {/* Team Modal */}
      {teamModal && (
        <TeamModal
          locale={locale}
          t={t}
          employees={employees}
          projectId={id}
          onClose={() => setTeamModal(false)}
          onSave={loadProject}
        />
      )}

      {/* Milestone Modal */}
      {milestoneModal && (
        <MilestoneModal
          milestone={milestoneModal}
          locale={locale}
          t={t}
          projectId={id}
          onClose={() => setMilestoneModal(null)}
          onSave={loadProject}
        />
      )}

      {/* Edit Project Modal */}
      {editModal && (
        <EditProjectModal
          project={project}
          locale={locale}
          t={t}
          clients={clients}
          managers={managers}
          onClose={() => setEditModal(false)}
          onSave={loadProject}
        />
      )}
    </div>
  );
}

function EditProjectModal({ project, locale, t, onClose, onSave, clients, managers }) {
  const [form, setForm] = useState({
    name_en: project.name_en || '', name_ar: project.name_ar || '',
    address: project.address || '', city: project.city || '',
    project_type: project.project_type || 'residential',
    client_id: project.client_id || '', project_manager_id: project.project_manager_id || '',
    contract_value: project.contract_value || 0, budget: project.budget || 0,
    start_date: project.start_date ? project.start_date.slice(0, 10) : '',
    expected_completion: project.expected_completion ? project.expected_completion.slice(0, 10) : '',
    status: project.status || 'planning',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'client_id' && value) {
        const selectedClient = clients.find(c => c.id === Number(value));
        if (selectedClient) {
          next.address = selectedClient.address || '';
          next.city = selectedClient.city || '';
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        contract_value: Number(form.contract_value) || 0,
        budget: Number(form.budget) || 0,
        client_id: form.client_id ? Number(form.client_id) : null,
        project_manager_id: form.project_manager_id ? Number(form.project_manager_id) : null,
      };
      const res = await fetchApi(`${API_URL}/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'تعديل المشروع' : 'Edit Project'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">English Name *</label>
                  <input className="form-input" value={form.name_en} onChange={e => handleChange('name_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم العربي *</label>
                  <input className="form-input" value={form.name_ar} onChange={e => handleChange('name_ar', e.target.value)} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'العنوان' : 'Address'}</label>
                  <input className="form-input" value={form.address} onChange={e => handleChange('address', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المدينة' : 'City'}</label>
                  <input className="form-input" value={form.city} onChange={e => handleChange('city', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'نوع المشروع' : 'Project Type'}</label>
                  <select className="form-select" value={form.project_type} onChange={e => handleChange('project_type', e.target.value)}>
                    {ALL_TYPES.map(tp => (
                      <option key={tp} value={tp}>{TYPE_LABELS[locale]?.[tp] || tp}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الحالة' : 'Status'}</label>
                  <select className="form-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                    {ALL_STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[locale]?.[s] || s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'العميل' : 'Client'}</label>
                  <select className="form-select" value={form.client_id} onChange={e => handleChange('client_id', e.target.value)}>
                    <option value="">-- {locale === 'ar' ? 'اختر العميل' : 'Select Client'} --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{locale === 'ar' ? c.name_ar : c.name_en} ({c.code})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'مدير المشروع' : 'Project Manager'}</label>
                  <select className="form-select" value={form.project_manager_id} onChange={e => handleChange('project_manager_id', e.target.value)}>
                    <option value="">-- {locale === 'ar' ? 'اختر مدير المشروع' : 'Select PM'} --</option>
                    {Object.entries(managers.reduce((groups, m) => {
                      const dept = m.department || (locale === 'ar' ? 'بدون قسم' : 'No Department');
                      (groups[dept] = groups[dept] || []).push(m);
                      return groups;
                    }, {})).map(([dept, deptManagers]) => (
                      <optgroup key={dept} label={dept}>
                        {deptManagers.map(m => (
                          <option key={m.id} value={m.id}>{locale === 'ar' ? m.name_ar : (m.name_en || m.name_ar)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'قيمة العقد' : 'Contract Value'} (EGP)</label>
                  <input className="form-input" type="number" min="0" value={form.contract_value} onChange={e => handleChange('contract_value', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الميزانية' : 'Budget'} (EGP)</label>
                  <input className="form-input" type="number" min="0" value={form.budget} onChange={e => handleChange('budget', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ البدء' : 'Start Date'}</label>
                  <input className="form-input" type="date" value={form.start_date} onChange={e => handleChange('start_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ الانتهاء المتوقع' : 'Expected Completion'}</label>
                  <input className="form-input" type="date" value={form.expected_completion} onChange={e => handleChange('expected_completion', e.target.value)} />
                </div>
              </div>

              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhaseModal({ phase, locale, t, projectId, onClose, onSave }) {
  const isEdit = !!phase && !!phase.id;
  const [form, setForm] = useState({
    name_en: phase?.name_en || '',
    name_ar: phase?.name_ar || '',
    status: phase?.status || 'planning',
    completion_percentage: phase?.completion_percentage || 0,
    start_date: phase?.start_date || '',
    expected_completion: phase?.expected_completion || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `${API_URL}/projects/${projectId}/phases/${phase.id}`
        : `${API_URL}/projects/${projectId}/phases`;
      const method = isEdit ? 'PUT' : 'POST';
      const body = { ...form, completion_percentage: Number(form.completion_percentage) || 0 };
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit ? (locale === 'ar' ? 'تعديل المرحلة' : 'Edit Phase') : (locale === 'ar' ? 'إضافة مرحلة' : 'Add Phase')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">English Name *</label>
                  <input className="form-input" value={form.name_en} onChange={e => handleChange('name_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم العربي *</label>
                  <input className="form-input" value={form.name_ar} onChange={e => handleChange('name_ar', e.target.value)} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الحالة' : 'Status'}</label>
                  <select className="form-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                    {ALL_PHASE_STATUSES.map(s => (
                      <option key={s} value={s}>{PHASE_STATUS_LABELS[locale]?.[s] || s}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'نسبة الإنجاز' : 'Completion %'}</label>
                  <input className="form-input" type="number" min="0" max="100" value={form.completion_percentage} onChange={e => handleChange('completion_percentage', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ البدء' : 'Start Date'}</label>
                  <input className="form-input" type="date" value={form.start_date} onChange={e => handleChange('start_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ الانتهاء المتوقع' : 'Expected Completion'}</label>
                  <input className="form-input" type="date" value={form.expected_completion} onChange={e => handleChange('expected_completion', e.target.value)} />
                </div>
              </div>

              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamModal({ locale, t, employees, projectId, onClose, onSave }) {
  const [form, setForm] = useState({ employee_id: '', role: 'project_manager' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { employee_id: Number(form.employee_id), role: form.role };
      const res = await fetchApi(`${API_URL}/projects/${projectId}/team`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Failed to add member'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'إضافة عضو للفريق' : 'Add Team Member'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الموظف' : 'Employee'}</label>
                <select className="form-select" value={form.employee_id} onChange={e => handleChange('employee_id', e.target.value)} required>
                  <option value="">-- {locale === 'ar' ? 'اختر الموظف' : 'Select Employee'} --</option>
                  {employees.map(emp => {
                    const nm = locale === 'ar'
                      ? (emp.name_ar || emp.name || emp.name_en)
                      : (emp.name_en || emp.name || emp.name_ar);
                    return (
                      <option key={emp.id} value={emp.id}>
                        {nm}{emp.designation ? ` — ${emp.designation}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الدور' : 'Role'}</label>
                <select className="form-select" value={form.role} onChange={e => handleChange('role', e.target.value)}>
                  {ALL_TEAM_ROLES.map(r => (
                    <option key={r} value={r}>{TEAM_ROLES[locale]?.[r] || r}</option>
                  ))}
                </select>
              </div>

              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function MilestoneModal({ milestone, locale, t, projectId, onClose, onSave }) {
  const isEdit = !!milestone && !!milestone.id;
  const [form, setForm] = useState({
    title_en: milestone?.title_en || '',
    title_ar: milestone?.title_ar || '',
    description: milestone?.description || '',
    target_date: milestone?.target_date || '',
    achieved_date: milestone?.achieved_date || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `${API_URL}/projects/${projectId}/milestones/${milestone.id}`
        : `${API_URL}/projects/${projectId}/milestones`;
      const method = isEdit ? 'PUT' : 'POST';
      const body = { ...form };
      if (!form.achieved_date) delete body.achieved_date;
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit ? (locale === 'ar' ? 'تعديل المعلم' : 'Edit Milestone') : (locale === 'ar' ? 'إضافة معلم' : 'Add Milestone')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">English Title *</label>
                  <input className="form-input" value={form.title_en} onChange={e => handleChange('title_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">العنوان العربي *</label>
                  <input className="form-input" value={form.title_ar} onChange={e => handleChange('title_ar', e.target.value)} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الوصف' : 'Description'}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ المستهدف' : 'Target Date'} *</label>
                  <input className="form-input" type="date" value={form.target_date} onChange={e => handleChange('target_date', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ الإنجاز' : 'Achieved Date'}</label>
                  <input className="form-input" type="date" value={form.achieved_date} onChange={e => handleChange('achieved_date', e.target.value)} />
                </div>
              </div>

              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProjectDetail;
