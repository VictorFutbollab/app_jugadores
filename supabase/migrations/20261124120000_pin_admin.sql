-- ════════════════════════════════════════════════════════════════════════
-- PIN de administración (segundo factor para el panel de admin).
--
-- Antes: una cuenta con role = 'admin' era administradora en cualquier sesión.
-- Ahora: solo lo es en la sesión en la que ha puesto el PIN correcto. Si entra
-- por el acceso normal (sin PIN), el servidor la trata como a cualquier usuario.
-- Al cerrar sesión, la sesión deja de existir y con ella el permiso de admin.
--
--   · El PIN no se guarda en claro: solo su huella (sha256 con sal aleatoria),
--     en un esquema que la API no expone ("privado").
--   · 5 fallos seguidos bloquean al usuario 15 minutos (en el servidor).
--   · El PIN NO está en este archivo (que va a GitHub): se fija aparte con
--     select public.admin_fijar_pin('……');  desde el SQL Editor.
--
-- Cambio aditivo: no borra ni modifica datos. Para deshacerlo:
-- supabase/rollback/20261124120000_pin_admin.down.sql
-- ════════════════════════════════════════════════════════════════════════

create schema if not exists privado;
revoke all on schema privado from public;

-- Huella del PIN (una sola fila).
create table privado.pin_admin (
  id boolean primary key default true check (id),
  sal text not null,
  huella text not null,
  actualizado_en timestamptz not null default now()
);

-- Sesiones (de Supabase Auth) en las que un admin ha puesto el PIN correcto.
create table privado.sesiones_admin (
  session_id uuid primary key,
  usuario uuid not null,
  verificada_en timestamptz not null default now()
);

-- Intentos fallidos por usuario.
create table privado.intentos_pin (
  usuario uuid primary key,
  fallos int not null default 0,
  bloqueado_hasta timestamptz
);

revoke all on all tables in schema privado from public;

-- ───────────── is_admin: ahora exige además la sesión con PIN ─────────────
-- Todas las políticas RLS y funciones de admin usan is_admin(), así que el PIN
-- pasa a ser obligatorio para cualquier operación de administración.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.sesion_activa()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    and exists (
      select 1 from privado.sesiones_admin s
      where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and s.usuario = auth.uid()
    )
$$;

-- ───────────── Comprobar el PIN (lo llama el acceso de administración) ─────────────
create function public.admin_verificar_pin(pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  bloqueo timestamptz;
  p privado.pin_admin;
  bien boolean;
begin
  if not public.sesion_activa() or sid is null then
    return false;
  end if;

  select bloqueado_hasta into bloqueo from privado.intentos_pin where usuario = auth.uid() for update;
  if bloqueo is not null and bloqueo > now() then
    raise exception 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
  end if;

  select * into p from privado.pin_admin where id;
  bien := p.huella is not null
    and exists (select 1 from public.profiles x where x.id = auth.uid() and x.role = 'admin')
    and p.huella = encode(sha256(convert_to(p.sal || coalesce(pin, ''), 'UTF8')), 'hex');

  if not bien then
    insert into privado.intentos_pin as i (usuario, fallos) values (auth.uid(), 1)
    on conflict (usuario) do update
      set fallos = case when i.bloqueado_hasta is not null then 1 else i.fallos + 1 end,
          bloqueado_hasta = null;
    update privado.intentos_pin
      set bloqueado_hasta = now() + interval '15 minutes', fallos = 0
      where usuario = auth.uid() and fallos >= 5;
    return false;
  end if;

  delete from privado.intentos_pin where usuario = auth.uid();
  -- limpieza: sesiones que ya no existen (cerradas o caducadas)
  delete from privado.sesiones_admin s where not exists (select 1 from auth.sessions a where a.id = s.session_id);
  insert into privado.sesiones_admin (session_id, usuario) values (sid, auth.uid())
  on conflict (session_id) do update set usuario = excluded.usuario, verificada_en = now();
  return true;
end $$;

-- ───────────── Fijar o cambiar el PIN ─────────────
-- Desde el SQL Editor (postgres) o un proceso de servidor; o un admin que ya
-- haya entrado con el PIN actual.
create function public.admin_fijar_pin(nuevo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sal text := replace(gen_random_uuid()::text, '-', '');
begin
  -- Ojo: dentro de una función security definer current_user es el dueño, no quien
  -- llama. Lo fiable es el rol del token: las peticiones de la app llegan siempre
  -- como 'authenticated' (o 'anon'); el SQL Editor no lleva token.
  if coalesce(auth.jwt() ->> 'role', '') in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el PIN' using errcode = '42501';
  end if;
  if coalesce(nuevo, '') !~ '^\d{4,8}$' then
    raise exception 'El PIN tiene que tener de 4 a 8 cifras' using errcode = '22023';
  end if;
  insert into privado.pin_admin (id, sal, huella) values (true, sal, encode(sha256(convert_to(sal || nuevo, 'UTF8')), 'hex'))
  on conflict (id) do update set sal = excluded.sal, huella = excluded.huella, actualizado_en = now();
end $$;

revoke execute on function public.admin_verificar_pin(text), public.admin_fijar_pin(text) from public, anon;
grant execute on function public.admin_verificar_pin(text) to authenticated;
grant execute on function public.admin_fijar_pin(text) to authenticated, service_role;
