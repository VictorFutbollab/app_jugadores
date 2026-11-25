/**
 * "Necesitan tu mirada": avisos del Inicio, con el motivo en una frase de entrenador.
 * Nunca en negativo absoluto y siempre con el siguiente paso implícito.
 * Lógica pura (sin React) para poder probarla.
 */
import type { Estado, Jugador } from '../model/types'
import type { DatosExternos, ResumenJugador } from './stats'
import { tieneConsentimientoFicha } from './privacy'
import { fechaCorta } from './format'

export type TipoAlerta = 'no_disponible' | 'consentimiento' | 'bajada' | 'carga' | 'sin_evaluar'

export interface Alerta {
  jugador: Jugador
  tipo: TipoAlerta
  frase: string
}

/** Orden de importancia: primero lo que afecta a quién puede jugar o ser evaluado. */
const PRIORIDAD: Record<TipoAlerta, number> = { no_disponible: 0, consentimiento: 1, bajada: 2, carga: 3, sin_evaluar: 4 }
const DIA = 86_400_000
export const DIAS_SIN_EVALUAR_INICIO = 21

export function alertasInicio(
  jugadores: Jugador[],
  resumen: Map<string, ResumenJugador>,
  externos: Map<string, DatosExternos>,
  estadoDe: (id: string) => Estado | undefined,
  hoy = new Date(),
): Alerta[] {
  const out: Alerta[] = []
  for (const j of jugadores) {
    const n = j.nombre
    const e = estadoDe(j.id)
    const r = resumen.get(j.id)
    const x = externos.get(j.id)
    const ficha = tieneConsentimientoFicha(j)
    if (e && e.tipo !== 'disponible') {
      out.push({ jugador: j, tipo: 'no_disponible', frase: e.vueltaPrevista ? `${n} no está disponible; vuelve el ${fechaCorta(e.vueltaPrevista)}.` : `${n} no está disponible por ahora.` })
    }
    if (!ficha) {
      out.push({ jugador: j, tipo: 'consentimiento', frase: `Falta el consentimiento de la familia de ${n}: hasta entonces no se le puede evaluar.` })
      continue
    }
    if (r?.tendencia != null && r.tendencia <= -0.6 /* escala 0–10 */) {
      out.push({ jugador: j, tipo: 'bajada', frase: `A ${n} le está costando más este mes; buen momento para hablar con él.` })
    }
    if (x && x.cargaMediaSemanal > 0 && x.cargaSemana > x.cargaMediaSemanal * 1.3) {
      out.push({ jugador: j, tipo: 'carga', frase: `${n} lleva mucha carga esta semana; vigila su descanso.` })
    }
    const ult = r?.ultimaEvaluacion
    if (!ult || hoy.getTime() - new Date(ult).getTime() > DIAS_SIN_EVALUAR_INICIO * DIA) {
      out.push({ jugador: j, tipo: 'sin_evaluar', frase: ult ? `Hace más de 3 semanas que no evalúas a ${n}.` : `Aún no has evaluado a ${n}.` })
    }
  }
  return out.sort((a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo] || a.jugador.dorsal - b.jugador.dorsal)
}

/** Los que más mejoran este mes (solo mejoras reales, frente a sí mismos). */
export function masMejoran(jugadores: Jugador[], resumen: Map<string, ResumenJugador>, max = 3): Jugador[] {
  return jugadores
    .filter((j) => (resumen.get(j.id)?.tendencia ?? 0) > 0.1) /* escala 0–10 */
    .sort((a, b) => resumen.get(b.id)!.tendencia! - resumen.get(a.id)!.tendencia!)
    .slice(0, max)
}

/** Tiempo orientativo de una evaluación rápida (~30 s por jugador). */
export function minutosEvaluar(n: number) {
  return Math.max(1, Math.round((n * 30) / 60))
}
