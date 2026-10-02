// Phase 28 — The six assistants (PM, Procurement, Commercial, Consultant,
// Document, Executive).
//
// STRICTLY ORCHESTRATION (prompt 28 preamble): no new business logic. Every
// assistant composes READ tools from the Phase 27 MCP tool set — each call
// runs through the same guarded internal handler chain, policy engine and
// redaction as the UI (the Phase 27 security model) — and produces DRAFT
// payloads for human review. Drafts are returned, never executed: assistants
// cannot send or approve anything, and no "confident agent" exception exists.
// Executing a draft = a human calling the tool themselves (or approving a
// gated request through the Agent Activity screen).

'use strict';

const mcpService = require('./mcpService');

const ASSISTANTS = ['pm', 'procurement', 'commercial', 'consultant', 'document', 'executive'];

const AGENT_SESSION = 'assistant';

// Same call surface as an MCP client would use: the tool executes through the
// internal guarded chain as this user, redacted, and logged to
// agent_tool_calls (session label 'assistant').
async function tool(user, toolName, args) {
  const result = await mcpService.executeTool({ toolName, args, reason: 'assistant', user, agentSession: 'assistant' });
  return result.body; // { success, data } or { success: false, error }
}

// Drafts are PROPOSALS: { tool, payload, note } — nothing is executed here.
function draft(toolName, payload, note) {
  return { tool: toolName, payload, note: note || 'Draft for human review — not sent.' };
}

// ---------------------------------------------------------------------------
// 1. PM Assistant
// ---------------------------------------------------------------------------

async function summarizePm(user, { project_id } = {}) {
  const args = project_id ? { project_id } : {};
  const [progress, delays, actions, alerts] = await Promise.all([
    project_id ? tool(user, 'get_project_progress', args) : Promise.resolve(null),
    project_id ? tool(user, 'get_schedule_delays', args) : Promise.resolve(null),
    tool(user, 'get_my_actions', {}),
    project_id ? tool(user, 'get_schedule_alerts', args) : Promise.resolve(null),
  ]);
  const [requirements, inspections, ncrs] = project_id ? await Promise.all([
    tool(user, 'get_material_requirements', args),
    tool(user, 'list_inspections', args),
    tool(user, 'list_ncrs', args),
  ]) : [null, null, null];

  const summary = {
    assistant: 'pm',
    project_id: project_id || null,
    progress: progress && progress.success ? progress.data : null,
    delayed_activities: delays && delays.success ? delays.data : null,
    my_actions: actions && actions.success
      ? { buckets: actions.buckets || null, total: actions.total || 0 }
      : null,
    schedule_alerts: alerts && alerts.success ? alerts.data : null,
    inspection_status: inspections && inspections.success ? inspections.data : null,
    open_ncrs: ncrs && ncrs.success ? ncrs.data : null,
    material_blockers: requirements && requirements.success ? requirements.data : null,
    risks: [],
  };
  if (Array.isArray(summary.delayed_activities) && summary.delayed_activities.length) {
    summary.risks.push(`${summary.delayed_activities.length} delayed activity(ies) in the schedule`);
  }
  if (Array.isArray(summary.open_ncrs) && summary.open_ncrs.length) {
    summary.risks.push(`${summary.open_ncrs.length} open NCR(s)`);
  }
  return summary;
}

function draftPm({ project_id, title, description, assigned_user_id, priority, due_date, rfi_subject, rfi_question }) {
  const drafts = [];
  if (title) {
    drafts.push(draft('assign_action', {
      project_id, title, description, assigned_user_id, priority: priority || 'normal', due_date: due_date || null,
    }, 'Assignment for human review and send.'));
  }
  if (rfi_subject) {
    drafts.push(draft('create_rfi', { project_id, subject: rfi_subject, question: rfi_question || '' },
      'RFI draft for human review — not sent.'));
  }
  return { assistant: 'pm', drafts };
}

// ---------------------------------------------------------------------------
// 2. Procurement Assistant
// ---------------------------------------------------------------------------

async function summarizeProcurement(user, { project_id, rfq_id } = {}) {
  const args = project_id ? { project_id } : {};
  const [requirements, inventory] = await Promise.all([
    tool(user, 'get_material_requirements', args),
    tool(user, 'get_inventory_status', {}),
  ]);
  const comparison = rfq_id ? await tool(user, 'compare_quotes', { rfq_id }) : null;

  const shortages = [];
  if (requirements && requirements.success && Array.isArray(requirements.data)) {
    for (const row of requirements.data) {
      const shortage = Number(row.shortage || 0);
      if (shortage > 0) {
        shortages.push({ material: row.material_name || row.name || `#${row.material_id || row.id}`, shortage });
      }
    }
  }
  return {
    assistant: 'procurement',
    project_id: project_id || null,
    shortages,
    inventory_status: inventory && inventory.success ? inventory.data : null,
    quote_comparison: comparison && comparison.success ? comparison.data : null,
    procurement_blockers: shortages.length
      ? shortages.map((s) => `${s.material}: short ${s.shortage}`)
      : [],
  };
}

function draftProcurement({ project_id, material_id, quantity, needed_by, title }) {
  return {
    assistant: 'procurement',
    drafts: [draft('create_purchase_requisition_draft', {
      project_id, title: title || 'Replenishment PR (assistant-drafted)',
      lines: [{ material_id, quantity, needed_by: needed_by || null }],
    }, 'PR draft for human review — purchasing submits and decides through the normal workflow.')],
  };
}

// ---------------------------------------------------------------------------
// 3. Commercial Assistant
// ---------------------------------------------------------------------------

async function summarizeCommercial(user, { project_id } = {}) {
  const args = project_id ? { project_id } : {};
  const [cost, invoices, variations, retention] = await Promise.all([
    project_id ? tool(user, 'get_project_cost_summary', args) : Promise.resolve(null),
    tool(user, 'list_invoices', args),
    project_id ? tool(user, 'list_variations', args) : Promise.resolve(null),
    project_id ? tool(user, 'get_retention', args) : Promise.resolve(null),
  ]);
  return {
    assistant: 'commercial',
    project_id: project_id || null,
    budget_and_eac: cost && cost.success ? cost.data : null,
    invoices: invoices && invoices.success ? invoices.data : null,
    variations: variations && variations.success ? variations.data : null,
    retention: retention && retention.success ? retention.data : null,
    note: 'Summaries only — the assistant never approves money. Any financial write is a gated action requiring a human approver.',
  };
}

function draftCommercial({ project_id, title, variation_type, lines, invoice_id, amount }) {
  const drafts = [];
  if (title) {
    drafts.push(draft('create_variation_draft', {
      project_id, title, variation_type: variation_type || 'client', lines: lines || [],
    }, 'Variation draft for human review — commercial starts/approves via the normal workflow.'));
  }
  if (invoice_id && amount != null) {
    drafts.push(draft('create_invoice_draft', { invoice_id, amount },
      'Invoice draft payload for human review — finance issues through the normal lifecycle.'));
  }
  return { assistant: 'commercial', drafts };
}

// ---------------------------------------------------------------------------
// 4. Consultant Assistant
// ---------------------------------------------------------------------------

async function summarizeConsultant(user, { project_id } = {}) {
  const args = project_id ? { project_id } : {};
  const [observations, rfis, inspections] = await Promise.all([
    tool(user, 'list_observations', args),
    tool(user, 'list_rfis', args),
    tool(user, 'list_inspections', args),
  ]);
  return {
    assistant: 'consultant',
    project_id: project_id || null,
    reviews_due: observations && observations.success ? observations.data : null,
    open_rfis: rfis && rfis.success ? rfis.data : null,
    inspections: inspections && inspections.success ? inspections.data : null,
    note: 'Official approvals stay role/policy controlled — the assistant only organizes and drafts.',
  };
}

function draftConsultant({ observation_id, comment, project_id, rfi_subject, rfi_question }) {
  const drafts = [];
  if (observation_id && comment) {
    drafts.push(draft('add_observation_comment', { observation_id, comment },
      'Observation comment draft for human review — not posted.'));
  }
  if (rfi_subject && project_id) {
    drafts.push(draft('create_rfi', { project_id, subject: rfi_subject, question: rfi_question || '' },
      'RFI draft for human review — not sent.'));
  }
  return { assistant: 'consultant', drafts };
}

// ---------------------------------------------------------------------------
// 5. Document Assistant
// ---------------------------------------------------------------------------

async function summarizeDocuments(user, { project_id, q } = {}) {
  const args = { ...(project_id ? { project_id } : {}), ...(q ? { q } : {}) };
  const [documents, search] = await Promise.all([
    tool(user, 'list_documents', args),
    q ? tool(user, 'search_documents', args) : Promise.resolve(null),
  ]);
  const docs = documents && documents.success ? documents.data : [];
  const superseded = (Array.isArray(docs) ? docs : []).filter((d) => d.status === 'superseded');
  return {
    assistant: 'document',
    project_id: project_id || null,
    documents: docs,
    superseded_references: superseded.map((d) => ({ id: d.id, number: d.document_number || d.number, title: d.title })),
    search_results: search && search.success ? search.data : null,
  };
}

function draftDocument({ project_id, title, recipient_organization_id, items, due_date }) {
  return {
    assistant: 'document',
    drafts: [draft('create_transmittal_draft', {
      project_id,
      title: title || 'Assistant-drafted transmittal',
      recipient_organization_id: recipient_organization_id || null,
      items: items || [],
      due_date: due_date || null,
    }, 'Transmittal draft for document-control review.')],
  };
}

// ---------------------------------------------------------------------------
// 6. Executive Assistant (read-only, portfolio-wide)
// ---------------------------------------------------------------------------

async function summarizeExecutive(user) {
  const [portfolio, cash] = await Promise.all([
    tool(user, 'get_portfolio_health', {}),
    tool(user, 'get_cash_position', {}),
  ]);
  return {
    assistant: 'executive',
    portfolio_health: portfolio && portfolio.success ? portfolio.data : null,
    cash: cash && cash.success ? cash.data : null,
    note: 'Read-only across what the CEO dashboard (Phase 23) shows. No writes, no drafts.',
  };
}

function draftExecutive() {
  return { assistant: 'executive', drafts: [], note: 'The Executive Assistant is read-only.' };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const SUMMARIZERS = {
  pm: summarizePm,
  procurement: summarizeProcurement,
  commercial: summarizeCommercial,
  consultant: summarizeConsultant,
  document: summarizeDocuments,
  executive: summarizeExecutive,
};

const DRAFTERS = {
  pm: draftPm,
  procurement: draftProcurement,
  commercial: draftCommercial,
  consultant: draftConsultant,
  document: draftDocument,
  executive: draftExecutive,
};

async function summarize(assistantName, user, args) {
  const fn = SUMMARIZERS[assistantName];
  if (!fn) throw Object.assign(new Error(`Unknown assistant '${assistantName}'`), { status: 404 });
  return fn(user, args || {});
}

async function draftFor(assistantName, input) {
  const fn = DRAFTERS[assistantName];
  if (!fn) throw Object.assign(new Error(`Unknown assistant '${assistantName}'`), { status: 404 });
  return fn(input || {});
}

module.exports = { ASSISTANTS, tool, draft, summarize, draftFor, draftPm, draftProcurement, draftCommercial, draftConsultant, draftDocument, draftExecutive };
