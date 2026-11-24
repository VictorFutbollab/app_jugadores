import type { ReactNode } from 'react'
import { Icon, type NombreIcono } from './Icon'
import type { Estado, Jugador } from '../model/types'
import { AREAS, AREA_COLOR, AREA_CORTO, ESTADO_INFO, iniciales, num1 } from '../logic/format'
import { puedeMostrarFoto } from '../logic/privacy'
import type { AreaScores } from '../logic/stats'
import { href, type Ruta } from '../state/router'
import { FLAGS } from '../config'

/** Camiseta con el dorsal: identifica al jugador sin foto y sin datos personales. */
export function Camiseta({ dorsal, size = 56, className = '' }: { dorsal: number | string | null | undefined; size?: number; className?: string }) {
  const n = dorsal == null || dorsal === '' ? '' : String(dorsal)
  return (
    <svg className={`avatar camiseta ${className}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path d="M16 6 8 10 3 19l6 4 3-3v22h24V20l3 3 6-4-5-9-8-4c-2 4-5 6-8 6s-6-2-8-6Z" />
      <text x="24" y="35" textAnchor="middle" fontSize={n.length > 1 ? 14 : 15}>
        {n}
      </text>
    </svg>
  )
}

export function Avatar({ j, size = 56 }: { j: Jugador; size?: number }) {
  if (puedeMostrarFoto(j)) return <img className="avatar" src={j.foto!} alt="" width={size} height={size} />
  if (FLAGS.disenoV2) return <Camiseta dorsal={j.dorsal} size={size} />
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
            {comparar?.[a] != null && <span className="barras-ref" style={{ left: `${(comparar[a]! / 5) * 100}%` }} title="Hace 30 días" />}
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

export function Vacio({ children, icono = 'plantilla' }: { children: ReactNode; icono?: NombreIcono }) {
  if (!FLAGS.disenoV2) return <p className="vacio">{children}</p>
  return (
    <div className="vacio vacio-v2">
      <span className="vacio-icono" aria-hidden>
        <Icon n={icono} size={26} />
      </span>
      <p>{children}</p>
    </div>
  )
}

/** Escala fija de color para las notas 1–5 (siempre acompañada del número, nunca solo color). */
export const claseNota = (v: number | null | undefined) => (v == null ? 'n0' : `n${Math.min(5, Math.max(1, Math.round(v)))}`)
