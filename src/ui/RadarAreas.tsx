/** Radar de las 4 áreas. Va aparte para que la librería de gráficos solo se cargue en la ficha. */
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend } from 'recharts'
import { AREAS, AREA_CORTO, num1 } from '../logic/format'
import type { AreaScores } from '../logic/stats'

export function RadarAreas({ areas, comparar, alto = 260, etiquetaComparar = 'Hace 30 días' }: { areas: AreaScores; comparar?: AreaScores; alto?: number; etiquetaComparar?: string }) {
  const data = AREAS.map((a) => ({ area: AREA_CORTO[a], jugador: areas[a] ?? 0, equipo: comparar?.[a] ?? 0 }))
  return (
    <div style={{ width: '100%', height: alto }} role="img" aria-label={`Radar: ${AREAS.map((a) => `${AREA_CORTO[a]} ${num1(areas[a])}`).join(', ')}`}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--line)" />
          <PolarAngleAxis dataKey="area" tick={{ fill: 'var(--text-2)', fontSize: 12, fontFamily: 'Inter' }} />
          <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={false} axisLine={false} />
          {comparar && (
            <Radar name={etiquetaComparar} dataKey="equipo" stroke="var(--text-3)" strokeDasharray="4 3" fill="transparent" isAnimationActive={false} />
          )}
          <Radar name="Jugador" dataKey="jugador" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.28} isAnimationActive={false} />
          {comparar && <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={null} />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
