# 05 - Project Creation Wizard

## Goal
Creating a project must provision its complete operating environment, not just a Project row.

## Step 1 - Basic contract/project information
Fields:
- project code/number
- Arabic/English names
- project type
- client organization (optional at creation)
- country/city/address/GPS
- timezone
- currency
- tax profile
- original client contract value
- original project budget
- start date
- completion date
- DLP/warranty period
- retention percentage/cap
- advance payment amount/percentage
- liquidated-damages configuration
- status

Documents:
- project charter
- client contract/LOA placeholder

## Step 2 - Physical structure
Choose template or create:
- sites
- buildings/towers/blocks
- zones
- floors
- areas/rooms/units
For infrastructure: sections/chainage/zones.

## Step 3 - WBS
Import template or construct WBS.

## Step 4 - Project team
Assign each required internal position. Allow vacancy with warning, not crash.

## Step 5 - External participants
Add client, PMC, consultants, subcontractors, testing lab, authorities. Invites are optional.

## Step 6 - Permission profile
Apply project permission template and project-specific overrides.

## Step 7 - Approval matrix
Configure financial thresholds and technical workflows.

## Step 8 - BOQ/CBS/cost codes
Import BOQ and budget, or create blank registers.

## Step 9 - Schedule
Import/create schedule and baseline placeholder.

## Step 10 - Documents/registers
Create standard registers and numbering schemes.

## Step 11 - Notifications/SLA
Select project notification template and escalation rules.

## Provisioning transaction
On Finish, atomically create:
- project
- root location
- root WBS
- role assignments
- project participant records
- default workflows
- project folder/register structure
- numbering sequences
- dashboard instances/preferences
- default reports
- notification rules

## Empty states
If no client exists, Client Portal preview still loads with 'No client assigned'. If no consultant exists, Consultant Portal preview still loads with 'No consultant assigned'.

## Acceptance tests
- Create blank project with no client/consultant.
- Create project from Residential Tower template.
- Create infrastructure project with chainage locations.
- Add/remove project team member and verify access changes.
- Retry failed provisioning without duplicate records.
