-- SchedulePhase (CONTEXT.md) was deliberately not given its own table — 投稿/投票
-- windows already live per-round on `rounds`. 宣傳期/公布期 have no home anywhere
-- though, and the 時程設定 screen needs to persist them. They're competition-wide
-- (not per-round), so they belong on `competitions` alongside registration_*.

alter table competitions
  add column promotion_starts_at timestamptz,
  add column promotion_ends_at timestamptz,
  add column announcement_starts_at timestamptz,
  add column announcement_ends_at timestamptz;
