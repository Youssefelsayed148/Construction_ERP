# 12 - Consultant Portal

## Design principle
Simple review-oriented portal. Same project database, external scoped permission shell.

## Login
- consultant user credentials
- MFA optional/company policy
- only assigned projects visible
- organization banner and project identity

## Home dashboard
Always renders, including zero-data state.
Widgets:
- overall progress
- milestones
- planned vs actual summary
- today's inspections
- new work ready for inspection
- WIR pending
- MIR pending
- RFIs awaiting response
- submittals awaiting review
- observations awaiting verification
- NCR closeouts awaiting review
- latest drawings
- recent daily progress/photos
- sticky/personal notes
- upcoming visits

## Consultant actions
- create site visit
- raise observation/comment with photos
- answer/review RFI
- review submittal revision
- inspect WIR/MIR
- accept/reject rectification
- issue instruction if project policy allows
- recommend variation/payment certificate if authorized

## Review SLA
Each workflow step has target response date and overdue escalation.

## Consultant inbox
One page: 'My Reviews' sorted by due date/priority with filters for project, discipline, type and location.

## Consultant audit
Every official response records user, organization, date/time, revision, comments and attachments.

## Empty state examples
- No inspections scheduled today
- No RFIs require your response
- Consultant not assigned to this discipline
Never blank/crash.
