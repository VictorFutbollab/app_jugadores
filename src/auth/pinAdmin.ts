/**
 * Freno de intentos del acceso de administración en este navegador.
 *
 * Es solo una comodidad: el freno de verdad está en el servidor (Supabase bloquea
 * 15 minutos tras 5 fallos y es quien comprueba el PIN: admin_verificar_pin).
 * En el modo local, el PIN lo comprueba src/db/local.ts.
 */
const INTENTOS_MAX = 5
const BLOQUEO_MS = 5 * 60_000
const CLAVE = 'admin-intentos'

interface Intentos {
  fallos: number
  hasta: number
}

function leerIntentos(): Intentos {
  try {
    return { fallos: 0, hasta: 0, ...(JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Partial<Intentos>) }
  } catch {
    return { fallos: 0, hasta: 0 }
  }
}

/** Minutos que quedan de bloqueo tras varios fallos (0 si se puede intentar). */
export function minutosBloqueo(ahora = Date.now()): number {
  const i = leerIntentos()
  return i.hasta > ahora ? Math.ceil((i.hasta - ahora) / 60_000) : 0
}

export function apuntarFallo(ahora = Date.now()) {
  const i = leerIntentos()
  const fallos = i.hasta && i.hasta <= ahora ? 1 : i.fallos + 1
  const bloqueo = fallos >= INTENTOS_MAX
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ fallos: bloqueo ? 0 : fallos, hasta: bloqueo ? ahora + BLOQUEO_MS : 0 }))
  } catch {
    /* sin almacenamiento: queda el freno del servidor */
  }
}

export function borrarFallos() {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    /* nada */
  }
}
