revoke execute on function public.list_public_rooms() from anon;
revoke execute on function public.send_connection_request(uuid) from anon;
revoke execute on function public.respond_connection_request(uuid,text) from anon;
revoke execute on function public.cancel_connection_request(uuid) from anon;
revoke execute on function public.remove_connection(uuid) from anon;
revoke execute on function public.block_member(uuid) from anon;
revoke execute on function public.register_for_session(uuid) from anon;
revoke execute on function public.cancel_session_registration(uuid) from anon;

grant execute on function public.list_public_rooms() to authenticated;
grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid,text) to authenticated;
grant execute on function public.cancel_connection_request(uuid) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
grant execute on function public.block_member(uuid) to authenticated;
grant execute on function public.register_for_session(uuid) to authenticated;
grant execute on function public.cancel_session_registration(uuid) to authenticated;
