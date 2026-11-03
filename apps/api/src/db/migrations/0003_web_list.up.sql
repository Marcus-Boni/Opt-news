-- Sources without a feed (ADR-0015): a listing page whose article links match a prefix. Additive.
ALTER TABLE content.sources ADD COLUMN link_prefix text;
ALTER TABLE content.sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE content.sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('rss', 'submission', 'web_list'));
ALTER TABLE content.sources ADD CONSTRAINT sources_web_list_prefix CHECK (kind <> 'web_list' OR link_prefix IS NOT NULL);
