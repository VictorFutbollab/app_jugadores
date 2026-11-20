import type {
  Area,
  Asistencia,
  CargaSesion,
  Evaluacion,
  ItemEvaluacion,
  Jugador,
  ParticipacionPartido,
} from '../model/types'
import { AREAS, edad } from './format'

export type AreaScores = Record<Area, number | null>

const DIA = 86_400_000

/** Ítems que se aplican a un jugador según edad y posición. */
export function itemsAplicables(items: ItemEvaluacion[], j: Pick<Jugador, 'fechaNacimiento' | 'posiciones'>, hoy = new Date()) {
  const e = edad(j.fechaNacimiento, hoy) ?? 12
  const esPortero = j.posiciones?.[0] === 'POR'
  return items.filter(
    (i) =>
      i.activo &&
      !i.eliminadoEn &&
      e >= i.edadMin &&
      e <= i.edadMax &&
      (i.ambito === 'todos' || (esPortero ? i.ambito === 'portero' : i.ambito === 'campo')),
  )
}

/** Última puntuación de cada ítem hasta una fecha (incluida). Lo no observado no cuenta. */
export function ultimasPuntuaciones(evals: Evaluacion[], hasta?: string) {
  const lim = hasta ? new Date(hasta).getTime() : Infinity
  const orden = evals
    .filter((e) => !e.eliminadoEn && new Date(e.fecha).getTime() <= lim)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  const m = new Map<string, number>()
  for (const ev of orden) for (const p of ev.puntuaciones) m.set(p.itemId, p.valor)
  return m
}

/** Peso de un ítem: en iniciación (6–9 años) pesa más la coordinación. */
function pesoItem(item: ItemEvaluacion, e: number) {
  return e <= 9 && item.id === 'fis-coordinacion' ? 2 : 1
}
/** Peso de cada área en la media general: en iniciación pesan más actitud y física (coordinación). */
export function pesosArea(e: number): Record<Area, number> {
  return e <= 9 ? { tecnica: 1, tactica: 0.5, fisica: 1.25, mental: 1.5 } : { tecnica: 1, tactica: 1, fisica: 1, mental: 1 }
}

export function puntuacionesPorArea(ult: Map<string, number>, items: ItemEvaluacion[], e = 12): AreaScores {
  const byId = new Map(items.map((i) => [i.id, i]))
  const acc: Record<Area, { s: number; w: number }> = {
    tecnica: { s: 0, w: 0 },
    tactica: { s: 0, w: 0 },
    fisica: { s: 0, w: 0 },
    mental: { s: 0, w: 0 },
  }
  for (const [itemId, v] of ult) {
    const it = byId.get(itemId)
    if (!it) continue
    const w = pesoItem(it, e)
    acc[it.area].s += v * w
    acc[it.area].w += w
  }
  return Object.fromEntries(AREAS.map((a) => [a, acc[a].w ? acc[a].s / acc[a].w : null])) as AreaScores
}

export function mediaGeneral(sc: AreaScores, e = 12): number | null {
  const w = pesosArea(e)
  let s = 0
  let t = 0
  for (const a of AREAS) {
    const v = sc[a]
    if (v == null) continue
    s += v * w[a]
    t += w[a]
  }
  return t ? s / t : null
}

export interface ResumenJugador {
  areas: AreaScores
  media: number | null
  mediaAnterior: number | null
  /** Diferencia con la media de hace 30 días (null si no hay datos para comparar). */
  tendencia: number | null
  ultimaEvaluacion: string | null
  numEvaluaciones: number
}

export function resumenJugador(j: Jugador, evals: Evaluacion[], items: ItemEvaluacion[], hoy = new Date()): ResumenJugador {
  const e = edad(j.fechaNacimiento, hoy) ?? 12
  const propias = evals.filter((x) => x.jugadorId === j.id && !x.eliminadoEn)
  const areas = puntuacionesPorArea(ultimasPuntuaciones(propias), items, e)
  const media = mediaGeneral(areas, e)
  const corte = new Date(hoy.getTime() - 30 * DIA).toISOString()
  const antes = propias.filter((x) => x.fecha <= corte)
  const mediaAnterior = antes.length ? mediaGeneral(puntuacionesPorArea(ultimasPuntuaciones(antes), items, e), e) : null
  const ult = propias.reduce<string | null>((m, x) => (m == null || x.fecha > m ? x.fecha : m), null)
  return {
    areas,
    media,
    mediaAnterior,
    tendencia: media != null && mediaAnterior != null ? media - mediaAnterior : null,
    ultimaEvaluacion: ult,
    numEvaluaciones: propias.length,
  }
}

/** Serie temporal por área: un punto en cada fecha con evaluación. */
export function serieEvolucion(j: Jugador, evals: Evaluacion[], items: ItemEvaluacion[]) {
  const e = edad(j.fechaNacimiento) ?? 12
  const propias = evals.filter((x) => x.jugadorId === j.id && !x.eliminadoEn)
  const fechas = [...new Set(propias.map((x) => x.fecha.slice(0, 10)))].sort()
  return fechas.map((f) => {
    const sc = puntuacionesPorArea(ultimasPuntuaciones(propias, `${f}T23:59:59`), items, e)
    return { fecha: f, ...sc, media: mediaGeneral(sc, e), contexto: propias.find((x) => x.fecha.startsWith(f))?.contexto }
  })
}

export function mediaEquipoPorArea(resumenes: ResumenJugador[]): AreaScores {
  return Object.fromEntries(
    AREAS.map((a) => {
      const vals = resumenes.map((r) => r.areas[a]).filter((v): v is number => v != null)
      return [a, vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null]
    }),
  ) as AreaScores
}

// ───────────── Datos que llegan de otras apps ─────────────

export interface DatosExternos {
  minutos: number
  partidos: number
  titularidades: number
  goles: number
  asistencias: number
  asistenciaPct: number | null // asistencia a entrenamientos y partidos
  entrenosPresente: number
  entrenosTotal: number
  cargaSemana: number // últimos 7 días
  cargaMediaSemanal: number // media de las 4 semanas anteriores
}

export function datosExternos(
  jugadorId: string,
  asis: Asistencia[],
  part: ParticipacionPartido[],
  carga: CargaSesion[],
  hoy = new Date(),
): DatosExternos {
  const a = asis.filter((x) => x.jugadorId === jugadorId)
  const p = part.filter((x) => x.jugadorId === jugadorId)
  const c = carga.filter((x) => x.jugadorId === jugadorId)
  const t = hoy.getTime()
  const enRango = (f: string, d0: number, d1: number) => {
    const d = (t - new Date(f).getTime()) / DIA
    return d >= d0 && d < d1
  }
  const ent = a.filter((x) => x.tipo === 'entrenamiento')
  return {
    minutos: p.reduce((s, x) => s + x.minutos, 0),
    partidos: p.filter((x) => x.minutos > 0).length,
    titularidades: p.filter((x) => x.titular).length,
    goles: p.reduce((s, x) => s + x.goles, 0),
    asistencias: p.reduce((s, x) => s + x.asistencias, 0),
    asistenciaPct: a.length ? a.filter((x) => x.presente).length / a.length : null,
    entrenosPresente: ent.filter((x) => x.presente).length,
    entrenosTotal: ent.length,
    cargaSemana: c.filter((x) => enRango(x.fecha, 0, 7)).reduce((s, x) => s + x.carga, 0),
    cargaMediaSemanal: c.filter((x) => enRango(x.fecha, 7, 35)).reduce((s, x) => s + x.carga, 0) / 4,
  }
}
