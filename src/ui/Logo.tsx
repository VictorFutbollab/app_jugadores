import logoUrl from '../assets/logo-futbollab.png'

/**
 * Logo oficial de FutbolLab (el mismo de futbollab.com).
 * `soloMarca` recorta el escudo del jugador, sin el texto.
 * Proporción del archivo: 313 × 64 px; el escudo ocupa el primer ~31 %.
 */
const PROPORCION = 313 / 64
const PROPORCION_MARCA = 98 / 64

export function Logo({ alto = 28, soloMarca = false, app }: { alto?: number; soloMarca?: boolean; app?: string }) {
  if (soloMarca) {
    return (
      <span className="logo-marca" style={{ width: alto * PROPORCION_MARCA, height: alto }} aria-hidden>
        <img src={logoUrl} alt="" height={alto} width={alto * PROPORCION} />
      </span>
    )
  }
  return (
    <span className="logo" style={{ height: alto }} role="img" aria-label={`FutbolLab${app ? ` ${app}` : ''}`}>
      <img src={logoUrl} alt="" height={alto} width={Math.round(alto * PROPORCION)} />
      {app && <span className="logo-app" style={{ fontSize: Math.max(11, alto * 0.42) }}>{app}</span>}
    </span>
  )
}
