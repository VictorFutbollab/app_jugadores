/**
 * Acceso a los datos en Supabase.
 *
 * Esta capa NO decide permisos: cada consulta va con el token del usuario y la
 * base de datos aplica las políticas RLS (supabase/migrations). Si el usuario no
 * puede ver o tocar algo, el servidor devuelve 0 filas o un error, aunque alguien
 * manipule este código desde el navegador.
 */
import { errorLegible, supabase } from './supabase'
import { esErrorDeRed } from './offline'
import { crearDatosEjemplo, prefijarIds, type Dataset } from '../data/seed'
import { ITEMS_POR_DEFECTO } from '../data/items'
import type { Consentimiento, Cuenta, Equipo, Genero, MiembroEquipo, RolApp, Usuario } from '../model/types'

type Fila = Record<string, unknown> & { id?: string; data?: Record<string, unknown> }

/** Tablas con datos de un jugador concreto (el servidor fija su equipo_id). */
const POR_JUGADOR = ['estados', 'evaluaciones', 'pruebas', 'notas', 'asistencias', 'participaciones', 'cargas'] as const
type TablaJugador = (typeof POR_JUGADOR)[number]
export type TablaDatos = 'equipos' | 'jugadores' | 'eventos' | 'items' | TablaJugador

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw errorLegible(r.error)
  return r.data
}

/** Lee todas las filas visibles (PostgREST devuelve como mucho 1000 por petición). */
async function todas(tabla: string, columnas = '*'): Promise<Fila[]> {
  const out: Fila[] = []
  for (let desde = 0; ; desde += 1000) {
    const lote = ok(await supabase.from(tabla).select(columnas).range(desde, desde + 999)) as unknown as Fila[]
    out.push(...lote)
    if (lote.length < 1000) return out
  }
}

// ───────────── Perfiles y sesión ─────────────

interface FilaPerfil {
  id: string
  nombre: string
  usuario: string
  email: string
  telefono: string
  foto: string | null
  entidad: string
  categoria: string
  equipo: string
  genero: Genero
  acepta_privacidad_en: string | null
  role: RolApp
  creado_en: string
  actualizado_en: string
}

const aCuenta = (p: FilaPerfil): Cuenta => ({
  id: p.id,
  nombre: p.nombre,
  usuario: p.usuario,
  email: p.email,
  telefono: p.telefono,
  foto: p.foto,
  entidad: p.entidad,
  categoria: p.categoria,
  equipo: p.equipo,
  genero: p.genero,
  aceptaPrivacidadEn: p.acepta_privacidad_en,
  role: p.role,
  creadoEn: p.creado_en,
  actualizadoEn: p.actualizado_en,
})

/**
 * Perfil (y rol) del usuario con sesión, comprobado contra el servidor:
 * getUser() valida el token con Supabase Auth y el rol se lee de la base de datos.
 * Devuelve null si no hay sesión válida.
 */
export async function perfilActual(): Promise<Cuenta | null> {
  const { data, error } = await supabase.auth.getUser()
  // Sin señal no es "sin sesión": se lanza para que la app abra con la copia local.
  if (error && esErrorDeRed(error)) throw error
  if (error || !data.user) return null
  const r = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
  if (r.error) throw errorLegible(r.error)
  return r.data ? aCuenta(r.data as FilaPerfil) : null
}

/** Perfiles visibles: el propio y el cuerpo técnico de tus equipos; el admin, todos. */
export async function listarPerfiles(): Promise<Cuenta[]> {
  return (await todas('profiles')).map((p) => aCuenta(p as unknown as FilaPerfil))
}

/** Guarda los datos editables del propio perfil (el rol no se puede escribir desde aquí). */
export async function guardarPerfil(c: Cuenta) {
  ok(
    await supabase
      .from('profiles')
      .update({ nombre: c.nombre, usuario: c.usuario, telefono: c.telefono, foto: c.foto ?? null, entidad: c.entidad, categoria: c.categoria, equipo: c.equipo, genero: c.genero })
      .eq('id', c.id),
  )
}

export async function usuarioDisponible(u: string) {
  return !!ok(await supabase.rpc('usuario_disponible', { u }))
}

// ───────────── Datos ─────────────

const conId = (f: Fila) => ({ ...(f.data ?? {}), id: f.id })

/** Todo lo que el usuario puede ver, en el formato de la app. */
export async function cargarTodo(): Promise<Dataset> {
  const [equipos, miembros, jugadores, basicos, eventos, items, perfiles, ...porJugador] = await Promise.all([
    todas('equipos'),
    todas('miembros'),
    todas('jugadores'),
    supabase.rpc('jugadores_basicos').then((r) => (ok(r) as Fila[]) ?? []),
    todas('eventos'),
    todas('items'),
    todas('profiles', 'id, nombre, email, usuario, telefono, foto'),
    ...POR_JUGADOR.map((t) => todas(t)),
  ])
  const ds = Object.fromEntries(POR_JUGADOR.map((t, i) => [t, porJugador[i].map((f) => ({ ...conId(f), jugadorId: f.jugador_id, ...(t === 'notas' ? { visibilidad: f.visibilidad, autorId: f.autor_id } : {}) }))]))

  // Sin permiso de ver la ficha, el servidor solo da nombre y dorsal (jugadores_basicos).
  const completos = new Map<string | undefined, Record<string, unknown>>(jugadores.map((f) => [f.id, { ...conId(f), equipoId: f.equipo_id }]))
  for (const b of basicos) if (!completos.has(b.id)) completos.set(b.id, { ...conId(b), equipoId: b.equipo_id, consentimiento: null })

  return {
    ...ds,
    equipos: equipos.map(conId),
    miembros: miembros.map((m) => ({ equipoId: m.equipo_id, usuarioId: m.usuario_id, rol: m.rol, permisos: m.permisos })),
    jugadores: [...completos.values()],
    eventos: eventos.map((f) => ({ ...conId(f), equipoId: f.equipo_id })),
    items: [...ITEMS_POR_DEFECTO, ...items.map((f) => ({ ...conId(f), equipoId: f.equipo_id ?? null }))],
    usuarios: perfiles as unknown as Usuario[],
  } as unknown as Dataset
}

/** Fila de base de datos para un objeto de la app. */
function aFila(tabla: TablaDatos, o: Record<string, unknown>): Record<string, unknown> {
  const data = { ...o }
  switch (tabla) {
    case 'equipos':
      return { id: o.id, data }
    case 'jugadores':
    case 'eventos':
      return { id: o.id, equipo_id: o.equipoId, data }
    case 'items':
      return { id: o.id, equipo_id: o.equipoId ?? null, data }
    case 'notas':
      // equipo_id lo pone el servidor a partir del jugador (no se puede falsear)
      return { id: o.id, equipo_id: '', jugador_id: o.jugadorId, visibilidad: o.visibilidad, autor_id: o.autorId, data }
    default:
      return { id: o.id, equipo_id: '', jugador_id: o.jugadorId, data }
  }
}

/**
 * Equipos y jugadores se guardan con las funciones compartidas de FutbolLab (las mismas que usa Informes):
 * permiten crear y editar al entrenador (cuenta manager) y al admin, fusionan los datos sin borrar lo que
 * guardan otras apps y nunca tocan el consentimiento (solo jugador_registrar_consentimiento).
 */
async function guardarCompartido(tabla: 'equipos' | 'jugadores', o: Record<string, unknown>) {
  if (tabla === 'equipos') ok(await supabase.rpc('inf_guardar_equipo', { p_id: o.id, p_cambios: o }))
  else ok(await supabase.rpc('inf_guardar_jugadores', { p_equipo: o.equipoId, p_jugadores: [{ id: o.id, data: o }] }))
}

export async function guardar(tabla: TablaDatos, o: object) {
  if (tabla === 'equipos' || tabla === 'jugadores') return guardarCompartido(tabla, o as Record<string, unknown>)
  ok(await supabase.from(tabla).upsert(aFila(tabla, o as Record<string, unknown>), { onConflict: 'id' }))
}

export async function guardarVarios(tabla: TablaDatos, filas: object[]) {
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500).map((o) => aFila(tabla, o as Record<string, unknown>))
    ok(await supabase.from(tabla).upsert(lote, { onConflict: 'id' }))
  }
}

/** Borrado completo (art. 17 RGPD): la base de datos borra en cascada todo lo del jugador. Solo admin. */
export async function borrarJugador(id: string) {
  const borradas = ok(await supabase.from('jugadores').delete().eq('id', id).select('id')) as { id: string }[]
  if (borradas.length === 0) throw new Error('No tienes permiso para borrar este jugador.')
}

/** Todos los datos de un jugador que el usuario puede ver (art. 15 y 20 RGPD). */
export async function exportarJugador(id: string) {
  const jugador = ok(await supabase.from('jugadores').select('*').eq('id', id).maybeSingle())
  const out: Record<string, unknown> = { exportadoEn: new Date().toISOString(), jugador: jugador ? conId(jugador as Fila) : null }
  for (const t of POR_JUGADOR) out[t] = (ok(await supabase.from(t).select('*').eq('jugador_id', id)) as Fila[]).map(conId)
  return out
}

// ───────────── Acciones del entrenador (funciones de servidor con su propia comprobación) ─────────────

export async function marcarFavorito(id: string, valor: boolean) {
  ok(await supabase.rpc('jugador_set_favorito', { jid: id, valor }))
}

export async function registrarConsentimiento(id: string, c: Consentimiento, fechaNacimiento: string | null) {
  ok(await supabase.rpc('jugador_registrar_consentimiento', { jid: id, c, fecha_nacimiento: fechaNacimiento ?? '' }))
}

// ───────────── Administración (el servidor exige rol admin en cada una) ─────────────

/**
 * Comprueba el PIN de administración en el servidor. Si es correcto (y la cuenta es
 * admin), ESTA sesión pasa a tener poderes de admin; ninguna otra. Tras 5 fallos el
 * servidor bloquea 15 minutos y lanza un error con el aviso.
 */
export async function verificarPinAdmin(pin: string): Promise<boolean> {
  return ok(await supabase.rpc('admin_verificar_pin', { pin })) === true
}

export async function guardarMiembro(m: MiembroEquipo) {
  ok(await supabase.from('miembros').upsert({ equipo_id: m.equipoId, usuario_id: m.usuarioId, rol: m.rol, permisos: m.permisos }, { onConflict: 'equipo_id,usuario_id' }))
}

export async function quitarMiembro(equipoId: string, usuarioId: string) {
  ok(await supabase.from('miembros').delete().eq('equipo_id', equipoId).eq('usuario_id', usuarioId))
}

export async function cambiarRol(usuarioId: string, role: RolApp) {
  ok(await supabase.rpc('admin_set_role', { objetivo: usuarioId, nuevo: role }))
}

/** Crea el equipo con la función compartida: quien lo crea queda como entrenador principal (en todas las apps). */
export async function crearEquipo(e: Equipo) {
  ok(await supabase.rpc('inf_crear_equipo', { p_id: e.id, p_data: e }))
}

/**
 * Plantilla de ejemplo (ficticia) en un equipo nuevo, con ids únicos.
 * Sustituye a la anterior plantilla de ejemplo, si la había. Solo admin.
 */
export async function cargarEjemplo(): Promise<string> {
  ok(await supabase.from('equipos').delete().like('id', 'demo-%'))
  const prefijo = `demo-${crypto.randomUUID().slice(0, 8)}-`
  const ds = prefijarIds(crearDatosEjemplo(), prefijo)
  await guardarVarios('equipos', ds.equipos)
  await guardarVarios('jugadores', ds.jugadores)
  await guardarVarios('eventos', ds.eventos)
  for (const t of POR_JUGADOR) await guardarVarios(t, ds[t])
  return ds.equipos[0].id
}

export interface EntradaActividad {
  id: number
  creado_en: string
  actor: string | null
  actor_es_admin: boolean
  accion: string
  tabla: string
  registro_id: string | null
  cambios: Record<string, unknown> | null
}

/** Últimas acciones registradas (solo las ve un admin). */
export async function leerActividad(limite = 50): Promise<EntradaActividad[]> {
  return ok(await supabase.from('registro_actividad').select('*').order('id', { ascending: false }).limit(limite)) as EntradaActividad[]
}
