/**
 * Datos de ejemplo: Infantil A (F11, temporada 2026-27), 18 jugadores ficticios.
 * Todo se genera de forma determinista y relativa a la fecha de hoy,
 * para que tendencias y "última semana" tengan siempre sentido.
 * Nombres inventados y sin fotos: nunca usar datos reales en demos.
 */
import type {
  Asistencia,
  CargaSesion,
  Equipo,
  Estado,
  Evaluacion,
  Evento,
  ItemEvaluacion,
  Jugador,
  MiembroEquipo,
  NotaSeguimiento,
  ParticipacionPartido,
  Pierna,
  Posicion,
  PruebaFisica,
  Usuario,
} from '../model/types'
import { ITEMS_POR_DEFECTO } from './items'
import { itemsAplicables } from '../logic/stats'

export interface Dataset {
  usuarios: Usuario[]
  miembros: MiembroEquipo[]
  equipos: Equipo[]
  jugadores: Jugador[]
  estados: Estado[]
  items: ItemEvaluacion[]
  evaluaciones: Evaluacion[]
  pruebas: PruebaFisica[]
  notas: NotaSeguimiento[]
  eventos: Evento[]
  asistencias: Asistencia[]
  participaciones: ParticipacionPartido[]
  cargas: CargaSesion[]
}

/**
 * Antepone un prefijo a todos los ids (y referencias) del conjunto, para poder
 * cargar la plantilla de ejemplo varias veces en la nube sin chocar.
 * Los ítems por defecto no se tocan: son comunes a todos los equipos.
 */
export function prefijarIds(ds: Dataset, prefijo: string): Dataset {
  const CAMPOS = ['id', 'equipoId', 'jugadorId', 'eventoId'] as const
  const p = <T extends object>(filas: T[]): T[] =>
    filas.map((f) => {
      const o = { ...f } as Record<string, unknown>
      for (const k of CAMPOS) if (typeof o[k] === 'string') o[k] = `${prefijo}${o[k]}`
      return o as T
    })
  return {
    ...ds,
    equipos: p(ds.equipos),
    miembros: ds.miembros.map((m) => ({ ...m, equipoId: `${prefijo}${m.equipoId}` })),
    jugadores: p(ds.jugadores),
    estados: p(ds.estados),
    evaluaciones: p(ds.evaluaciones),
    pruebas: p(ds.pruebas),
    notas: p(ds.notas),
    eventos: p(ds.eventos),
    asistencias: p(ds.asistencias),
    participaciones: p(ds.participaciones),
    cargas: p(ds.cargas),
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const USUARIO_PRINCIPAL = 'u-principal'
export const USUARIO_AYUDANTE = 'u-ayudante'
export const EQUIPO_ID = 'eq-infantil-a'

// nombre, apellidos, dorsal, posiciones, pierna, nacimiento, nivel base (1–5), ritmo de mejora/mes
type P = [string, string, number, Posicion[], Pierna, string, number, number]
const PLANTILLA: P[] = [
  ['Hugo', 'Martín Sanz', 1, ['POR'], 'derecha', '2013-03-14', 3.4, 0.15],
  ['Iker', 'Navarro Gil', 13, ['POR'], 'izquierda', '2014-01-22', 2.8, 0.3],
  ['Álex', 'Romero Pardo', 2, ['LD', 'ED'], 'derecha', '2013-07-02', 3.1, 0.2],
  ['Daniel', 'Ortega Ruiz', 3, ['LI'], 'izquierda', '2013-11-19', 2.9, 0.1],
  ['Mario', 'Castro León', 4, ['DFC'], 'derecha', '2013-02-08', 3.6, 0.05],
  ['Pablo', 'Herrera Vidal', 5, ['DFC', 'MCD'], 'derecha', '2013-05-27', 3.2, 0.25],
  ['Nico', 'Delgado Rey', 15, ['DFC'], 'izquierda', '2014-04-11', 2.6, 0.35],
  ['Leo', 'Iglesias Moya', 12, ['LD', 'LI'], 'ambas', '2014-08-30', 2.7, 0.2],
  ['Marcos', 'Vega Prieto', 6, ['MCD'], 'derecha', '2013-01-30', 3.5, 0.1],
  ['Adrián', 'Molina Cruz', 8, ['MC', 'MCO'], 'derecha', '2013-09-05', 3.7, 0.15],
  ['Lucas', 'Serrano Blanco', 10, ['MCO', 'DC'], 'izquierda', '2013-06-16', 3.9, 0.1],
  ['Bruno', 'Ramos Fuentes', 14, ['MC'], 'derecha', '2014-02-03', 3.0, -0.15],
  ['Enzo', 'Cabrera Soler', 16, ['MC', 'MCD'], 'derecha', '2014-10-21', 2.5, 0.4],
  ['Martín', 'Lozano Peña', 7, ['ED', 'EI'], 'derecha', '2013-04-09', 3.4, 0.2],
  ['Izan', 'Campos Arias', 11, ['EI'], 'izquierda', '2013-12-01', 3.3, 0.0],
  ['Thiago', 'Medina Rubio', 9, ['DC'], 'derecha', '2013-08-24', 3.6, 0.25],
  ['Gael', 'Pastor Nieto', 17, ['DC', 'ED'], 'derecha', '2014-05-15', 2.9, 0.15],
  ['Unai', 'Ferrer Lago', 18, ['EI', 'MC'], 'izquierda', '2014-03-28', 0, 0], // sin consentimiento aún
]

const SIN_CONSENTIMIENTO = new Set([18])
const SIN_FOTOS = new Set([12])

const DIA = 86_400_000
const iso = (d: Date) => d.toISOString()
const dia = (d: Date) => d.toISOString().slice(0, 10)

export function crearDatosEjemplo(hoy = new Date()): Dataset {
  const rnd = mulberry32(2026)
  const r = (a: number, b: number) => a + rnd() * (b - a)
  const T = iso(hoy)
  const meta = (id: string, creado = T) => ({ id, creadoEn: creado, actualizadoEn: creado, creadoPor: USUARIO_PRINCIPAL })

  const usuarios: Usuario[] = [
    { id: USUARIO_PRINCIPAL, nombre: 'Cuerpo técnico (ejemplo)', email: 'principal@ejemplo.test' },
    { id: USUARIO_AYUDANTE, nombre: 'Ayudante', email: 'ayudante@ejemplo.test' },
  ]
  const miembros: MiembroEquipo[] = [
    { equipoId: EQUIPO_ID, usuarioId: USUARIO_PRINCIPAL, rol: 'entrenador_principal', permisos: { verFicha: true, verNotasPrivadas: true, evaluar: true } },
    { equipoId: EQUIPO_ID, usuarioId: USUARIO_AYUDANTE, rol: 'ayudante', permisos: { verFicha: true, verNotasPrivadas: false, evaluar: true } },
  ]

  // Inicio de temporada: 11 semanas antes de hoy, en lunes.
  const inicio = new Date(hoy.getTime() - 77 * DIA)
  inicio.setUTCHours(18, 0, 0, 0)
  inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7))

  const equipos: Equipo[] = [
    { ...meta(EQUIPO_ID, iso(inicio)), clubId: 'club-demo', entidad: 'Club de ejemplo', genero: 'masculino', nombre: 'Infantil A', categoria: 'Infantil', temporada: '2026-27', modalidad: 'F11', edadMin: 12, edadMax: 13 },
  ]

  const jugadores: Jugador[] = PLANTILLA.map(([nombre, apellidos, dorsal, posiciones, pierna, nac], i) => {
    const id = `j-${String(dorsal).padStart(2, '0')}`
    const base: Jugador = { ...meta(id, iso(inicio)), equipoId: EQUIPO_ID, nombre, apellidos, dorsal, favorito: i === 10 }
    if (SIN_CONSENTIMIENTO.has(dorsal)) {
      return { ...base, contactos: [{ nombre: 'Familia Ferrer', relacion: 'Madre', telefono: '600 000 018' }], consentimiento: null }
    }
    const firmaMadre = i % 3 !== 0
    return {
      ...base,
      foto: null,
      fechaNacimiento: nac,
      posiciones,
      pierna,
      contactos: [{ nombre: `${firmaMadre ? 'Madre' : 'Padre'} de ${nombre}`, relacion: firmaMadre ? 'Madre' : 'Padre', telefono: `600 000 ${String(dorsal).padStart(3, '0')}` }],
      consentimiento: {
        fecha: dia(new Date(inicio.getTime() + (i % 5) * DIA)),
        firmante: `${firmaMadre ? 'Madre' : 'Padre'} de ${nombre} ${apellidos.split(' ')[0]}`,
        firmanteTipo: firmaMadre ? 'madre' : 'padre',
        alcance: { ficha: true, fotos: !SIN_FOTOS.has(dorsal), notasVoz: i % 4 !== 0 },
        version: '2026.1',
      },
    }
  })

  // Estados
  const estados: Estado[] = jugadores.map((j) => ({ ...meta(`st-${j.id}`, iso(inicio)), jugadorId: j.id, tipo: 'disponible', desde: dia(inicio) }))
  const set = (dorsal: number, e: Partial<Estado>) => {
    const s = estados.find((x) => x.jugadorId === `j-${String(dorsal).padStart(2, '0')}`)!
    Object.assign(s, e)
  }
  set(5, { tipo: 'lesionado', desde: dia(new Date(hoy.getTime() - 9 * DIA)), vueltaPrevista: dia(new Date(hoy.getTime() + 12 * DIA)), nota: 'Sigue el plan del fisio del club' })
  set(16, { tipo: 'enfermo', desde: dia(new Date(hoy.getTime() - 2 * DIA)), vueltaPrevista: dia(new Date(hoy.getTime() + 3 * DIA)) })
  set(14, { tipo: 'sancionado', desde: dia(new Date(hoy.getTime() - 4 * DIA)), vueltaPrevista: dia(new Date(hoy.getTime() + 4 * DIA)), nota: '1 partido por acumulación de tarjetas' })

  // Eventos: martes y jueves entreno, sábado partido
  const eventos: Evento[] = []
  const rivales = ['CD Las Rozas', 'AD Alcorcón B', 'CF Fuenlabrada C', 'EF Pozuelo', 'Rayo Majadahonda', 'CD Leganés C', 'UD Boadilla', 'CD Móstoles', 'AD Villaviciosa', 'Getafe CF C', 'CDE Tres Cantos']
  for (let w = 0; w < 12; w++) {
    for (const [off, tipo] of [[1, 'entrenamiento'], [3, 'entrenamiento'], [5, 'partido']] as const) {
      const f = new Date(inicio.getTime() + (w * 7 + off) * DIA)
      if (f > hoy) continue
      eventos.push({
        id: `ev-${w}-${off}`,
        equipoId: EQUIPO_ID,
        tipo,
        fecha: iso(f),
        titulo: tipo === 'partido' ? `vs ${rivales[w % rivales.length]}` : `Entrenamiento ${off === 1 ? 'martes' : 'jueves'}`,
        rival: tipo === 'partido' ? rivales[w % rivales.length] : undefined,
      })
    }
  }

  // Asistencia, minutos y carga (simulan lo que llega de Sesiones y Temporada)
  const asistencias: Asistencia[] = []
  const participaciones: ParticipacionPartido[] = []
  const cargas: CargaSesion[] = []
  const compromiso = new Map(jugadores.map((j, i) => [j.id, 0.8 + ((i * 7) % 10) / 50]))
  for (const ev of eventos) {
    const presentes: string[] = []
    for (const j of jugadores) {
      const presente = rnd() < compromiso.get(j.id)!
      asistencias.push({ id: `as-${ev.id}-${j.id}`, eventoId: ev.id, jugadorId: j.id, fecha: ev.fecha, tipo: ev.tipo, presente, motivo: presente ? undefined : 'Justificada' })
      if (presente) presentes.push(j.id)
    }
    if (ev.tipo === 'entrenamiento') {
      for (const id of presentes) {
        const rpe = Math.round(r(4, 7.5))
        cargas.push({ id: `cg-${ev.id}-${id}`, eventoId: ev.id, jugadorId: id, fecha: ev.fecha, minutos: 90, rpe, carga: rpe * 90 })
      }
    } else {
      // Infantil F11: 2 × 35 min. 11 titulares, cambios ilimitados.
      const conv = presentes.slice(0, 18)
      const orden = [...conv].sort((a, b) => rnd() - 0.5 + (Number(a.slice(2)) > 13 ? 0.35 : 0) - (Number(b.slice(2)) > 13 ? 0.35 : 0))
      orden.forEach((id, k) => {
        const titular = k < 11
        const minutos = titular ? Math.round(r(40, 70)) : Math.round(r(10, 35))
        const dorsal = Number(id.slice(2))
        const ataque = [7, 9, 10, 11, 17, 8].includes(dorsal)
        const goles = ataque && rnd() < 0.3 ? 1 + (rnd() < 0.2 ? 1 : 0) : 0
        const asist = ataque && rnd() < 0.25 ? 1 : 0
        participaciones.push({ id: `pp-${ev.id}-${id}`, eventoId: ev.id, jugadorId: id, fecha: ev.fecha, minutos, titular, goles, asistencias: asist })
        const rpe = Math.round(r(6, 9))
        cargas.push({ id: `cg-${ev.id}-${id}`, eventoId: ev.id, jugadorId: id, fecha: ev.fecha, minutos, rpe, carga: rpe * minutos })
      })
    }
  }

  // Evaluaciones: inicial completa + evaluaciones rápidas tras partidos (3 ítems)
  const items = ITEMS_POR_DEFECTO
  const evaluaciones: Evaluacion[] = []
  const conFicha = jugadores.filter((j) => j.consentimiento)
  const nivel = new Map(PLANTILLA.map((p) => [`j-${String(p[2]).padStart(2, '0')}`, { base: p[6], ritmo: p[7] }]))
  const sesgoItem = new Map<string, number>()
  for (const j of conFicha) for (const it of items) sesgoItem.set(`${j.id}|${it.id}`, r(-0.8, 0.8))
  const valor = (jid: string, itemId: string, fecha: Date): 1 | 2 | 3 | 4 | 5 => {
    const n = nivel.get(jid)!
    const meses = (fecha.getTime() - inicio.getTime()) / (30 * DIA)
    const v = n.base + n.ritmo * 1.6 * meses + sesgoItem.get(`${jid}|${itemId}`)! + r(-0.45, 0.45)
    return Math.max(1, Math.min(5, Math.round(v))) as 1 | 2 | 3 | 4 | 5
  }
  const fIni = new Date(inicio.getTime() + 8 * DIA)
  for (const j of conFicha) {
    const its = itemsAplicables(items, j, fIni)
    evaluaciones.push({
      ...meta(`evl-ini-${j.id}`, iso(fIni)),
      jugadorId: j.id,
      fecha: iso(fIni),
      evaluadorId: USUARIO_PRINCIPAL,
      contexto: 'trimestral',
      puntuaciones: its.map((it) => ({ itemId: it.id, valor: valor(j.id, it.id, fIni) })),
      comentario: 'Evaluación inicial de temporada',
    })
  }
  const partidos = eventos.filter((e) => e.tipo === 'partido').slice(1)
  partidos.forEach((ev, k) => {
    if (k % 2 === 1 && k !== partidos.length - 1) return // cada dos partidos y el último
    const f = new Date(new Date(ev.fecha).getTime() + DIA)
    for (const j of conFicha) {
      const its = itemsAplicables(items, j, f)
      if (!participaciones.some((p) => p.eventoId === ev.id && p.jugadorId === j.id)) continue
      const elegidos = [0, 1, 2].map((q) => its[(k * 5 + q * 7 + Number(j.dorsal)) % its.length])
      const unicos = [...new Map(elegidos.map((x) => [x.id, x])).values()]
      evaluaciones.push({
        ...meta(`evl-${ev.id}-${j.id}`, iso(f)),
        jugadorId: j.id,
        fecha: iso(f),
        evaluadorId: USUARIO_PRINCIPAL,
        contexto: 'partido',
        eventoId: ev.id,
        puntuaciones: unicos.map((it) => ({ itemId: it.id, valor: valor(j.id, it.id, f) })),
      })
    }
  })
  // Evaluación trimestral completa a mitad de temporada para dar forma a la evolución
  const fMid = new Date(inicio.getTime() + 45 * DIA)
  for (const j of conFicha) {
    const its = itemsAplicables(items, j, fMid)
    evaluaciones.push({
      ...meta(`evl-mid-${j.id}`, iso(fMid)),
      jugadorId: j.id,
      fecha: iso(fMid),
      evaluadorId: USUARIO_PRINCIPAL,
      contexto: 'entrenamiento',
      puntuaciones: its.filter((_, q) => q % 2 === 0).map((it) => ({ itemId: it.id, valor: valor(j.id, it.id, fMid) })),
    })
  }

  // Pruebas físicas (batería de septiembre) — se usarán en la fase 3
  const pruebas: PruebaFisica[] = []
  const fPrueba = new Date(inicio.getTime() + 3 * DIA)
  for (const j of conFicha) {
    const n = nivel.get(j.id)!.base
    pruebas.push(
      { ...meta(`pf-s-${j.id}`, iso(fPrueba)), jugadorId: j.id, tipo: 'sprint_30m', fecha: iso(fPrueba), resultado: +(5.6 - (n - 3) * 0.18 + r(-0.15, 0.15)).toFixed(2), unidad: 's' },
      { ...meta(`pf-v-${j.id}`, iso(fPrueba)), jugadorId: j.id, tipo: 'salto_vertical', fecha: iso(fPrueba), resultado: Math.round(30 + (n - 3) * 3 + r(-3, 3)), unidad: 'cm' },
      { ...meta(`pf-y-${j.id}`, iso(fPrueba)), jugadorId: j.id, tipo: 'ida_vuelta', fecha: iso(fPrueba), resultado: +(7 + (n - 3) * 0.8 + r(-0.6, 0.6)).toFixed(1), unidad: 'nivel' },
    )
  }

  // Notas de seguimiento
  const notas: NotaSeguimiento[] = []
  const nota = (dorsal: number, dias: number, texto: string, visibilidad: 'privada' | 'apta_familia', autor = USUARIO_PRINCIPAL) => {
    const f = iso(new Date(hoy.getTime() - dias * DIA))
    const jid = `j-${String(dorsal).padStart(2, '0')}`
    notas.push({ ...meta(`nt-${jid}-${dias}`, f), creadoPor: autor, jugadorId: jid, texto, autorId: autor, fecha: f, visibilidad })
  }
  nota(10, 6, 'Muy buen partido entre líneas. Trabajar la finalización con la derecha.', 'apta_familia')
  nota(10, 20, 'Algo desconectado en el último entreno; hablar con él con calma.', 'privada')
  nota(16, 4, 'Gran progresión en la presión tras pérdida. Hay que darle más minutos.', 'apta_familia')
  nota(14, 3, 'Baja de rendimiento en las últimas semanas. Revisar carga escolar con la familia.', 'privada')
  nota(5, 9, 'Se retiró en el partido. El fisio del club lleva la recuperación.', 'privada', USUARIO_AYUDANTE)
  nota(13, 15, 'Mejora clara en el juego con el pie. Seguir con salidas en corto.', 'apta_familia')

  return { usuarios, miembros, equipos, jugadores, estados, items, evaluaciones, pruebas, notas, eventos, asistencias, participaciones, cargas }
}
