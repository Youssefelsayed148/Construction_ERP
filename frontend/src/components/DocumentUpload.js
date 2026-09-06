import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Image } from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Reusable file upload: uploads to /api/documents/upload and reports uploaded
// file info (file_url, original_name, file_type, file_size_bytes) via onUploaded.
// Used by site reports (photos), document control, QHSE attachments.
function DocumentUpload({ onUploaded, multiple = true, accept, label, locale = 'en' }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState([]);

  const handleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      Array.from(fileList).forEach(f => formData.append('files', f));
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
      const next = multiple ? [...uploaded, ...json.data] : json.data;
      setUploaded(next);
      onUploaded(multiple ? next : json.data[0]);
    } catch (e) {
      setError(e.message);
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

  const isImage = (f) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(f.file_type);

  return (
    <div className="form-group">
      <label className="form-label">
        {label || (locale === 'ar' ? 'المرفقات' : 'Attachments')}
      </label>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
      <button
        type="button"
        className="btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{ width: '100%', justifyContent: 'center', border: '1px dashed var(--color-surface-raised)' }}
      >
        {uploading ? <span className="spinner" /> : <Upload size={16} />}
        {uploading
          ? (locale === 'ar' ? 'جاري الرفع...' : 'Uploading...')
          : (locale === 'ar' ? 'اختر ملفات للرفع' : 'Choose files to upload')}
      </button>
      {error && <div className="alert alert-danger" style={{ marginTop: '8px' }}>{error}</div>}
      {uploaded.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          {uploaded.map((f, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', background: 'var(--color-surface)', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>
              {isImage(f) ? <Image size={14} /> : <FileText size={14} />}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_name}</span>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                {(f.file_size_bytes / 1024).toFixed(0)} KB
              </span>
              <button type="button" onClick={() => removeFile(idx)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 0 }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DocumentUpload;
