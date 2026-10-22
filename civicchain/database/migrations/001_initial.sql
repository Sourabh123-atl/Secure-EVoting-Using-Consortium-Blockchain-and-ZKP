-- Proposed PostgreSQL schema for the next implementation stage.
-- The current runtime uses a local JSON file; this schema is not wired to server.js.

CREATE TYPE account_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
CREATE TYPE eligibility_status AS ENUM ('NOT_APPLIED', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED');
CREATE TYPE election_status AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'TALLY_PENDING', 'TALLY_EVIDENCE_RECORDED', 'RESULTS_PUBLISHED', 'ARCHIVED', 'CANCELLED');
CREATE TYPE ballot_status AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'CONFIRMED', 'REJECTED', 'FAILED', 'UNVERIFIABLE');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status account_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE roles (
  id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE voter_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  eligibility_status eligibility_status NOT NULL DEFAULT 'NOT_APPLIED',
  minimum_required_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_election_id NUMERIC(78,0) UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  purpose TEXT NOT NULL,
  constituency TEXT NOT NULL,
  status election_status NOT NULL DEFAULT 'DRAFT',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  configuration_commitment BYTEA,
  chain_id BIGINT,
  registry_address TEXT,
  voting_contract_address TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  fixture BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE TABLE election_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL,
  option_commitment BYTEA,
  UNIQUE (election_id, display_order),
  UNIQUE (election_id, id)
);

CREATE TABLE eligibility_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  election_id UUID REFERENCES elections(id) ON DELETE RESTRICT,
  status eligibility_status NOT NULL DEFAULT 'PENDING',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE eligibility_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_reference TEXT NOT NULL UNIQUE,
  user_mapping_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  eligibility_group TEXT NOT NULL,
  commitment_field TEXT NOT NULL,
  issuance_status TEXT NOT NULL,
  issued_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE eligibility_roots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
  root_value NUMERIC(78,0) NOT NULL,
  root_version BIGINT NOT NULL,
  status TEXT NOT NULL,
  transaction_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (election_id, root_version)
);

CREATE TABLE ballot_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference TEXT NOT NULL UNIQUE,
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
  ciphertext_reference TEXT,
  ballot_commitment TEXT NOT NULL,
  transaction_hash TEXT,
  inclusion_block BIGINT,
  status ballot_status NOT NULL DEFAULT 'PENDING',
  protocol_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deliberately no user_id or plaintext selection on ballot_submissions. If operational
-- abuse protection needs a separate linkage, isolate it, minimize retention, and threat-model it.
CREATE INDEX ballot_submissions_election_status_idx ON ballot_submissions(election_id, status);
CREATE INDEX ballot_submissions_tx_hash_idx ON ballot_submissions(transaction_hash) WHERE transaction_hash IS NOT NULL;

CREATE TABLE blockchain_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_hash TEXT NOT NULL UNIQUE,
  chain_id BIGINT NOT NULL,
  contract_address TEXT,
  transaction_type TEXT NOT NULL,
  submission_reference TEXT,
  status ballot_status NOT NULL DEFAULT 'PENDING',
  block_number BIGINT,
  finality_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tally_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
  tally_commitment TEXT NOT NULL,
  artifact_commitment TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIABLE',
  artifact_reference TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE (election_id, tally_commitment)
);

CREATE TABLE audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_reference TEXT,
  outcome TEXT NOT NULL,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrity_reference TEXT,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_happened_at_idx ON audit_events(happened_at DESC);

-- Do not add private credential secrets, raw proof witnesses, private keys, tally shares,
-- session tokens or plaintext vote selections to these tables.
