import { openDB, type IDBPDatabase } from 'idb'

/**
 * Preferencias locales del dispositivo (IndexedDB): tema, "ver como" y equipo activo.
 *
 * Aquí NO se guarda nada que dé permisos (ni rol, ni sesión, ni datos de jugadores):
 * los datos y la autorización viven en Supabase. Si alguien manipula estos ajustes
 * solo cambia lo que ve en su pantalla; el servidor sigue aplicando sus reglas.
 */

const ALMACENES_ANTIGUOS = [
  'usuarios', 'miembros', 'equipos', 'jugadores', 'estados', 'items', 'evaluaciones',
  'pruebas', 'notas', 'eventos', 'asistencias', 'participaciones', 'cargas', 'cuentas',
]

let dbp: Promise<IDBPDatabase> | null = null
function db() {
  dbp ??= openDB('futbollab-jugadores', 3, {
    upgrade(d) {
      // v3: los datos pasan a Supabase. Se borran las copias locales del prototipo
      // (incluidas las cuentas con su contraseña derivada) para no dejar datos personales en el dispositivo.
      for (const s of ALMACENES_ANTIGUOS) if (d.objectStoreNames.contains(s)) d.deleteObjectStore(s)
      if (!d.objectStoreNames.contains('ajustes')) d.createObjectStore('ajustes')
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
