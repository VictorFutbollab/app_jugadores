/**
 * Prueba de seguridad de punta a punta contra el proyecto REAL de Supabase:
 * Auth (inicio y cierre de sesión), PostgREST (API) y RLS, igual que lo usa la app.
 *
 * Lo más cómodo: powershell -ExecutionPolicy Bypass -File scripts/probar-seguridad.ps1
 * (pide la clave secreta de forma oculta). O a mano, con las variables en el entorno:
 *   $env:SUPABASE_URL = "https://xxxx.supabase.co"
 *   $env:SUPABASE_ANON_KEY = "<clave pública>"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role>"   # solo para crear y borrar los usuarios de prueba
 *   node scripts/probar-seguridad.mjs
 *
 * Crea 3 usuarios de prueba (admin, entrenador A y entrenador B) y 2 equipos, ejecuta
 * los 8 escenarios y lo borra todo al terminar. Sale con código 1 si algo falla.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL_SB = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SB || !ANON || !SERVICE) {
  console.log('Faltan SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(2)
}

const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const servidor = createClient(URL_SB, SERVICE, opciones) // proceso de servidor: solo prepara y limpia
const cliente = () => createClient(URL_SB, ANON, opciones) // lo mismo que tiene el navegador

const sufijo = randomUUID().slice(0, 8)
const PW = `Prueba-${randomUUID()}`
// Dominio real (con MX) para que Supabase acepte el formato; con email_confirm no se envía ningún correo.
const correo = (q) => `prueba.seguridad+${q}-${sufijo}@futbollab.com`
const EQ_A = `test-${sufijo}-a`
const EQ_B = `test-${sufijo}-b`

let fallos = 0
const ok = (cond, texto) => {
  console.log(`${cond ? '  ✔' : '  ✘'} ${texto}`)
  if (!cond) fallos++
}
const rechazado = (r) => !!r.error || (Array.isArray(r.data) && r.data.length === 0)

async function crearUsuario(q, extra = {}) {
  const { data, error } = await servidor.auth.admin.createUser({
    email: correo(q),
    password: PW,
    email_confirm: true,
    // aunque alguien mande role=admin en los metadatos, el servidor lo ignora
    user_metadata: { usuario: `t${q}${sufijo}`.slice(0, 20), nombre: `Prueba ${q}`, ...extra },
  })
  if (error) throw error
  return data.user.id
}
async function entrar(q) {
  const c = cliente()
  const { error } = await c.auth.signInWithPassword({ email: correo(q), password: PW })
  if (error) throw error
  return c
}

/** Borra restos de ejecuciones anteriores interrumpidas (solo datos de prueba). */
async function limpiarRestos() {
  const eq = await servidor.from('equipos').delete().like('id', 'test-%').select('id')
  let usuarios = 0
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await servidor.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error) throw error
    for (const u of data.users) {
      if (u.email?.startsWith('prueba.seguridad+') && u.email.endsWith('@futbollab.com')) {
        await servidor.auth.admin.deleteUser(u.id)
        usuarios++
      }
    }
    if (data.users.length < 200) break
  }
  if (eq.data?.length || usuarios) console.log(`Restos de pruebas anteriores borrados: ${eq.data?.length ?? 0} equipos y ${usuarios} usuarios.`)
}

const ids = {}
try {
  await limpiarRestos()
  console.log('Preparando usuarios y equipos de prueba…')
  ids.admin = await crearUsuario('admin')
  ids.a = await crearUsuario('a', { role: 'admin' })
  ids.b = await crearUsuario('b')
  const p = await servidor.rpc('promover_admin', { correo: correo('admin') })
  if (p.error) throw p.error
  const ins = async (t, filas) => {
    const r = await servidor.from(t).insert(filas)
    if (r.error) throw r.error
  }
  await ins('equipos', [{ id: EQ_A, data: { id: EQ_A, nombre: 'Prueba A' } }, { id: EQ_B, data: { id: EQ_B, nombre: 'Prueba B' } }])
  await ins('miembros', [
    { equipo_id: EQ_A, usuario_id: ids.a, rol: 'entrenador_principal', permisos: { verFicha: true, verNotasPrivadas: true, evaluar: true } },
    { equipo_id: EQ_B, usuario_id: ids.b, rol: 'entrenador_principal', permisos: { verFicha: true, verNotasPrivadas: true, evaluar: true } },
  ])
  const consentido = { fecha: '2026-09-01', firmante: 'Madre', firmanteTipo: 'madre', alcance: { ficha: true, fotos: false, notasVoz: false }, version: '2026.1' }
  await ins('jugadores', [
    { id: `${EQ_A}-j1`, equipo_id: EQ_A, data: { nombre: 'Jugador', apellidos: 'A', dorsal: 1, consentimiento: consentido } },
    { id: `${EQ_B}-j1`, equipo_id: EQ_B, data: { nombre: 'Jugadora', apellidos: 'B', dorsal: 1, consentimiento: consentido } },
  ])
  await ins('notas', [{ id: `${EQ_B}-n1`, equipo_id: EQ_B, jugador_id: `${EQ_B}-j1`, data: { texto: 'privada de B' }, visibilidad: 'privada', autor_id: ids.b }])

  console.log('\n1 · Un usuario normal inicia sesión y accede a su panel')
  const a = await entrar('a')
  const perfilA = await a.from('profiles').select('role').eq('id', ids.a).single()
  ok(perfilA.data?.role === 'player', `el registro con role=admin en los metadatos quedó como "${perfilA.data?.role}"`)
  const susJugadores = await a.from('jugadores').select('id')
  ok(susJugadores.data?.length === 1 && susJugadores.data[0].id === `${EQ_A}-j1`, 've solo a los jugadores de su equipo')
  const evalA = await a.from('evaluaciones').insert({ id: `${EQ_A}-ev1`, equipo_id: '', jugador_id: `${EQ_A}-j1`, data: { evaluadorId: ids.a, puntuaciones: [] } })
  ok(!evalA.error, 'puede evaluar a su jugador')

  console.log('\n2 y 3 · Un usuario normal intenta usar la API de administración')
  ok(rechazado(await a.from('jugadores').insert({ id: `${EQ_A}-x`, equipo_id: EQ_A, data: {} }).select()), 'crear jugador: rechazado')
  ok(rechazado(await a.from('jugadores').update({ data: { dorsal: 99 } }).eq('id', `${EQ_A}-j1`).select()), 'editar jugador: rechazado')
  ok(rechazado(await a.from('jugadores').delete().eq('id', `${EQ_A}-j1`).select()), 'borrar jugador: rechazado')
  ok(rechazado(await a.from('miembros').insert({ equipo_id: EQ_B, usuario_id: ids.a, rol: 'entrenador_principal' }).select()), 'meterse en otro equipo: rechazado')
  ok(rechazado(await a.rpc('admin_set_role', { objetivo: ids.b, nuevo: 'admin' })), 'admin_set_role: rechazado')
  ok(rechazado(await a.rpc('promover_admin', { correo: correo('a') })), 'promover_admin: rechazado')
  ok(rechazado(await a.from('registro_actividad').select('*')), 'leer el registro de actividad: sin acceso')

  console.log('\n4 · Un usuario normal intenta hacerse admin')
  ok(rechazado(await a.from('profiles').update({ role: 'admin' }).eq('id', ids.a).select()), 'update profiles.role: rechazado')
  ok(rechazado(await a.rpc('admin_set_role', { objetivo: ids.a, nuevo: 'admin' })), 'admin_set_role sobre sí mismo: rechazado')
  await a.auth.updateUser({ data: { role: 'admin' } }) // metadatos editables por el usuario: no deben contar
  const sigue = await servidor.from('profiles').select('role').eq('id', ids.a).single()
  ok(sigue.data?.role === 'player', `tras todos los intentos su rol sigue siendo "${sigue.data?.role}"`)

  console.log('\n5 · Un usuario normal intenta ver datos privados de otro equipo')
  ok((await a.from('jugadores').select('*').eq('equipo_id', EQ_B)).data?.length === 0, 'jugadores del otro equipo: 0 filas')
  ok((await a.from('notas').select('*').eq('equipo_id', EQ_B)).data?.length === 0, 'notas privadas del otro equipo: 0 filas')
  ok((await a.from('profiles').select('*').eq('id', ids.b)).data?.length === 0, 'perfil del otro entrenador: 0 filas')
  ok(rechazado(await a.from('evaluaciones').insert({ id: `${EQ_B}-evx`, equipo_id: EQ_A, jugador_id: `${EQ_B}-j1`, data: { evaluadorId: ids.a } }).select()), 'evaluar a un jugador del otro equipo (falseando equipo_id): rechazado')

  console.log('\n6 · El admin inicia sesión y gestiona')
  const adm = await entrar('admin')
  ok((await adm.from('profiles').select('role').eq('id', ids.admin).single()).data?.role === 'admin', 'su rol en el servidor es admin')
  ok((await adm.from('jugadores').select('id').in('equipo_id', [EQ_A, EQ_B])).data?.length === 2, 've los jugadores de todos los equipos')
  ok(!(await adm.from('jugadores').insert({ id: `${EQ_A}-j2`, equipo_id: EQ_A, data: { nombre: 'Alta', dorsal: 2 } })).error, 'da de alta un jugador')
  ok(!(await adm.rpc('admin_set_role', { objetivo: ids.b, nuevo: 'admin' })).error, 'nombra admin a otro')
  ok(!(await adm.rpc('admin_set_role', { objetivo: ids.b, nuevo: 'player' })).error, 'y se lo quita')
  const act = await adm.from('registro_actividad').select('accion, tabla, registro_id').eq('actor', ids.admin)
  ok(act.data?.some((x) => x.accion === 'INSERT' && x.registro_id === `${EQ_A}-j2`) && act.data?.some((x) => x.accion === 'CAMBIO_ROL'), 'sus acciones quedan en el registro de actividad')

  console.log('\n7 · Sin sesión')
  const anon = cliente()
  for (const t of ['profiles', 'jugadores', 'notas', 'registro_actividad']) ok(rechazado(await anon.from(t).select('*')), `leer ${t}: rechazado`)
  ok(rechazado(await anon.from('jugadores').insert({ id: 'anon', equipo_id: EQ_A, data: {} }).select()), 'escribir: rechazado')

  console.log('\n8 · El admin cierra sesión')
  const { data: s } = await adm.auth.getSession()
  const tokenViejo = s.session.access_token
  await adm.auth.signOut() // revoca la sesión en el servidor
  const robado = createClient(URL_SB, ANON, { ...opciones, global: { headers: { Authorization: `Bearer ${tokenViejo}` } } })
  ok((await robado.from('jugadores').select('id').in('equipo_id', [EQ_A, EQ_B])).data?.length === 0, 'con el token anterior (aún sin caducar) ya no ve datos')
  ok(rechazado(await robado.from('jugadores').insert({ id: `${EQ_A}-j3`, equipo_id: EQ_A, data: {} }).select()), 'ni puede administrar')
  ok(rechazado(await robado.rpc('admin_set_role', { objetivo: ids.a, nuevo: 'admin' })), 'ni cambiar roles')
} catch (e) {
  fallos++
  console.log('\nError preparando o ejecutando las pruebas:', JSON.stringify({ mensaje: e?.message ?? String(e), codigo: e?.code, estado: e?.status, detalles: e?.details, pista: e?.hint }))
} finally {
  console.log('\nLimpiando datos de prueba…')
  await servidor.from('equipos').delete().in('id', [EQ_A, EQ_B])
  for (const id of Object.values(ids)) await servidor.auth.admin.deleteUser(id)
}

console.log(fallos ? `\n✘ ${fallos} comprobaciones han fallado` : '\n✔ Todas las comprobaciones de seguridad han pasado')
process.exit(fallos ? 1 : 0)
