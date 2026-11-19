-- ============================================================================
-- 1001 No contact details in free-text profile fields (about, profession, …).
-- Same filter as chat: protects members' safety and the Premium plan.
-- Staff and trusted functions are exempt (the bureau may write anything).
-- ============================================================================
create function private.profiles_text_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or private.is_staff() or coalesce(current_setting('app.trusted', true), '') = 'on' then
    return new;
  end if;
  if private.contains_contact_info(concat_ws(' | ', new.first_name, new.about, new.family_about, new.degree_title,
       new.institution, new.profession, new.father_occupation, new.mother_occupation, new.house_size)) then
    raise exception 'contact_info_in_profile' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger profiles_text_guard before insert or update on public.profiles
  for each row execute function private.profiles_text_guard();

create function private.preferences_text_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not private.is_staff() and private.contains_contact_info(new.notes) then
    raise exception 'contact_info_in_profile' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger preferences_text_guard before insert or update on public.partner_preferences
  for each row execute function private.preferences_text_guard();

grant execute on function private.profiles_text_guard(), private.preferences_text_guard() to authenticated;
