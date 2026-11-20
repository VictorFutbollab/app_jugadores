/**
 * Lógica del panel de administración: filtros, orden, validación y exportación.
 * Funciones puras (sin React ni IndexedDB) para poder probarlas.
 */
import type { Cuenta, Estado, Jugador, Rol } from '../model/types'
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

export type FiltroAdmin = 'activos' | 'sin_consentimiento' | 'no_disponibles' | 'sin_evaluar' | 'archivados' | 'todos'
export const FILTROS_ADMIN: { id: FiltroAdmin; nombre: string }[] = [
  { id: 'activos', nombre: 'Activos' },
  { id: 'sin_consentimiento', nombre: 'Sin consentimiento' },
  { id: 'no_disponibles', nombre: 'No disponibles' },
  { id: 'sin_evaluar', nombre: `Sin evaluar ${DIAS_SIN_EVALUAR} días` },
  { id: 'archivados', nombre: 'Archivados' },
  { id: 'todos', nombre: 'Todos' },
]

export function cumpleFiltro(f: FilaAdmin, filtro: FiltroAdmin): boolean {
  const activo = !f.j.archivado
  switch (filtro) {
    case 'todos':
      return true
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
