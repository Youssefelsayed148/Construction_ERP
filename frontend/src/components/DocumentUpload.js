import { apiFetch } from '../services/apiClient';
import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Image } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

// Client limits improve feedback; backend limits and authorization remain authoritative.
function DocumentUpload({ onUploaded, multiple = true, accept, label, maxFiles = 5, maxFileSizeBytes = 10 * 1024 * 1024 }) {
  const { t } = useLocale();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState([]);

  const handleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const limit = multiple ? maxFiles : 1;
    if (files.length > limit || (multiple && uploaded.length + files.length > maxFiles)) {
      setError(t('common.upload.tooMany', { count: limit }));
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (files.some((file) => file.size > maxFileSizeBytes)) {
      setError(t('common.upload.tooLarge', { size: Math.round(maxFileSizeBytes / (1024 * 1024)) }));
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      const token = localStorage.getItem('token');
      const res = await apiFetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(t(`errors.${json.code || 'requestFailed'}`, { defaultValue: t('errors.requestFailed') }));
      const next = multiple ? [...uploaded, ...json.data] : json.data;
      setUploaded(next);
      onUploaded(multiple ? next : json.data[0]);
    } catch (e) {
      setError(e.message || t('common.states.error'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeFile = (idx) => {
    const next = uploaded.filter((_, i) => i !== idx);
    setUploaded(next);
    onUploaded(multiple ? next : null);
  };
  const isImage = (file) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(String(file.file_type || '').toLowerCase());

  return (
    <div className="form-group">
      <label className="form-label">{label || t('common.upload.attachments')}</label>
      <input ref={inputRef} type="file" multiple={multiple} accept={accept} aria-label={label || t('common.upload.attachments')}
        style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
      <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={uploading}
        style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--color-surface-raised)' }}>
        {uploading ? <span className="spinner" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
        {uploading ? t('common.upload.uploading') : t('common.upload.choose')}
      </button>
      <div className="form-hint">{t('common.upload.limits', { count: maxFiles, size: Math.round(maxFileSizeBytes / (1024 * 1024)) })}</div>
      {error && <div className="alert alert-danger" role="alert" style={{ marginTop: '8px' }}>{error}</div>}
      {uploaded.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          {uploaded.map((file, idx) => (
            <div key={`${file.file_url || file.original_name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', background: 'var(--color-surface)', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>
              {isImage(file) ? <Image size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.original_name}</span>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>{(file.file_size_bytes / 1024).toFixed(0)} KB</span>
              <button type="button" aria-label={t('common.upload.remove', { name: file.original_name })} onClick={() => removeFile(idx)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DocumentUpload;
