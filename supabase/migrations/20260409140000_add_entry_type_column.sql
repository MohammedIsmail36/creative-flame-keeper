-- =======================================================================
-- M3: Add entry_type column to journal_entries for reliable filtering
-- =======================================================================
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS entry_type VARCHAR(50) DEFAULT 'regular';

COMMENT ON COLUMN journal_entries.entry_type IS 'Type of journal entry: regular, closing, reversal';

CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_type
  ON journal_entries(entry_type);

-- Backfill existing closing entries based on description
UPDATE journal_entries
SET entry_type = 'closing'
WHERE description LIKE '%قيد إقفال السنة المالية%'
  AND entry_type = 'regular';
