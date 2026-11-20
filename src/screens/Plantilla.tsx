import { useMemo, useState } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { Avatar, Cabecera, Enlace, EstadoChip, Tendencia, Vacio } from '../ui/components'
import { POSICION_ORDEN, num0, num1, pct } from '../logic/format'
import { tieneConsentimientoFicha } from '../logic/privacy'
import type { Jugador, TipoEstado } from '../model/types'

type Orden = 'dorsal' | 'posicion' | 'media' | 'minutos' | 'asistencia'
const ORDENES: { id: Orden; nombre: string }[] = [
  { id: 'dorsal', nombre: 'Dorsal' },
  { id: 'posicion', nombre: 'Posición' },
  { id: 'media', nombre: 'Media' },
  { id: 'minutos', nombre: 'Minutos' },
  { id: 'asistencia', nombre: 'Asistencia' },
]
type Filtro = 'todos' | 'disponibles' | 'no_disponibles' | 'favoritos' | 'sin_consentimiento'

export function Plantilla() {
  const { jugadoresVisibles, resumen, externos, estadoDe, ds } = useApp()
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<Orden>('dorsal')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    const est = (j: Jugador): TipoEstado => estadoDe(j.id)?.tipo ?? 'disponible'
    const filtrada = jugadoresVisibles.filter((j) => {
      if (t && !`${j.nombre} ${j.apellidos} ${j.dorsal}`.toLowerCase().includes(t)) return false
      if (filtro === 'disponibles') return est(j) === 'disponible'
      if (filtro === 'no_disponibles') return est(j) !== 'disponible'
      if (filtro === 'favoritos') return !!j.favorito
      if (filtro === 'sin_consentimiento') return !tieneConsentimientoFicha(j)
      return true
    })
    const pos = (j: Jugador) => {
      const p = j.posiciones?.[0]
      return p ? POSICION_ORDEN.indexOf(p) : 99
    }
    const desc = (v: number | null | undefined) => (v == null ? Infinity : -v)
    const clave: Record<Orden, (j: Jugador) => number> = {
      dorsal: (j) => j.dorsal,
      posicion: (j) => pos(j) * 100 + j.dorsal,
      media: (j) => desc(resumen.get(j.id)?.media),
      minutos: (j) => desc(externos.get(j.id)?.minutos),
      asistencia: (j) => desc(externos.get(j.id)?.asistenciaPct),
    }
    return [...filtrada].sort((a, b) => clave[orden](a) - clave[orden](b) || a.dorsal - b.dorsal)
  }, [jugadoresVisibles, q, filtro, orden, resumen, externos, estadoDe])

  const equipo = ds.equipos[0]
  return (
    <>
      <Cabecera titulo="Plantilla" sub={`${equipo.nombre} · ${equipo.modalidad} · ${jugadoresVisibles.length} jugadores`} />
      <div className="herramientas">
        <input className="buscar" type="search" placeholder="Buscar jugador" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar jugador" />
        <label className="ordenar">
          <span>Ordenar</span>
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            {ORDENES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filtros" role="radiogroup" aria-label="Filtrar">
        {(
          [
            ['todos', 'Todos'],
            ['disponibles', 'Disponibles'],
            ['no_disponibles', 'No disponibles'],
            ['favoritos', 'Favoritos'],
            ['sin_consentimiento', 'Sin consentimiento'],
          ] as [Filtro, string][]
        ).map(([id, n]) => (
          <button key={id} role="radio" aria-checked={filtro === id} className={`filtro ${filtro === id ? 'on' : ''}`} onClick={() => setFiltro(id)}>
            {n}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Vacio>No hay jugadores con ese filtro.</Vacio>
      ) : (
        <ul className="rejilla">
          {lista.map((j) => {
            const r = resumen.get(j.id)!
            const x = externos.get(j.id)!
            const ficha = tieneConsentimientoFicha(j)
            return (
              <li key={j.id}>
                <Enlace to={{ nombre: 'jugador', id: j.id }} className="tarjeta">
                  <div className="tarjeta-top">
                    <Avatar j={j} size={52} />
                    <span className="dorsal num">{j.dorsal}</span>
                    {j.favorito && <span className="fav" aria-label="Favorito"><Icon n="estrella" size={14} relleno /></span>}
                  </div>
                  <strong className="tarjeta-nombre">
                    {j.nombre} <span className="apellido">{j.apellidos.split(' ')[0]}</span>
                  </strong>
                  {ficha ? (
                    <>
                      <span className="tarjeta-pos">{j.posiciones?.join(' · ')}</span>
                      <EstadoChip e={estadoDe(j.id)} compacto />
                      <div className="tarjeta-media">
                        <span className="media num">{num1(r.media)}</span>
                        <Tendencia v={r.tendencia} />
                      </div>
                      {orden === 'minutos' && <span className="tarjeta-extra num">{num0(x.minutos)} min</span>}
                      {orden === 'asistencia' && <span className="tarjeta-extra num">{pct(x.asistenciaPct)} asist.</span>}
                    </>
                  ) : (
                    <span className="chip aviso"><Icon n="aviso" size={13} /> Falta consentimiento</span>
                  )}
                </Enlace>
              </li>
            )
          })}
        </ul>
      )}
      <p className="nota-pie">Media 1–5 de las 4 áreas. Flecha y número: cambio respecto a hace 30 días.</p>
    </>
  )
}
