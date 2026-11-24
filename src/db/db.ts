import { openDB, type IDBPDatabase } from 'idb'

/**
 * Preferencias locales del dispositivo (IndexedDB): tema, "ver como" y equipo activo.
 *
 * Aquí NO se guarda nada que dé permisos (ni rol, ni sesión): los datos y la
 * autorización viven en Supabase. Si alguien manipula estos ajustes solo cambia
 * lo que ve en su pantalla; el servidor sigue aplicando sus reglas.
 *
 * IMPORTANTE: los almacenes de la versión local (cuentas, jugadores, evaluaciones…)
 * NO se borran. Se conservan intactos para poder hacer la copia de seguridad y la
 * migración a Supabase de forma controlada (ver leerDatosLocales).
 */

/** Almacenes de la versión local del prototipo (solo lectura desde esta versión). */
export const ALMACENES_LOCALES = [
  'usuarios', 'miembros', 'equipos', 'jugadores', 'estados', 'items', 'evaluaciones',
  'pruebas', 'notas', 'eventos', 'asistencias', 'participaciones', 'cargas', 'cuentas',
] as const

let dbp: Promise<IDBPDatabase> | null = null
export function db() {
  // v6: añade "copia" (últimos datos vistos, para abrir sin cobertura) y "cola" (notas
  // pendientes de subir). Solo crea lo que falta: nunca borra nada de versiones anteriores.
  dbp ??= openDB('futbollab-jugadores', 6, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('ajustes')) d.createObjectStore('ajustes')
      if (!d.objectStoreNames.contains('copia')) d.createObjectStore('copia')
      if (!d.objectStoreNames.contains('cola')) d.createObjectStore('cola', { keyPath: 'id' }).createIndex('usuario', 'usuario')
    },
  })
  return dbp
}

export async function leerAjuste<T>(k: string): Promise<T | undefined> {
  try {
    return await (await db()).get('ajustes', k)
  } catch {
    return undefined // navegación privada o almacenamiento bloqueado: se usan los valores por defecto
  }
}

export async function guardarAjuste(k: string, v: unknown) {
  try {
    await (await db()).put('ajustes', v, k)
  } catch {
    /* sin almacenamiento local: la preferencia dura hasta cerrar la pestaña */
  }
}

/**
 * Lee (sin modificar) todo lo que la versión local guardó en este navegador.
 * Sirve para la copia de seguridad previa a la migración. Las cuentas se devuelven
 * sin la contraseña derivada: no hace falta para migrar y no debe salir del dispositivo.
 */
export async function leerDatosLocales(): Promise<Record<string, unknown[]>> {
  const d = await db()
  const out: Record<string, unknown[]> = {}
  for (const s of ALMACENES_LOCALES) {
    if (!d.objectStoreNames.contains(s)) continue
    const filas = (await d.getAll(s)) as Record<string, unknown>[]
    out[s] = s === 'cuentas' ? filas.map(({ credencial: _c, ...resto }) => resto) : filas
  }
  return out
}
