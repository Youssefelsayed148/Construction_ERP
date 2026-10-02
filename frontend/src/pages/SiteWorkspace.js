import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Camera, Sun, Users, Truck, HardHat, ClipboardList, AlertTriangle, StickyNote, Play } from 'lucide-react';

// Phase 15 — the site-engineer home screen. Everything on it comes from ONE
// backend assembly (GET /api/projects/:id/workspace); the daily report is
// generated from the same source records (POST .../site-reports/assemble),
// so the engineer types only narrative, issues and the next-day plan.

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const SECTION_LABELS = {
  en: {
    activities: "Today's Activities", manpower: 'Manpower', equipment: 'Equipment',
    deliveries: 'Deliveries (GRNs)', executed_quantities: 'Executed Quantities',
    inspections: 'Inspections', safety: 'Safety', material_readiness: 'Material Readiness',
    instructions: 'Open Engineer Instructions', photos: 'Today\'s Photos',
  },
  ar: {
    activities: 'أنشطة اليوم', manpower: 'العمالة', equipment: 'المعدات',
    deliveries: 'التوريدات (GRN)', executed_quantities: 'الكميات المنفذة',
    inspections: 'الفحوصات', safety: 'السلامة', material_readiness: 'جاهزية المواد',
    instructions: 'تعليمات مفتوحة', photos: 'صور اليوم',
  },
};

function Section({ icon: Icon, label, count, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={16} /> {label}
        </span>
        <span className={`badge ${count > 0 ? 'badge-info' : 'badge-secondary'}`}>{count}</span>
      </div>
      <div className="card-body" style={{ fontSize: 13 }}>
        {children}
      </div>
    </div>
  );
}

function SiteWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [narrative, setNarrative] = useState('');
  const [issues, setIssues] = useState('');
  const [plan, setPlan] = useState('');
  const [error, setError] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInput = useRef(null);

  const today = new Date().toISOString().slice(0, 10);
  const t = SECTION_LABELS[locale === 'ar' ? 'ar' : 'en'];

  const load = useCallback(() => {
    fetchApi(`${API_URL}/projects/${id}/workspace?date=${today}`)
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
    fetchApi(`${API_URL}/projects/${id}/sticky-notes`)
      .then(r => setNotes(r.data || []))
      .catch(() => {});
  }, [id, today]);

  useEffect(() => { load(); }, [load]);

  const addPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const caption = window.prompt(locale === 'ar' ? 'وصف الصورة:' : 'Photo caption:') || '';
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('files', file);
      const uploadedResponse = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: form,
      });
      const uploaded = await uploadedResponse.json();
      if (!uploadedResponse.ok) throw new Error(uploaded.error || 'Photo upload failed');
      const saved = uploaded.data?.[0];
      if (!saved) throw new Error('The server did not return the uploaded photo');
      await fetchApi(`${API_URL}/projects/${id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ caption, file_name: saved.original_name || file.name, file_url: saved.file_url }),
      });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addSticky = (scope) => {
    if (!newNote.trim()) return;
    fetchApi(`${API_URL}/projects/${id}/sticky-notes`, {
      method: 'POST', body: JSON.stringify({ text: newNote, scope }),
    }).then(() => { setNewNote(''); load(); })
      .catch(e => setError(e.message));
  };

  const convertNote = (noteId) => {
    fetchApi(`${API_URL}/projects/${id}/sticky-notes/${noteId}/convert-to-action`, {
      method: 'POST', body: JSON.stringify({}),
    }).then(load).catch(e => setError(e.message));
  };

  const assembleReport = () => {
    fetchApi(`${API_URL}/projects/${id}/site-reports/assemble`, {
      method: 'POST',
      body: JSON.stringify({ report_date: today, narrative, issues_blockers: issues, next_day_plan: plan }),
    }).then(() => navigate(`/projects/${id}/site`))
      .catch(e => setError(e.message));
  };

  if (error) return <div className="page-container"><div className="alert alert-danger">{error}</div></div>;
  if (!data) return <div className="page-container"><p>Loading workspace…</p></div>;

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={14} /></button>
          <h1 style={{ fontSize: 20, margin: 0 }}>{locale === 'ar' ? 'مساحة عمل مهندس الموقع' : 'Site Engineer Workspace'}</h1>
        </div>
        <input ref={photoInput} type="file" accept="image/*" capture="environment" onChange={addPhoto} style={{ display: 'none' }} />
        <button className="btn btn-primary btn-sm" disabled={uploadingPhoto} onClick={() => photoInput.current?.click()}>
          <Camera size={14} style={{ marginRight: 4 }} /> {uploadingPhoto ? 'Uploading…' : (locale === 'ar' ? 'التقاط صورة' : 'Quick Photo')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Section icon={ClipboardList} label={t.activities} count={data.activities.count}>
          {data.activities.items.length === 0
            ? <em>{locale === 'ar' ? 'لا توجد أنشطة اليوم.' : 'No activities scheduled today.'}</em>
            : data.activities.items.map(a => <div key={a.id}>{a.title} — {a.status}</div>)}
        </Section>

        <Section icon={Users} label={t.manpower} count={data.manpower.present}>
          {data.manpower.present === 0
            ? <em>{locale === 'ar' ? 'لا سجلات حضور اليوم.' : 'No attendance records today.'}</em>
            : <span>{data.manpower.present} present</span>}
        </Section>

        <Section icon={HardHat} label={t.equipment} count={data.equipment.count}>
          {data.equipment.count === 0
            ? <em>{locale === 'ar' ? 'لا معدات اليوم.' : 'No equipment logged today.'}</em>
            : <span>{data.equipment.hours} h total</span>}
        </Section>

        <Section icon={Truck} label={t.deliveries} count={data.deliveries.grns}>
          {data.deliveries.grns === 0
            ? <em>{locale === 'ar' ? 'لا توريدات اليوم.' : 'No GRNs today.'}</em>
            : data.deliveries.items.map(d => <div key={d.id}>{d.grn_number}</div>)}
        </Section>

        <Section icon={ClipboardList} label={t.executed_quantities} count={data.executed_quantities.approved_measurements}>
          {data.executed_quantities.approved_measurements === 0
            ? <em>{locale === 'ar' ? 'لا كميات معتمدة اليوم.' : 'No approved measurements today.'}</em>
            : <span>{data.executed_quantities.total_quantity} total</span>}
        </Section>

        <Section icon={Sun} label={t.inspections} count={data.inspections.items.length}>
          {data.inspections.items.length === 0
            ? <em>{locale === 'ar' ? 'لا فحوصات اليوم.' : 'No inspections scheduled today.'}</em>
            : data.inspections.items.map(i => <div key={i.kind + i.id}>{i.kind}: {i.status || '-'}</div>)}
        </Section>

        <Section icon={AlertTriangle} label={t.safety} count={data.safety.incidents}>
          {data.safety.incidents === 0
            ? <em>{locale === 'ar' ? 'لا حوادث.' : 'No incidents today.'}</em>
            : data.safety.items.map(i => <div key={i.id}>{i.incident_type}</div>)}
        </Section>

        <Section icon={ClipboardList} label={t.instructions} count={data.instructions.open}>
          {data.instructions.open === 0
            ? <em>{locale === 'ar' ? 'لا تعليمات مفتوحة.' : 'No open instructions.'}</em>
            : data.instructions.items.map(i => (
              <div key={i.id}>{i.instruction_number}: {i.title} ({i.status})</div>
            ))}
        </Section>

        <Section icon={StickyNote} label={t.photos} count={data.photos.count}>
          {data.photos.count === 0
            ? <em>{locale === 'ar' ? 'لا صور اليوم.' : 'No photos today.'}</em>
            : data.photos.items.map(p => <div key={p.id}>{p.caption || 'photo'}</div>)}
        </Section>

        <Section icon={Sun} label={t.material_readiness} count={data.material_readiness.ready}>
          <span>{data.material_readiness.ready} / {data.material_readiness.requirements} ready to pick</span>
        </Section>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">{locale === 'ar' ? 'التقرير اليومي' : 'Daily Report'}</div>
        <div className="card-body">
          <textarea className="form-control" rows={2} placeholder={locale === 'ar' ? 'السرد:' : 'Narrative:'} value={narrative} onChange={e => setNarrative(e.target.value)} />
          <textarea className="form-control" rows={2} style={{ marginTop: 8 }} placeholder={locale === 'ar' ? 'المشاكل والمعوقات:' : 'Issues / blockers:'} value={issues} onChange={e => setIssues(e.target.value)} />
          <textarea className="form-control" rows={2} style={{ marginTop: 8 }} placeholder={locale === 'ar' ? 'خطة الغد:' : 'Next-day plan:'} value={plan} onChange={e => setPlan(e.target.value)} />
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={assembleReport}>
            {locale === 'ar' ? 'تجميع التقرير من السجلات' : 'Assemble report from records'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">{locale === 'ar' ? 'ملاحظات لاصقة' : 'Sticky Notes'}</div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-control" placeholder={locale === 'ar' ? 'ملاحظة سريعة…' : 'Quick note…'} value={newNote} onChange={e => setNewNote(e.target.value)} />
            <button className="btn btn-secondary btn-sm" onClick={() => addSticky('personal')}>{locale === 'ar' ? 'شخصية' : 'Personal'}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => addSticky('project')}>{locale === 'ar' ? 'مشروع' : 'Project'}</button>
          </div>
          <div style={{ marginTop: 8 }}>
            {notes.length === 0
              ? <em>{locale === 'ar' ? 'لا ملاحظات.' : 'No sticky notes.'}</em>
              : notes.map(n => (
                <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span><StickyNote size={12} /> {n.text} <small>({n.scope})</small></span>
                  {n.converted_action_item_id == null
                    ? <button className="btn btn-info btn-sm" onClick={() => convertNote(n.id)}><Play size={10} /> {locale === 'ar' ? 'تحويل لإجراء' : 'Convert to action'}</button>
                    : <span className="badge badge-success">{locale === 'ar' ? 'أصبح إجراء' : 'Action created'}</span>}
                </div>
              ))}
          </div>
          <small style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar'
              ? 'الملاحظات اللاصقة ليست مراسلات رسمية — استخدم مسار المستندات الرسمية.'
              : 'Sticky notes are not formal correspondence — use the official document registers for anything contractual.'}
          </small>
        </div>
      </div>
    </div>
  );
}

export default SiteWorkspace;
