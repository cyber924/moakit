ALTER TABLE pattern_catalog ADD COLUMN weekly_start TEXT NOT NULL DEFAULT '';
ALTER TABLE pattern_catalog ADD COLUMN weekly_end TEXT NOT NULL DEFAULT '';
UPDATE pattern_catalog SET recommended=1,merch_version=merch_version+1 WHERE id=(SELECT id FROM pattern_catalog WHERE status='published' AND invalid=0 ORDER BY updated_at DESC,id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM pattern_catalog WHERE recommended=1 AND status='published');
UPDATE pattern_catalog SET weekly_best=1,merch_version=merch_version+1 WHERE id=(SELECT id FROM pattern_catalog WHERE status='published' AND invalid=0 ORDER BY updated_at DESC,id LIMIT 1 OFFSET 1) AND NOT EXISTS(SELECT 1 FROM pattern_catalog WHERE weekly_best=1 AND status='published');
