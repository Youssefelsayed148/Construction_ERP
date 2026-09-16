# 17 - Planning and Scheduling

## Schedule model
- Schedule
- Baseline
- Activity
- Dependency
- Progress update
- Calendar
- Milestone
- Resource assignment optional

## Activity fields
- WBS
- work package
- location
- responsible party
- planned start/finish
- actual start/finish
- original/remaining duration
- % complete
- physical quantity basis optional
- predecessor/successor
- relationship FS/SS/FF/SF
- lag
- critical flag/float if calculated/imported

## Views
- Gantt
- milestones
- 2/4/6-week lookahead
- delayed activities
- critical activities
- location-based schedule
- subcontractor schedule

## Progress
Where quantity-driven, activity progress can derive from approved physical quantity with manual override controlled by permission/policy.

## Import/export
Provide interfaces for common scheduling imports/exports where feasible. Do not attempt to replace a full enterprise CPM engine in the first iteration.

## KPIs
Schedule Variance % = Actual Progress - Planned Progress
SPI = EV/PV where earned-value management is enabled.

## Alerts
- activity starts soon but material not ready
- inspection/submittal blocks activity
- critical activity delayed
- milestone forecast late
