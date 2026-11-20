import { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../state/store'
import { ir } from '../state/router'
import { Cabecera, Tendencia, Vacio } from '../ui/components'
import { AREAS, AREA_COLOR, AREA_CORTO, fechaCorta, num1 } from '../logic/format'
import { tieneConsentimientoFicha } from '../logic/privacy'
import { serieEvolucion } from '../logic/stats'

export function Evolucion({ id }: { id?: string }) {
  const { ds, jugadoresVisibles } = useApp()
  const conFicha = jugadoresVisibles.filter(tieneConsentimientoFicha).sort((a, b) => a.dorsal - b.dorsal)
  const j = conFicha.find((x) => x.id === id) ?? conFicha[0]
  const serie = useMemo(() => (j ? serieEvolucion(j, ds.evaluaciones, ds.items) : []), [j, ds.evaluaciones, ds.items])

  if (!j) return <Vacio>No hay jugadores con consentimiento.</Vacio>
  const primero = serie[0]
  const ultimo = serie[serie.length - 1]
  const datos = serie.map((p) => ({ ...p, etiqueta: fechaCorta(p.fecha) }))

  return (
    <>
      <Cabecera titulo="Evolución" sub="Por área a lo largo de la temporada" />
      <div className="herramientas">
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

      {serie.length < 2 ? (
        <Vacio>Hacen falta al menos 2 evaluaciones para ver la evolución.</Vacio>
      ) : (
        <>
          <section className="bloque">
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={datos} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fill: 'var(--text-2)', fontSize: 11 }} stroke="var(--line)" />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: 'var(--text-2)', fontSize: 11 }} stroke="var(--line)" />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13 }}
                    labelStyle={{ color: 'var(--text)' }}
                    formatter={(v) => num1(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} />
                  {AREAS.map((a) => (
                    <Line key={a} type="monotone" dataKey={a} name={AREA_CORTO[a]} stroke={AREA_COLOR[a]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                  ))}
                  <Line type="monotone" dataKey="media" name="Media" stroke="var(--accent)" strokeWidth={3} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="bloque">
            <h2>
              Cambio desde el {fechaCorta(primero.fecha)}
            </h2>
            <ul className="lista-fin">
              {[...AREAS, 'media' as const].map((a) => (
                <li key={a}>
                  <span className="crece">{a === 'media' ? 'Media general' : AREA_CORTO[a]}</span>
                  <span className="num">
                    {num1(primero[a])} → {num1(ultimo[a])}
                  </span>
                  <Tendencia v={primero[a] != null && ultimo[a] != null ? ultimo[a]! - primero[a]! : null} />
                </li>
              ))}
            </ul>
            <p className="nota-pie">{serie.length} evaluaciones. Cada punto usa la última nota de cada ítem hasta esa fecha.</p>
          </section>
        </>
      )}
    </>
  )
}
