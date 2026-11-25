import type { TipoCuenta } from '../db/cuenta'
import type { Equipo, Genero, Modalidad } from '../model/types'

/**
 * Qué puede hacer la cuenta en el panel del entrenador. Solo decide qué se ENSEÑA:
 * la regla de verdad la aplica la base de datos (tipo_cuenta, puede_editar_equipo y RLS).
 *
 *  - crearEquipo: cuentas manager o admin (una familia no crea equipos).
 *  - editarEquipo / anadirJugador / editarJugador: además, puede_editar_equipo del equipo activo.
 */
export function accionesEntrenador({ tipoCuenta, puedeEditar }: { tipoCuenta: TipoCuenta | null; puedeEditar: boolean }) {
  const gestor = tipoCuenta === 'manager' || tipoCuenta === 'admin'
  const edita = gestor && puedeEditar
  return { crearEquipo: gestor, editarEquipo: edita, anadirJugador: edita, editarJugador: edita }
}

export const MODALIDADES: Modalidad[] = ['F7', 'F8', 'F11']
export const GENEROS: [Genero, string][] = [
  ['masculino', 'Masculino'],
  ['femenino', 'Femenino'],
  ['mixto', 'Mixto'],
]

/** Temporada actual: de julio a junio ("2026-27"). */
export function temporadaActual(hoy = new Date()) {
  const y = hoy.getMonth() >= 6 ? hoy.getFullYear() : hoy.getFullYear() - 1
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`
}

export type DatosEquipo = Pick<Equipo, 'nombre' | 'categoria' | 'modalidad' | 'temporada' | 'entidad'> & { genero: Genero }
export type ErroresEquipo = Partial<Record<keyof DatosEquipo, string>>

export function validarEquipo(d: DatosEquipo): ErroresEquipo {
  const e: ErroresEquipo = {}
  if (!d.nombre.trim()) e.nombre = 'Escribe el nombre del equipo.'
  else if (d.nombre.trim().length > 60) e.nombre = 'Como mucho 60 caracteres.'
  if (!d.categoria.trim()) e.categoria = 'Elige la categoría.'
  if (!MODALIDADES.includes(d.modalidad)) e.modalidad = 'Elige F7, F8 o F11.'
  if (!/^\d{4}-\d{2}$/.test(d.temporada.trim())) e.temporada = 'Formato 2026-27.'
  if (d.entidad.trim().length < 2) e.entidad = 'Escribe el club o la escuela.'
  return e
}
