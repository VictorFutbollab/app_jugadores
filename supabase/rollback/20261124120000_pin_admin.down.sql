-- Deshace supabase/migrations/20261124120000_pin_admin.sql
-- (vuelve a: cuenta admin = administradora en cualquier sesión, sin PIN).
-- No toca ningún dato de jugadores, equipos ni usuarios.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.sesion_activa() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
$$;

drop function if exists public.admin_verificar_pin(text);
drop function if exists public.admin_fijar_pin(text);
drop schema if exists privado cascade;
