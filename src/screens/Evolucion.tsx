import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../state/store'
import { ir } from '../state/router'
import { Cabecera, Camiseta, Tendencia, Vacio } from '../ui/components'
import { AREAS, AREA_COLOR, AREA_CORTO, fechaCorta, num1 } from '../logic/format'
import { tieneConsentimientoFicha } from '../logic/privacy'
import { serieEvolucion } from '../logic/stats'
import { FLAGS } from '../config'
import type { Area } from '../model/types'

type Periodo = 'temporada' | '90' | '30'
const PERIODOS: { id: Periodo; nombre: string }[] = [
  { id: 'temporada', nombre: 'Temporada' },
  { id: '90', nombre: '3 meses' },
  { id: '30', nombre: '30 días' },
]

export function Evolucion({ id }: { id?: string }) {
  const { ds, jugadoresVisibles } = useApp()
  const [periodo, setPeriodo] = useState<Periodo>('temporada')
  const [foco, setFoco] = useState<Area | null>(null)
  const conFicha = jugadoresVisibles.filter(tieneConsentimientoFicha).sort((a, b) => a.dorsal - b.dorsal)
  const j = conFicha.find((x) => x.id === id) ?? conFicha[0]
  const serieTodo = useMemo(() => (j ? serieEvolucion(j, ds.evaluaciones, ds.items) : []), [j, ds.evaluaciones, ds.items])

  if (!j) return <Vacio icono="evolucion">No hay jugadores con consentimiento.</Vacio>
  // El periodo solo recorta lo que se ve; los cálculos de cada punto no cambian.
  const desde = periodo === 'temporada' ? '' : new Date(Date.now() - Number(periodo) * 86_400_000).toISOString().slice(0, 10)
  const serie = desde ? serieTodo.filter((p) => p.fecha >= desde) : serieTodo
  const primero = serie[0]
  const ultimo = serie[serie.length - 1]
  const datos = serie.map((p) => ({ ...p, etiqueta: fechaCorta(p.fecha) }))
  const delta = (a: Area | 'media') => (primero?.[a] != null && ultimo?.[a] != null ? ultimo[a]! - primero[a]! : null)
  const conDelta = AREAS.filter((a) => delta(a) != null)
  const masCrece = [...conDelta].sort((a, b) => delta(b)! - delta(a)!)[0]
  const masBaja = [...conDelta].sort((a, b) => delta(a)! - delta(b)!)[0]
  const opacidad = (a: Area) => (foco && foco !== a ? 0.18 : 1)

  return (
    <>
      <Cabecera titulo="Evolución" sub="Por área a lo largo de la temporada" />
      <div className="herramientas">
        {FLAGS.disenoV2 && <Camiseta dorsal={j.dorsal} size={44} className="destacada" />}
        <label className="ordenar crece">
          <span>Jugador</span>
          <select value={j.id} onChange={(e) => ir({ nombre: 'evolucion', id: e.target.value }, true)}>
            {conFicha.map((x) => (
              <option key={x.id} value={x.id}>
                {x.dorsal} · {x.nombre} {x.apellidos.split(' ')[0]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {FLAGS.disenoV2 && (
        <div className="evo-controles">
          <div className="segmentado pequeno" role="radiogroup" aria-label="Periodo">
            {PERIODOS.map((p) => (
              <button key={p.id} role="radio" aria-checked={periodo === p.id} className={periodo === p.id ? 'on' : ''} onClick={() => setPeriodo(p.id)}>
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {serie.length < 2 ? (
        <Vacio icono="evolucion">
          {serieTodo.length >= 2 ? 'En este periodo hay menos de 2 evaluaciones. Prueba con un periodo más largo.' : 'Hacen falta al menos 2 evaluaciones para ver la evolución.'}
        </Vacio>
      ) : (
        <div className="evolucion-rejilla">
          <section className="bloque evo-grafico">
            {FLAGS.disenoV2 && (
              <div className="evo-areas" role="group" aria-label="Resaltar un área">
                <button className={`evo-area ${foco == null ? 'on' : ''}`} aria-pressed={foco == null} onClick={() => setFoco(null)}>
                  Todas
                </button>
                {AREAS.map((a) => (
                  <button key={a} className={`evo-area ${foco === a ? 'on' : ''}`} aria-pressed={foco === a} onClick={() => setFoco(foco === a ? null : a)}>
                    <i style={{ background: AREA_COLOR[a] }} aria-hidden />
                    {AREA_CORTO[a]}
                  </button>
                ))}
              </div>
            )}
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={datos} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fill: 'var(--text-2)', fontSize: 12 }} stroke="var(--line)" tickLine={false} />
                  <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: 'var(--text-2)', fontSize: 12 }} stroke="var(--line)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13, color: 'var(--text)' }}
                    labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
                    formatter={(v) => num1(Number(v))}
                  />
                  {!FLAGS.disenoV2 && <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} />}
                  {AREAS.map((a) => (
                    <Line
                      key={a}
                      type="monotone"
                      dataKey={a}
                      name={AREA_CORTO[a]}
                      stroke={AREA_COLOR[a]}
                      strokeWidth={foco === a ? 3.5 : 2}
                      strokeOpacity={opacidad(a)}
                      dot={{ r: foco === a ? 4 : 3, strokeOpacity: opacidad(a), fillOpacity: opacidad(a) }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                  <Line type="monotone" dataKey="media" name="Media" stroke="var(--accent)" strokeWidth={3} strokeOpacity={foco ? 0.25 : 1} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {FLAGS.disenoV2 && <p className="nota-pie">Línea discontinua: media general. Cada punto es un día con evaluación.</p>}
          </section>

          <section className="bloque">
            <h2>Cambio desde el {fechaCorta(primero.fecha)}</h2>
            {FLAGS.disenoV2 && masCrece && delta(masCrece)! > 0 && (
              <div className="fuerte-flojo">
                <span>
                  <small>Más ha crecido</small>
                  <strong style={{ color: AREA_COLOR[masCrece] }}>{AREA_CORTO[masCrece]}</strong>
                  <Tendencia v={delta(masCrece)} />
                </span>
                {masBaja && masBaja !== masCrece && (
                  <span>
                    <small>{delta(masBaja)! < 0 ? 'Necesita atención' : 'Más estable'}</small>
                    <strong style={{ color: AREA_COLOR[masBaja] }}>{AREA_CORTO[masBaja]}</strong>
                    <Tendencia v={delta(masBaja)} />
                  </span>
                )}
              </div>
            )}
            <ul className="lista-fin evo-cambios">
              {[...AREAS, 'media' as const].map((a) => (
                <li key={a}>
                  <span className="crece">
                    {FLAGS.disenoV2 && <i className="evo-punto" style={{ background: a === 'media' ? 'var(--accent)' : AREA_COLOR[a] }} aria-hidden />}
                    {a === 'media' ? 'Media general' : AREA_CORTO[a]}
                  </span>
                  {FLAGS.disenoV2 && ultimo[a] != null && (
                    <span className="evo-pista" aria-hidden>
                      <span style={{ width: `${(ultimo[a]! / 5) * 100}%`, background: a === 'media' ? 'var(--accent)' : AREA_COLOR[a] }} />
                    </span>
                  )}
                  <span className="num">
                    {num1(primero[a])} → {num1(ultimo[a])}
                  </span>
                  <Tendencia v={delta(a)} />
                </li>
              ))}
            </ul>
            <p className="nota-pie">{serie.length} evaluaciones. Cada punto usa la última nota de cada ítem hasta esa fecha.</p>
          </section>
        </div>
      )}
    </>
  )
}
