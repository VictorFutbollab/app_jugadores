import { useState, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { Avatar, Cabecera, Camiseta, Enlace, Tendencia } from '../ui/components'
import { ESTADO_INFO, fechaCorta, num0, num1 } from '../logic/format'
import { tieneConsentimientoFicha } from '../logic/privacy'
import { alertasInicio, masMejoran, minutosEvaluar } from '../logic/alertas'
import { FLAGS } from '../config'
import type { Jugador } from '../model/types'

const DIA = 86_400_000

/** Inicio clásico (antes del rediseño). Se conserva tras el interruptor FLAGS.inicioNuevo. */
function InicioClasico() {
  const { ds, jugadoresVisibles, resumen, externos, estadoDe, cuenta } = useApp()
  const [verTodo, setVerTodo] = useState(false)
  const equipo = ds.equipos[0]
  const hoy = Date.now()
  const conFicha = jugadoresVisibles.filter(tieneConsentimientoFicha)
  const sinConsent = jugadoresVisibles.filter((j) => !tieneConsentimientoFicha(j))
  const noDisp = jugadoresVisibles.filter((j) => (estadoDe(j.id)?.tipo ?? 'disponible') !== 'disponible')
  const disponibles = jugadoresVisibles.length - noDisp.length

  const conTend = conFicha.filter((j) => resumen.get(j.id)?.tendencia != null)
  const mejoras = [...conTend].sort((a, b) => resumen.get(b.id)!.tendencia! - resumen.get(a.id)!.tendencia!).slice(0, 3)
  const bajadas = conTend.filter((j) => resumen.get(j.id)!.tendencia! < -0.1).sort((a, b) => resumen.get(a.id)!.tendencia! - resumen.get(b.id)!.tendencia!).slice(0, 3)
  const sinEvaluar = conFicha.filter((j) => {
    const u = resumen.get(j.id)?.ultimaEvaluacion
    return !u || hoy - new Date(u).getTime() > 21 * DIA
  })
  const cargaAlta = conFicha.filter((j) => {
    const x = externos.get(j.id)!
    return x.cargaMediaSemanal > 0 && x.cargaSemana > x.cargaMediaSemanal * 1.3
  })

  // Una sola lista de pendientes: cada jugador una vez, con todos sus motivos.
  const mapa = new Map<string, { j: Jugador; motivos: { texto: string; clase: string }[] }>()
  const anadir = (j: Jugador, texto: string, clase: string) => {
    const p = mapa.get(j.id) ?? { j, motivos: [] }
    p.motivos.push({ texto, clase })
    mapa.set(j.id, p)
  }
  sinConsent.forEach((j) => anadir(j, 'Sin consentimiento', 'aviso'))
  noDisp.forEach((j) => {
    const e = estadoDe(j.id)!
    anadir(j, `${ESTADO_INFO[e.tipo].nombre}${e.vueltaPrevista ? ` · vuelve ${fechaCorta(e.vueltaPrevista)}` : ''}`, 'peligro')
  })
  cargaAlta.forEach((j) => anadir(j, 'Carga alta esta semana', 'aviso'))
  bajadas.forEach((j) => anadir(j, 'Baja su nivel: habla con él', 'neutro'))
  sinEvaluar.forEach((j) => anadir(j, 'Sin evaluar en 3 semanas', 'neutro'))
  const pendientes = [...mapa.values()]

  const Fila = ({ j, children }: { j: Jugador; children: ReactNode }) => (
    <li>
      <Enlace to={{ nombre: 'jugador', id: j.id }} className="fila">
        <Avatar j={j} size={36} />
        <span className="num dorsal-mini">{j.dorsal}</span>
        <span className="crece">
          {j.nombre} {j.apellidos.split(' ')[0]}
        </span>
        {children}
      </Enlace>
    </li>
  )

  return (
    <>
      <Cabecera
        titulo={`Hola, ${cuenta.nombre.split(' ')[0]}`}
        sub={`${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · ${equipo.modalidad} · Temporada ${equipo.temporada}`}
      />

      <Enlace to={{ nombre: 'evaluar' }} className="cta">
        <span className="cta-txt">
          <span className="eyebrow">Después del partido o del entreno</span>
          <strong>Evaluación rápida</strong>
          <span className="sub">{disponibles} disponibles · unos 2 minutos</span>
        </span>
        <span className="cta-mas" aria-hidden>
          <Icon n="mas" size={24} />
        </span>
      </Enlace>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-v num">
            {disponibles}
            <small>/{jugadoresVisibles.length}</small>
          </span>
          <span className="kpi-e">disponibles</span>
        </div>
        <div className="kpi">
          <span className="kpi-v num">{num1(avg(conFicha.map((j) => resumen.get(j.id)?.media)))}</span>
          <span className="kpi-e">media equipo</span>
        </div>
        <div className="kpi">
          <span className="kpi-v num">{num0(100 * (avg(conFicha.map((j) => externos.get(j.id)?.asistenciaPct)) ?? 0))} %</span>
          <span className="kpi-e">asistencia</span>
        </div>
      </div>

      <section className="bloque">
        <h2>Para hoy</h2>
        {pendientes.length === 0 ? (
          <p className="ok con-icono">
            <Icon n="check" size={18} /> Nada pendiente: todos disponibles y evaluados.
          </p>
        ) : (
          <>
            <ul className="filas">
              {(verTodo ? pendientes : pendientes.slice(0, 5)).map((p) => (
                <Fila key={p.j.id} j={p.j}>
                  <span className="motivos">
                    {p.motivos.map((m) => (
                      <span key={m.texto} className={`chip ${m.clase}`}>
                        {m.texto}
                      </span>
                    ))}
                  </span>
                </Fila>
              ))}
            </ul>
            {pendientes.length > 5 && (
              <button className="enlace pequeno" onClick={() => setVerTodo((v) => !v)}>
                {verTodo ? 'Ver menos' : `Ver los ${pendientes.length}`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="bloque">
        <h2>Más mejoran · 30 días</h2>
        <ul className="filas">
          {mejoras.map((j) => (
            <Fila key={j.id} j={j}>
              <span className="num">{num1(resumen.get(j.id)!.media)}</span>
              <Tendencia v={resumen.get(j.id)!.tendencia} />
            </Fila>
          ))}
        </ul>
      </section>

    </>
  )
}

function avg(xs: (number | null | undefined)[]) {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

export function Inicio() {
  return FLAGS.inicioNuevo ? <InicioNuevo /> : <InicioClasico />
}

/**
 * Inicio rediseñado: una sola acción principal (evaluar hoy), lo que necesita tu
 * mirada (máximo 3) y quién más mejora este mes, siempre frente a sí mismo.
 */
function InicioNuevo() {
  const { ds, jugadoresVisibles, resumen, externos, estadoDe, cuenta } = useApp()
  const [verTodo, setVerTodo] = useState(false)
  const equipo = ds.equipos[0]
  const evaluables = jugadoresVisibles.filter((j) => tieneConsentimientoFicha(j) && (estadoDe(j.id)?.tipo ?? 'disponible') === 'disponible')
  const evaluablesTodos = jugadoresVisibles.filter((j) => (estadoDe(j.id)?.tipo ?? 'disponible') === 'disponible')
  const alertas = alertasInicio(jugadoresVisibles, resumen, externos, estadoDe)
  const visibles = verTodo ? alertas : alertas.slice(0, 3)
  const mejoran = masMejoran(jugadoresVisibles.filter(tieneConsentimientoFicha), resumen)

  // Indicadores y actividad: solo recuentos de datos reales, sin comparar a nadie con nadie.
  const ahora = Date.now()
  const visiblesIds = new Set(jugadoresVisibles.map((j) => j.id))
  const evals = ds.evaluaciones.filter((e) => !e.eliminadoEn && e.puntuaciones.length > 0 && visiblesIds.has(e.jugadorId))
  const evaluadosSemana = new Set(evals.filter((e) => ahora - new Date(e.fecha).getTime() < 7 * 86_400_000).map((e) => e.jugadorId)).size
  const sinEvaluar = jugadoresVisibles.filter((j) => {
    if (!tieneConsentimientoFicha(j)) return false
    const u = resumen.get(j.id)?.ultimaEvaluacion
    return !u || ahora - new Date(u).getTime() > 21 * 86_400_000
  }).length
  const sesiones = new Map<string, { fecha: string; contexto: string; jugadores: Set<string> }>()
  for (const e of evals) {
    const clave = `${e.fecha.slice(0, 10)}|${e.contexto}`
    const s = sesiones.get(clave) ?? { fecha: e.fecha, contexto: e.contexto, jugadores: new Set<string>() }
    s.jugadores.add(e.jugadorId)
    sesiones.set(clave, s)
  }
  const recientes = [...sesiones.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 4)
  const CONTEXTO: Record<string, string> = { partido: 'Partido', entrenamiento: 'Entrenamiento', trimestral: 'Evaluación trimestral' }

  return (
    <>
      {FLAGS.disenoV2 ? (
        <header className="portada">
          <svg className="portada-campo" viewBox="0 0 390 300" aria-hidden preserveAspectRatio="xMidYMin slice">
            <circle cx="195" cy="0" r="92" />
            <rect x="95" y="200" width="200" height="110" />
            <rect x="150" y="260" width="90" height="50" />
            <path d="M155 200 A45 45 0 0 1 235 200" />
          </svg>
          <p className="portada-fecha">
            Hola, {cuenta.nombre.split(' ')[0]} · {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="portada-equipo">{equipo.nombre}</h1>
          <p className="portada-sub">
            {jugadoresVisibles.length} jugadores · {jugadoresVisibles.length - evaluablesTodos.length === 0 ? 'todos disponibles' : `${jugadoresVisibles.length - evaluablesTodos.length} no disponibles`}
          </p>
        </header>
      ) : (
        <Cabecera titulo={`Hola, ${cuenta.nombre.split(' ')[0]}`} sub={`${equipo.nombre} · ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`} />
      )}

      {FLAGS.disenoV2 && (
        <dl className="indicadores">
          <div>
            <dt>Disponibles</dt>
            <dd>
              {evaluablesTodos.length}
              <small>/{jugadoresVisibles.length}</small>
            </dd>
          </div>
          <div>
            <dt>Evaluados esta semana</dt>
            <dd>{evaluadosSemana}</dd>
          </div>
          <div>
            <dt>Sin evaluar hace 3 semanas</dt>
            <dd className={sinEvaluar > 0 ? 'atencion' : ''}>{sinEvaluar}</dd>
          </div>
        </dl>
      )}

      <div className="inicio-rejilla">
      <div className="inicio-col">
      <Enlace to={{ nombre: 'evaluar' }} className="cta cta-principal">
        <span className="cta-txt">
          <strong>Evaluar hoy</strong>
          <span className="sub">
            {evaluables.length} jugadores · unos {minutosEvaluar(evaluables.length)} min
          </span>
        </span>
        <span className="cta-mas" aria-hidden>
          <Icon n="mas" size={26} />
        </span>
      </Enlace>

      <section className="bloque">
        <h2>Necesitan tu mirada</h2>
        {alertas.length === 0 ? (
          <p className="ok con-icono">
            <Icon n="check" size={18} /> Todo en orden: todos disponibles y evaluados.
          </p>
        ) : (
          <>
            <ul className="alertas">
              {visibles.map((a) => (
                <li key={`${a.jugador.id}-${a.tipo}`}>
                  <Enlace to={{ nombre: 'jugador', id: a.jugador.id }} className="alerta">
                    <Avatar j={a.jugador} size={40} />
                    <span className={`alerta-txt ${a.tipo}`}>{a.frase}</span>
                  </Enlace>
                </li>
              ))}
            </ul>
            {alertas.length > 3 && (
              <button className="enlace pequeno" onClick={() => setVerTodo((v) => !v)}>
                {verTodo ? 'Ver solo las 3 primeras' : `Ver ${alertas.length - 3} más`}
              </button>
            )}
          </>
        )}
      </section>
      </div>

      <div className="inicio-col">
      <section className="bloque">
        <h2>{FLAGS.disenoV2 ? 'En forma este mes' : 'Más mejoran este mes'}</h2>
        {mejoran.length === 0 ? (
          <p className="sub">Cuando evalúes un par de semanas seguidas, aquí verás quién está en racha.</p>
        ) : FLAGS.disenoV2 ? (
          <ul className="en-forma">
            {mejoran.map((j) => (
              <li key={j.id}>
                <Enlace to={{ nombre: 'jugador', id: j.id }} className="en-forma-tarjeta">
                  <Camiseta dorsal={j.dorsal} size={48} className="destacada" />
                  <strong>
                    {j.nombre} {j.apellidos.split(' ')[0]}
                  </strong>
                  <Tendencia v={resumen.get(j.id)!.tendencia} />
                </Enlace>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="filas">
            {mejoran.map((j) => (
              <li key={j.id}>
                <Enlace to={{ nombre: 'jugador', id: j.id }} className="fila">
                  <Avatar j={j} size={36} />
                  <span className="num dorsal-mini">{j.dorsal}</span>
                  <span className="crece">
                    {j.nombre} {j.apellidos.split(' ')[0]}
                  </span>
                  <Tendencia v={resumen.get(j.id)!.tendencia} />
                </Enlace>
              </li>
            ))}
          </ul>
        )}
      </section>

      {FLAGS.disenoV2 && recientes.length > 0 && (
        <section className="bloque">
          <h2>Actividad reciente</h2>
          <ul className="actividad-reciente">
            {recientes.map((s) => (
              <li key={`${s.fecha}-${s.contexto}`}>
                <span className="actividad-fecha">
                  <strong>{new Date(s.fecha).getDate()}</strong>
                  <span>{new Date(s.fecha).toLocaleDateString('es-ES', { month: 'short' })}</span>
                </span>
                <span className="crece">
                  <strong>{CONTEXTO[s.contexto] ?? s.contexto}</strong>
                  <span className="sub">
                    {s.jugadores.size} {s.jugadores.size === 1 ? 'jugador evaluado' : 'jugadores evaluados'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
      </div>
    </>
  )
}
