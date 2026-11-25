import { useId, type ReactNode } from 'react'
import { Icon, type NombreIcono } from './Icon'
import type { Estado, Jugador } from '../model/types'
import { AREAS, AREA_COLOR, AREA_CORTO, ESTADO_INFO, iniciales, num1 } from '../logic/format'
import { puedeMostrarFoto } from '../logic/privacy'
import type { AreaScores } from '../logic/stats'
import { href, type Ruta } from '../state/router'
import { FLAGS } from '../config'

/**
 * Foto de perfil por defecto (cuenta sin foto): un balón en el centro del campo,
 * sobre césped a franjas. Ilustración propia de FutbolLab (sin derechos de terceros).
 */
export function AvatarFutbol({ size = 40, className = '', etiqueta = 'Foto de perfil' }: { size?: number; className?: string; etiqueta?: string }) {
  const id = useId().replace(/:/g, '')
  const centro = '50,48.5 57.13,53.68 54.41,62.07 45.59,62.07 42.87,53.68'
  const fuera = [
    '50,42 41.92,36.13 45,26.62 55,26.62 58.08,36.13',
    '63.31,51.67 66.4,42.17 76.39,42.17 79.48,51.67 71.4,57.55',
    '58.23,67.33 68.22,67.33 71.31,76.83 63.23,82.7 55.14,76.83',
    '41.77,67.33 44.86,76.83 36.77,82.7 28.69,76.83 31.78,67.33',
    '36.69,51.67 28.6,57.55 20.52,51.67 23.61,42.17 33.6,42.17',
  ]
  const costuras = [
    [50, 48.5, 50, 41],
    [57.13, 53.68, 64.27, 51.36],
    [54.41, 62.07, 58.82, 68.14],
    [45.59, 62.07, 41.18, 68.14],
    [42.87, 53.68, 35.73, 51.36],
  ]
  return (
    <svg className={`avatar-futbol ${className}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={etiqueta}>
      <defs>
        <clipPath id={`${id}-c`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <clipPath id={`${id}-b`}>
          <circle cx="50" cy="56" r="21" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-c)`}>
        <rect width="100" height="100" fill="#1f6f3a" />
        {[0, 24, 48, 72, 96].map((x) => (
          <rect key={x} x={x} y="0" width="12" height="100" fill="#237a40" />
        ))}
        <g fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="2">
          <line x1="0" y1="56" x2="100" y2="56" />
          <circle cx="50" cy="56" r="33" />
        </g>
        <ellipse cx="51" cy="79" rx="15" ry="3.2" fill="#000000" opacity="0.25" />
        <circle cx="50" cy="56" r="21" fill="#ffffff" />
        <g clipPath={`url(#${id}-b)`} fill="#102018">
          <polygon points={centro} />
          {fuera.map((p) => (
            <polygon key={p} points={p} />
          ))}
          <g stroke="#102018" strokeWidth="1.4" strokeLinecap="round">
            {costuras.map(([x1, y1, x2, y2]) => (
              <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>
        </g>
        <circle cx="50" cy="56" r="21" fill="none" stroke="#102018" strokeOpacity="0.35" strokeWidth="1" />
      </g>
    </svg>
  )
}

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
            <span className="barras-valor" style={{ width: `${((areas[a] ?? 0) / 10) * 100}%`, background: AREA_COLOR[a] }} />
            {comparar?.[a] != null && <span className="barras-ref" style={{ left: `${(comparar[a]! / 10) * 100}%` }} title="Hace 30 días" />}
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

/** Escala fija de color para las notas 0–10 en 5 tramos (siempre acompañada del número, nunca solo color). */
export const claseNota = (v: number | null | undefined) => (v == null ? 'n0' : `n${Math.min(5, Math.max(1, Math.round(v / 2)))}`)
