-- Curation cycle (NX-03, N-11, Q-10) and polite collection. Additive only: no column or row is dropped.

-- Conditional GET: the validators of the last full response, replayed as If-None-Match / If-Modified-Since.
ALTER TABLE content.sources ADD COLUMN etag text, ADD COLUMN last_modified text;

-- Links members submit (N-11) enter the pipeline as items of one virtual source, never collected as a feed.
ALTER TABLE content.sources DROP CONSTRAINT sources_kind_check;
ALTER TABLE content.sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('rss', 'submission'));
INSERT INTO content.sources (id, name, kind, feed_url, tier, interval_minutes)
VALUES ('indicacoes', 'Indicações da comunidade', 'submission', '', 'T1_5', 60)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE content.submissions ADD COLUMN raw_item_id uuid REFERENCES content.raw_items (id),
  ADD COLUMN error text;

-- A curator may send an item past the selection gate ("publicar mesmo assim"); the pipeline still writes it.
ALTER TABLE content.raw_items ADD COLUMN forced_by uuid REFERENCES identity.members (id);

-- Curator judgements on what the pipeline decided: the labelled sample that calibrates the gates (Q-10).
CREATE TABLE content.curation_labels (
  raw_item_id uuid NOT NULL REFERENCES content.raw_items (id),
  member_id uuid NOT NULL REFERENCES identity.members (id),
  verdict text NOT NULL CHECK (verdict IN ('should_publish', 'should_skip')),
  pipeline_status text NOT NULL,
  score_a int,
  score_b int,
  model_version text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (raw_item_id, member_id)
);
