# 30 - UI/UX Standard

## Global shell
- Company/project switcher
- Global search
- My Actions
- Notifications
- Quick Create
- Help
- Profile

## Role-adaptive navigation
Do not show every module to every role. Navigation derives from role and project permissions.

## Interaction standards
- clear status badges
- breadcrumb with project/location
- consistent record header
- action bar based on allowed transitions
- timeline/audit tab
- files/comments tab
- related-records tab
- responsive tables with saved filters

## External portal UX
Client: executive/simple.
Consultant: review/inbox-centric.
Subcontractor: scope/action-centric.
Supplier: RFQ/PO/delivery-centric.

## Field/mobile UX
- large touch targets
- camera-first photo capture
- minimal typing
- recent locations
- barcode/QR support later for materials/assets
- offline-ready architecture

## Empty state standard
Every view defines:
- headline
- explanation
- permitted next action
Examples:
'No consultant assigned yet' + Assign Consultant button for authorized internal users.
'No inspections today' with no error state.

## Error standard
Never show raw stack traces or raw API exceptions to users. Show actionable error plus correlation ID for support.
