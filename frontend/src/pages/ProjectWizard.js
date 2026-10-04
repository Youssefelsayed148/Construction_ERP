import { buildWizardPayload } from '../utils/wizardPayload';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowRight, ArrowLeft, Check, X, Building2, Layers, Network, Users, Globe, ShieldCheck, FileCheck, CalendarRange, FolderTree, BellRing } from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLookups = useCallback(async () => {
    try { const r = await fetchApi(`${API_URL}/projects/templates`); if (r.success) setTemplates(r.data || []); } catch (e) { /* none seeded yet */ }
    try { const r = await fetchApi(`${API_URL}/clients?limit=200`); if (r.success) setClients(r.data || []); } catch (e) { /* ignore */ }
    try { const r = await fetchApi(`${API_URL}/hr/employees?is_manager=true&limit=200`); if (r.success) setManagers(r.data || []); } catch (e) { /* ignore */ }
    try { const r = await fetchApi(`${API_URL}/hr/employees?limit=500`); if (r.success) setEmployees(r.data || []); } catch (e) { /* ignore */ }
  }, []);

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
          <h1>{L('New Project — Wizard', 'مشروع جديد — معالج الإعداد')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {L('11 steps · everything is committed atomically on Finish', '١١ خطوة · يُحفظ كل شيء ذرياً عند الإنهاء')}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{L('English Name', 'الاسم بالإنجليزية')}</label>
                <input className="form-input" value={form.name_en} onChange={e => set('name_en', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Arabic Name *', 'الاسم العربي *')}</label>
                <input className="form-input" value={form.name_ar} onChange={e => set('name_ar', e.target.value)} required />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{L('Project Number', 'رقم المشروع')}</label>
                <input className="form-input" value={form.project_number} onChange={e => set('project_number', e.target.value)} placeholder="auto" />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Project Type', 'نوع المشروع')}</label>
                <select className="form-select" value={form.project_type} onChange={e => set('project_type', e.target.value)}>
                  {ALL_TYPES.map(tp => <option key={tp} value={tp}>{TYPE_LABELS[locale]?.[tp] || tp}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{L('Client (optional)', 'العميل (اختياري)')}</label>
                <select className="form-select" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
                  <option value="">{L('-- No client assigned --', '-- بدون عميل --')}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{locale === 'ar' ? c.name_ar : c.name_en} ({c.code})</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{L('Country', 'الدولة')}</label>
                <input className="form-input" value={form.country} onChange={e => set('country', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('City', 'المدينة')}</label>
                <input className="form-input" value={form.city} onChange={e => set('city', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{L('Address', 'العنوان')}</label>
              <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">GPS Lat</label>
                <input className="form-input" type="number" step="any" value={form.gps_latitude} onChange={e => set('gps_latitude', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">GPS Lng</label>
                <input className="form-input" type="number" step="any" value={form.gps_longitude} onChange={e => set('gps_longitude', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Timezone', 'المنطقة الزمنية')}</label>
                <select className="form-select" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{L('Currency', 'العملة')}</label>
                <select className="form-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{L('Tax Profile', 'الملف الضريبي')}</label>
              <select className="form-select" value={form.tax_profile} onChange={e => set('tax_profile', e.target.value)}>
                {TAX_PROFILES.map(tp => <option key={tp.value} value={tp.value}>{L(tp.en, tp.ar)}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{L('Original Contract Value', 'قيمة العقد الأصلية')}</label>
                <input className="form-input" type="number" min="0" value={form.contract_value} onChange={e => set('contract_value', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Original Budget', 'الميزانية الأصلية')}</label>
                <input className="form-input" type="number" min="0" value={form.budget} onChange={e => set('budget', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Project Manager', 'مدير المشروع')}</label>
                <select className="form-select" value={form.project_manager_id} onChange={e => set('project_manager_id', e.target.value)}>
                  <option value="">--</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{locale === 'ar' ? m.name_ar : (m.name_en || m.name_ar)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{L('Start Date', 'تاريخ البدء')}</label>
                <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Completion Date', 'تاريخ الإنجاز')}</label>
                <input className="form-input" type="date" value={form.expected_completion} onChange={e => set('expected_completion', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Tax / retention handled in steps 6-7', 'يُكمل في الخطوات ٦-٧')}</label>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{L('DLP (months)', 'فترة الصيانة (شهور)')}</label>
                <input className="form-input" type="number" min="0" value={form.dlp_period_months} onChange={e => set('dlp_period_months', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Warranty (months)', 'الضمان (شهور)')}</label>
                <input className="form-input" type="number" min="0" value={form.warranty_period_months} onChange={e => set('warranty_period_months', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Retention %', 'نسبة الحجز %')}</label>
                <input className="form-input" type="number" min="0" max="100" value={form.retention_percentage} onChange={e => set('retention_percentage', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Retention Cap', 'سقف الحجز')}</label>
                <input className="form-input" type="number" min="0" value={form.retention_cap_amount} onChange={e => set('retention_cap_amount', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{L('Advance Payment %', 'نسبة الدفعة المقدمة %')}</label>
                <input className="form-input" type="number" min="0" max="100" value={form.advance_payment_percentage} onChange={e => set('advance_payment_percentage', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{L('Liquidated Damages %/day', 'التعويض الاتفاقي %/يوم')}</label>
                <input className="form-input" type="number" step="any" min="0" value={form.liquidated_damages_rate} onChange={e => set('liquidated_damages_rate', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — physical structure */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">{L('Start from a template or blank', 'البدء من قالب أو فراغ')}</label>
              <select className="form-select" value={form.template_key} onChange={e => set('template_key', e.target.value)}>
                <option value="">{L('Blank project', 'مشروع فارغ')}</option>
                {templates.map(tpl => <option key={tpl.key} value={tpl.key}>{tpl.name} ({tpl.project_type})</option>)}
              </select>
            </div>
            {form.template_key && templateDetail && (
              <div>
                <div className="alert alert-info">
                  {L(
                    `${templateDetail.description} — ${templateDetail.locations.length} locations, ${templateDetail.wbs.length} WBS nodes, ${templateDetail.folders.length} folders will be created.`,
                    `${templateDetail.description} — سيتم إنشاء ${templateDetail.locations.length} موقع و ${templateDetail.wbs.length} عقدة WBS و ${templateDetail.folders.length} مجلد.`
                  )}
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
                {L('Blank selected — you can still define a custom location tree in the BOQ/schedule steps later, or import one.', 'تم اختيار المشروع الفارغ — يمكنك تعريف المواقع لاحقاً أو استيرادها.')}
              </p>
            )}
          </div>
        )}

        {/* Step 3 — WBS */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {form.template_key && templateDetail
                ? L('WBS nodes come from the selected template and are created inside the Finish transaction.', 'عقد WBS تُنشأ من القالب داخل معاملة الإنهاء.')
                : L('Blank WBS — a single root node is created; phases can be added later from the project page.', 'سيُنشأ عقدة جذر واحدة؛ يمكن إضافة المراحل من صفحة المشروع.')}
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
              <label className="form-label">{L('Add team member', 'إضافة عضو فريق')}</label>
              <select className="form-select" value="" onChange={e => addTeamMember(e.target.value)}>
                <option value="">{L('-- Select employee --', '-- اختر موظفاً --')}</option>
                {employees.filter(e => !form.team.some(m => m.employee_id === e.id)).map(e => (
                  <option key={e.id} value={e.id}>{locale === 'ar' ? e.name_ar : (e.name_en || e.name_ar)} {e.email ? `(${e.email})` : ''}</option>
                ))}
              </select>
            </div>
            {form.team.length === 0 && (
              <p style={{ color: 'var(--color-text-secondary)' }}>{L('No team members yet (optional).', 'لا يوجد أعضاء بعد (اختياري).')}</p>
            )}
            {form.team.map((m, idx) => (
              <div key={m.employee_id} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ flex: 1, fontSize: '14px' }}>
                  {(() => { const e = employees.find(x => x.id === m.employee_id); return e ? (locale === 'ar' ? e.name_ar : (e.name_en || e.name_ar)) : m.employee_id; })()}
                </span>
                <select className="form-select" style={{ width: '220px' }} value={m.role} onChange={e => setForm(f => ({ ...f, team: f.team.map((x, i) => i === idx ? { ...x, role: e.target.value } : x) }))}>
                  {TEAM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
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
              {L('Optional — can be empty. Consultants/clients get portal access per participant.', 'اختياري — يمكن أن يبقى فارغاً.')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'end' }}>
              <div className="form-group">
                <label className="form-label">{L('Organization (client directory)', 'المؤسسة (دليل العملاء)')}</label>
                <select id="participant-org" className="form-select" defaultValue="">
                  <option value="">{L('-- Select organization --', '-- اختر مؤسسة --')}</option>
                  {clients.map(o => <option key={o.id} value={o.id}>{(locale === 'ar' ? o.name_ar : o.name_en) || o.code}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{L('Role', 'الدور')}</label>
                <select id="participant-type" className="form-select" defaultValue="consultant">
                  {['consultant', 'client', 'supplier', 'subcontractor'].map(tp => <option key={tp} value={tp}>{tp}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" style={{ marginBottom: '20px' }}
                onClick={() => {
                  const orgEl = document.getElementById('participant-org');
                  const typeEl = document.getElementById('participant-type');
                  addParticipant(orgEl.value, typeEl.value);
                  orgEl.value = '';
                }}>
                {L('Add', 'إضافة')}
              </button>
            </div>
            {form.participants.length === 0 && (
              <p style={{ color: 'var(--color-text-secondary)' }}>{L('No external participants (they can be added later).', 'لا توجد أطراف خارجية (يمكن إضافتها لاحقاً).')}</p>
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
            <label className="form-label">{L('Visibility policy', 'سياسة الظهور')}</label>
            {VISIBILITY_POLICIES.map(vp => (
              <label key={vp.value} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
                <input type="radio" name="visibility" checked={form.visibility_policy === vp.value} onChange={() => set('visibility_policy', vp.value)} />
                {L(vp.en, vp.ar)}
              </label>
            ))}
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              {L('Internal cost fields under /costing and /finance are hidden from consultant and client roles by the Phase 4 policy engine regardless of this setting.', 'حقول التكلفة الداخلية مخفية عن أدوار الاستشاري والعميل بمحرك الصلاحيات من المرحلة ٤ بغض النظر عن هذا الإعداد.')}
            </p>
          </div>
        )}

        {/* Step 7 — approval matrix */}
        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {form.template_key && templateDetail
                ? L('Approval rules below come from the selected template.', 'قواعد الاعتماد أدناه من القالب المختار.')
                : L('Default approval rules apply (edit thresholds after creation).', 'قواعد افتراضية — يمكن تعديل الحدود بعد الإنشاء.')}
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
              <label className="form-label">{L('BOQ/CBS source file (optional import)', 'ملف جدول الكميات (اختياري)')}</label>
              <input className="form-input" type="file" onChange={e => set('boq', e.target.files[0] ? e.target.files[0].name : null)} />
            </div>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {form.boq ? L(`Queued: ${form.boq} (import runs after provisioning)`, `في الانتظار: ${form.boq}`) : L('Blank — BOQ sections/items can be built or imported later from the project BOQ page.', 'فارغ — يمكن بناء أو استيراد جدول الكميات لاحقاً.')}
            </p>
          </div>
        )}

        {/* Step 9 — schedule */}
        {step === 8 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">{L('Schedule import (optional)', 'استيراد الجدول الزمني (اختياري)')}</label>
              <input className="form-input" type="file" onChange={e => set('schedule', e.target.files[0] ? e.target.files[0].name : null)} />
            </div>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {form.schedule ? L(`Queued: ${form.schedule}`, `في الانتظار: ${form.schedule}`) : L('Blank — milestones can be added from the project page.', 'فارغ — يمكن إضافة المعالم من صفحة المشروع.')}
            </p>
          </div>
        )}

        {/* Step 10 — documents & registers */}
        {step === 9 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {L('These standard folders and registers are created automatically on Finish:', 'تُنشأ هذه المجلدات والسجلات تلقائياً عند الإنهاء:')}
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
              <div key={r} style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>🗂 Register: {r}</div>
            ))}
          </div>
        )}

        {/* Step 11 — notifications / SLA */}
        {step === 10 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group" style={{ maxWidth: '240px' }}>
              <label className="form-label">{L('Approval SLA (hours)', 'مهلة الاعتماد (ساعات)')}</label>
              <input className="form-input" type="number" min="1" value={form.sla_hours} onChange={e => set('sla_hours', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{L('Notification channels', 'قنوات التنبيه')}</label>
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
            <ArrowLeft size={14} />{L('Back', 'السابق')}
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" disabled={!stepValid(step)} onClick={() => setStep(s => s + 1)}>
              {L('Next', 'التالي')}<ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleFinish} disabled={saving}>
              {saving ? <span className="spinner" /> : <><Check size={14} />{L('Finish — provision project', 'إنهاء — إنشاء المشروع')}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectWizard;