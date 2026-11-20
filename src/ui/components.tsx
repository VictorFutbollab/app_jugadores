import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend } from 'recharts'
import type { Estado, Jugador } from '../model/types'
import { AREAS, AREA_COLOR, AREA_CORTO, ESTADO_INFO, iniciales, num1 } from '../logic/format'
import { puedeMostrarFoto } from '../logic/privacy'
import type { AreaScores } from '../logic/stats'
import { href, type Ruta } from '../state/router'

export function Avatar({ j, size = 56 }: { j: Jugador; size?: number }) {
  if (puedeMostrarFoto(j)) return <img className="avatar" src={j.foto!} alt="" width={size} height={size} />
  return (
    <span className="avatar ini" aria-hidden style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {iniciales(j.nombre, j.apellidos)}
    </span>
  )
}

/** Tendencia con flecha y número; nunca solo color. */
export function Tendencia({ v, sufijo = '' }: { v: number | null; sufijo?: string }) {
  if (v == null) return <span className="tend neutra" title="Sin datos para comparar">— sin comparar</span>
  const r = Math.round(v * 10) / 10
  const cls = r > 0 ? 'sube' : r < 0 ? 'baja' : 'neutra'
  const flecha = r > 0 ? '▲' : r < 0 ? '▼' : '▶'
  const txt = `${r > 0 ? '+' : r < 0 ? '−' : '±'}${num1(Math.abs(r))}`
  return (
    <span className={`tend ${cls}`} aria-label={`${r > 0 ? 'Sube' : r < 0 ? 'Baja' : 'Igual'} ${txt}${sufijo}`}>
      <span aria-hidden>{flecha}</span> {txt}
      {sufijo}
    </span>
  )
}

export function EstadoChip({ e, compacto }: { e?: Estado; compacto?: boolean }) {
  if (!e) return null
  const info = ESTADO_INFO[e.tipo]
  if (compacto && e.tipo === 'disponible') return null
  return (
    <span className={`chip estado-${e.tipo}`} style={{ color: info.color, borderColor: info.color }}>
      <i className="punto" aria-hidden /> {info.nombre}
    </span>
  )
}

export function Cabecera({ titulo, sub, atras, accion }: { titulo: ReactNode; sub?: ReactNode; atras?: () => void; accion?: ReactNode }) {
  return (
    <header className="cabecera">
      {atras && (
        <button className="icon-btn" onClick={atras} aria-label="Volver">
          <Icon n="atras" />
        </button>
      )}
      <div className="cabecera-txt">
        <h1>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {accion}
    </header>
  )
}

export function Enlace({ to, children, className }: { to: Ruta; children: ReactNode; className?: string }) {
  return (
    <a href={href(to)} className={className}>
      {children}
    </a>
  )
}

export function RadarAreas({ areas, comparar, alto = 260, etiquetaComparar = 'Media del equipo' }: { areas: AreaScores; comparar?: AreaScores; alto?: number; etiquetaComparar?: string }) {
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

export function BarrasArea({ areas, comparar }: { areas: AreaScores; comparar?: AreaScores }) {
  return (
    <ul className="barras">
      {AREAS.map((a) => (
        <li key={a}>
          <span className="barras-nombre">
            <i style={{ background: AREA_COLOR[a] }} aria-hidden />
            {AREA_CORTO[a]}
          </span>
          <span className="barras-pista">
            <span className="barras-valor" style={{ width: `${((areas[a] ?? 0) / 5) * 100}%`, background: AREA_COLOR[a] }} />
            {comparar?.[a] != null && <span className="barras-ref" style={{ left: `${(comparar[a]! / 5) * 100}%` }} title="Media del equipo" />}
          </span>
          <span className="num">{num1(areas[a])}</span>
        </li>
      ))}
    </ul>
  )
}

export function Dato({ etiqueta, valor, extra, fuente }: { etiqueta: string; valor: ReactNode; extra?: ReactNode; fuente?: string }) {
  return (
    <div className="dato">
      <span className="dato-et">{etiqueta}</span>
      <span className="dato-val num">{valor}</span>
      {extra && <span className="dato-extra">{extra}</span>}
      {fuente && <span className="dato-fuente">desde {fuente}</span>}
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="vacio">{children}</p>
}
