import { useState, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { Avatar, Cabecera, Enlace, Tendencia } from '../ui/components'
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
  const alertas = alertasInicio(jugadoresVisibles, resumen, externos, estadoDe)
  const visibles = verTodo ? alertas : alertas.slice(0, 3)
  const mejoran = masMejoran(jugadoresVisibles.filter(tieneConsentimientoFicha), resumen)

  return (
    <>
      <Cabecera titulo={`Hola, ${cuenta.nombre.split(' ')[0]}`} sub={`${equipo.nombre} · ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`} />

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

      <section className="bloque">
        <h2>Más mejoran este mes</h2>
        {mejoran.length === 0 ? (
          <p className="sub">Cuando evalúes un par de semanas seguidas, aquí verás quién está en racha.</p>
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
    </>
  )
}
