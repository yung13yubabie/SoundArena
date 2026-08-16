-- Discovery lists public competitions with "由 OO 主辦" — needs to read the
-- organizer's profile via the competitions(organizer_id) embed. profiles'
-- existing policies (self, platform admin) don't cover this. Scope it
-- narrowly: readable only if the profile organizes at least one public
-- competition — not a blanket "any authenticated user can read any profile".
create policy "profiles readable when organizing a public competition" on profiles for select using (
  exists (select 1 from competitions c where c.organizer_id = profiles.id and c.is_public)
);
