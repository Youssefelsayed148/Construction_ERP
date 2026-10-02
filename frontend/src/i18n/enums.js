// Shared presentation helpers for machine values (L6 grows this file; L3 needs roles).
// API and database values stay English machine identifiers (`pending_approval`). They are rendered
// through the enums.* catalog (`enums.status.pendingApproval`), never by replacing underscores.

// pending_approval | pending-approval | PendingApproval -> pendingApproval
export function toEnumKey(value) {
  const words = String(value ?? '').trim().replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return '';
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('');
}

// An unknown value is shown as the stored value (it is data), not as a guessed sentence.
export function translateEnum(t, group, value) {
  if (value === null || value === undefined || value === '') return '';
  return t(`enums.${group}.${toEnumKey(value)}`, { defaultValue: String(value) });
}

export const translateStatus = (t, value) => translateEnum(t, 'status', value);
export const translateRole = (t, value) => translateEnum(t, 'role', value);
export const translatePriority = (t, value) => translateEnum(t, 'priority', value);
export const translateSeverity = (t, value) => translateEnum(t, 'severity', value);
export const translateEntityType = (t, value) => translateEnum(t, 'entityType', value);
export const translateWorkflowAction = (t, value) => translateEnum(t, 'workflowAction', value);
