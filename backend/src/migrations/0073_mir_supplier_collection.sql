-- F3 (owner decision 2, C-PROC-002): a rejected delivery needs no return document. The MIR that rejected it
-- carries a minimal "rejected - supplier to collect" record instead: a status flag + a note. Stock-neutral (the
-- quarantine_reject movement already wrote the quantity off) and no GL effect. Additive and nullable: NULL means
-- nothing to collect (accepted MIRs and every row that predates this migration).
ALTER TABLE material_inspection_requests
  ADD COLUMN IF NOT EXISTS supplier_collection_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS supplier_collection_note TEXT,
  ADD COLUMN IF NOT EXISTS supplier_collection_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS supplier_collection_updated_by INTEGER REFERENCES users(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_inspection_requests_supplier_collection_check') THEN
    ALTER TABLE material_inspection_requests
      ADD CONSTRAINT material_inspection_requests_supplier_collection_check
      CHECK (supplier_collection_status IS NULL OR supplier_collection_status IN ('pending_collection', 'collected'));
  END IF;
END $$;
