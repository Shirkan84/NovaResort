-- Healer registration applications, private document storage, and approval-only privileges.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists professional_title text;
alter table public.profiles add column if not exists professional_verification_status text not null default 'unverified';
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists professional_website text;
alter table public.profiles add column if not exists linkedin_url text;

alter table public.profiles drop constraint if exists profiles_professional_verification_status_check;
alter table public.profiles add constraint profiles_professional_verification_status_check check (
  professional_verification_status in ('unverified','pending','approved','rejected','more_info_requested')
);

create table if not exists public.healer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','more_info_requested')),
  professional_title text not null,
  specialties text[] not null default '{}',
  biography text not null check (char_length(biography) between 20 and 2000),
  education jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  document_names text[] not null default '{}',
  years_experience integer not null check (years_experience >= 0),
  languages text[] not null default '{}',
  country text not null,
  city text,
  professional_website text,
  linkedin_url text,
  professional_license jsonb not null default '{}'::jsonb,
  insurance_accepted text[] not null default '{}',
  session_availability text not null check (session_availability in ('online','in_person','both')),
  session_types text[] not null default '{}',
  admin_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.healer_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.healer_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_at timestamptz not null default now()
);

alter table public.healer_applications enable row level security;
alter table public.healer_application_documents enable row level security;

create index if not exists healer_applications_status_idx on public.healer_applications(status, created_at desc);
create index if not exists healer_application_documents_user_idx on public.healer_application_documents(user_id, uploaded_at desc);

create or replace function public.current_account_type()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.profile_type from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function public.current_verification_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.professional_verification_status from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.profile_type = 'admin'
      and coalesce(p.account_status, 'active') = 'active'
  )
$$;

create or replace function public.is_approved_professional(check_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user
      and p.account_status = 'active'
      and p.professional_verification_status = 'approved'
      and p.profile_type in ('healer','therapist','coach','mindfulness_teacher','wellness_professional','community_facilitator','admin')
  )
$$;

revoke all on function public.current_account_type() from public;
revoke all on function public.current_verification_status() from public;
revoke all on function public.current_user_is_admin() from public;
revoke all on function public.is_approved_professional(uuid) from public;
grant execute on function public.current_account_type() to authenticated;
grant execute on function public.current_verification_status() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.is_approved_professional(uuid) to authenticated;

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and profile_type = public.current_account_type()
  and professional_verification_status = public.current_verification_status()
  and coalesce(account_status, 'active') = 'active'
);

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "healers view own applications" on public.healer_applications;
create policy "healers view own applications" on public.healer_applications
for select to authenticated
using (user_id = (select auth.uid()) or public.current_user_is_admin());

drop policy if exists "healers update pending applications" on public.healer_applications;
create policy "healers update pending applications" on public.healer_applications
for update to authenticated
using (user_id = (select auth.uid()) and status in ('pending','more_info_requested'))
with check (user_id = (select auth.uid()) and status in ('pending','more_info_requested'));

drop policy if exists "admins review healer applications" on public.healer_applications;
create policy "admins review healer applications" on public.healer_applications
for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "healers view own application documents" on public.healer_application_documents;
create policy "healers view own application documents" on public.healer_application_documents
for select to authenticated
using (user_id = (select auth.uid()) or public.current_user_is_admin());

drop policy if exists "healers add own application documents" on public.healer_application_documents;
create policy "healers add own application documents" on public.healer_application_documents
for insert to authenticated
with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('healer-documents', 'healer-documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "healers upload own verification documents" on storage.objects;
create policy "healers upload own verification documents"
on storage.objects for insert to authenticated
with check (bucket_id = 'healer-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "healers view own verification documents" on storage.objects;
create policy "healers view own verification documents"
on storage.objects for select to authenticated
using (bucket_id = 'healer-documents' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.current_user_is_admin()));

drop policy if exists "admins manage verification documents" on storage.objects;
create policy "admins manage verification documents"
on storage.objects for update to authenticated
using (bucket_id = 'healer-documents' and public.current_user_is_admin())
with check (bucket_id = 'healer-documents' and public.current_user_is_admin());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  application jsonb := coalesce(new.raw_user_meta_data->'healer_application','{}'::jsonb);
  wants_healer boolean := coalesce(new.raw_user_meta_data->>'requested_profile_type', new.raw_user_meta_data->>'profile_type') = 'healer';
begin
  insert into public.profiles (
    id, full_name, display_name, country, city, profile_type, professional_title,
    professional_verification_status, about, specialties, years_experience, languages,
    professional_website, linkedin_url
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),
    coalesce(application->>'country', new.raw_user_meta_data->>'country'),
    nullif(application->>'city',''),
    'member',
    nullif(application->>'professional_title',''),
    case when wants_healer then 'pending' else 'unverified' end,
    case when wants_healer then coalesce(application->>'biography','') else '' end,
    coalesce(array(select jsonb_array_elements_text(application->'specialties')), '{}'::text[]),
    nullif(application->>'years_experience','')::integer,
    coalesce(array(select jsonb_array_elements_text(application->'languages')), '{}'::text[]),
    nullif(application->>'website',''),
    nullif(application->>'linkedin','')
  ) on conflict (id) do nothing;

  if wants_healer then
    insert into public.healer_applications (
      user_id, status, professional_title, specialties, biography, education, certifications,
      document_names, years_experience, languages, country, city, professional_website,
      linkedin_url, professional_license, insurance_accepted, session_availability, session_types
    )
    values (
      new.id,
      'pending',
      coalesce(application->>'professional_title','Pending title'),
      coalesce(array(select jsonb_array_elements_text(application->'specialties')), '{}'::text[]),
      coalesce(application->>'biography','Pending biography'),
      coalesce(application->'education','[]'::jsonb),
      coalesce(application->'certifications','[]'::jsonb),
      coalesce(array(select jsonb_array_elements_text(application->'document_names')), '{}'::text[]),
      coalesce(nullif(application->>'years_experience','')::integer,0),
      coalesce(array(select jsonb_array_elements_text(application->'languages')), '{}'::text[]),
      coalesce(application->>'country', new.raw_user_meta_data->>'country',''),
      nullif(application->>'city',''),
      nullif(application->>'website',''),
      nullif(application->>'linkedin',''),
      coalesce(application->'professional_license','{}'::jsonb),
      coalesce(array(select jsonb_array_elements_text(application->'insurance_accepted')), '{}'::text[]),
      coalesce(nullif(application->>'session_availability',''),'online'),
      coalesce(array(select jsonb_array_elements_text(application->'session_types')), '{}'::text[])
    )
    on conflict (user_id) do update set
      status = 'pending',
      professional_title = excluded.professional_title,
      specialties = excluded.specialties,
      biography = excluded.biography,
      education = excluded.education,
      certifications = excluded.certifications,
      document_names = excluded.document_names,
      years_experience = excluded.years_experience,
      languages = excluded.languages,
      country = excluded.country,
      city = excluded.city,
      professional_website = excluded.professional_website,
      linkedin_url = excluded.linkedin_url,
      professional_license = excluded.professional_license,
      insurance_accepted = excluded.insurance_accepted,
      session_availability = excluded.session_availability,
      session_types = excluded.session_types,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop policy if exists "users create own sessions" on public.sessions;
create policy "users create own sessions" on public.sessions
for insert to authenticated
with check (host_id = (select auth.uid()) and starts_at > now() and public.is_approved_professional((select auth.uid())));

drop policy if exists "hosts update own sessions" on public.sessions;
create policy "hosts update own sessions" on public.sessions
for update to authenticated
using (host_id = (select auth.uid()) and public.is_approved_professional((select auth.uid())))
with check (host_id = (select auth.uid()) and public.is_approved_professional((select auth.uid())));

drop policy if exists "public sessions are visible" on public.sessions;
create policy "public sessions are visible" on public.sessions
for select to authenticated
using (visibility = 'public' or host_id = (select auth.uid()));

drop policy if exists "participants view own registrations" on public.session_registrations;
create policy "participants view own registrations" on public.session_registrations
for select to authenticated
using (user_id = (select auth.uid()));
