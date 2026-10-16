import { translateEnum } from '../i18n/enums';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import { buildWizardPayload } from '../utils/wizardPayload';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import LoadMore from '../components/common/LoadMore';
import { ArrowRight, ArrowLeft, Check, X, Building2, Layers, Network, Users, Globe, ShieldCheck, FileCheck, CalendarRange, FolderTree, BellRing } from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
});

const ALL_TYPES = ['residential', 'commercial', 'industrial', 'infrastructure', 'mixed'];
const TYPE_LABELS = {
  en: { residential: 'Residential', commercial: 'Commercial', industrial: 'Industrial', infrastructure: 'Infrastructure', mixed: 'Mixed-Use' },
  ar: { residential: 'سكني', commercial: 'تجاري', industrial: 'صناعي', infrastructure: 'بنية تحتية', mixed: 'متعدد الاستخدامات' }
};
const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED'];
const TIMEZONES = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'UTC'];
const TAX_PROFILES = [
  { value: 'standard_vat', en: 'Standard VAT (14%)', ar: 'ضريبة قيمة مضافة ١٤٪' },
  { value: 'reduced_vat', en: 'Reduced VAT (5%)', ar: 'ضريبة مخفضة ٥٪' },
  { value: 'exempt', en: 'Exempt', ar: 'معفى' },
];
const VISIBILITY_POLICIES = [
  { value: 'standard', en: 'Standard — internal team sees all figures', ar: 'قياسي — الفريق الداخلي يرى كل الأرقام' },
  { value: 'restricted', en: 'Restricted — costs hidden from non-finance roles', ar: 'مقيد — التكاليف مخفية عن غير الماليين' },
  { value: 'client_visible', en: 'Client visible — client sees prices, not internal cost', ar: 'مرئي للعميل — يرى الأسعار دون التكلفة الداخلية' },
];
const TEAM_ROLES = ['project_manager', 'site_engineer', 'qs', 'safety_officer', 'supervisor', 'foreman'];

const STEPS = [
  { id: 'basic', icons: Building2, en: 'Basic Info', ar: 'البيانات الأساسية' },
  { id: 'structure', icons: Layers, en: 'Physical Structure', ar: 'الهيكل الفيزيائي' },
  { id: 'wbs', icons: Network, en: 'WBS', ar: 'هيكل تجزئة العمل' },
  { id: 'team', icons: Users, en: 'Project Team', ar: 'فريق المشروع' },
  { id: 'participants', icons: Globe, en: 'External Participants', ar: 'الأطراف الخارجية' },
  { id: 'permissions', icons: ShieldCheck, en: 'Permission Profile', ar: 'ملف الصلاحيات' },
  { id: 'approvals', icons: FileCheck, en: 'Approval Matrix', ar: 'مصفوفة الاعتماد' },
  { id: 'boq', icons: FolderTree, en: 'BOQ / CBS', ar: 'جدول الكميات' },
  { id: 'schedule', icons: CalendarRange, en: 'Schedule', ar: 'الجدول الزمني' },
  { id: 'documents', icons: FolderTree, en: 'Documents & Registers', ar: 'المستندات والسجلات' },
  { id: 'notifications', icons: BellRing, en: 'Notifications & SLA', ar: 'التنبيهات واتفاقية الخدمة' },
];

const initialForm = {
  // Step 1 — basic info
  name_en: '', name_ar: '', project_type: 'residential', project_number: '',
  client_id: '', project_manager_id: '',
  country: 'Egypt', city: '', address: '', gps_latitude: '', gps_longitude: '',
  timezone: 'Africa/Cairo', currency: 'EGP', tax_profile: 'standard_vat',
  contract_value: 0, budget: 0,
  dlp_period_months: 12, warranty_period_months: 12,
  retention_percentage: 5, retention_cap_amount: '', advance_payment_percentage: '',
  liquidated_damages_rate: '', start_date: '', expected_completion: '',
  // Step 2 — structure
  template_key: '',
  // Step 4/5
  team: [], participants: [],
  // Step 6
  visibility_policy: 'standard',
  // Step 7
  approval_overrides: [],
  // Step 8/9
  boq: null, schedule: null,
  // Step 11
  sla_hours: 48, notification_channels: ['in_app'],
};
function ProjectWizard() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [templates, setTemplates] = useState([]);
  const [templateDetail, setTemplateDetail] = useState(null);
  const [clients, setClients] = useState([]);
  const [managers, setManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [lookupCounts, setLookupCounts] = useState({ clients: null, managers: null, employees: null });
  const [loadingLookup, setLoadingLookup] = useState({ clients: false, managers: false, employees: false });
  const lookupRows = { clients, managers, employees };
  const lookupRowsRef = useRef(lookupRows); lookupRowsRef.current = lookupRows;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLookups = useCallback(async () => {
    try { const r = await fetchApi(`${API_URL}/projects/templates`); if (r.success) setTemplates(r.data || []); } catch (e) { /* none seeded yet */ }
    try { const r = await fetchApi(`${API_URL}/clients?limit=200&offset=0`); if (r.success) { setClients(r.data || []); setLookupCounts(current => ({ ...current, clients: r.totalCount ?? null })); } } catch (e) { /* ignore */ }
    try { const r = await fetchApi(`${API_URL}/hr/employees?is_manager=true&limit=200&offset=0`); if (r.success) { setManagers(r.data || []); setLookupCounts(current => ({ ...current, managers: r.totalCount ?? null })); } } catch (e) { /* ignore */ }
    try { const r = await fetchApi(`${API_URL}/hr/employees?limit=200&offset=0`); if (r.success) { setEmployees(r.data || []); setLookupCounts(current => ({ ...current, employees: r.totalCount ?? null })); } } catch (e) { /* ignore */ }
  }, []);

  const loadMoreLookup = async (kind) => {
    setLoadingLookup(current => ({ ...current, [kind]: true }));
    const rows = lookupRowsRef.current[kind] || [];
    const params = new URLSearchParams({ limit: '200', offset: String(rows.length) });
    const path = kind === 'clients' ? '/clients' : '/hr/employees';
    if (kind === 'managers') params.set('is_manager', 'true');
    try {
      const result = await fetchApi(`${API_URL}${path}?${params}`);
      const next = result.data || [];
      if (kind === 'clients') setClients(current => [...current, ...next]);
      if (kind === 'managers') setManagers(current => [...current, ...next]);
      if (kind === 'employees') setEmployees(current => [...current, ...next]);
      setLookupCounts(current => ({ ...current, [kind]: result.totalCount ?? null }));
    } catch (loadError) { setError(loadError.message); }
    finally { setLoadingLookup(current => ({ ...current, [kind]: false })); }
  };

  useEffect(() => { loadLookups(); }, [loadLookups]);

  // Step 2: when a template is chosen, load its full structure preview.
  useEffect(() => {
    const load = async () => {
      if (!form.template_key) { setTemplateDetail(null); return; }
      try {
        const r = await fetchApi(`${API_URL}/projects/templates/${form.template_key}`);
        if (r.success) setTemplateDetail(r.data);
      } catch (e) { setTemplateDetail(null); }
    };
    load();
  }, [form.template_key]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const addTeamMember = (employeeId) => {
    if (!employeeId) return;
    const emp = employees.find(e => e.id === Number(employeeId));
    if (!emp) return;
    if (form.team.some(m => m.employee_id === emp.id)) return;
    const email = emp.email || null;
    setForm(f => ({ ...f, team: [...f.team, { employee_id: emp.id, email, role: 'site_engineer' }] }));
  };

  const addParticipant = (clientId, type) => {
    if (!clientId || !type) return;
    if (form.participants.some(p => p.client_id === Number(clientId))) return;
    setForm(f => ({ ...f, participants: [...f.participants, { client_id: Number(clientId), participant_type: type, portal_access_enabled: type === 'client' || type === 'consultant' }] }));
  };

  const stepValid = (i) => {
    if (i === 0) return form.name_ar.trim().length > 0 || form.name_en.trim().length > 0;
    return true; // steps 2-11 are all optional/preview steps
  };

  const handleFinish = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = buildWizardPayload(form);
      const res = await fetchApi(`${API_URL}/projects/wizard`, { method: 'POST', body: JSON.stringify(payload) });
      if (res.success) navigate(`/projects/${res.data.id}`);
      else setError(res.error || 'Provisioning failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const L = (en, ar) => (locale === 'ar' ? ar : en);

  const stepsUi = STEPS.map((s, i) => ({ ...s, index: i }));

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('projectWizard.system.newProjectWizard')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('projectWizard.system.11StepsEverythingIsCommittedAtomicallyOnFinish')}
          </p>
        </div>
        <button className="btn" onClick={() => navigate('/projects')}>
          <X size={16} />{t('common.cancel')}
        </button>
      </div>

      <div className="level-line" />

      {/* Step rail */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {stepsUi.map(s => (
          <button
            key={s.id}
            className={`btn ${step === s.index ? 'btn-primary' : step > s.index ? '' : ''}`}
            style={{ padding: '6px 12px', fontSize: '12px', opacity: step === s.index ? 1 : 0.75 }}
            onClick={() => setStep(s.index)}
          >
            {step > s.index ? <Check size={12} /> : <s.icons size={12} />}
            {L(s.en, s.ar)}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: '24px', maxWidth: '900px' }}>
        {/* Step 1 — basic info */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.englishName')}</label>
                <input className="form-input" value={form.name_en} onChange={e => set('name_en', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.arabicName')}</label>
                <input className="form-input" value={form.name_ar} onChange={e => set('name_ar', e.target.value)} required />
              </div>
            </div>
            <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.projectNumber')}</label>
                <input className="form-input" value={form.project_number} onChange={e => set('project_number', e.target.value)} placeholder={t('projectWizard.system.auto')} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.projectType')}</label>
                <select className="form-select" value={form.project_type} onChange={e => set('project_type', e.target.value)}>
                  {ALL_TYPES.map(tp => <option key={tp} value={tp}>{TYPE_LABELS[locale]?.[tp] || tp}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.clientOptional')}</label>
                <select className="form-select" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
                  <option value="">{t('projectWizard.system.noClientAssigned')}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{locale === 'ar' ? c.name_ar : c.name_en} ({c.code})</option>)}
                </select>
                <LoadMore loadedCount={clients.length} totalCount={lookupCounts.clients} loading={loadingLookup.clients} onLoadMore={() => loadMoreLookup('clients')} t={t} />
              </div>
            </div>
            <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.country')}</label>
                <input className="form-input" value={form.country} onChange={e => set('country', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.city')}</label>
                <input className="form-input" value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('projectWizard.system.address')}</label>
              <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div className="responsive-grid responsive-grid--four" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.gpsLat')}</label>
                <input className="form-input" type="number" step="any" value={form.gps_latitude} onChange={e => set('gps_latitude', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.gpsLng')}</label>
                <input className="form-input" type="number" step="any" value={form.gps_longitude} onChange={e => set('gps_longitude', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.timezone')}</label>
                <select className="form-select" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.currency')}</label>
                <select className="form-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('projectWizard.system.taxProfile')}</label>
              <select className="form-select" value={form.tax_profile} onChange={e => set('tax_profile', e.target.value)}>
                {TAX_PROFILES.map(tp => <option key={tp.value} value={tp.value}>{L(tp.en, tp.ar)}</option>)}
              </select>
            </div>
            <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.originalContractValue')}</label>
                <input className="form-input" type="number" min="0" value={form.contract_value} onChange={e => set('contract_value', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.originalBudget')}</label>
                <input className="form-input" type="number" min="0" value={form.budget} onChange={e => set('budget', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.projectManager')}</label>
                <select className="form-select" value={form.project_manager_id} onChange={e => set('project_manager_id', e.target.value)}>
                  <option value="">--</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{locale === 'ar' ? m.name_ar : (m.name_en || m.name_ar)}</option>)}
                </select>
                <LoadMore loadedCount={managers.length} totalCount={lookupCounts.managers} loading={loadingLookup.managers} onLoadMore={() => loadMoreLookup('managers')} t={t} />
              </div>
            </div>
            <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.startDate')}</label>
                <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.completionDate')}</label>
                <input className="form-input" type="date" value={form.expected_completion} onChange={e => set('expected_completion', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.taxRetentionHandledInSteps67')}</label>
              </div>
            </div>
            <div className="responsive-grid responsive-grid--four" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.dlpMonths')}</label>
                <input className="form-input" type="number" min="0" value={form.dlp_period_months} onChange={e => set('dlp_period_months', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.warrantyMonths')}</label>
                <input className="form-input" type="number" min="0" value={form.warranty_period_months} onChange={e => set('warranty_period_months', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.retention')}</label>
                <input className="form-input" type="number" min="0" max="100" value={form.retention_percentage} onChange={e => set('retention_percentage', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.retentionCap')}</label>
                <input className="form-input" type="number" min="0" value={form.retention_cap_amount} onChange={e => set('retention_cap_amount', e.target.value)} />
              </div>
            </div>
            <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.advancePayment')}</label>
                <input className="form-input" type="number" min="0" max="100" value={form.advance_payment_percentage} onChange={e => set('advance_payment_percentage', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.liquidatedDamagesDay')}</label>
                <input className="form-input" type="number" step="any" min="0" value={form.liquidated_damages_rate} onChange={e => set('liquidated_damages_rate', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — physical structure */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">{t('projectWizard.system.startFromATemplateOrBlank')}</label>
              <select className="form-select" value={form.template_key} onChange={e => set('template_key', e.target.value)}>
                <option value="">{t('projectWizard.system.blankProject')}</option>
                {templates.map(tpl => <option key={tpl.key} value={tpl.key}>{tpl.name} ({tpl.project_type})</option>)}
              </select>
            </div>
            {form.template_key && templateDetail && (
              <div>
                <div className="alert alert-info">
                  {t('projectWizard.system.locationsWbsNodesFoldersWillBeCreated', { description: templateDetail.description, length: templateDetail.locations.length, length2: templateDetail.wbs.length, length3: templateDetail.folders.length })}
                </div>
                <div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid var(--color-surface-raised)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                  {templateDetail.locations.map(loc => (
                    <div key={loc.code} style={{ fontSize: '13px', padding: '2px 0', color: 'var(--color-text-secondary)' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{loc.code}</span> {loc.name} ({loc.location_type_code})
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!form.template_key && (
              <p style={{ color: 'var(--color-text-secondary)' }}>
                {t('projectWizard.system.blankSelectedYouCanStillDefineACustomLocationTree')}
              </p>
            )}
          </div>
        )}

        {/* Step 3 — WBS */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {form.template_key && templateDetail
                ? t('projectWizard.system.wbsNodesComeFromTheSelectedTemplateAndAreCreated')
                : t('projectWizard.system.blankWbsASingleRootNodeIsCreatedPhasesCan')}
            </p>
            {form.template_key && templateDetail && templateDetail.wbs.map(n => (
              <div key={n.code} style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {n.parent_code ? '└ ' : ''}<span style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{n.code}</span> {n.name}
              </div>
            ))}
          </div>
        )}

        {/* Step 4 — project team */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">{t('projectWizard.system.addTeamMember')}</label>
              <select className="form-select" value="" onChange={e => addTeamMember(e.target.value)}>
                <option value="">{t('projectWizard.system.selectEmployee')}</option>
                {employees.filter(e => !form.team.some(m => m.employee_id === e.id)).map(e => (
                  <option key={e.id} value={e.id}>{locale === 'ar' ? e.name_ar : (e.name_en || e.name_ar)} {e.email ? `(${e.email})` : ''}</option>
                ))}
              </select>
              <LoadMore loadedCount={employees.length} totalCount={lookupCounts.employees} loading={loadingLookup.employees} onLoadMore={() => loadMoreLookup('employees')} t={t} />
            </div>
            {form.team.length === 0 && (
              <p style={{ color: 'var(--color-text-secondary)' }}>{t('projectWizard.system.noTeamMembersYetOptional')}</p>
            )}
            {form.team.map((m, idx) => (
              <div key={m.employee_id} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ flex: 1, fontSize: '14px' }}>
                  {(() => { const e = employees.find(x => x.id === m.employee_id); return e ? (locale === 'ar' ? e.name_ar : (e.name_en || e.name_ar)) : m.employee_id; })()}
                </span>
                <select className="form-select" style={{ width: '220px' }} value={m.role} onChange={e => setForm(f => ({ ...f, team: f.team.map((x, i) => i === idx ? { ...x, role: e.target.value } : x) }))}>
                  {TEAM_ROLES.map(r => <option key={r} value={r}>{translateEnum(t, 'role', r)}</option>)}
                </select>
                <button className="btn" onClick={() => setForm(f => ({ ...f, team: f.team.filter((_, i) => i !== idx) }))}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Step 5 — external participants */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('projectWizard.system.optionalCanBeEmptyConsultantsClientsGetPortalAccessPer')}
            </p>
            <div className="responsive-grid responsive-grid--two-one-auto" style={{ gap: '12px', alignItems: 'end' }}>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.organizationClientDirectory')}</label>
                <select id="participant-org" className="form-select" defaultValue="">
                  <option value="">{t('projectWizard.system.selectOrganization')}</option>
                  {clients.map(o => <option key={o.id} value={o.id}>{(locale === 'ar' ? o.name_ar : o.name_en) || o.code}</option>)}
                </select>
                <LoadMore loadedCount={clients.length} totalCount={lookupCounts.clients} loading={loadingLookup.clients} onLoadMore={() => loadMoreLookup('clients')} t={t} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('projectWizard.system.role')}</label>
                <select id="participant-type" className="form-select" defaultValue="consultant">
                  {['consultant', 'client', 'supplier', 'subcontractor'].map(tp => <option key={tp} value={tp}>{translateEnum(t, 'role', tp)}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" style={{ marginBottom: '20px' }}
                onClick={() => {
                  const orgEl = document.getElementById('participant-org');
                  const typeEl = document.getElementById('participant-type');
                  addParticipant(orgEl.value, typeEl.value);
                  orgEl.value = '';
                }}>
                {t('projectWizard.system.add')}
              </button>
            </div>
            {form.participants.length === 0 && (
              <p style={{ color: 'var(--color-text-secondary)' }}>{t('projectWizard.system.noExternalParticipantsTheyCanBeAddedLater')}</p>
            )}
            {form.participants.map((p, idx) => {
              const c = clients.find(x => x.id === p.client_id);
              return (
                <div key={`${p.client_id}-${p.participant_type}`} style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '14px' }}>
                  <span style={{ flex: 1 }}>{c ? (locale === 'ar' ? c.name_ar : c.name_en) : p.client_id}</span>
                  <span className="badge badge-info">{p.participant_type}</span>
                  <button className="btn" onClick={() => setForm(f => ({ ...f, participants: f.participants.filter((_, i) => i !== idx) }))}><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}

        {/* Step 6 — permission profile */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-label">{t('projectWizard.system.visibilityPolicy')}</label>
            {VISIBILITY_POLICIES.map(vp => (
              <label key={vp.value} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
                <input type="radio" name="visibility" checked={form.visibility_policy === vp.value} onChange={() => set('visibility_policy', vp.value)} />
                {L(vp.en, vp.ar)}
              </label>
            ))}
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              {t('projectWizard.system.internalCostFieldsUnderCostingAndFinanceAreHiddenFrom')}
            </p>
          </div>
        )}

        {/* Step 7 — approval matrix */}
        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {form.template_key && templateDetail
                ? t('projectWizard.system.approvalRulesBelowComeFromTheSelectedTemplate')
                : t('projectWizard.system.defaultApprovalRulesApplyEditThresholdsAfterCreation')}
            </p>
            {(form.template_key && templateDetail ? templateDetail.approval_rules : []).map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                <span className="badge badge-info">{r.module}</span>
                <span>≤ {r.threshold_amount} → {r.approver_role} ({r.stage})</span>
              </div>
            ))}
          </div>
        )}

        {/* Step 8 — BOQ/CBS */}
        {step === 7 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">{t('projectWizard.system.boqCbsSourceFileOptionalImport')}</label>
              <input className="form-input" type="file" onChange={e => set('boq', e.target.files[0] ? e.target.files[0].name : null)} />
            </div>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {form.boq ? t('projectWizard.system.queuedImportRunsAfterProvisioning', { boq: form.boq }) : t('projectWizard.system.blankBoqSectionsItemsCanBeBuiltOrImportedLater')}
            </p>
          </div>
        )}

        {/* Step 9 — schedule */}
        {step === 8 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">{t('projectWizard.system.scheduleImportOptional')}</label>
              <input className="form-input" type="file" onChange={e => set('schedule', e.target.files[0] ? e.target.files[0].name : null)} />
            </div>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {form.schedule ? t('projectWizard.system.queued', { schedule: form.schedule }) : t('projectWizard.system.blankMilestonesCanBeAddedFromTheProjectPage')}
            </p>
          </div>
        )}

        {/* Step 10 — documents & registers */}
        {step === 9 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('projectWizard.system.theseStandardFoldersAndRegistersAreCreatedAutomaticallyOnFinish')}
            </p>
            {(form.template_key && templateDetail && templateDetail.folders.length ? templateDetail.folders : [
              { code: 'contracts', name: 'Contracts' }, { code: 'drawings', name: 'Drawings' },
              { code: 'boq', name: 'BOQ and CBS' }, { code: 'submittals', name: 'Submittals' },
              { code: 'rfi', name: 'RFIs' }, { code: 'hse', name: 'HSE' }, { code: 'financial', name: 'Financial' },
            ]).map(f => (
              <div key={f.code} style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                📁 {f.name} <span style={{ fontFamily: 'monospace' }}>({f.code})</span>
              </div>
            ))}
            {['site-diary', 'safety-incidents', 'inspections', 'correspondence'].map(r => (
              <div key={r} style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{t('projectWizard.system.register')} {r}</div>
            ))}
          </div>
        )}

        {/* Step 11 — notifications / SLA */}
        {step === 10 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group" style={{ maxWidth: '240px' }}>
              <label className="form-label">{t('projectWizard.system.approvalSlaHours')}</label>
              <input className="form-input" type="number" min="1" value={form.sla_hours} onChange={e => set('sla_hours', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('projectWizard.system.notificationChannels')}</label>
              {['in_app', 'email', 'sms', 'whatsapp'].map(ch => (
                <label key={ch} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={form.notification_channels?.includes(ch)}
                    onChange={e => setForm(f => ({
                      ...f,
                      notification_channels: e.target.checked
                        ? [...(f.notification_channels || []), ch]
                        : (f.notification_channels || []).filter(x => x !== ch),
                    }))}
                  />
                  {ch}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="alert alert-danger" style={{ marginTop: '16px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
          <button className="btn" disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}>
            <ArrowLeft size={14} />{t('projectWizard.system.back')}
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" disabled={!stepValid(step)} onClick={() => setStep(s => s + 1)}>
              {t('projectWizard.system.next')}<ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleFinish} disabled={saving}>
              {saving ? <span className="spinner" /> : <><Check size={14} />{t('projectWizard.system.finishProvisionProject')}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectWizard;
