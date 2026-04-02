-- Tornder initial schema

CREATE TABLE players (
  torn_player_id  integer PRIMARY KEY,
  name            text NOT NULL,
  faction_id      integer,
  faction_name    text,
  company_id      integer,
  company_name    text,
  company_role    text,
  is_public       boolean DEFAULT false,
  last_verified   timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE flags (
  torn_player_id  integer PRIMARY KEY REFERENCES players ON DELETE CASCADE,
  -- Marriage (Torn-verified)
  is_single       boolean DEFAULT false,
  seeking_marriage boolean DEFAULT false,
  -- Island (Torn-verified)
  has_island      boolean DEFAULT false,
  island_open     boolean DEFAULT false,
  seeking_island  boolean DEFAULT false,
  -- Company (Torn-verified)
  is_director     boolean DEFAULT false,
  company_hiring  boolean DEFAULT false,
  seeking_job     boolean DEFAULT false,
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE interests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_player_id  integer REFERENCES players,
  to_player_id    integer REFERENCES players,
  category        text CHECK (category IN ('marriage', 'island', 'company')),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (from_player_id, to_player_id, category)
);

CREATE TABLE dismissed (
  from_player_id  integer REFERENCES players,
  to_player_id    integer REFERENCES players,
  category        text CHECK (category IN ('marriage', 'island', 'company')),
  created_at      timestamptz DEFAULT now(),
  PRIMARY KEY (from_player_id, to_player_id, category)
);

-- RLS: disable direct client access, all reads go through Edge Functions
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dismissed ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so Edge Functions using service_role key can still read/write
