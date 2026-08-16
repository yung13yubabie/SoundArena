-- Editing a ScoringRule's weighted items (weight sum must equal 100%) needs
-- delete-removed + update-kept to land in ONE transaction so the deferred
-- constraint trigger on score_items only checks the final state. A PostgREST
-- call per row would each commit — and each fail — independently.
create or replace function replace_score_items(p_scoring_rule_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  keep_ids uuid[];
  item jsonb;
begin
  select array_agg((elem->>'id')::uuid)
    into keep_ids
  from jsonb_array_elements(p_items) elem;

  delete from score_items
  where scoring_rule_id = p_scoring_rule_id
    and (keep_ids is null or id <> all(keep_ids));

  for item in select * from jsonb_array_elements(p_items)
  loop
    update score_items
    set
      label = item ->> 'label',
      kind = (item ->> 'kind')::score_item_kind,
      weight_percent = case
        when item ->> 'weight_percent' is null then null
        else (item ->> 'weight_percent')::numeric
      end
    where id = (item ->> 'id')::uuid
      and scoring_rule_id = p_scoring_rule_id;
  end loop;
end;
$$;

grant execute on function replace_score_items(uuid, jsonb) to authenticated;
