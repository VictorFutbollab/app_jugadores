import type { Area, Posicion, TipoEstado } from '../model/types'

export const AREAS: Area[] = ['tecnica', 'tactica', 'fisica', 'mental'] // orden fijo en todo FutbolLab

export const AREA_NOMBRE: Record<Area, string> = {
  tecnica: 'Técnica',
  tactica: 'Táctica',
  fisica: 'Física',
  mental: 'Actitud y mental',
}
export const AREA_CORTO: Record<Area, string> = {
  tecnica: 'Técnica',
  tactica: 'Táctica',
  fisica: 'Física',
  mental: 'Mental',
}
/** Colores por área: variables CSS con versión para modo oscuro y claro (contraste ≥ 3:1 en ambos). */
export const AREA_COLOR: Record<Area, string> = {
  tecnica: 'var(--area-tecnica)',
  tactica: 'var(--area-tactica)',
  fisica: 'var(--area-fisica)',
  mental: 'var(--area-mental)',
}

export const POSICION_NOMBRE: Record<Posicion, string> = {
  POR: 'Portero',
  LD: 'Lateral derecho',
  LI: 'Lateral izquierdo',
  DFC: 'Central',
  MCD: 'Pivote',
  MC: 'Centrocampista',
  MCO: 'Mediapunta',
  ED: 'Extremo derecho',
  EI: 'Extremo izquierdo',
  DC: 'Delantero',
}
/** Orden táctico para ordenar por posición. */
export const POSICION_ORDEN: Posicion[] = ['POR', 'LD', 'DFC', 'LI', 'MCD', 'MC', 'MCO', 'ED', 'EI', 'DC']

export const ESTADO_INFO: Record<TipoEstado, { nombre: string; icono: string; color: string }> = {
  disponible: { nombre: 'Disponible', icono: '✓', color: 'var(--ok)' },
  lesionado: { nombre: 'Lesionado', icono: '✚', color: 'var(--warn)' }, // nunca rojo sobre un jugador
  enfermo: { nombre: 'Enfermo', icono: '●', color: 'var(--warn)' },
  sancionado: { nombre: 'Sancionado', icono: '■', color: 'var(--warn)' },
}

const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

export const num1 = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '–' : nf1.format(n))
export const num0 = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '–' : nf0.format(n))
export const pct = (n: number | null | undefined) => (n == null ? '–' : `${nf0.format(n * 100)} %`)

export function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
export function fechaLarga(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function edad(fechaNacimiento: string | null | undefined, hoy = new Date()) {
  if (!fechaNacimiento) return null
  const f = new Date(fechaNacimiento)
  let e = hoy.getFullYear() - f.getFullYear()
  const m = hoy.getMonth() - f.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) e--
  return e
}

export const iniciales = (nombre: string, apellidos: string) =>
  `${nombre[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase()

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
