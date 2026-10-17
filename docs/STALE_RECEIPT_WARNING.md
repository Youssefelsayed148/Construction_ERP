# Accepted MIRs awaiting receipt posting

`backend/src/scripts/reconcile-database.js` reports an accepted or partially accepted MIR with positive accepted lines and no **posted** GRN as workflow work. It never adds an integrity violation solely because the GRN is missing.

- Configuration: `RECONCILIATION_STALE_RECEIPT_HOURS`, default **72 hours**. Use a positive finite number; fractional hours are supported. Invalid values fail before queries run.
- Age starts at `decided_at`, falling back to `created_at` for legacy records. Future dates report zero age.
- Age **greater than** the threshold produces `[WARNING]`; younger records and the exact threshold produce `[INFO]`.
- Each notice identifies the MIR number, parent PO number and age in hours. Legacy MIRs without a number use their database ID.
- A posted GRN resolves the notice. Draft or cancelled GRNs do not resolve it.
- `pending_receipts` retains its existing all-age count. Structured results also contain `stale_receipt_hours` and `receipt_notices` with `mir_id`, `mir_number`, `order_number`, `age_hours` and `level`.
- Warning levels do not change `ok`, individual violation counts or the CLI success status. The existing backup-confirmation guard still applies.

For a PO-00008-style accepted MIR aged 73 hours without a posted GRN, the default configuration emits:

```text
[WARNING] MIR MIR-00008 / PO PO-00008: accepted receipt awaiting posted GRN; age=73.00h
```

Quantity reconciliation remains separate: PO accepted quantity is decided MIR acceptance plus applicable legacy receipts, minus returns once. A linked GRN does not add acceptance a second time. A genuine projection mismatch remains a violation even if a receipt notice also exists. The check is read-only; it creates no GRN and changes no stored quantities.
