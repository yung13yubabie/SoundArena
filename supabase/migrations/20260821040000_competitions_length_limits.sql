alter table competitions
  add constraint competitions_name_length check (char_length(name) <= 200),
  add constraint competitions_description_length check (description is null or char_length(description) <= 4000);
