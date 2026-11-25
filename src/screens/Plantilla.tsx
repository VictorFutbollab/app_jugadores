import { useMemo, useState } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { Avatar, Cabecera, Enlace, EstadoChip, Tendencia, Vacio } from '../ui/components'
import { AREAS, AREA_COLOR, AREA_CORTO, POSICION_ORDEN, num0, num1, pct } from '../logic/format'
import { FLAGS } from '../config'
import { href } from '../state/router'
import { accionesEntrenador } from '../logic/permisos'
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
type Filtro = 'todos' | 'disponibles' | 'no_disponibles' | 'favoritos' | 'sin_consentimiento' | 'de_baja'

export function Plantilla() {
  const { jugadoresVisibles, resumen, externos, estadoDe, ds, tipoCuenta, puedeEditar } = useApp()
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<Orden>('dorsal')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    const est = (j: Jugador): TipoEstado => estadoDe(j.id)?.tipo ?? 'disponible'
    // "De baja": los archivados (siguen con su historial y se pueden reactivar desde Editar).
    const base = filtro === 'de_baja' ? ds.jugadores.filter((j) => j.archivado && !j.eliminadoEn) : jugadoresVisibles
    const filtrada = base.filter((j) => {
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
  }, [jugadoresVisibles, ds.jugadores, q, filtro, orden, resumen, externos, estadoDe])

  const equipo = ds.equipos[0]
  // Dar de alta: entrenador principal (y admin, que en el panel del entrenador cuenta como principal).
  // Lo decide la base de datos (puede_editar_equipo); aquí solo se enseña u oculta.
  const acciones = accionesEntrenador({ tipoCuenta, puedeEditar })
  const puedeAnadir = acciones.anadirJugador
  const botones = (acciones.editarEquipo || acciones.anadirJugador) && (
    <div className="cabecera-acciones">
      {acciones.editarEquipo && (
        <a className="btn btn-cabecera" href={href({ nombre: 'equipo', id: equipo.id })} aria-label="Editar equipo" title="Editar equipo">
          <Icon n="lapiz" size={18} /> <span className="btn-cabecera-txt">Editar equipo</span>
        </a>
      )}
      {acciones.anadirJugador && (
        <a className="btn primario btn-cabecera" href={href({ nombre: 'jugador-editar', id: 'nuevo' })} aria-label="Añadir jugador" title="Añadir jugador">
          <Icon n="mas" size={18} /> <span className="btn-cabecera-txt">Añadir jugador</span>
        </a>
      )}
    </div>
  )
  return (
    <>
      <Cabecera titulo="Plantilla" sub={`${equipo.nombre} · ${equipo.modalidad} · ${jugadoresVisibles.length} jugadores`} accion={botones} />
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
            ...(puedeAnadir ? ([['de_baja', 'De baja']] as const) : []),
          ] as [Filtro, string][]
        ).map(([id, n]) => (
          <button key={id} role="radio" aria-checked={filtro === id} className={`filtro ${filtro === id ? 'on' : ''}`} onClick={() => setFiltro(id)}>
            {n}
          </button>
        ))}
      </div>

      {jugadoresVisibles.length === 0 && filtro !== 'de_baja' ? (
        <Vacio>
          Aún no hay jugadores en la plantilla.
          {puedeAnadir && (
            <>
              {' '}
              <a href={href({ nombre: 'jugador-editar', id: 'nuevo' })}>Añade el primero</a>.
            </>
          )}
        </Vacio>
      ) : lista.length === 0 ? (
        <Vacio>No hay jugadores con ese filtro.</Vacio>
      ) : (
        <ul className="rejilla">
          {lista.map((j) => {
            const r = resumen.get(j.id)!
            const x = externos.get(j.id)!
            const ficha = tieneConsentimientoFicha(j)
            return (
              <li key={j.id} className={acciones.editarJugador ? 'con-editar' : undefined}>
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
                      {FLAGS.disenoV2 && r.media != null && (
                        <span className="mini-areas" role="img" aria-label={AREAS.map((a) => `${AREA_CORTO[a]} ${num1(r.areas[a])}`).join(', ')}>
                          {AREAS.map((a) => (
                            <i key={a} style={{ height: `${r.areas[a] == null ? 0 : 8 + (r.areas[a]! / 10) * 92}%`, background: AREA_COLOR[a] }} />
                          ))}
                        </span>
                      )}
                      {orden === 'minutos' && <span className="tarjeta-extra num">{num0(x.minutos)} min</span>}
                      {orden === 'asistencia' && <span className="tarjeta-extra num">{pct(x.asistenciaPct)} asist.</span>}
                    </>
                  ) : (
                    <span className="chip aviso"><Icon n="aviso" size={13} /> Falta consentimiento</span>
                  )}
                </Enlace>
                {acciones.editarJugador && (
                  <a className="tarjeta-editar" href={href({ nombre: 'jugador-editar', id: j.id })} aria-label={`Editar a ${j.nombre}`} title="Editar">
                    <Icon n="lapiz" size={16} />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="nota-pie">Media 0–10 de las 4 áreas. Flecha y número: cambio respecto a hace 30 días.</p>
    </>
  )
}
