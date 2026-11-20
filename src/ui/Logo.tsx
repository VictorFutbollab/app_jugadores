/**
 * Logo de FutbolLab.
 * PROVISIONAL: cuando llegue el logo oficial, se sustituye este componente
 * por un <img> del archivo en src/assets/ (un solo punto de cambio).
 */
export function Logo({ alto = 28, soloMarca = false, app }: { alto?: number; soloMarca?: boolean; app?: string }) {
  const marca = (
    <svg viewBox="0 0 32 32" height={alto} width={alto} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="var(--accent)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--accent-ink)" strokeWidth="2.2" />
      <path d="M16 11.2l4.3 3.1-1.6 5H13.3l-1.6-5z" fill="var(--accent-ink)" />
      <path d="M16 7v4.2M24.6 13.3l-4.3 1M21.3 23.5l-2.6-4.2M10.7 23.5l2.6-4.2M7.4 13.3l4.3 1" stroke="var(--accent-ink)" strokeWidth="1.6" />
    </svg>
  )
  if (soloMarca) return marca
  return (
    <span className="logo" style={{ height: alto }} role="img" aria-label={`FutbolLab${app ? ` ${app}` : ''}`}>
      {marca}
      <span className="logo-txt" style={{ fontSize: alto * 0.78 }}>
        FUTBOL<b>LAB</b>
      </span>
      {app && <span className="logo-app" style={{ fontSize: alto * 0.42 }}>{app}</span>}
    </span>
  )
}
