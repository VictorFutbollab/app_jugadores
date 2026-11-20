import type { Consentimiento, Jugador, MiembroEquipo, NotaSeguimiento } from '../model/types'
import { edad } from './format'

/**
 * Reglas de privacidad de menores (RGPD + LOPDGDD).
 * En el cliente solo sirven para la interfaz; la garantía real la dan las
 * políticas por fila de Supabase (fase 2), que replican estas mismas reglas.
 */

export function consentimientoVigente(c: Consentimiento | null | undefined): c is Consentimiento {
  return !!c && !c.retiradoEn
}

export function tieneConsentimientoFicha(j: Pick<Jugador, 'consentimiento'>) {
  return consentimientoVigente(j.consentimiento) && j.consentimiento.alcance.ficha
}

export function puedeMostrarFoto(j: Jugador) {
  return tieneConsentimientoFicha(j) && !!j.consentimiento?.alcance.fotos && !!j.foto
}

/** Campos que se pueden guardar siempre (gestión deportiva básica). */
export const CAMPOS_MINIMOS = ['id', 'equipoId', 'nombre', 'apellidos', 'dorsal'] as const

/**
 * Devuelve el jugador recortado a nombre y dorsal si no hay consentimiento de ficha.
 * Se usa también al guardar: sin consentimiento no se persisten los demás datos.
 */
export function minimizar(j: Jugador): Jugador {
  if (tieneConsentimientoFicha(j)) return j
  return {
    ...j,
    foto: null,
    fechaNacimiento: null,
    posiciones: [],
    pierna: null,
    contactos: j.contactos, // el contacto de la familia hace falta para pedir el consentimiento
  }
}

export interface ResultadoValidacion {
  ok: boolean
  error?: string
}

/** Art. 7 LOPDGDD: desde los 14 años el menor puede consentir por sí mismo. */
export function validarConsentimiento(c: Consentimiento, fechaNacimiento?: string | null): ResultadoValidacion {
  if (!c.firmante.trim()) return { ok: false, error: 'Falta el nombre de quien firma.' }
  if (!c.fecha) return { ok: false, error: 'Falta la fecha del consentimiento.' }
  if (c.firmanteTipo === 'jugador_mayor_14') {
    const e = edad(fechaNacimiento, new Date(c.fecha))
    if (e == null) return { ok: false, error: 'Hace falta la fecha de nacimiento para que firme el propio jugador.' }
    if (e < 14) return { ok: false, error: 'Por debajo de 14 años debe firmar la madre, el padre o el tutor legal.' }
  }
  return { ok: true }
}

// ───────────── Permisos por rol ─────────────

export function puedeVerFicha(m: MiembroEquipo) {
  return m.rol === 'entrenador_principal' || m.permisos.verFicha
}
export function puedeEvaluar(m: MiembroEquipo) {
  return m.rol === 'entrenador_principal' || m.permisos.evaluar
}
export function puedeVerNota(m: MiembroEquipo, n: NotaSeguimiento) {
  if (n.autorId === m.usuarioId) return true
  if (n.visibilidad === 'apta_familia') return puedeVerFicha(m)
  return m.rol === 'entrenador_principal' || m.permisos.verNotasPrivadas
}
