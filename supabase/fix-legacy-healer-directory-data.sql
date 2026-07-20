-- Repair legacy healer registrations that predate the administrator approval flow.
-- This does not approve new pending applicants. It only upgrades users whose auth metadata
-- explicitly shows they selected healer before profiles stored approved professional status.

update public.profiles p
set
  profile_type = 'healer',
  professional_verification_status = 'approved',
  account_status = 'active',
  discoverable = true,
  visibility = case when p.visibility = 'private' then 'community' else p.visibility end,
  updated_at = now()
from auth.users u
where u.id = p.id
  and u.raw_user_meta_data->>'profile_type' = 'healer'
  and coalesce(u.raw_user_meta_data->>'requested_profile_type','') = ''
  and p.profile_type = 'member'
  and p.professional_verification_status in ('unverified','pending');
