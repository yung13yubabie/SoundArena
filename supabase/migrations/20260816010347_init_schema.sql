-- SoundArena initial schema
-- Source of truth for entities: CONTEXT.md. Rules referenced: SPEC.md sections 0-9.
--
-- Scope notes (things intentionally NOT done here, so nobody assumes they are):
--   * SchedulePhase (CONTEXT.md) is not a separate table. Registration window lives on
--     competitions; submission/voting windows live per-round on rounds, per SPEC.md
--     "通常對應到 Round 的起訖日期". Revisit if a standalone 宣傳/公布 phase needs real data.
--   * Notification system (SPEC.md 第6節) has no table yet — CONTEXT.md doesn't define it
--     as a domain entity, and it wasn't asked for in this pass.
--   * FormatTemplate rows (賽制範本, e.g. "雙敗淘汰範本") are NOT seeded — SPEC.md names
--     them as examples only, doesn't give exact compositions. Table exists, empty.
--   * RLS: enabled on every table. Only the low-risk, unambiguous cases have policies
--     (public catalogs, own profile, organizer-owns-their-competition). Tables holding
--     participant identity / vote / review data (registrations, submissions, votes,
--     submission_scores, reports) are RLS-enabled with NO policies yet — reachable only
--     via the service_role key from backend code. Needs a dedicated pass once the
--     participant/voter/reviewer access rules (anonymity mode, "評審不應看到投稿者真實
--     身份") are being implemented, since guessing those wrong is worse than deferring.

-- ============================================================================
-- Enums
-- ============================================================================

create type anonymity_mode as enum ('full_anonymous_until_final', 'per_round_anonymous', 'fully_public');
create type participant_status as enum ('active', 'eliminated');
create type submission_status as enum (
  'draft', 'identity_checking', 'identity_matched', 'identity_mismatched',
  'pending_review', 'approved', 'rejected'
);
create type score_item_kind as enum ('weighted', 'bonus');
create type format_block_category as enum ('elimination', 'grouping', 'special');
create type report_status as enum ('pending', 'resolved', 'dismissed');

-- ============================================================================
-- Helpers
-- ============================================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- profiles (extends auth.users)
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  line_user_id text,
  discord_user_id text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Catalogs: FormatBlock / ScoreItem templates / FormatTemplate
-- ============================================================================

create table format_blocks (
  id uuid primary key default gen_random_uuid(),
  category format_block_category not null,
  key text not null unique,
  label text not null,
  description text
);

insert into format_blocks (category, key, label) values
  ('elimination', 'single_elimination', '單敗淘汰'),
  ('elimination', 'double_elimination', '雙敗淘汰(含敗部復活)'),
  ('elimination', 'round_robin', '循環賽'),
  ('elimination', 'periodic_accumulation', '月度/週期累積制'),
  ('grouping', 'individual', '個人賽'),
  ('grouping', 'team', '隊伍賽'),
  ('grouping', 'lottery', '抽籤分組'),
  ('special', 'wildcard_revival', '敗部復活戰'),
  ('special', 'themed_round', '限定主題輪'),
  ('special', 'mentor_system', '業界導師制');

create table score_item_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  default_kind score_item_kind not null
);

insert into score_item_templates (key, label, default_kind) values
  ('vote', '投票', 'weighted'),
  ('external_vote', '外部投票', 'weighted'),
  ('video_traffic', '影片流量', 'weighted'),
  ('keyword_match', '關鍵字/主題符合加分', 'weighted'),
  ('manual_bonus', '魔王加給', 'bonus');

create table format_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table format_template_blocks (
  id uuid primary key default gen_random_uuid(),
  format_template_id uuid not null references format_templates(id) on delete cascade,
  format_block_id uuid not null references format_blocks(id) on delete restrict,
  default_config jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  unique (format_template_id, format_block_id)
);

-- ============================================================================
-- competitions / rounds
-- ============================================================================

create table competitions (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references profiles(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text,
  anonymity_mode anonymity_mode not null default 'per_round_anonymous',
  is_public boolean not null default false,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_window_valid check (
    registration_opens_at is null or registration_closes_at is null
    or registration_opens_at < registration_closes_at
  )
);

create trigger competitions_set_updated_at before update on competitions
  for each row execute function set_updated_at();

create table rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  round_index int not null,
  name text not null,
  allows_new_submissions boolean not null default true,
  submission_opens_at timestamptz,
  submission_closes_at timestamptz,
  voting_opens_at timestamptz,
  voting_closes_at timestamptz,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, round_index),
  constraint round_index_positive check (round_index >= 1),
  constraint submission_window_valid check (
    submission_opens_at is null or submission_closes_at is null or submission_opens_at < submission_closes_at
  ),
  constraint voting_window_valid check (
    voting_opens_at is null or voting_closes_at is null or voting_opens_at < voting_closes_at
  )
);

create trigger rounds_set_updated_at before update on rounds
  for each row execute function set_updated_at();

-- ============================================================================
-- ScoringRule / ScoreItem
-- A scoring_rules row with round_id = null is the Competition's default;
-- one with round_id set is that Round's ScoringRuleOverride.
-- ============================================================================

create table scoring_rules (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  round_id uuid references rounds(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger scoring_rules_set_updated_at before update on scoring_rules
  for each row execute function set_updated_at();

create unique index scoring_rules_one_default_per_competition
  on scoring_rules (competition_id) where round_id is null;

create unique index scoring_rules_one_per_round
  on scoring_rules (round_id) where round_id is not null;

create or replace function check_scoring_rule_round_competition()
returns trigger language plpgsql as $$
begin
  if new.round_id is not null and not exists (
    select 1 from rounds r where r.id = new.round_id and r.competition_id = new.competition_id
  ) then
    raise exception 'scoring_rules.round_id must belong to scoring_rules.competition_id';
  end if;
  return new;
end;
$$;

create trigger scoring_rules_check_round_competition
  before insert or update on scoring_rules
  for each row execute function check_scoring_rule_round_competition();

create table score_items (
  id uuid primary key default gen_random_uuid(),
  scoring_rule_id uuid not null references scoring_rules(id) on delete cascade,
  template_id uuid references score_item_templates(id) on delete restrict,
  label text not null,
  kind score_item_kind not null,
  weight_percent numeric(5, 2),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint weight_percent_matches_kind check (
    (kind = 'weighted' and weight_percent is not null and weight_percent >= 0)
    or (kind = 'bonus' and weight_percent is null)
  )
);

-- Hard rule (SPEC.md 第8節): weighted score_items in a scoring_rule must sum to 100%.
-- Deferred so an organizer can add/edit items one at a time within one transaction;
-- only the state at COMMIT is validated.
create or replace function check_scoring_rule_weight_sum()
returns trigger language plpgsql as $$
declare
  affected_rule_id uuid;
  weighted_total numeric;
  weighted_count int;
begin
  affected_rule_id := coalesce(new.scoring_rule_id, old.scoring_rule_id);

  select count(*), coalesce(sum(weight_percent), 0)
    into weighted_count, weighted_total
  from score_items
  where scoring_rule_id = affected_rule_id and kind = 'weighted';

  if weighted_count > 0 and weighted_total <> 100.00 then
    raise exception 'scoring_rule %: weighted score_items must sum to 100%% (got %)',
      affected_rule_id, weighted_total;
  end if;

  return null;
end;
$$;

create constraint trigger score_items_weight_sum_check
  after insert or update or delete on score_items
  deferrable initially deferred
  for each row execute function check_scoring_rule_weight_sum();

create table round_format_blocks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  format_block_id uuid not null references format_blocks(id) on delete restrict,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (round_id, format_block_id)
);

-- ============================================================================
-- Registration / Participant / Submission
-- ============================================================================

create table registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  suno_handle text not null,
  status participant_status not null default 'active',
  eliminated_in_round_id uuid references rounds(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, user_id)
);

create trigger registrations_set_updated_at before update on registrations
  for each row execute function set_updated_at();

create table submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  suno_share_url text not null,
  title text,
  cover_image_url text,
  sharer_handle text,
  lyrics text,
  audio_object_key text,
  allow_public_playback boolean not null default false,
  status submission_status not null default 'draft',
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, registration_id)
);

create trigger submissions_set_updated_at before update on submissions
  for each row execute function set_updated_at();

create or replace function check_submission_round_registration_competition()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1
    from rounds r
    join registrations reg on reg.id = new.registration_id
    where r.id = new.round_id and r.competition_id = reg.competition_id
  ) then
    raise exception 'submissions.round_id and registration_id must belong to the same competition';
  end if;
  return new;
end;
$$;

create trigger submissions_check_round_registration
  before insert or update on submissions
  for each row execute function check_submission_round_registration_competition();

-- ============================================================================
-- Votes / SubmissionScores (backs the ScoreItem template-library values)
-- ============================================================================

create table votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  submission_id uuid not null references submissions(id) on delete cascade,
  voter_id uuid not null references profiles(id) on delete cascade,
  voter_ip inet not null,
  created_at timestamptz not null default now(),
  unique (round_id, voter_id),
  unique (round_id, voter_ip)
);

create or replace function check_vote_validity()
returns trigger language plpgsql as $$
declare
  submission_round uuid;
  submission_owner uuid;
begin
  select s.round_id, reg.user_id
    into submission_round, submission_owner
  from submissions s
  join registrations reg on reg.id = s.registration_id
  where s.id = new.submission_id;

  if submission_round is null then
    raise exception 'submission % not found', new.submission_id;
  end if;

  if submission_round <> new.round_id then
    raise exception 'votes.round_id must match the submission''s round_id';
  end if;

  if submission_owner = new.voter_id then
    raise exception 'cannot vote for your own submission';
  end if;

  return new;
end;
$$;

create trigger votes_check_validity
  before insert on votes
  for each row execute function check_vote_validity();

create table submission_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  score_item_id uuid not null references score_items(id) on delete cascade,
  raw_value numeric not null default 0,
  entered_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, score_item_id)
);

create trigger submission_scores_set_updated_at before update on submission_scores
  for each row execute function set_updated_at();

-- ============================================================================
-- Report
-- ============================================================================

create table reports (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  status report_status not null default 'pending',
  handled_by uuid references profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index idx_competitions_organizer on competitions(organizer_id);
create index idx_competitions_is_public on competitions(is_public) where is_public = true;
create index idx_rounds_competition on rounds(competition_id);
create index idx_registrations_competition on registrations(competition_id);
create index idx_registrations_user on registrations(user_id);
create index idx_submissions_round on submissions(round_id);
create index idx_submissions_status on submissions(status);
create index idx_votes_submission on votes(submission_id);
create index idx_submission_scores_submission on submission_scores(submission_id);
create index idx_reports_competition on reports(competition_id);
create index idx_reports_status on reports(status);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table profiles enable row level security;
alter table format_blocks enable row level security;
alter table score_item_templates enable row level security;
alter table format_templates enable row level security;
alter table format_template_blocks enable row level security;
alter table competitions enable row level security;
alter table rounds enable row level security;
alter table scoring_rules enable row level security;
alter table score_items enable row level security;
alter table round_format_blocks enable row level security;
alter table registrations enable row level security;
alter table submissions enable row level security;
alter table votes enable row level security;
alter table submission_scores enable row level security;
alter table reports enable row level security;

-- Catalogs: public read-only (writes are a platform-ops function, no policy yet).
create policy "format_blocks readable by everyone" on format_blocks for select using (true);
create policy "score_item_templates readable by everyone" on score_item_templates for select using (true);
create policy "format_templates readable by everyone" on format_templates for select using (true);
create policy "format_template_blocks readable by everyone" on format_template_blocks for select using (true);

-- profiles: self, plus platform admins can read everyone.
create policy "profiles readable by self" on profiles for select using (auth.uid() = id);
create policy "profiles readable by platform admins" on profiles for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin)
);
create policy "profiles updatable by self" on profiles for update using (auth.uid() = id);

-- competitions: public listing (Discovery), organizer owns their own, platform admins see all.
create policy "public competitions readable by everyone" on competitions for select using (is_public = true);
create policy "own competitions readable by organizer" on competitions for select using (auth.uid() = organizer_id);
create policy "competitions readable by platform admins" on competitions for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin)
);
create policy "competitions insertable by organizer" on competitions for insert with check (auth.uid() = organizer_id);
create policy "competitions updatable by organizer" on competitions for update using (auth.uid() = organizer_id);

-- rounds / scoring_rules / score_items / round_format_blocks: visibility mirrors the
-- parent competition (SPEC.md 第8節 requires the scoring formula to be public); writes
-- are restricted to that competition's organizer.
create policy "rounds readable when competition readable" on rounds for select using (
  exists (
    select 1 from competitions c
    where c.id = rounds.competition_id
      and (c.is_public or c.organizer_id = auth.uid()
           or exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin))
  )
);
create policy "rounds writable by organizer" on rounds for all using (
  exists (select 1 from competitions c where c.id = rounds.competition_id and c.organizer_id = auth.uid())
) with check (
  exists (select 1 from competitions c where c.id = rounds.competition_id and c.organizer_id = auth.uid())
);

create policy "scoring_rules readable when competition readable" on scoring_rules for select using (
  exists (
    select 1 from competitions c
    where c.id = scoring_rules.competition_id
      and (c.is_public or c.organizer_id = auth.uid()
           or exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin))
  )
);
create policy "scoring_rules writable by organizer" on scoring_rules for all using (
  exists (select 1 from competitions c where c.id = scoring_rules.competition_id and c.organizer_id = auth.uid())
) with check (
  exists (select 1 from competitions c where c.id = scoring_rules.competition_id and c.organizer_id = auth.uid())
);

create policy "score_items readable when scoring_rule readable" on score_items for select using (
  exists (
    select 1 from scoring_rules sr
    join competitions c on c.id = sr.competition_id
    where sr.id = score_items.scoring_rule_id
      and (c.is_public or c.organizer_id = auth.uid()
           or exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin))
  )
);
create policy "score_items writable by organizer" on score_items for all using (
  exists (
    select 1 from scoring_rules sr
    join competitions c on c.id = sr.competition_id
    where sr.id = score_items.scoring_rule_id and c.organizer_id = auth.uid()
  )
) with check (
  exists (
    select 1 from scoring_rules sr
    join competitions c on c.id = sr.competition_id
    where sr.id = score_items.scoring_rule_id and c.organizer_id = auth.uid()
  )
);

create policy "round_format_blocks readable when round readable" on round_format_blocks for select using (
  exists (
    select 1 from rounds r
    join competitions c on c.id = r.competition_id
    where r.id = round_format_blocks.round_id
      and (c.is_public or c.organizer_id = auth.uid()
           or exists (select 1 from profiles p where p.id = auth.uid() and p.is_platform_admin))
  )
);
create policy "round_format_blocks writable by organizer" on round_format_blocks for all using (
  exists (
    select 1 from rounds r
    join competitions c on c.id = r.competition_id
    where r.id = round_format_blocks.round_id and c.organizer_id = auth.uid()
  )
) with check (
  exists (
    select 1 from rounds r
    join competitions c on c.id = r.competition_id
    where r.id = round_format_blocks.round_id and c.organizer_id = auth.uid()
  )
);

-- registrations / submissions / votes / submission_scores / reports: RLS enabled,
-- no policies. Deliberately service_role-only until participant/voter/reviewer access
-- (anonymity mode, identity-hiding for reviewers) is designed — see file header.
