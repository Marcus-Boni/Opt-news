-- Reverts 0003. Drops the link prefix. Listing sources that already exist keep their rows (and the 'web_list' kind
-- they need), so their items and stories stay traceable; the previous code never collects them.
ALTER TABLE content.sources DROP CONSTRAINT sources_web_list_prefix;
ALTER TABLE content.sources DROP COLUMN link_prefix;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM content.sources WHERE kind = 'web_list') THEN
    ALTER TABLE content.sources DROP CONSTRAINT sources_kind_check;
    ALTER TABLE content.sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('rss', 'submission'));
  END IF;
END $$;
