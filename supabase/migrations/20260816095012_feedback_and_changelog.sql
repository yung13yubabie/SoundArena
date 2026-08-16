-- Feedback (platform-wide, not tied to a competition — distinct from `reports`,
-- which is a complaint against a specific competition) and a public changelog.
-- Neither is part of CONTEXT.md's domain model; both were requested directly.

create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Any logged-in user can submit feedback about themselves; nobody can read
-- it back through the API — reviewed via the Supabase dashboard/service_role.
create policy "feedback insertable by the author"
  on feedback for insert
  with check (auth.uid() = user_id);

create table changelog_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  published_at date not null,
  created_at timestamptz not null default now()
);

alter table changelog_entries enable row level security;

-- Public changelog: anyone can read, only service_role can write (curated by us).
create policy "changelog readable by everyone"
  on changelog_entries for select
  using (true);

create index idx_changelog_published_at on changelog_entries(published_at desc);
