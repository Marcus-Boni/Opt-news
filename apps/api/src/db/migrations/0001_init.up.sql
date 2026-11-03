-- Opt News domain: one PostgreSQL database, one schema per bounded context (ADR-0004). The curation pipeline
-- (ADR-0003, strategy D) lives in the `content` schema next to the published stories.
CREATE SCHEMA identity;
CREATE SCHEMA content;
CREATE SCHEMA community;
CREATE SCHEMA meetups;
CREATE SCHEMA knowledge;
CREATE SCHEMA ops;

-- Identity & Access: (tenant_id, entra_oid) is the stable identity; no credentials, minimal profile.
CREATE TABLE identity.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  entra_oid text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entra_oid)
);

CREATE TABLE identity.role_assignments (
  member_id uuid NOT NULL REFERENCES identity.members (id),
  role text NOT NULL CHECK (role IN ('visitor', 'member', 'organizer', 'curator', 'admin')),
  granted_by uuid REFERENCES identity.members (id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, role)
);

-- Server-side sessions: the browser only holds an opaque token; the database keeps its hash.
CREATE TABLE identity.sessions (
  token_hash text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES identity.members (id),
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_member ON identity.sessions (member_id);

-- Content Intelligence: sources → raw items (metadata + feed excerpt only, never the full article) → paid model
-- calls with receipts → published stories.
CREATE TABLE content.topics (
  slug text PRIMARY KEY,
  label text NOT NULL,
  position int NOT NULL
);

CREATE TABLE content.sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('rss')),
  feed_url text NOT NULL,
  -- T1 official first party, T1_5 official accounts, T2 media and individuals (selection thresholds differ).
  tier text NOT NULL CHECK (tier IN ('T1', 'T1_5', 'T2')),
  license_policy text NOT NULL DEFAULT 'summary_link' CHECK (license_policy IN ('summary_link')),
  active boolean NOT NULL DEFAULT true,
  interval_minutes int NOT NULL DEFAULT 60 CHECK (interval_minutes >= 5),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content.raw_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES content.sources (id),
  guid text NOT NULL,
  canonical_url text NOT NULL UNIQUE,
  original_url text NOT NULL,
  title text NOT NULL,
  excerpt text,
  published_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  revision int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'archived', 'rejected', 'not_selected', 'selected', 'failed')),
  score_a int,
  score_b int,
  attempts int NOT NULL DEFAULT 0,
  error text,
  UNIQUE (source_id, guid)
);
CREATE INDEX raw_items_pending ON content.raw_items (observed_at) WHERE status IN ('discovered', 'failed');

-- One row per logical paid request: saved before the call, answer saved before use; a retry reuses it.
-- subject_id is a raw item id, or a briefing key such as "briefing:daily:2026-11-02".
CREATE TABLE content.model_receipts (
  key text PRIMARY KEY,
  subject_id text NOT NULL,
  task text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'done', 'failed')),
  response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX model_receipts_day ON content.model_receipts (created_at);

-- N-06: coverage of the same occurrence (or its direct follow-ups) grouped into one event.
CREATE TABLE content.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  heat_score real NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text REFERENCES content.sources (id),
  event_id uuid REFERENCES content.events (id),
  provider text NOT NULL,
  upstream_id text NOT NULL,
  headline text NOT NULL,
  summary text,
  original_url text NOT NULL,
  canonical_url text NOT NULL,
  source_name text NOT NULL,
  original_published_at timestamptz,
  first_seen_at timestamptz NOT NULL,
  language text NOT NULL,
  topics text[] NOT NULL DEFAULT '{}',
  editorial_score real,
  optsolv_relevance_score real,
  selection_reason text,
  ai_generated boolean NOT NULL DEFAULT true,
  model_version text,
  policy_version text,
  evidence_urls text[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('published', 'under_review', 'retracted')),
  review_reason text,
  upstream_revision text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  retracted_at timestamptz,
  -- Feed order: the source's publication date when known, else when we first saw it.
  sort_at timestamptz GENERATED ALWAYS AS (coalesce(original_published_at, first_seen_at)) STORED,
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', headline), 'A') || setweight(to_tsvector('portuguese', coalesce(summary, '')), 'B')
  ) STORED,
  UNIQUE (provider, upstream_id)
);
CREATE INDEX stories_feed ON content.stories (status, sort_at DESC, id DESC);
CREATE INDEX stories_canonical ON content.stories (canonical_url);
CREATE INDEX stories_event ON content.stories (event_id) WHERE event_id IS NOT NULL;

-- Every grouping judgement is kept (also the ones that did not attach), so grouping can be audited and recalibrated.
CREATE TABLE content.event_decisions (
  id bigserial PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES content.stories (id),
  candidate_story_id uuid NOT NULL REFERENCES content.stories (id),
  relation text NOT NULL CHECK (relation IN ('SAME_OCCURRENCE', 'SAME_STORY', 'UNRELATED', 'ROUNDUP')),
  confidence real NOT NULL,
  attached boolean NOT NULL,
  model_version text NOT NULL,
  policy_version text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_decisions_story ON content.event_decisions (story_id);

-- N-07: one briefing per period. Items are story references; what readers see is re-checked against the stories
-- current state at read time (a retracted story leaves the briefing, and takes the overview with it).
CREATE TABLE content.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily')),
  period_key text NOT NULL,
  overview text,
  items jsonb NOT NULL,
  model_version text,
  policy_version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, period_key)
);
CREATE INDEX stories_topics ON content.stories USING gin (topics);
CREATE INDEX stories_search ON content.stories USING gin (search);

-- Every change a story goes through (created, corrected, retracted, restored) is kept.
CREATE TABLE content.story_history (
  id bigserial PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES content.stories (id),
  change text NOT NULL,
  snapshot jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_history_story ON content.story_history (story_id, at);

CREATE TABLE content.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES identity.members (id),
  url text NOT NULL,
  normalized_url text NOT NULL,
  note text,
  status text NOT NULL CHECK (status IN ('pending_review', 'duplicate', 'accepted', 'rejected')),
  story_id uuid REFERENCES content.stories (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submitted_by, normalized_url)
);

-- Community: comments attach to a story, meetup or insight; hidden/deleted keep the row for history.
CREATE TABLE community.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('story', 'meetup', 'insight')),
  target_id uuid NOT NULL,
  parent_id uuid REFERENCES community.comments (id),
  author_id uuid NOT NULL REFERENCES identity.members (id),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  revision int NOT NULL DEFAULT 1,
  moderation_reason text,
  moderated_by uuid REFERENCES identity.members (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
CREATE INDEX comments_target ON community.comments (target_type, target_id, created_at, id);
CREATE INDEX comments_recent ON community.comments (created_at DESC);

CREATE TABLE community.comment_revisions (
  comment_id uuid NOT NULL REFERENCES community.comments (id),
  revision int NOT NULL,
  body text NOT NULL,
  replaced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, revision)
);

-- Meetups: proposal (origin preserved) → votes → session → artifacts.
CREATE TABLE meetups.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES identity.members (id),
  title text NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'selected', 'rejected', 'expired', 'withdrawn')),
  origin_story_id uuid REFERENCES content.stories (id),
  voting_closes_at timestamptz NOT NULL,
  decided_by uuid REFERENCES identity.members (id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposals_story ON meetups.proposals (origin_story_id);

CREATE TABLE meetups.votes (
  proposal_id uuid NOT NULL REFERENCES meetups.proposals (id),
  member_id uuid NOT NULL REFERENCES identity.members (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, member_id)
);

CREATE TABLE meetups.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid UNIQUE REFERENCES meetups.proposals (id),
  title text NOT NULL,
  description text NOT NULL,
  scheduled_start timestamptz NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  state text NOT NULL CHECK (state IN ('draft', 'scheduled', 'completed', 'documented', 'cancelled')),
  organizer_id uuid NOT NULL REFERENCES identity.members (id),
  responsible_id uuid NOT NULL REFERENCES identity.members (id),
  teams_url text,
  summary text,
  conclusions text,
  revision int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', title), 'A')
      || setweight(to_tsvector('portuguese', description || ' ' || coalesce(summary, '') || ' ' || coalesce(conclusions, '')), 'B')
  ) STORED
);
CREATE INDEX sessions_start ON meetups.sessions (scheduled_start);
CREATE INDEX sessions_search ON meetups.sessions USING gin (search);

CREATE TABLE meetups.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES meetups.sessions (id),
  kind text NOT NULL CHECK (kind IN ('slides', 'document', 'recording', 'link')),
  title text NOT NULL,
  url text NOT NULL,
  author_id uuid NOT NULL REFERENCES identity.members (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX artifacts_session ON meetups.artifacts (session_id);

-- Knowledge: human insight ≠ story ≠ comment. Links are typed and validated by the service.
CREATE TABLE knowledge.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES identity.members (id),
  title text NOT NULL,
  hypothesis text NOT NULL,
  context text,
  applicability text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'reviewing', 'accepted', 'dismissed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', title), 'A')
      || setweight(to_tsvector('portuguese', hypothesis || ' ' || coalesce(context, '') || ' ' || coalesce(applicability, '')), 'B')
  ) STORED
);
CREATE INDEX insights_search ON knowledge.insights USING gin (search);

CREATE TABLE knowledge.links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type text NOT NULL CHECK (from_type IN ('insight')),
  from_id uuid NOT NULL,
  to_type text NOT NULL CHECK (to_type IN ('story', 'meetup', 'proposal', 'insight')),
  to_id uuid NOT NULL,
  relation text NOT NULL CHECK (relation IN ('inspired_by', 'discussed_in', 'evidence', 'related')),
  created_by uuid NOT NULL REFERENCES identity.members (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_type, from_id, to_type, to_id, relation)
);
CREATE INDEX links_to ON knowledge.links (to_type, to_id);

-- Administration & Audit.
CREATE TABLE ops.audit (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES identity.members (id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  request_id text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_target ON ops.audit (target_type, target_id, at);

-- Transactional outbox: written in the same transaction as the business change. Consumers (notifications, search
-- indexer) arrive with Phase 2; until then events accumulate with dispatched_at NULL.
CREATE TABLE ops.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  version int NOT NULL DEFAULT 1,
  aggregate_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text,
  actor_type text NOT NULL CHECK (actor_type IN ('member', 'system')),
  payload jsonb NOT NULL DEFAULT '{}',
  dispatched_at timestamptz
);
CREATE INDEX outbox_pending ON ops.outbox (occurred_at) WHERE dispatched_at IS NULL;
