-- Bug: "profiles readable by platform admins" checked is_platform_admin by
-- running `select ... from profiles`, which re-triggers profiles' own RLS
-- policies (including this one) — infinite recursion. Every other policy
-- that copy-pasted the same inline subquery to check platform-admin status
-- (competitions/rounds/scoring_rules/score_items/round_format_blocks) has
-- the identical bug: it queries profiles from inside another table's
-- policy, which still has to evaluate profiles' RLS, including the broken
-- self-referencing policy above. Fix: a SECURITY DEFINER helper that reads
-- profiles bypassing RLS, then repoint every affected policy at it.

create or replace function is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_platform_admin from profiles p where p.id = auth.uid()), false);
$$;

grant execute on function is_platform_admin() to authenticated, anon;

drop policy "profiles readable by platform admins" on profiles;
create policy "profiles readable by platform admins" on profiles for select using (is_platform_admin());

drop policy "competitions readable by platform admins" on competitions;
create policy "competitions readable by platform admins" on competitions for select using (is_platform_admin());

drop policy "rounds readable when competition readable" on rounds;
create policy "rounds readable when competition readable" on rounds for select using (
  exists (
    select 1 from competitions c
    where c.id = rounds.competition_id
      and (c.is_public or c.organizer_id = auth.uid() or is_platform_admin())
  )
);

drop policy "scoring_rules readable when competition readable" on scoring_rules;
create policy "scoring_rules readable when competition readable" on scoring_rules for select using (
  exists (
    select 1 from competitions c
    where c.id = scoring_rules.competition_id
      and (c.is_public or c.organizer_id = auth.uid() or is_platform_admin())
  )
);

drop policy "score_items readable when scoring_rule readable" on score_items;
create policy "score_items readable when scoring_rule readable" on score_items for select using (
  exists (
    select 1 from scoring_rules sr
    join competitions c on c.id = sr.competition_id
    where sr.id = score_items.scoring_rule_id
      and (c.is_public or c.organizer_id = auth.uid() or is_platform_admin())
  )
);

drop policy "round_format_blocks readable when round readable" on round_format_blocks;
create policy "round_format_blocks readable when round readable" on round_format_blocks for select using (
  exists (
    select 1 from rounds r
    join competitions c on c.id = r.competition_id
    where r.id = round_format_blocks.round_id
      and (c.is_public or c.organizer_id = auth.uid() or is_platform_admin())
  )
);
