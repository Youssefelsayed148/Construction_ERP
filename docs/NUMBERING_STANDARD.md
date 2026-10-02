# Numbering Standard — Phase 21

Governing format for every numbered document-control record.

## Controlled documents — `PROJECT-DISCIPLINE-TYPE-SEQ-REV`

```
PREFIX-DISCIPLINE-TYPE-SEQ-REV
TWR-ARC-DWG-0001-R0
```

| Part | Meaning | Default |
|---|---|---|
| PREFIX | project code (or `P<id>`) | project `code`, configurable |
| DISCIPLINE | 3-letter code | included, configurable off |
| TYPE | 3-letter controlled type | included, configurable off |
| SEQ | sequence per (project, discipline, type) | zero-padded (default 4 digits) |
| REV | revision code `R<n>` | `R` prefix, configurable |

- Discipline codes: ARC architectural · STR structural · CIV civil ·
  MEC mechanical · ELE electrical · PLB plumbing · HVC hvac · FIR fire ·
  GEN general.
- Controlled types: DWG drawing · SPE specification · CON contract ·
  REP report · MET method statement · ASB as-built · OM O&M · OTH other.
- Revision rules: `R0` at registration; each new version bumps `R` by one
  (`R0 → R1 → R2 …`); exactly one current revision at any time; superseded
  revisions are immutable.

## Transmittals

- Outgoing: `TRO-YYYY-####`
- Incoming: `TRI-YYYY-####`

## Correspondence

- Letters: `LTR-YYYY-####` · Notices: `NOT-YYYY-####` ·
  Instructions: `INS-YYYY-####` · Claims: `CLM-YYYY-####`
- Amendment revisions: `rev 0, 1, 2 …` carried on the record with an
  immutable `correspondence_history` row per amendment.

## Other registers (existing standards retained)

- NCR `NCR-YYYY-####` · ITP `ITP-YYYY-####` · WIR `WIR-YYYY-####` ·
  MIR `MIR-####` (procurement) · Punch `PCH-YYYY-####` ·
  Near miss `NM-YYYY-####` · Permits `PTW/HW/LIF/EXC/CSE-YYYY-####`
- RFI `RFI-<project>-###` · Submittal `SUB-<project>-###` (Phase 16 format)

All sequences are per project and year-scoped; the sequences tables live in
`document_number_sequences` (documents) and each module's own counter.
