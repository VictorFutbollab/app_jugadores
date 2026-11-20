import type { ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { Avatar, Cabecera, Enlace, Tendencia } from '../ui/components'
import { fechaCorta, num0, num1 } from '../logic/format'
import { tieneConsentimientoFicha } from '../logic/privacy'
import type { Jugador } from '../model/types'

const DIA = 86_400_000

export function Inicio() {
  const { ds, jugadoresVisibles, resumen, externos, estadoDe, cuenta } = useApp()
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

      {(sinConsent.length > 0 || noDisp.length > 0) && (
        <section className="bloque">
          <h2>Avisos</h2>
          <ul className="filas">
            {sinConsent.map((j) => (
              <Fila key={j.id} j={j}>
                <span className="chip aviso"><Icon n="aviso" size={13} /> Sin consentimiento</span>
              </Fila>
            ))}
            {noDisp.map((j) => {
              const e = estadoDe(j.id)!
              return (
                <Fila key={j.id} j={j}>
                  <span className="sub">
                    {e.tipo}
                    {e.vueltaPrevista && ` · vuelve ${fechaCorta(e.vueltaPrevista)}`}
                  </span>
                </Fila>
              )
            })}
          </ul>
        </section>
      )}

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

      {bajadas.length > 0 && (
        <section className="bloque">
          <h2>Merecen una conversación</h2>
          <ul className="filas">
            {bajadas.map((j) => (
              <Fila key={j.id} j={j}>
                <span className="num">{num1(resumen.get(j.id)!.media)}</span>
                <Tendencia v={resumen.get(j.id)!.tendencia} />
              </Fila>
            ))}
          </ul>
        </section>
      )}

      {cargaAlta.length > 0 && (
        <section className="bloque">
          <h2>Carga alta esta semana</h2>
          <ul className="filas">
            {cargaAlta.map((j) => {
              const x = externos.get(j.id)!
              return (
                <Fila key={j.id} j={j}>
                  <Tendencia v={((x.cargaSemana - x.cargaMediaSemanal) / x.cargaMediaSemanal) * 100} sufijo=" %" />
                </Fila>
              )
            })}
          </ul>
        </section>
      )}

      {sinEvaluar.length > 0 && (
        <section className="bloque">
          <h2>Sin evaluar en 3 semanas</h2>
          <ul className="filas">
            {sinEvaluar.map((j) => (
              <Fila key={j.id} j={j}>
                <span className="sub">{resumen.get(j.id)?.ultimaEvaluacion ? fechaCorta(resumen.get(j.id)!.ultimaEvaluacion!) : 'nunca'}</span>
              </Fila>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function avg(xs: (number | null | undefined)[]) {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}
