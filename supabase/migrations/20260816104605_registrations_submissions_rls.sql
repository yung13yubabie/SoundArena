-- Wiring the real 報名 → 投稿 flow. registrations/submissions were RLS-enabled
-- with zero policies (service_role only) since the identity/anonymity rules
-- needed their own pass — see init_schema.sql's header. That pass is this one,
-- scoped to what registration + submission + organizer review actually need:
-- the submitter sees their own rows, the competition's organizer sees/manages
-- everything under their own competition. Judge-side anonymity (評審不應看到
-- 投稿者真實身份) is a separate concern for /judge, not touched here.

alter table registrations add column display_name text not null default '';
alter table registrations alter column display_name drop default;

create policy "registrations insertable by self" on registrations for insert with check (auth.uid() = user_id);
create policy "registrations readable by self" on registrations for select using (auth.uid() = user_id);
create policy "registrations readable by competition organizer" on registrations for select using (
  exists (select 1 from competitions c where c.id = registrations.competition_id and c.organizer_id = auth.uid())
);
create policy "registrations updatable by competition organizer" on registrations for update using (
  exists (select 1 from competitions c where c.id = registrations.competition_id and c.organizer_id = auth.uid())
);

create policy "submissions insertable by the registrant" on submissions for insert with check (
  exists (select 1 from registrations r where r.id = submissions.registration_id and r.user_id = auth.uid())
);
create policy "submissions readable by the registrant" on submissions for select using (
  exists (select 1 from registrations r where r.id = submissions.registration_id and r.user_id = auth.uid())
);
create policy "submissions readable by competition organizer" on submissions for select using (
  exists (
    select 1 from rounds rd join competitions c on c.id = rd.competition_id
    where rd.id = submissions.round_id and c.organizer_id = auth.uid()
  )
);
create policy "submissions updatable by competition organizer" on submissions for update using (
  exists (
    select 1 from rounds rd join competitions c on c.id = rd.competition_id
    where rd.id = submissions.round_id and c.organizer_id = auth.uid()
  )
);
