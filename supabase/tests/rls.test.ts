/**
 * Pruebas de seguridad de la base de datos (roles + RLS) sobre PostgreSQL real.
 *
 * Se ejecuta la migración de supabase/migrations en PGlite (PostgreSQL en WASM)
 * con un entorno que imita a Supabase: roles anon / authenticated / service_role,
 * auth.users, auth.sessions, auth.uid() y auth.jwt(). Cada consulta se lanza
 * "como" un usuario con SET ROLE + request.jwt.claims, igual que hace PostgREST.
 *
 * Las mismas comprobaciones se repiten contra el proyecto real con
 * scripts/probar-seguridad.mjs (HTTP, Auth y PostgREST de verdad).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const ENTORNO_SUPABASE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
grant usage on schema public, auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
-- Privilegios por defecto de Supabase: todo para anon y authenticated (la migración los recorta)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

const U = {
  admin: '00000000-0000-4000-8000-00000000000a',
  entrenadorA: '00000000-0000-4000-8000-0000000000a1', // principal del equipo A
  ayudanteA: '00000000-0000-4000-8000-0000000000a2', // ayudante del A, sin notas privadas
  entrenadorB: '00000000-0000-4000-8000-0000000000b1', // principal del equipo B
  sinEquipo: '00000000-0000-4000-8000-0000000000c1', // recién registrado
}
const SESION: Record<string, string> = Object.fromEntries(Object.values(U).map((id) => [id, id.replace(/^0000/, '5e55')]))

let db: PGlite

type Res = { rows: Record<string, unknown>[]; affected: number; error?: undefined } | { rows?: undefined; affected?: undefined; error: string }

/** Ejecuta SQL como un usuario (o como anon si uid es null), igual que PostgREST. */
async function como(uid: string | null, sql: string, params: unknown[] = []): Promise<Res> {
  try {
    return await db.transaction(async (tx) => {
      const claims = uid ? { sub: uid, role: 'authenticated', session_id: SESION[uid] } : { role: 'anon' }
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
      await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
      const r = await tx.query<Record<string, unknown>>(sql, params)
      return { rows: r.rows, affected: r.affectedRows ?? 0 }
    })
  } catch (e) {
    return { error: (e as Error).message }
  }
}
const filas = async (uid: string | null, sql: string, params: unknown[] = []) => {
  const r = await como(uid, sql, params)
  if (r.error) throw new Error(`Error inesperado: ${r.error}\n${sql}`)
  return r.rows!
}
const jugador = (id: string, equipo: string, nombre: string, dorsal: number, conConsentimiento = true) =>
  JSON.stringify({
    id, equipoId: equipo, nombre, apellidos: 'Prueba', dorsal, fechaNacimiento: '2013-05-01',
    consentimiento: conConsentimiento ? { fecha: '2026-09-01', firmante: 'Madre', firmanteTipo: 'madre', alcance: { ficha: true, fotos: false, notasVoz: false }, version: '2026.1' } : null,
  })

beforeAll(async () => {
  db = new PGlite()
  await db.exec(ENTORNO_SUPABASE)
  const dir = fileURLToPath(new URL('../migrations', import.meta.url))
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'))

  // Registros: el que intenta colarse como admin desde los metadatos se queda en player.
  const alta = (id: string, email: string, usuario: string, extra = {}) =>
    db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ usuario, nombre: usuario, ...extra })])
  await alta(U.admin, 'admin@club.test', 'admin')
  await alta(U.entrenadorA, 'a@club.test', 'entrenador.a', { role: 'admin' })
  await alta(U.ayudanteA, 'ayu@club.test', 'ayudante.a')
  await alta(U.entrenadorB, 'b@club.test', 'entrenador.b')
  await alta(U.sinEquipo, 'nuevo@club.test', 'nuevo')
  for (const id of Object.values(U)) await db.query(`insert into auth.sessions (id, user_id) values ($1, $2)`, [SESION[id], id])

  // Primer admin: proceso de servidor (como el SQL Editor).
  await db.query(`select public.promover_admin('admin@club.test')`)

  // Datos (los crea el servidor, como haría la carga inicial).
  await db.exec(`
    insert into public.equipos (id, data) values ('eq-a', '{"id":"eq-a","nombre":"Infantil A"}'), ('eq-b', '{"id":"eq-b","nombre":"Alevín B"}');
    insert into public.miembros values
      ('eq-a', '${U.entrenadorA}', 'entrenador_principal', '{"verFicha":true,"verNotasPrivadas":true,"evaluar":true}'),
      ('eq-a', '${U.ayudanteA}', 'ayudante', '{"verFicha":true,"verNotasPrivadas":false,"evaluar":true}'),
      ('eq-b', '${U.entrenadorB}', 'entrenador_principal', '{"verFicha":true,"verNotasPrivadas":true,"evaluar":true}');
  `)
  await db.query(`insert into public.jugadores (id, equipo_id, data) values ('j-a1','eq-a',$1), ('j-a2','eq-a',$2), ('j-b1','eq-b',$3)`, [
    jugador('j-a1', 'eq-a', 'Lucas', 10),
    jugador('j-a2', 'eq-a', 'Unai', 18, false),
    jugador('j-b1', 'eq-b', 'Marta', 7),
  ])
  await db.exec(`
    insert into public.notas (id, equipo_id, jugador_id, data, visibilidad, autor_id) values
      ('n-a-priv', 'eq-a', 'j-a1', '{"texto":"privada A"}', 'privada', '${U.entrenadorA}'),
      ('n-a-fam',  'eq-a', 'j-a1', '{"texto":"familia A"}', 'apta_familia', '${U.entrenadorA}'),
      ('n-b-priv', 'eq-b', 'j-b1', '{"texto":"privada B"}', 'privada', '${U.entrenadorB}');
    insert into public.estados (id, equipo_id, jugador_id, data) values ('st-a1', 'eq-a', 'j-a1', '{"tipo":"disponible"}');
  `)
})

const evaluacion = (id: string, jugadorId: string, evaluadorId: string, equipo = 'eq-a') =>
  [`insert into public.evaluaciones (id, equipo_id, jugador_id, data) values ($1, $2, $3, $4)`, [id, equipo, jugadorId, JSON.stringify({ id, jugadorId, evaluadorId, fecha: '2026-11-20', contexto: 'partido', puntuaciones: [{ itemId: 'tec-pase', valor: 4 }] })]] as const

describe('roles', () => {
  it('todo registro nuevo es player, aunque mande role=admin en los metadatos', async () => {
    const r = await db.query(`select usuario, role from public.profiles order by usuario`)
    expect(r.rows).toEqual([
      { usuario: 'admin', role: 'admin' },
      { usuario: 'ayudante.a', role: 'player' },
      { usuario: 'entrenador.a', role: 'player' },
      { usuario: 'entrenador.b', role: 'player' },
      { usuario: 'nuevo', role: 'player' },
    ])
  })
})

describe('1 · un usuario normal entra y ve su panel', () => {
  it('ve su perfil, su equipo y sus jugadores', async () => {
    expect(await filas(U.entrenadorA, `select role from public.profiles where id = auth.uid()`)).toEqual([{ role: 'player' }])
    expect((await filas(U.entrenadorA, `select id from public.equipos`)).map((r) => r.id)).toEqual(['eq-a'])
    expect((await filas(U.entrenadorA, `select id from public.jugadores order by id`)).map((r) => r.id)).toEqual(['j-a1', 'j-a2'])
  })
  it('puede evaluar a un jugador de su equipo con consentimiento', async () => {
    const [sql, p] = evaluacion('ev-ok', 'j-a1', U.entrenadorA)
    expect((await como(U.entrenadorA, sql, [...p])).error).toBeUndefined()
  })
  it('puede marcar favorito y registrar un consentimiento pendiente (principal)', async () => {
    expect((await como(U.entrenadorA, `select public.jugador_set_favorito('j-a1', true)`)).error).toBeUndefined()
    const c = { fecha: '2026-11-20', firmante: 'Padre de Unai', firmanteTipo: 'padre', alcance: { ficha: true, fotos: false, notasVoz: false }, version: '2026.1' }
    expect((await como(U.entrenadorA, `select public.jugador_registrar_consentimiento('j-a2', $1, '2014-03-28')`, [JSON.stringify(c)])).error).toBeUndefined()
  })
})

describe('2 y 3 · un usuario normal intenta usar funciones de administración', () => {
  it('no puede dar de alta jugadores', async () => {
    const r = await como(U.entrenadorA, `insert into public.jugadores (id, equipo_id, data) values ('j-x','eq-a','{"nombre":"X"}')`)
    expect(r.error).toMatch(/row-level security/)
  })
  it('no puede editar ni borrar jugadores (0 filas afectadas)', async () => {
    expect((await como(U.entrenadorA, `update public.jugadores set data = data || '{"dorsal":99}' where id = 'j-a1'`)).affected).toBe(0)
    expect((await como(U.entrenadorA, `delete from public.jugadores where id = 'j-a1'`)).affected).toBe(0)
    expect((await db.query(`select data->>'dorsal' d from public.jugadores where id = 'j-a1'`)).rows).toEqual([{ d: '10' }])
  })
  it('no puede gestionar equipos, miembros, estados ni permisos', async () => {
    expect((await como(U.entrenadorA, `insert into public.miembros values ('eq-b', auth.uid(), 'entrenador_principal', '{}')`)).error).toMatch(/row-level security/)
    expect((await como(U.ayudanteA, `update public.miembros set permisos = '{"verFicha":true,"verNotasPrivadas":true,"evaluar":true}' where usuario_id = auth.uid()`)).affected).toBe(0)
    expect((await como(U.entrenadorA, `insert into public.equipos (id, data) values ('eq-z', '{}')`)).error).toMatch(/row-level security/)
    expect((await como(U.entrenadorA, `update public.estados set data = '{"tipo":"lesionado"}' where id = 'st-a1'`)).affected).toBe(0)
  })
  it('no puede cambiar roles ni ejecutar funciones de servidor', async () => {
    expect((await como(U.entrenadorA, `select public.admin_set_role(auth.uid(), 'admin')`)).error).toMatch(/Solo un administrador/)
    expect((await como(U.entrenadorA, `select public.promover_admin('a@club.test')`)).error).toMatch(/permission denied/)
  })
  it('no ve el registro de actividad', async () => {
    expect(await filas(U.entrenadorA, `select * from public.registro_actividad`)).toEqual([])
  })
  it('el ayudante no puede registrar consentimientos', async () => {
    const c = { fecha: '2026-11-20', firmante: 'X', firmanteTipo: 'madre', alcance: { ficha: true } }
    expect((await como(U.ayudanteA, `select public.jugador_registrar_consentimiento('j-a1', $1, null)`, [JSON.stringify(c)])).error).toMatch(/entrenador principal/)
  })
})

describe('4 · un usuario normal intenta hacerse admin', () => {
  it('no puede escribir la columna role (privilegio de columna)', async () => {
    expect((await como(U.entrenadorA, `update public.profiles set role = 'admin' where id = auth.uid()`)).error).toMatch(/permission denied/)
  })
  it('sí puede editar su nombre, pero no su rol aunque lo combine con otros campos', async () => {
    expect((await como(U.entrenadorA, `update public.profiles set nombre = 'Entrenador A' where id = auth.uid()`)).affected).toBe(1)
    expect((await como(U.entrenadorA, `update public.profiles set nombre = 'x', role = 'admin' where id = auth.uid()`)).error).toMatch(/permission denied/)
  })
  it('no puede crear un perfil admin a mano', async () => {
    expect((await como(U.entrenadorA, `insert into public.profiles (id, usuario, role) values (gen_random_uuid(), 'colado', 'admin')`)).error).toMatch(/permission denied/)
  })
  it('el trigger también lo frena si alguien concediera la columna por error', async () => {
    await db.exec(`grant update (role) on public.profiles to authenticated`)
    const r = await como(U.entrenadorA, `update public.profiles set role = 'admin' where id = auth.uid()`)
    await db.exec(`revoke update (role) on public.profiles from authenticated`)
    expect(r.error).toMatch(/No puedes cambiar tu rol/)
    expect((await db.query(`select role from public.profiles where id = $1`, [U.entrenadorA])).rows).toEqual([{ role: 'player' }])
  })
  it('no puede editar el perfil de otro', async () => {
    expect((await como(U.entrenadorA, `update public.profiles set nombre = 'hackeado' where id = $1`, [U.entrenadorB])).affected).toBe(0)
  })
})

describe('5 · un usuario normal intenta ver datos privados de otros', () => {
  it('no ve jugadores, equipos, notas ni estados de otro equipo', async () => {
    expect(await filas(U.entrenadorA, `select * from public.jugadores where id = 'j-b1'`)).toEqual([])
    expect(await filas(U.entrenadorA, `select * from public.equipos where id = 'eq-b'`)).toEqual([])
    expect(await filas(U.entrenadorA, `select * from public.notas where equipo_id = 'eq-b'`)).toEqual([])
    expect(await filas(U.entrenadorA, `select * from public.jugadores_basicos() where equipo_id = 'eq-b'`)).toEqual([])
  })
  it('no ve el perfil de quien no comparte equipo', async () => {
    expect(await filas(U.entrenadorA, `select id from public.profiles where id = $1`, [U.entrenadorB])).toEqual([])
    expect((await filas(U.entrenadorA, `select id from public.profiles where id = $1`, [U.ayudanteA])).length).toBe(1)
  })
  it('el ayudante sin permiso no ve las notas privadas del principal', async () => {
    expect((await filas(U.ayudanteA, `select id from public.notas order by id`)).map((r) => r.id)).toEqual(['n-a-fam'])
  })
  it('no puede evaluar a jugadores de otro equipo, ni colarlo cambiando equipo_id', async () => {
    const [sql, p] = evaluacion('ev-b', 'j-b1', U.entrenadorA, 'eq-a')
    expect((await como(U.entrenadorA, sql, [...p])).error).toMatch(/row-level security/)
  })
  it('no puede firmar evaluaciones en nombre de otro', async () => {
    const [sql, p] = evaluacion('ev-falsa', 'j-a1', U.ayudanteA)
    expect((await como(U.entrenadorA, sql, [...p])).error).toMatch(/row-level security/)
  })
  it('no puede evaluar a quien no tiene consentimiento', async () => {
    await db.exec(`insert into public.jugadores (id, equipo_id, data) values ('j-a3', 'eq-a', '{"nombre":"Sin","dorsal":3,"consentimiento":null}')`)
    const [sql, p] = evaluacion('ev-sin', 'j-a3', U.entrenadorA)
    expect((await como(U.entrenadorA, sql, [...p])).error).toMatch(/row-level security/)
  })
  it('no puede marcar favorito en otro equipo', async () => {
    expect((await como(U.entrenadorA, `select public.jugador_set_favorito('j-b1', true)`)).error).toMatch(/No tienes acceso/)
  })
  it('un registrado sin equipo no ve nada', async () => {
    expect(await filas(U.sinEquipo, `select * from public.jugadores`)).toEqual([])
    expect(await filas(U.sinEquipo, `select * from public.equipos`)).toEqual([])
    expect(await filas(U.sinEquipo, `select * from public.jugadores_basicos()`)).toEqual([])
  })
})

describe('6 · el admin entra y gestiona', () => {
  it('ve todos los equipos y jugadores', async () => {
    expect((await filas(U.admin, `select id from public.equipos order by id`)).map((r) => r.id)).toEqual(['eq-a', 'eq-b'])
    expect((await filas(U.admin, `select count(*)::int n from public.jugadores`))[0].n).toBe(4)
  })
  it('da de alta, edita y borra jugadores (en cascada)', async () => {
    expect((await como(U.admin, `insert into public.jugadores (id, equipo_id, data) values ('j-nuevo','eq-b','{"nombre":"Nuevo","dorsal":20}')`)).error).toBeUndefined()
    const HIJAS = ['estados', 'evaluaciones', 'pruebas', 'asistencias', 'participaciones', 'cargas']
    for (const t of HIJAS) {
      expect((await como(U.admin, `insert into public.${t} (id, equipo_id, jugador_id, data) values ('${t}-nuevo','eq-b','j-nuevo','{}')`)).error).toBeUndefined()
    }
    expect((await como(U.admin, `insert into public.notas (id, equipo_id, jugador_id, data, visibilidad, autor_id) values ('nota-nuevo','eq-b','j-nuevo','{}','privada','x')`)).error).toBeUndefined()
    expect((await como(U.admin, `update public.jugadores set data = data || '{"dorsal":21}' where id = 'j-nuevo'`)).affected).toBe(1)
    // Borrado completo (art. 17 RGPD): un DELETE y la base de datos borra todo lo que cuelga del jugador.
    expect((await como(U.admin, `delete from public.jugadores where id = 'j-nuevo'`)).affected).toBe(1)
    for (const t of [...HIJAS, 'notas']) {
      expect((await db.query(`select count(*)::int n from public.${t} where jugador_id = 'j-nuevo'`)).rows[0]).toEqual({ n: 0 })
    }
  })
  it('gestiona miembros y permisos', async () => {
    expect((await como(U.admin, `insert into public.miembros values ('eq-b', $1, 'ayudante', '{"verFicha":true,"verNotasPrivadas":false,"evaluar":false}')`, [U.sinEquipo])).error).toBeUndefined()
    expect((await filas(U.sinEquipo, `select id from public.jugadores`)).map((r) => r.id)).toEqual(['j-b1'])
  })
  it('nombra y quita admins, pero nunca deja el club sin ninguno', async () => {
    expect((await como(U.admin, `select public.admin_set_role($1, 'admin')`, [U.entrenadorB])).error).toBeUndefined()
    expect((await como(U.admin, `select public.admin_set_role($1, 'player')`, [U.entrenadorB])).error).toBeUndefined()
    expect((await como(U.admin, `select public.admin_set_role(auth.uid(), 'player')`)).error).toMatch(/al menos un administrador/)
  })
  it('todo queda en el registro de actividad, con quién lo hizo', async () => {
    const r = await filas(U.admin, `select accion, tabla, registro_id, actor, actor_es_admin from public.registro_actividad where actor = auth.uid() order by id`)
    const resumen = r.map((x) => `${x.accion} ${x.tabla} ${x.registro_id}`)
    expect(resumen).toContain('INSERT jugadores j-nuevo')
    expect(resumen).toContain('UPDATE jugadores j-nuevo')
    expect(resumen).toContain('DELETE jugadores j-nuevo')
    expect(resumen).toContain(`INSERT miembros eq-b/${U.sinEquipo}`)
    expect(resumen.filter((x) => x.startsWith(`CAMBIO_ROL profiles ${U.entrenadorB}`))).toHaveLength(2)
    expect(r.every((x) => x.actor_es_admin === true)).toBe(true)
    const upd = await filas(U.admin, `select cambios from public.registro_actividad where accion = 'UPDATE' and registro_id = 'j-nuevo'`)
    expect(upd[0].cambios).toEqual({ dorsal: { antes: 20, despues: 21 } })
  })
  it('nadie (ni el admin) puede alterar el registro de actividad', async () => {
    expect((await como(U.admin, `delete from public.registro_actividad`)).error).toMatch(/permission denied/)
    expect((await como(U.admin, `update public.registro_actividad set accion = 'x'`)).error).toMatch(/permission denied/)
  })
})

describe('7 · sin sesión', () => {
  it('no puede leer ni escribir nada', async () => {
    for (const t of ['profiles', 'equipos', 'jugadores', 'notas', 'evaluaciones', 'registro_actividad']) {
      expect((await como(null, `select * from public.${t}`)).error).toMatch(/permission denied/)
    }
    expect((await como(null, `insert into public.jugadores (id, equipo_id, data) values ('j-anon','eq-a','{}')`)).error).toMatch(/permission denied/)
    expect((await como(null, `select public.admin_set_role('${U.admin}', 'player')`)).error).toMatch(/permission denied/)
    expect((await como(null, `select * from public.jugadores_basicos()`)).error).toMatch(/permission denied/)
  })
  it('solo puede comprobar si un nombre de usuario está libre', async () => {
    expect(await filas(null, `select public.usuario_disponible('admin') libre`)).toEqual([{ libre: false }])
    expect(await filas(null, `select public.usuario_disponible('libre.2026') libre`)).toEqual([{ libre: true }])
  })
})

describe('8 · el admin cierra sesión', () => {
  it('su token deja de valer al instante, aunque no haya caducado', async () => {
    expect((await filas(U.admin, `select count(*)::int n from public.jugadores`))[0].n).toBeGreaterThan(0)
    await db.query(`delete from auth.sessions where id = $1`, [SESION[U.admin]]) // lo que hace signOut en Supabase
    expect(await filas(U.admin, `select * from public.jugadores`)).toEqual([])
    expect(await filas(U.admin, `select * from public.registro_actividad`)).toEqual([])
    expect((await como(U.admin, `insert into public.jugadores (id, equipo_id, data) values ('j-tras','eq-a','{}')`)).error).toMatch(/row-level security/)
    expect((await como(U.admin, `select public.admin_set_role($1, 'admin')`, [U.entrenadorA])).error).toMatch(/Solo un administrador/)
  })
  it('lo mismo para un entrenador: sin sesión viva no ve su equipo', async () => {
    await db.query(`delete from auth.sessions where id = $1`, [SESION[U.entrenadorB]])
    expect(await filas(U.entrenadorB, `select * from public.jugadores`)).toEqual([])
  })
})
