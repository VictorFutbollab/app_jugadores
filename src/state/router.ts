import { useEffect, useState } from 'react'

/**
 * Enrutado mínimo por hash: funciona sin servidor, en PWA y en la vista previa.
 * Formato con solo letras, números y guiones (#plantilla, #jugador--j-10--notas)
 * para que los enlaces se puedan copiar y compartir en cualquier visor.
 */
export type Ruta =
  | { nombre: 'inicio' }
  | { nombre: 'plantilla' }
  | { nombre: 'jugador'; id: string; pestana?: string }
  | { nombre: 'evaluar' }
  | { nombre: 'evolucion'; id?: string }
  | { nombre: 'perfil' }

export function parse(hash: string): Ruta {
  const [a, b, c] = hash.replace(/^#\/?/, '').split(/--|\//)
  switch (a) {
    case 'plantilla':
      return { nombre: 'plantilla' }
    case 'jugador':
      return b ? { nombre: 'jugador', id: b, pestana: c } : { nombre: 'plantilla' }
    case 'evaluar':
      return { nombre: 'evaluar' }
    case 'evolucion':
      return { nombre: 'evolucion', id: b }
    case 'perfil':
      return { nombre: 'perfil' }
    default:
      return { nombre: 'inicio' }
  }
}

export function href(r: Ruta): string {
  switch (r.nombre) {
    case 'inicio':
      return '#inicio'
    case 'jugador':
      return `#jugador--${r.id}${r.pestana ? `--${r.pestana}` : ''}`
    case 'evolucion':
      return `#evolucion${r.id ? `--${r.id}` : ''}`
    default:
      return `#${r.nombre}`
  }
}

export const ir = (r: Ruta, reemplazar = false) => {
  if (reemplazar) location.replace(href(r))
  else location.hash = href(r)
}
export const volver = (fallback: Ruta = { nombre: 'plantilla' }) => {
  if (history.length > 1) history.back()
  else ir(fallback, true)
}

export function useRuta() {
  const [r, setR] = useState(() => parse(location.hash))
  useEffect(() => {
    const f = () => {
      setR(parse(location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return r
}
