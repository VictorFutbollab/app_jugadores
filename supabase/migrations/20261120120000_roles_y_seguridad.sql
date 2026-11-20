-- ════════════════════════════════════════════════════════════════════════
-- FutbolLab Jugadores · esquema, roles y seguridad por fila (RLS)
--
-- Roles de la aplicación (profiles.role):
--   player → usuario normal (entrenador). Es el rol por defecto de todo registro.
--   admin  → administrador del club. Solo lo asigna otro admin (admin_set_role)
--            o un proceso de servidor (promover_admin, desde el SQL Editor).
--
-- Principios:
--   · Toda autorización se decide aquí, en la base de datos. La interfaz solo
--     oculta lo que el servidor ya va a rechazar.
--   · El rol se lee siempre de public.profiles (nunca del JWT ni de los
--     metadatos que el usuario puede editar), así un cambio de rol es inmediato.
--   · Cada comprobación exige que la sesión siga viva en auth.sessions: al
--     cerrar sesión, el token deja de valer aunque no haya caducado.
-- ════════════════════════════════════════════════════════════════════════

create type public.app_role as enum ('player', 'admin');

-- ───────────────────────── Perfiles ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '' check (char_length(nombre) <= 120),
  usuario text not null unique check (usuario ~ '^[a-z0-9._]{3,20}$'),
  email text not null default '',
  telefono text not null default '' check (char_length(telefono) <= 20),
  foto text check (foto is null or char_length(foto) <= 200000),
  entidad text not null default '' check (char_length(entidad) <= 120),
  categoria text not null default '' check (char_length(categoria) <= 40),
  equipo text not null default '' check (char_length(equipo) <= 40),
  genero text not null default 'masculino' check (genero in ('masculino', 'femenino', 'mixto')),
  acepta_privacidad_en timestamptz,
  role public.app_role not null default 'player',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ───────────────────────── Datos de la app ─────────────────────────
-- Cada fila guarda el objeto de la app en `data` y saca a columnas lo que
-- necesitan las políticas (equipo, jugador, visibilidad y autor de las notas).

create table public.equipos (
  id text primary key check (char_length(id) between 1 and 80),
  data jsonb not null check (pg_column_size(data) < 20000),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.miembros (
  equipo_id text not null references public.equipos (id) on delete cascade,
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  rol text not null check (rol in ('entrenador_principal', 'ayudante', 'preparador_fisico', 'coordinador')),
  permisos jsonb not null default '{"verFicha": false, "verNotasPrivadas": false, "evaluar": false}'::jsonb,
  primary key (equipo_id, usuario_id)
);
create index miembros_usuario_idx on public.miembros (usuario_id);

create table public.jugadores (
  id text primary key check (char_length(id) between 1 and 80),
  equipo_id text not null references public.equipos (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 300000),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index jugadores_equipo_idx on public.jugadores (equipo_id);

create table public.eventos (
  id text primary key check (char_length(id) between 1 and 120),
  equipo_id text not null references public.equipos (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 20000)
);
create index eventos_equipo_idx on public.eventos (equipo_id);

-- Ítems de evaluación personalizados (los 29 por defecto viven en la app).
create table public.items (
  id text primary key check (char_length(id) between 1 and 80),
  equipo_id text references public.equipos (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 20000)
);

-- Tablas con datos de un jugador concreto.
create table public.estados (
  id text primary key check (char_length(id) between 1 and 160),
  equipo_id text not null references public.equipos (id) on delete cascade,
  jugador_id text not null references public.jugadores (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 20000)
);
create table public.evaluaciones (like public.estados including all);
create table public.pruebas (like public.estados including all);
create table public.asistencias (like public.estados including all);
create table public.participaciones (like public.estados including all);
create table public.cargas (like public.estados including all);
create table public.notas (
  like public.estados including all,
  visibilidad text not null check (visibilidad in ('privada', 'apta_familia')),
  autor_id text not null
);
-- LIKE no copia las claves foráneas: se añaden aquí.
do $$
declare t text;
begin
  foreach t in array array['evaluaciones', 'pruebas', 'asistencias', 'participaciones', 'cargas', 'notas'] loop
    execute format('alter table public.%I add foreign key (equipo_id) references public.equipos (id) on delete cascade', t);
    execute format('alter table public.%I add foreign key (jugador_id) references public.jugadores (id) on delete cascade', t);
  end loop;
  foreach t in array array['estados', 'evaluaciones', 'pruebas', 'asistencias', 'participaciones', 'cargas', 'notas'] loop
    execute format('create index %I on public.%I (jugador_id)', t || '_jugador_idx', t);
    execute format('create index %I on public.%I (equipo_id)', t || '_equipo_idx', t);
  end loop;
end $$;

-- ───────────────────────── Registro de actividad ─────────────────────────

create table public.registro_actividad (
  id bigint generated always as identity primary key,
  creado_en timestamptz not null default now(),
  actor uuid,                -- auth.uid() de quien hizo el cambio (null = proceso de servidor)
  actor_es_admin boolean not null default false,
  accion text not null,      -- INSERT | UPDATE | DELETE | CAMBIO_ROL
  tabla text not null,
  registro_id text,
  cambios jsonb
);
create index registro_actividad_fecha_idx on public.registro_actividad (creado_en desc);

-- ═════════════════════════ Funciones de autorización ═════════════════════════
-- SECURITY DEFINER + search_path vacío: leen las tablas sin pasar por RLS
-- (evita recursión) y no se pueden secuestrar con objetos de otro esquema.

-- La sesión del JWT sigue existiendo (no se ha cerrado ni ha caducado).
create function public.sesion_activa() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  )
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.sesion_activa() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
$$;

create function public.es_miembro(eq text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.sesion_activa() and exists (
    select 1 from public.miembros m where m.equipo_id = eq and m.usuario_id = auth.uid()
  )
$$;

create function public.es_principal(eq text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.sesion_activa() and exists (
    select 1 from public.miembros m
    where m.equipo_id = eq and m.usuario_id = auth.uid() and m.rol = 'entrenador_principal'
  )
$$;

-- p ∈ verFicha | evaluar | verNotasPrivadas. El entrenador principal los tiene todos.
create function public.tiene_permiso(eq text, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.sesion_activa() and exists (
    select 1 from public.miembros m
    where m.equipo_id = eq and m.usuario_id = auth.uid()
      and (m.rol = 'entrenador_principal' or coalesce((m.permisos ->> p)::boolean, false))
  )
$$;

-- Comparte algún equipo con el usuario actual (para ver nombres del cuerpo técnico).
create function public.comparte_equipo(otro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.sesion_activa() and exists (
    select 1 from public.miembros a join public.miembros b on a.equipo_id = b.equipo_id
    where a.usuario_id = auth.uid() and b.usuario_id = otro
  )
$$;

create function public.equipo_de_jugador(jid text) returns text
language sql stable security definer set search_path = '' as $$
  select j.equipo_id from public.jugadores j where j.id = jid
$$;

-- Consentimiento de ficha vigente (sin consentimiento no se evalúa: RGPD).
create function public.jugador_con_consentimiento(jid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_typeof(j.data -> 'consentimiento') = 'object'
       and coalesce(j.data -> 'consentimiento' ->> 'retiradoEn', '') = ''
       and coalesce((j.data -> 'consentimiento' -> 'alcance' ->> 'ficha')::boolean, false)
    from public.jugadores j where j.id = jid
  ), false)
$$;

-- ═════════════════════════ Triggers ═════════════════════════

-- Alta: todo usuario nuevo es 'player'. El rol de los metadatos se ignora siempre.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  u text := lower(coalesce(m ->> 'usuario', ''));
begin
  if u !~ '^[a-z0-9._]{3,20}$' or exists (select 1 from public.profiles p where p.usuario = u) then
    u := 'u' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  insert into public.profiles (id, nombre, usuario, email, telefono, entidad, categoria, equipo, genero, acepta_privacidad_en, role)
  values (
    new.id,
    left(coalesce(m ->> 'nombre', ''), 120),
    u,
    coalesce(new.email, ''),
    left(coalesce(m ->> 'telefono', ''), 20),
    left(coalesce(m ->> 'entidad', ''), 120),
    left(coalesce(m ->> 'categoria', ''), 40),
    left(coalesce(m ->> 'equipo', ''), 40),
    case when m ->> 'genero' in ('masculino', 'femenino', 'mixto') then m ->> 'genero' else 'masculino' end,
    case when m ->> 'acepta_privacidad' = 'true' then now() end,
    'player'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- El email del perfil sigue al de Auth (el usuario no lo edita directamente).
create function public.sync_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email
  after update of email on auth.users
  for each row execute function public.sync_email();

-- Defensa en profundidad: aunque fallaran los permisos de columna, un cliente
-- (anon/authenticated) nunca puede crear un perfil admin ni cambiar un rol.
-- Solo pueden hacerlo funciones de servidor (que se ejecutan como su dueño).
create function public.proteger_rol() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.role <> 'player' then
      raise exception 'Un registro nuevo solo puede tener el rol player' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.role is distinct from old.role or new.id is distinct from old.id or new.email is distinct from old.email) then
      raise exception 'No puedes cambiar tu rol ni tu identidad' using errcode = '42501';
    end if;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

create trigger profiles_proteger_rol
  before insert or update on public.profiles
  for each row execute function public.proteger_rol();

-- Las filas de un jugador heredan SIEMPRE el equipo del jugador: el cliente no
-- puede colar datos en otro equipo cambiando equipo_id.
create function public.fijar_equipo_jugador() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.equipo_id := public.equipo_de_jugador(new.jugador_id);
  if new.equipo_id is null then
    raise exception 'El jugador % no existe', new.jugador_id using errcode = '23503';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['estados', 'evaluaciones', 'pruebas', 'asistencias', 'participaciones', 'cargas', 'notas'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.fijar_equipo_jugador()', t || '_fijar_equipo', t);
  end loop;
end $$;

-- Registro de actividad: quién cambió qué (solo las claves que cambian; sin fotos).
create function public.registrar_actividad() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  antes jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  despues jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  cambios jsonb;
  rid text;
  accion text := tg_op;
begin
  -- Aplana `data` para ver qué campo concreto cambió.
  if antes ? 'data' then antes := (antes - 'data') || coalesce(antes -> 'data', '{}'::jsonb); end if;
  if despues ? 'data' then despues := (despues - 'data') || coalesce(despues -> 'data', '{}'::jsonb); end if;
  antes := antes - 'foto' - 'actualizadoEn' - 'actualizado_en';
  despues := despues - 'foto' - 'actualizadoEn' - 'actualizado_en';

  if tg_table_name = 'profiles' then
    if tg_op <> 'UPDATE' or old.role is not distinct from new.role then return null; end if;
    accion := 'CAMBIO_ROL';
    cambios := jsonb_build_object('role', jsonb_build_object('antes', old.role, 'despues', new.role));
  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('antes', antes -> k, 'despues', despues -> k)) into cambios
    from (select jsonb_object_keys(antes) k union select jsonb_object_keys(despues)) ks
    where antes -> k is distinct from despues -> k;
    if cambios is null then return null; end if;
  elsif tg_op = 'INSERT' then
    cambios := jsonb_strip_nulls(jsonb_build_object('nombre', despues -> 'nombre', 'dorsal', despues -> 'dorsal', 'rol', despues -> 'rol', 'tipo', despues -> 'tipo'));
  else
    cambios := jsonb_strip_nulls(jsonb_build_object('nombre', antes -> 'nombre', 'apellidos', antes -> 'apellidos', 'dorsal', antes -> 'dorsal', 'rol', antes -> 'rol'));
  end if;

  rid := coalesce(despues ->> 'id', antes ->> 'id', despues ->> 'usuario_id', antes ->> 'usuario_id');
  if tg_table_name = 'miembros' then
    rid := coalesce(despues ->> 'equipo_id', antes ->> 'equipo_id') || '/' || coalesce(despues ->> 'usuario_id', antes ->> 'usuario_id');
  end if;

  insert into public.registro_actividad (actor, actor_es_admin, accion, tabla, registro_id, cambios)
  values (auth.uid(), coalesce(public.is_admin(), false), accion, tg_table_name, rid, cambios);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['equipos', 'miembros', 'jugadores', 'estados', 'items', 'profiles'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.registrar_actividad()', t || '_actividad', t);
  end loop;
end $$;

-- ═════════════════════════ Funciones (RPC) ═════════════════════════

-- ¿Está libre este nombre de usuario? (para avisar antes de registrarse)
create function public.usuario_disponible(u text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(u) ~ '^[a-z0-9._]{3,20}$' and not exists (select 1 from public.profiles p where p.usuario = lower(u))
$$;

-- Solo un admin puede cambiar roles, y siempre debe quedar al menos uno.
create function public.admin_set_role(objetivo uuid, nuevo public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
declare actual public.app_role;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles' using errcode = '42501';
  end if;
  perform 1 from public.profiles where role = 'admin' for update; -- evita dos bajas simultáneas
  select role into actual from public.profiles where id = objetivo;
  if actual is null then
    raise exception 'Usuario no encontrado' using errcode = 'P0002';
  end if;
  if actual = 'admin' and nuevo <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Tiene que quedar al menos un administrador' using errcode = '42501';
  end if;
  update public.profiles set role = nuevo where id = objetivo;
end $$;

-- Proceso de servidor para nombrar al primer admin (o recuperar el acceso).
-- No la puede ejecutar ningún cliente: solo el SQL Editor o la service_role.
create function public.promover_admin(correo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set role = 'admin' where email = lower(trim(correo));
  if not found then
    raise exception 'No hay ninguna cuenta con el email %', correo using errcode = 'P0002';
  end if;
end $$;

-- Lo que puede hacer el entrenador sin ser admin: marcar favorito…
create function public.jugador_set_favorito(jid text, valor boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_miembro(public.equipo_de_jugador(jid)) then
    raise exception 'No tienes acceso a este jugador' using errcode = '42501';
  end if;
  update public.jugadores set data = jsonb_set(data, '{favorito}', to_jsonb(valor)), actualizado_en = now() where id = jid;
end $$;

-- …y registrar el consentimiento que firma la familia (solo el entrenador principal,
-- solo si no hay uno vigente; editarlo o retirarlo es cosa del admin).
create function public.jugador_registrar_consentimiento(jid text, c jsonb, fecha_nacimiento text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  edad int;
  nac date;
begin
  if not public.es_principal(public.equipo_de_jugador(jid)) then
    raise exception 'Solo el entrenador principal puede registrar el consentimiento' using errcode = '42501';
  end if;
  if public.jugador_con_consentimiento(jid) then
    raise exception 'Ya tiene un consentimiento vigente' using errcode = '23505';
  end if;
  if jsonb_typeof(c) <> 'object'
     or coalesce(trim(c ->> 'firmante'), '') = ''
     or coalesce(c ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}'
     or c ->> 'firmanteTipo' not in ('madre', 'padre', 'tutor_legal', 'jugador_mayor_14')
     or jsonb_typeof(c -> 'alcance') <> 'object' then
    raise exception 'Consentimiento incompleto' using errcode = '22023';
  end if;
  nac := nullif(fecha_nacimiento, '')::date;
  if c ->> 'firmanteTipo' = 'jugador_mayor_14' then
    edad := extract(year from age((c ->> 'fecha')::date, nac));
    if nac is null or edad < 14 then
      raise exception 'Por debajo de 14 años debe firmar la madre, el padre o el tutor legal' using errcode = '22023';
    end if;
  end if;
  update public.jugadores
  set data = data
      || jsonb_build_object('consentimiento', jsonb_build_object(
           'fecha', c ->> 'fecha', 'firmante', left(c ->> 'firmante', 120), 'firmanteTipo', c ->> 'firmanteTipo',
           'alcance', jsonb_build_object(
             'ficha', coalesce((c -> 'alcance' ->> 'ficha')::boolean, false),
             'fotos', coalesce((c -> 'alcance' ->> 'fotos')::boolean, false),
             'notasVoz', coalesce((c -> 'alcance' ->> 'notasVoz')::boolean, false)),
           'version', left(coalesce(c ->> 'version', ''), 20)))
      || jsonb_build_object('fechaNacimiento', to_jsonb(nac::text)),
      actualizado_en = now()
  where id = jid;
end $$;

-- Datos mínimos de la plantilla (nombre y dorsal) para miembros sin permiso de
-- ver la ficha: así pueden ver quién hay sin acceder a los datos personales.
create function public.jugadores_basicos() returns table (id text, equipo_id text, data jsonb)
language sql stable security definer set search_path = '' as $$
  select j.id, j.equipo_id,
         jsonb_build_object('id', j.id, 'equipoId', j.equipo_id, 'nombre', j.data -> 'nombre', 'apellidos', j.data -> 'apellidos',
                            'dorsal', j.data -> 'dorsal', 'archivado', j.data -> 'archivado', 'eliminadoEn', j.data -> 'eliminadoEn')
  from public.jugadores j
  where public.es_miembro(j.equipo_id)
$$;

-- ═════════════════════════ Row Level Security ═════════════════════════

alter table public.profiles enable row level security;
alter table public.equipos enable row level security;
alter table public.miembros enable row level security;
alter table public.jugadores enable row level security;
alter table public.eventos enable row level security;
alter table public.items enable row level security;
alter table public.estados enable row level security;
alter table public.evaluaciones enable row level security;
alter table public.pruebas enable row level security;
alter table public.asistencias enable row level security;
alter table public.participaciones enable row level security;
alter table public.cargas enable row level security;
alter table public.notas enable row level security;
alter table public.registro_actividad enable row level security;

-- Perfiles: el propio, los del cuerpo técnico de tus equipos y, si eres admin, todos.
create policy perfil_ver on public.profiles for select to authenticated
  using ((id = auth.uid() and public.sesion_activa()) or public.is_admin() or public.comparte_equipo(id));
create policy perfil_editar_propio on public.profiles for update to authenticated
  using (id = auth.uid() and public.sesion_activa())
  with check (id = auth.uid() and public.sesion_activa());

-- Equipos y miembros: los ve quien pertenece al equipo; los gestiona el admin.
create policy equipo_ver on public.equipos for select to authenticated using (public.is_admin() or public.es_miembro(id));
create policy miembro_ver on public.miembros for select to authenticated using (public.is_admin() or public.es_miembro(equipo_id));

-- Ficha completa del jugador: hace falta el permiso verFicha.
create policy jugador_ver on public.jugadores for select to authenticated using (public.is_admin() or public.tiene_permiso(equipo_id, 'verFicha'));

-- Datos de equipo y disponibilidad: cualquier miembro.
create policy evento_ver on public.eventos for select to authenticated using (public.is_admin() or public.es_miembro(equipo_id));
create policy estado_ver on public.estados for select to authenticated using (public.is_admin() or public.es_miembro(equipo_id));
create policy asistencia_ver on public.asistencias for select to authenticated using (public.is_admin() or public.es_miembro(equipo_id));
create policy participacion_ver on public.participaciones for select to authenticated using (public.is_admin() or public.es_miembro(equipo_id));
create policy carga_ver on public.cargas for select to authenticated using (public.is_admin() or public.es_miembro(equipo_id));
create policy item_ver on public.items for select to authenticated
  using ((equipo_id is null and public.sesion_activa()) or public.is_admin() or public.es_miembro(equipo_id));

-- Evaluaciones y pruebas físicas: forman parte de la ficha.
create policy evaluacion_ver on public.evaluaciones for select to authenticated using (public.is_admin() or public.tiene_permiso(equipo_id, 'verFicha'));
create policy prueba_ver on public.pruebas for select to authenticated using (public.is_admin() or public.tiene_permiso(equipo_id, 'verFicha'));

-- Notas: las tuyas, las aptas para familia si ves la ficha, y las privadas con permiso.
create policy nota_ver on public.notas for select to authenticated using (
  public.is_admin()
  or (public.es_miembro(equipo_id) and (
        autor_id = auth.uid()::text
        or public.tiene_permiso(equipo_id, 'verNotasPrivadas')
        or (visibilidad = 'apta_familia' and public.tiene_permiso(equipo_id, 'verFicha'))))
);

-- Evaluar: con permiso, a jugadores con consentimiento y siempre firmando como uno mismo.
create policy evaluacion_crear on public.evaluaciones for insert to authenticated with check (
  public.tiene_permiso(equipo_id, 'evaluar')
  and data ->> 'evaluadorId' = auth.uid()::text
  and public.jugador_con_consentimiento(jugador_id)
);
create policy evaluacion_editar_propia on public.evaluaciones for update to authenticated
  using (public.tiene_permiso(equipo_id, 'evaluar') and data ->> 'evaluadorId' = auth.uid()::text)
  with check (
    public.tiene_permiso(equipo_id, 'evaluar')
    and data ->> 'evaluadorId' = auth.uid()::text
    and public.jugador_con_consentimiento(jugador_id)
  );

-- Administración: el admin puede todo en las tablas de datos (nunca en profiles.role,
-- que solo cambia admin_set_role, ni en el registro de actividad).
do $$
declare t text;
begin
  foreach t in array array['equipos', 'miembros', 'jugadores', 'eventos', 'items', 'estados', 'evaluaciones', 'pruebas', 'asistencias', 'participaciones', 'cargas', 'notas'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;

create policy actividad_ver on public.registro_actividad for select to authenticated using (public.is_admin());

-- ═════════════════════════ Privilegios ═════════════════════════
-- Supabase da por defecto todos los privilegios a anon y authenticated.
-- Se recortan al mínimo: RLS decide las filas; los GRANT, las operaciones.

do $$
declare t text;
begin
  foreach t in array array['profiles', 'equipos', 'miembros', 'jugadores', 'eventos', 'items', 'estados', 'evaluaciones', 'pruebas', 'asistencias', 'participaciones', 'cargas', 'notas', 'registro_actividad'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  foreach t in array array['equipos', 'miembros', 'jugadores', 'eventos', 'items', 'estados', 'evaluaciones', 'pruebas', 'asistencias', 'participaciones', 'cargas', 'notas'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

grant select on public.registro_actividad to authenticated;
grant select on public.profiles to authenticated;
-- La columna role (y id, email, fechas) no se puede escribir desde el cliente.
grant update (nombre, usuario, telefono, foto, entidad, categoria, equipo, genero) on public.profiles to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.sesion_activa(), public.is_admin(), public.es_miembro(text), public.es_principal(text),
  public.tiene_permiso(text, text), public.comparte_equipo(uuid), public.equipo_de_jugador(text),
  public.jugador_con_consentimiento(text), public.admin_set_role(uuid, public.app_role),
  public.jugador_set_favorito(text, boolean), public.jugador_registrar_consentimiento(text, jsonb, text),
  public.jugadores_basicos()
  to authenticated;
grant execute on function public.usuario_disponible(text) to anon, authenticated;
-- promover_admin: solo SQL Editor (postgres) o un proceso de servidor con la service_role.
grant execute on function public.promover_admin(text) to service_role;

-- Las funciones que se creen en el futuro tampoco quedarán abiertas por defecto.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
