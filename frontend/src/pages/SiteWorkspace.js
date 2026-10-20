import { translateEnum } from '../i18n/enums';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { errorMessage } from '../utils/errorMessage';
import TextEntryDialog from '../components/common/TextEntryDialog';
import LoadMore from '../components/common/LoadMore';
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

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
});


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
  const { t: translate } = useLocale();
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState([]);
  const notesLength = useRef(0); notesLength.current = notes.length;
  const [notesTotalCount, setNotesTotalCount] = useState(null);
  const [loadingMoreNotes, setLoadingMoreNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [narrative, setNarrative] = useState('');
  const [issues, setIssues] = useState('');
  const [plan, setPlan] = useState('');
  const [error, setError] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const photoInput = useRef(null);

  const today = new Date().toISOString().slice(0, 10);
  const t = {
    activities: translate('site.workspace.sections.activities'),
    manpower: translate('site.workspace.sections.manpower'),
    equipment: translate('site.workspace.sections.equipment'),
    deliveries: translate('site.workspace.sections.deliveries'),
    executed_quantities: translate('site.workspace.sections.executedQuantities'),
    inspections: translate('site.workspace.sections.inspections'),
    safety: translate('site.workspace.sections.safety'),
    material_readiness: translate('site.workspace.sections.materialReadiness'),
    instructions: translate('site.workspace.sections.instructions'),
    photos: translate('site.workspace.sections.photos'),
  };

  const load = useCallback(() => {
    fetchApi(`${API_URL}/projects/${id}/workspace?date=${today}`)
      .then(r => setData(r.data))
      .catch(e => setError(e));
    fetchApi(`${API_URL}/projects/${id}/sticky-notes?limit=200&offset=0`)
      .then(r => { setNotes(r.data || []); setNotesTotalCount(r.totalCount ?? null); })
      .catch(() => {});
  }, [id, today]);

  const loadMoreNotes = async () => {
    setLoadingMoreNotes(true);
    try {
      const r = await fetchApi(`${API_URL}/projects/${id}/sticky-notes?limit=200&offset=${notesLength.current}`);
      setNotes(current => [...current, ...(r.data || [])]);
      setNotesTotalCount(r.totalCount ?? null);
    } catch (e) { setError(e); }
    finally { setLoadingMoreNotes(false); }
  };

  useEffect(() => { load(); }, [load]);

  const selectPhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoFile(file);
  };

  const addPhoto = async (caption) => {
    const file = photoFile;
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('files', file);
      const uploadedResponse = await apiFetch(`${API_BASE_URL}/api/documents/upload`, {
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
      setPhotoFile(null);
      load();
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addSticky = (scope) => {
    if (!newNote.trim()) return;
    fetchApi(`${API_URL}/projects/${id}/sticky-notes`, {
      method: 'POST', body: JSON.stringify({ text: newNote, scope }),
    }).then(() => { setNewNote(''); load(); })
      .catch(e => setError(e));
  };

  const convertNote = (noteId) => {
    fetchApi(`${API_URL}/projects/${id}/sticky-notes/${noteId}/convert-to-action`, {
      method: 'POST', body: JSON.stringify({}),
    }).then(load).catch(e => setError(e));
  };

  const assembleReport = () => {
    fetchApi(`${API_URL}/projects/${id}/site-reports/assemble`, {
      method: 'POST',
      body: JSON.stringify({ report_date: today, narrative, issues_blockers: issues, next_day_plan: plan }),
    }).then(() => navigate(`/projects/${id}/site`))
      .catch(e => setError(e));
  };

  if (error) return <div className="page-container"><div className="alert alert-danger">{errorMessage(error, translate)}</div></div>;
  if (!data || !data.activities) return <div className="page-container"><p>{translate('site.system.loadingWorkspace')}</p></div>;

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={14} /></button>
          <h1 style={{ fontSize: 20, margin: 0 }}>{translate('site.system.siteEngineerWorkspace')}</h1>
        </div>
        <input ref={photoInput} type="file" accept="image/*" capture="environment" onChange={selectPhoto} style={{ display: 'none' }} />
        <button className="btn btn-primary btn-sm" disabled={uploadingPhoto} onClick={() => photoInput.current?.click()}>
          <Camera size={14} style={{ marginRight: 4 }} /> {uploadingPhoto ? translate('site.system.uploading') : (translate('site.system.quickPhoto'))}
        </button>
      </div>

      <div className="responsive-grid responsive-grid--auto-280" style={{ gap: 16 }}>
        <Section icon={ClipboardList} label={t.activities} count={data.activities.count}>
          {data.activities.items.length === 0
            ? <em>{translate('site.system.noActivitiesScheduledToday')}</em>
            : data.activities.items.map(a => <div key={a.id}>{a.title} — {translateEnum(translate, 'status', a.status)}</div>)}
        </Section>

        <Section icon={Users} label={t.manpower} count={data.manpower.present}>
          {data.manpower.present === 0
            ? <em>{translate('site.system.noAttendanceRecordsToday')}</em>
            : <span>{data.manpower.present}  {translate('site.system.present')}</span>}
        </Section>

        <Section icon={HardHat} label={t.equipment} count={data.equipment.count}>
          {data.equipment.count === 0
            ? <em>{translate('site.system.noEquipmentLoggedToday')}</em>
            : <span>{data.equipment.hours}  {translate('site.system.hTotal')}</span>}
        </Section>

        <Section icon={Truck} label={t.deliveries} count={data.deliveries.grns}>
          {data.deliveries.grns === 0
            ? <em>{translate('site.system.noGrnsToday')}</em>
            : data.deliveries.items.map(d => <div key={d.id}>{d.grn_number}</div>)}
        </Section>

        <Section icon={ClipboardList} label={t.executed_quantities} count={data.executed_quantities.approved_measurements}>
          {data.executed_quantities.approved_measurements === 0
            ? <em>{translate('site.system.noApprovedMeasurementsToday')}</em>
            : <span>{data.executed_quantities.total_quantity}  {translate('site.system.total')}</span>}
        </Section>

        <Section icon={Sun} label={t.inspections} count={data.inspections.items.length}>
          {data.inspections.items.length === 0
            ? <em>{translate('site.system.noInspectionsScheduledToday')}</em>
            : data.inspections.items.map(i => <div key={i.kind + i.id}>{i.kind}: {i.status || '-'}</div>)}
        </Section>

        <Section icon={AlertTriangle} label={t.safety} count={data.safety.incidents}>
          {data.safety.incidents === 0
            ? <em>{translate('site.system.noIncidentsToday')}</em>
            : data.safety.items.map(i => <div key={i.id}>{i.incident_type}</div>)}
        </Section>

        <Section icon={ClipboardList} label={t.instructions} count={data.instructions.open}>
          {data.instructions.open === 0
            ? <em>{translate('site.system.noOpenInstructions')}</em>
            : data.instructions.items.map(i => (
              <div key={i.id}>{i.instruction_number}: {i.title} ({translateEnum(translate, 'status', i.status)})</div>
            ))}
        </Section>

        <Section icon={StickyNote} label={t.photos} count={data.photos.count}>
          {data.photos.count === 0
            ? <em>{translate('site.system.noPhotosToday')}</em>
            : data.photos.items.map(p => <div key={p.id}>{p.caption || translate('site.system.photo')}</div>)}
        </Section>

        <Section icon={Sun} label={t.material_readiness} count={data.material_readiness.ready}>
          <span>{data.material_readiness.ready} / {data.material_readiness.requirements}  {translate('site.system.readyToPick')}</span>
        </Section>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">{translate('site.system.dailyReport')}</div>
        <div className="card-body">
          <textarea className="form-control" rows={2} placeholder={translate('site.system.narrative')} value={narrative} onChange={e => setNarrative(e.target.value)} />
          <textarea className="form-control" rows={2} style={{ marginTop: 8 }} placeholder={translate('site.system.issuesBlockers')} value={issues} onChange={e => setIssues(e.target.value)} />
          <textarea className="form-control" rows={2} style={{ marginTop: 8 }} placeholder={translate('site.system.nextDayPlan')} value={plan} onChange={e => setPlan(e.target.value)} />
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={assembleReport}>
            {translate('site.system.assembleReportFromRecords')}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">{translate('site.system.stickyNotes')}</div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-control" placeholder={translate('site.system.quickNote')} value={newNote} onChange={e => setNewNote(e.target.value)} />
            <button className="btn btn-secondary btn-sm" onClick={() => addSticky('personal')}>{translate('site.system.personal')}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => addSticky('project')}>{translate('site.system.project')}</button>
          </div>
          <div style={{ marginTop: 8 }}>
            {notes.length === 0
              ? <em>{translate('site.system.noStickyNotes')}</em>
              : notes.map(n => (
                <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <span><StickyNote size={12} /> {n.text} <small>({translateEnum(translate, 'scope', n.scope)})</small></span>
                  {n.converted_action_item_id == null
                    ? <button className="btn btn-info btn-sm" onClick={() => convertNote(n.id)}><Play size={10} /> {translate('site.system.convertToAction')}</button>
                    : <span className="badge badge-success">{translate('site.system.actionCreated')}</span>}
                </div>
              ))}
          </div>
          <LoadMore loadedCount={notes.length} totalCount={notesTotalCount} loading={loadingMoreNotes} t={translate} onLoadMore={loadMoreNotes} />
          <small style={{ color: 'var(--color-text-secondary)' }}>
            {translate('site.system.stickyNotesAreNotFormalCorrespondenceUseTheOfficialDocument')}
          </small>
        </div>
      </div>
      <TextEntryDialog open={Boolean(photoFile)} title={translate('common.dialogs.sitePhotoTitle')} label={translate('common.dialogs.sitePhotoCaption')} required={false} onSubmit={addPhoto} onCancel={() => setPhotoFile(null)} />
    </div>
  );
}

export default SiteWorkspace;
