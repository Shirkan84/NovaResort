-- Session System Data Integrity Audit Queries
-- Run these to verify data consistency across the session system.

-- ============================================================
-- 1. Sessions with invalid status values
-- ============================================================
-- Expected: draft, published, live, completed, cancelled
select id, title, status, created_at
from public.sessions
where status not in ('draft','published','live','completed','cancelled');

-- ============================================================
-- 2. Sessions without a host profile
-- ============================================================
select s.id, s.title, s.host_id
from public.sessions s
left join public.profiles p on p.id = s.host_id
where p.id is null;

-- ============================================================
-- 3. Session registrations for non-existent sessions
-- ============================================================
select sr.id, sr.session_id, sr.user_id, sr.status
from public.session_registrations sr
left join public.sessions s on s.id = sr.session_id
where s.id is null;

-- ============================================================
-- 4. Duplicate registrations (same user, same session, both active)
-- ============================================================
select session_id, user_id, count(*) as cnt
from public.session_registrations
where status in ('registered','waitlisted')
group by session_id, user_id
having count(*) > 1;

-- ============================================================
-- 5. Registrations exceeding session capacity
-- ============================================================
select s.id, s.title, s.capacity,
  (select count(*) from public.session_registrations sr
   where sr.session_id = s.id and sr.status = 'registered') as registered_count
from public.sessions s
where s.status not in ('cancelled','draft')
  and (select count(*) from public.session_registrations sr
       where sr.session_id = s.id and sr.status = 'registered') > s.capacity;

-- ============================================================
-- 6. Room state for non-existent sessions
-- ============================================================
select rs.session_id, rs.status
from public.session_room_state rs
left join public.sessions s on s.id = rs.session_id
where s.id is null;

-- ============================================================
-- 7. Sessions marked live but room state is not live
-- ============================================================
select s.id, s.title, s.status as session_status, rs.status as room_status
from public.sessions s
left join public.session_room_state rs on rs.session_id = s.id
where s.status = 'live' and (rs.status is null or rs.status != 'live');

-- ============================================================
-- 8. Room participants for non-existent sessions
-- ============================================================
select rp.session_id, rp.user_id
from public.session_room_participants rp
left join public.sessions s on s.id = rp.session_id
where s.id is null;

-- ============================================================
-- 9. Active room participants (no left_at) for ended sessions
-- ============================================================
select rp.session_id, rp.user_id, rp.joined_at, rs.status as room_status
from public.session_room_participants rp
join public.session_room_state rs on rs.session_id = rp.session_id
where rp.left_at is null and rs.status in ('ended','closed');

-- ============================================================
-- 10. Chat messages for non-existent sessions
-- ============================================================
select cm.id, cm.session_id
from public.session_chat_messages cm
left join public.sessions s on s.id = cm.session_id
where s.id is null;

-- ============================================================
-- 11. Session reminders that reference non-existent sessions
-- ============================================================
select rem.id, rem.session_id
from public.session_reminders rem
left join public.sessions s on s.id = rem.session_id
where s.id is null;

-- ============================================================
-- 12. Attendance records for non-existent sessions
-- ============================================================
select sa.id, sa.session_id, sa.user_id
from public.session_attendance sa
left join public.sessions s on s.id = sa.session_id
where s.id is null;

-- ============================================================
-- 13. Attendance records with left_at before joined_at
-- ============================================================
select id, session_id, user_id, joined_at, left_at
from public.session_attendance
where left_at is not null and left_at < joined_at;

-- ============================================================
-- 14. Session reviews for non-existent sessions
-- ============================================================
select sr.id, sr.session_id, sr.user_id
from public.session_reviews sr
left join public.sessions s on s.id = sr.session_id
where s.id is null;

-- ============================================================
-- 15. Session reviews with invalid ratings
-- ============================================================
select id, session_id, user_id, rating
from public.session_reviews
where rating < 1 or rating > 5;

-- ============================================================
-- 16. Sessions with starts_at in the past but status = 'published'
-- (should be 'live' or 'completed')
-- ============================================================
select id, title, status, starts_at, ends_at
from public.sessions
where status = 'published'
  and ends_at < now();

-- ============================================================
-- 17. Sessions with status = 'live' but ends_at in the past
-- (should have been ended/completed)
-- ============================================================
select id, title, status, starts_at, ends_at
from public.sessions
where status = 'live'
  and ends_at < now();

-- ============================================================
-- 18. Waitlisted registrations that should have been promoted
-- (session has capacity, user is still waitlisted)
-- ============================================================
select sr.session_id, sr.user_id, sr.status, s.capacity,
  (select count(*) from public.session_registrations sr2
   where sr2.session_id = sr.session_id and sr2.status = 'registered') as reg_count
from public.session_registrations sr
join public.sessions s on s.id = sr.session_id
where sr.status = 'waitlisted'
  and (select count(*) from public.session_registrations sr2
       where sr2.session_id = sr.session_id and sr2.status = 'registered') < s.capacity;

-- ============================================================
-- 19. Orphaned room state (room opened but no participants ever joined)
-- ============================================================
select rs.session_id, rs.status, rs.started_at
from public.session_room_state rs
left join public.session_room_participants rp on rp.session_id = rs.session_id
where rp.id is null and rs.status = 'live';

-- ============================================================
-- 20. Summary: Session counts by status
-- ============================================================
select status, count(*) as cnt
from public.sessions
group by status
order by cnt desc;
