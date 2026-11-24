/**
 * Lógica del panel de administración: filtros, orden, validación y exportación.
 * Funciones puras (sin React ni IndexedDB) para poder probarlas.
 */
import type { Cuenta, Estado, Jugador, MiembroEquipo, Rol } from '../model/types'
import type { DatosExternos, ResumenJugador } from './stats'
import { tieneConsentimientoFicha } from './privacy'
import { ESTADO_INFO, POSICION_NOMBRE } from './format'

export const ROLES: Rol[] = ['entrenador_principal', 'ayudante', 'preparador_fisico', 'coordinador']
export const ROL_NOMBRE: Record<Rol, string> = {
  entrenador_principal: 'Entrenador principal',
  ayudante: 'Ayudante',
  preparador_fisico: 'Preparador físico',
  coordinador: 'Coordinador',
}

/** A partir de cuántos días sin evaluar se avisa. */
export const DIAS_SIN_EVALUAR = 21

export interface FilaAdmin {
  j: Jugador
  estado?: Estado
  r?: ResumenJugador
  x?: DatosExternos
  consentimiento: boolean
  /** Días desde la última evaluación; null si nunca se ha evaluado. */
  diasSinEvaluar: number | null
}

export function filaAdmin(j: Jugador, estado: Estado | undefined, r: ResumenJugador | undefined, x: DatosExternos | undefined, hoy = new Date()): FilaAdmin {
  const ult = r?.ultimaEvaluacion
  return {
    j,
    estado,
    r,
    x,
    consentimiento: tieneConsentimientoFicha(j),
    diasSinEvaluar: ult ? Math.floor((hoy.getTime() - new Date(ult).getTime()) / 86_400_000) : null,
  }
}

export type FiltroAdmin = 'activos' | 'atencion' | 'sin_consentimiento' | 'no_disponibles' | 'sin_evaluar' | 'archivados' | 'todos'

/** Los cuatro filtros que se muestran: pocos y claros. */
export const FILTROS_ADMIN: { id: FiltroAdmin; nombre: string }[] = [
  { id: 'activos', nombre: 'Activos' },
  { id: 'atencion', nombre: 'Necesitan atención' },
  { id: 'archivados', nombre: 'Archivados' },
  { id: 'todos', nombre: 'Todos' },
]

export type MotivoAtencion = 'consentimiento' | 'no_disponible' | 'sin_evaluar'

/** Por qué un jugador activo necesita que alguien haga algo (vacío si no necesita nada). */
export function motivosAtencion(f: FilaAdmin): MotivoAtencion[] {
  if (f.j.archivado) return []
  const m: MotivoAtencion[] = []
  if (!f.consentimiento) m.push('consentimiento')
  if (f.estado && f.estado.tipo !== 'disponible') m.push('no_disponible')
  if (f.consentimiento && (f.diasSinEvaluar == null || f.diasSinEvaluar >= DIAS_SIN_EVALUAR)) m.push('sin_evaluar')
  return m
}

export function cumpleFiltro(f: FilaAdmin, filtro: FiltroAdmin): boolean {
  const activo = !f.j.archivado
  switch (filtro) {
    case 'todos':
      return true
    case 'atencion':
      return motivosAtencion(f).length > 0
    case 'archivados':
      return !activo
    case 'sin_consentimiento':
      return activo && !f.consentimiento
    case 'no_disponibles':
      return activo && !!f.estado && f.estado.tipo !== 'disponible'
    case 'sin_evaluar':
      return activo && f.consentimiento && (f.diasSinEvaluar == null || f.diasSinEvaluar >= DIAS_SIN_EVALUAR)
    default:
      return activo
  }
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca por nombre, apellidos o dorsal, sin distinguir tildes ni mayúsculas. */
export function coincideBusqueda(j: Jugador, q: string) {
  const t = sinTildes(q.trim())
  if (!t) return true
  if (/^\d+$/.test(t)) return String(j.dorsal) === t
  return sinTildes(`${j.nombre} ${j.apellidos}`).includes(t)
}

export type OrdenAdmin = 'dorsal' | 'nombre' | 'media' | 'asistencia' | 'minutos' | 'ultima'

/** Ordena; los valores vacíos van siempre al final, en cualquier sentido. */
export function ordenarFilas(filas: FilaAdmin[], orden: OrdenAdmin, asc: boolean): FilaAdmin[] {
  const valor = (f: FilaAdmin): number | string | null => {
    switch (orden) {
      case 'nombre':
        return sinTildes(`${f.j.nombre} ${f.j.apellidos}`)
      case 'media':
        return f.r?.media ?? null
      case 'asistencia':
        return f.x?.asistenciaPct ?? null
      case 'minutos':
        return f.x?.minutos ?? null
      case 'ultima':
        return f.r?.ultimaEvaluacion ?? null
      default:
        return f.j.dorsal
    }
  }
  return [...filas].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    if (va == null && vb == null) return a.j.dorsal - b.j.dorsal
    if (va == null) return 1
    if (vb == null) return -1
    const c = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number)
    return (asc ? c : -c) || a.j.dorsal - b.j.dorsal
  })
}

export type ErroresJugador = Partial<Record<'nombre' | 'apellidos' | 'dorsal', string>>

/** Nombre y apellidos obligatorios; dorsal de 1 a 99 y sin repetir entre los jugadores activos del equipo. */
export function validarJugador(j: Pick<Jugador, 'id' | 'equipoId' | 'nombre' | 'apellidos' | 'dorsal' | 'archivado'>, todos: Jugador[]): ErroresJugador {
  const e: ErroresJugador = {}
  if (!j.nombre.trim()) e.nombre = 'Escribe el nombre.'
  if (!j.apellidos.trim()) e.apellidos = 'Escribe los apellidos.'
  if (!Number.isInteger(j.dorsal) || j.dorsal < 1 || j.dorsal > 99) e.dorsal = 'Dorsal de 1 a 99.'
  else if (!j.archivado) {
    const otro = todos.find((x) => x.id !== j.id && x.equipoId === j.equipoId && !x.archivado && !x.eliminadoEn && x.dorsal === j.dorsal)
    if (otro) e.dorsal = `El ${j.dorsal} ya lo lleva ${otro.nombre} ${otro.apellidos.split(' ')[0]}.`
  }
  return e
}

/** Primer dorsal libre entre los activos del equipo (para dar de alta más rápido). */
export function dorsalLibre(todos: Jugador[], equipoId: string) {
  const usados = new Set(todos.filter((x) => x.equipoId === equipoId && !x.archivado && !x.eliminadoEn).map((x) => x.dorsal))
  for (let d = 1; d <= 99; d++) if (!usados.has(d)) return d
  return 1
}

/**
 * ¿Seguiría habiendo al menos un admin si la cuenta `id` pasa a ser (o deja de ser) admin?
 * Solo para avisar en la interfaz: la regla la aplica el servidor en admin_set_role.
 */
export function quedaAlgunAdmin(cuentas: Pick<Cuenta, 'id' | 'role'>[], id: string, esAdmin: boolean) {
  return cuentas.some((c) => (c.id === id ? esAdmin : c.role === 'admin'))
}

// ───────────── Exportación CSV (Excel en español: separador ";" y BOM) ─────────────

/** Escapa una celda y evita la inyección de fórmulas en Excel (= + - @ al inicio). */
export function celdaCsv(v: unknown): string {
  let s = v == null ? '' : String(v)
  const numero = /^-?\d+([.,]\d+)?$/.test(s) // -0,3 es un número, no una fórmula
  if (!numero && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const dec = (n: number | null | undefined, d = 1) => (n == null || Number.isNaN(n) ? '' : n.toFixed(d).replace('.', ','))

export function csvJugadores(filas: FilaAdmin[]): string {
  const cab = ['Dorsal', 'Nombre', 'Apellidos', 'Posición', 'Estado', 'Consentimiento', 'Media', 'Tendencia 30 días', 'Asistencia %', 'Minutos', 'Goles', 'Última evaluación', 'Archivado']
  const filasCsv = filas.map((f) => [
    f.j.dorsal,
    f.j.nombre,
    f.j.apellidos,
    f.j.posiciones?.[0] ? POSICION_NOMBRE[f.j.posiciones[0]] : '',
    f.estado ? ESTADO_INFO[f.estado.tipo].nombre : '',
    f.consentimiento ? 'Sí' : 'No',
    dec(f.r?.media),
    dec(f.r?.tendencia),
    f.x?.asistenciaPct == null ? '' : Math.round(f.x.asistenciaPct * 100),
    f.x?.minutos ?? '',
    f.x?.goles ?? '',
    f.r?.ultimaEvaluacion?.slice(0, 10) ?? '',
    f.j.archivado ? 'Sí' : 'No',
  ])
  return [cab, ...filasCsv].map((r) => r.map(celdaCsv).join(';')).join('\r\n')
}

// ───────────── Tipos de acceso (en lugar de casillas sueltas) ─────────────

export type TipoAcceso = 'principal' | 'ayudante' | 'consulta' | 'personalizado'

export const TIPOS_ACCESO: { id: Exclude<TipoAcceso, 'personalizado'>; nombre: string; descripcion: string }[] = [
  { id: 'principal', nombre: 'Entrenador principal', descripcion: 'Puede todo en su equipo' },
  { id: 'ayudante', nombre: 'Ayudante', descripcion: 'Ve las fichas y evalúa; no ve notas privadas' },
  { id: 'consulta', nombre: 'Solo consulta', descripcion: 'Ve las fichas; no evalúa ni ve notas privadas' },
]

const PERMISOS_DE: Record<Exclude<TipoAcceso, 'personalizado'>, MiembroEquipo['permisos']> = {
  principal: { verFicha: true, verNotasPrivadas: true, evaluar: true },
  ayudante: { verFicha: true, verNotasPrivadas: false, evaluar: true },
  consulta: { verFicha: true, verNotasPrivadas: false, evaluar: false },
}

/** Qué tipo de acceso tiene un miembro según su rol y permisos. */
export function tipoAcceso(m: Pick<MiembroEquipo, 'rol' | 'permisos'>): TipoAcceso {
  if (m.rol === 'entrenador_principal') return 'principal'
  const p = m.permisos
  for (const t of ['ayudante', 'consulta'] as const) {
    const q = PERMISOS_DE[t]
    if (p.verFicha === q.verFicha && p.evaluar === q.evaluar && p.verNotasPrivadas === q.verNotasPrivadas) return t
  }
  return 'personalizado'
}

/** Aplica un tipo de acceso. Conserva el puesto (preparador físico, coordinador…) si no es el principal. */
export function conAcceso<M extends Pick<MiembroEquipo, 'rol' | 'permisos'>>(m: M, t: Exclude<TipoAcceso, 'personalizado'>): M {
  const rol: Rol = t === 'principal' ? 'entrenador_principal' : m.rol === 'entrenador_principal' ? (t === 'ayudante' ? 'ayudante' : 'coordinador') : m.rol
  return { ...m, rol, permisos: { ...PERMISOS_DE[t] } }
}

// ───────────── Registro de actividad en lenguaje normal ─────────────

export interface EntradaRegistro {
  accion: string
  tabla: string
  registro_id: string | null
  cambios: Record<string, unknown> | null
}

export interface NombresRegistro {
  jugador: (id: string) => string | undefined
  /** jugador al que pertenece un estado */
  jugadorDeEstado: (estadoId: string) => string | undefined
  persona: (usuarioId: string) => string | undefined
  equipo: (equipoId: string) => string | undefined
}

const CAMPO: Record<string, string> = {
  nombre: 'nombre', apellidos: 'apellidos', dorsal: 'dorsal', consentimiento: 'consentimiento', favorito: 'favorito',
  archivado: 'archivado', posiciones: 'posiciones', pierna: 'pierna', fechaNacimiento: 'fecha de nacimiento',
  contactos: 'contactos', tipo: 'estado', desde: 'fecha', vueltaPrevista: 'vuelta prevista', nota: 'nota',
  rol: 'rol', permisos: 'permisos', foto: 'foto',
}
const ESTADO_TXT: Record<string, string> = { disponible: 'disponible', lesionado: 'lesionado', enfermo: 'enfermo', sancionado: 'sancionado' }

export type TipoRegistro = 'jugadores' | 'equipo' | 'roles'

/** Convierte una entrada técnica del registro en una frase ("dio de alta a Lucas (10)"). */
export function describirRegistro(x: EntradaRegistro, n: NombresRegistro): { texto: string; tipo: TipoRegistro } {
  const c = (x.cambios ?? {}) as Record<string, { antes?: unknown; despues?: unknown } & unknown>
  const id = x.registro_id ?? ''
  const valor = (k: string) => (c[k] as unknown as string | number | undefined) ?? undefined
  const campos = () =>
    Object.keys(c)
      .map((k) => CAMPO[k])
      .filter(Boolean)
      .join(', ')
  switch (x.tabla) {
    case 'jugadores': {
      const nombre = n.jugador(id) ?? (valor('nombre') ? `${valor('nombre')}${valor('apellidos') ? ` ${valor('apellidos')}` : ''}` : 'un jugador')
      const dorsal = valor('dorsal')
      if (x.accion === 'INSERT') return { texto: `dio de alta a ${nombre}${dorsal != null ? ` (${dorsal})` : ''}`, tipo: 'jugadores' }
      if (x.accion === 'DELETE') return { texto: `borró a ${nombre} y todos sus datos`, tipo: 'jugadores' }
      const arch = c.archivado as { despues?: unknown } | undefined
      if (arch && Object.keys(c).length === 1) return { texto: arch.despues ? `archivó a ${nombre}` : `recuperó a ${nombre}`, tipo: 'jugadores' }
      return { texto: `editó la ficha de ${nombre}${campos() ? ` (${campos()})` : ''}`, tipo: 'jugadores' }
    }
    case 'estados': {
      const jid = n.jugadorDeEstado(id)
      const nombre = (jid && n.jugador(jid)) ?? 'un jugador'
      const tipo = (c.tipo as { despues?: string } | undefined)?.despues ?? (valor('tipo') as string | undefined)
      if (x.accion === 'DELETE') return { texto: `borró el estado de ${nombre}`, tipo: 'jugadores' }
      return { texto: tipo ? `marcó a ${nombre} como ${ESTADO_TXT[tipo] ?? tipo}` : `cambió la disponibilidad de ${nombre}`, tipo: 'jugadores' }
    }
    case 'miembros': {
      const [eq, uid] = id.split('/')
      const persona = n.persona(uid) ?? 'una persona'
      const equipo = n.equipo(eq) ?? 'un equipo'
      if (x.accion === 'INSERT') return { texto: `añadió a ${persona} a ${equipo}`, tipo: 'equipo' }
      if (x.accion === 'DELETE') return { texto: `quitó a ${persona} de ${equipo}`, tipo: 'equipo' }
      return { texto: `cambió el acceso de ${persona} en ${equipo}`, tipo: 'equipo' }
    }
    case 'equipos': {
      const nombre = n.equipo(id) ?? (valor('nombre') as string | undefined) ?? 'un equipo'
      if (x.accion === 'INSERT') return { texto: `creó el equipo ${nombre}`, tipo: 'equipo' }
      if (x.accion === 'DELETE') return { texto: `borró el equipo ${nombre}`, tipo: 'equipo' }
      return { texto: `editó el equipo ${nombre}`, tipo: 'equipo' }
    }
    case 'profiles': {
      const persona = n.persona(id) ?? 'una cuenta'
      const r = c.role as { despues?: string } | undefined
      return { texto: r?.despues === 'admin' ? `nombró administrador a ${persona}` : `quitó el rol de administrador a ${persona}`, tipo: 'roles' }
    }
    default:
      return { texto: `cambió ${x.tabla}`, tipo: 'equipo' }
  }
}
