-- Reverts 0002. Drops curator labels and submission links. The 'indicacoes' source (and the 'submission' kind it
-- needs) stays when items reference it, so their stories keep a valid source.
DROP TABLE content.curation_labels;
ALTER TABLE content.raw_items DROP COLUMN forced_by;
ALTER TABLE content.submissions DROP COLUMN raw_item_id, DROP COLUMN error;
DELETE FROM content.sources s WHERE s.id = 'indicacoes'
  AND NOT EXISTS (SELECT 1 FROM content.raw_items r WHERE r.source_id = s.id);
ALTER TABLE content.sources DROP COLUMN etag, DROP COLUMN last_modified;
