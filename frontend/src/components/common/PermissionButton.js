import React from 'react';

// UI affordance only. The API remains responsible for enforcing authorization.
export default function PermissionButton({ allowed = false, children, title, ...props }) {
  if (!allowed) return null;
  return <button {...props} title={title}>{children}</button>;
}
