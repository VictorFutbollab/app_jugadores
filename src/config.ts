/**
 * Configuración general de la app.
 *
 * APP_NAME: nombre comercial en un único sitio. Hasta que se confirme el cambio de
 * nombre (candidato: "Dorsal"), se sigue mostrando "FutbolLab Jugadores".
 *
 * FLAGS: interruptores de los cambios visibles grandes, para poder probarlos y
 * volver atrás sin tocar el código. Se pueden forzar en un dispositivo con
 *   localStorage.setItem('flags', JSON.stringify({ inicioNuevo: false }))
 * Fase siguiente: guardarlos por equipo en el servidor.
 */
export const APP_NAME = 'FutbolLab Jugadores'
export const APP_NAME_CORTO = 'Jugadores'

const POR_DEFECTO = {
  /** Barra inferior con 4 pestañas (Inicio, Plantilla, Evaluar, Evolución); Perfil, en el avatar. */
  navegacion4: true,
  /** Inicio con un único botón protagonista, "Necesitan tu mirada" (máx. 3) y "Más mejoran este mes". */
  inicioNuevo: true,
  /**
   * Diseño "Vestuario": camisetas con dorsal en vez de iniciales, números grandes,
   * títulos normales (sin versalitas ni rayita), menos cajas y CTA sólido.
   * Desactivarlo devuelve el diseño anterior al completo.
   */
  disenoV2: true,
  /**
   * Capa visual sobre el diseño nuevo: 'cesped' (clara, deportiva, césped a franjas
   * y verde como color principal) o 'vestuario' (oscura, celeste FutbolLab).
   */
  estiloVisual: 'cesped' as 'cesped' | 'vestuario',
}

export type Flags = typeof POR_DEFECTO

function leerFlags(): Flags {
  try {
    const guardadas = JSON.parse(localStorage.getItem('flags') ?? '{}') as Partial<Flags>
    return { ...POR_DEFECTO, ...guardadas }
  } catch {
    return POR_DEFECTO
  }
}

export const FLAGS: Flags = typeof localStorage === 'undefined' ? POR_DEFECTO : leerFlags()
