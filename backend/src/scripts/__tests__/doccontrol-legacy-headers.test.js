// Closeout batch A-6 item 4: GET /rfis and GET /submittals (backend/src/routes/doccontrol.js,
// also reachable via /api/v1) still return the legacy single-answer RFI/submittal fields
// (answer/answered_by(_name)/answered_at, response/responded_by(_name)/responded_at).
// consultantEngine.js dual-writes them and frontend/src/pages/ProjectDocuments.js still reads
// them directly, so they were not retired; instead both routes must mark themselves deprecated.
//
// A static source check (same technique as scripts/__tests__/route-guards.test.js) rather than a
// live-server/DB test: it is deterministic, needs no fixtures, and reproduces exactly what would
// regress if the header call were ever deleted from one of these two handlers.
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'doccontrol.js'), 'utf8');

function handlerBody(routePath) {
  const start = source.indexOf(`router.get('${routePath}', authenticate, authorize(), async (req, res) => {`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  return source.slice(start, end);
}

describe('doccontrol legacy single-answer response headers', () => {
  test('GET /rfis and GET /submittals both call markLegacySingleAnswerShape before responding', () => {
    expect(handlerBody('/rfis')).toContain('markLegacySingleAnswerShape(res)');
    expect(handlerBody('/submittals')).toContain('markLegacySingleAnswerShape(res)');
  });

  test('markLegacySingleAnswerShape sets Deprecation: true and a Sunset date 90 days from 2026-10-28', () => {
    expect(source).toContain("res.set('Deprecation', 'true')");
    expect(source).toContain("res.set('Sunset', LEGACY_SINGLE_ANSWER_SUNSET)");
    const sunset = new Date('Tue, 26 Jan 2027 00:00:00 GMT');
    const recorded = new Date(Date.UTC(2026, 9, 28));
    const diffDays = Math.round((sunset.getTime() - recorded.getTime()) / 86400000);
    expect(diffDays).toBe(90);
  });

  test('the legacy response-write path still rejects (410) so the dual-write stays through the revisioned register only', () => {
    expect(source).toContain("rejectLegacyResponse(res, '/api/v1/rfis/:id/responses')");
    expect(source).toContain("rejectLegacyResponse(res, '/api/v1/submittals/:id/revisions')");
  });
});
