import React, { useEffect, useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

async function fetchMedia(fileUrl) {
  const response = await fetch(`${API_BASE_URL}${fileUrl}`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem('clientPreviewToken') || localStorage.getItem('token')}` },
  });
  if (!response.ok) throw new Error('File is unavailable');
  return response.blob();
}

export async function openProtectedFile(fileUrl) {
  const blobUrl = URL.createObjectURL(await fetchMedia(fileUrl));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
}

export function ProtectedImage({ fileUrl, alt, ...props }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let active = true;
    let objectUrl;
    if (fileUrl) fetchMedia(fileUrl).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setSrc(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (active) setSrc(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [fileUrl]);
  if (!src) return <span aria-label={alt}>File unavailable</span>;
  return <img src={src} alt={alt} {...props} />;
}
