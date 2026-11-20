import { openDB, type IDBPDatabase } from 'idb'
import { crearDatosEjemplo, EQUIPO_ID, type Dataset } from '../data/seed'
import { categoria } from '../data/categorias'
import type { Cuenta, Equipo, MiembroEquipo, Usuario } from '../model/types'

/**
 * Almacenamiento local sin conexión (IndexedDB).
 * Fase 2: esta capa se sincroniza con Supabase (cola de cambios + políticas por fila)
 * y cifra los campos sensibles con una clave derivada de la sesión.
 */

export type StoreName = keyof Dataset
export const STORES: StoreName[] = [
  'usuarios', 'miembros', 'equipos', 'jugadores', 'estados', 'items', 'evaluaciones',
  'pruebas', 'notas', 'eventos', 'asistencias', 'participaciones', 'cargas',
]
/** Almacenes con datos de un jugador concreto (para exportar y borrar a petición). */
const POR_JUGADOR: StoreName[] = ['estados', 'evaluaciones', 'pruebas', 'notas', 'asistencias', 'participaciones', 'cargas']

const KEY: Partial<Record<StoreName, string | string[]>> = { miembros: ['equipoId', 'usuarioId'] }

let dbp: Promise<IDBPDatabase> | null = null
export function db() {
  dbp ??= openDB('futbollab-jugadores', 2, {
    upgrade(d, version) {
      if (version < 1) {
        for (const s of STORES) {
          const os = d.createObjectStore(s, { keyPath: KEY[s] ?? 'id' })
          if (POR_JUGADOR.includes(s)) os.createIndex('jugadorId', 'jugadorId')
        }
        d.createObjectStore('ajustes')
      }
      if (version < 2) {
        const c = d.createObjectStore('cuentas', { keyPath: 'id' })
        c.createIndex('usuario', 'usuario', { unique: true })
        c.createIndex('email', 'email', { unique: true })
      }
    },
  })
  return dbp
}

export async function cargarTodo(): Promise<Dataset> {
  const d = await db()
  const entries = await Promise.all(STORES.map(async (s) => [s, await d.getAll(s)] as const))
  return Object.fromEntries(entries) as unknown as Dataset
}

export async function sembrarSiVacio() {
  const d = await db()
  if ((await d.count('jugadores')) > 0) return false
  await escribirDataset(crearDatosEjemplo())
  return true
}

export async function escribirDataset(ds: Dataset) {
  const d = await db()
  const tx = d.transaction(STORES, 'readwrite')
  for (const s of STORES) {
    const os = tx.objectStore(s)
    for (const row of ds[s] as unknown[]) os.put(row)
  }
  await tx.done
}

/** Vuelve a cargar la plantilla de ejemplo conservando la cuenta y su equipo. */
export async function restablecer(cuentaId?: string) {
  const d = await db()
  const tx = d.transaction(STORES, 'readwrite')
  await Promise.all(STORES.map((s) => tx.objectStore(s).clear()))
  await tx.done
  await escribirDataset(crearDatosEjemplo())
  const c = cuentaId ? await cuentaPorId(cuentaId) : undefined
  if (c) await guardarCuenta(c)
}

export async function guardar<T>(store: StoreName, row: T) {
  await (await db()).put(store, row)
}

export async function guardarVarios<T>(store: StoreName, rows: T[]) {
  const d = await db()
  const tx = d.transaction(store, 'readwrite')
  for (const r of rows) tx.store.put(r)
  await tx.done
}

/** Exporta todos los datos de un jugador (derecho de acceso y portabilidad, art. 15 y 20 RGPD). */
export async function exportarJugador(jugadorId: string) {
  const d = await db()
  const jugador = await d.get('jugadores', jugadorId)
  const out: Record<string, unknown> = { exportadoEn: new Date().toISOString(), jugador }
  for (const s of POR_JUGADOR) out[s] = await d.getAllFromIndex(s, 'jugadorId', jugadorId)
  return out
}

/**
 * Borrado completo a petición (derecho de supresión, art. 17 RGPD).
 * No pasa por la papelera: elimina el jugador y todo lo que cuelga de él en una transacción.
 * Devuelve cuántos registros se han borrado.
 */
export async function borrarJugadorCompleto(jugadorId: string) {
  const d = await db()
  const tx = d.transaction(['jugadores', ...POR_JUGADOR], 'readwrite')
  let n = 0
  for (const s of POR_JUGADOR) {
    const keys = await tx.objectStore(s).index('jugadorId').getAllKeys(jugadorId)
    for (const k of keys) {
      await tx.objectStore(s).delete(k)
      n++
    }
  }
  await tx.objectStore('jugadores').delete(jugadorId)
  await tx.done
  return n + 1
}

export async function leerAjuste<T>(k: string): Promise<T | undefined> {
  return (await db()).get('ajustes', k)
}
export async function guardarAjuste(k: string, v: unknown) {
  await (await db()).put('ajustes', v, k)
}

// ───────────── Cuentas (prototipo local; fase 2: Supabase Auth) ─────────────

export async function cuentaPorId(id: string): Promise<Cuenta | undefined> {
  return (await db()).get('cuentas', id)
}
export async function cuentaPorUsuarioOEmail(x: string): Promise<Cuenta | undefined> {
  const d = await db()
  const k = x.trim().toLowerCase()
  return (await d.getFromIndex('cuentas', 'usuario', k)) ?? (await d.getFromIndex('cuentas', 'email', k))
}
export async function existe(campo: 'usuario' | 'email', valor: string, excepto?: string) {
  const c: Cuenta | undefined = await (await db()).getFromIndex('cuentas', campo, valor)
  return !!c && c.id !== excepto
}

/**
 * Guarda la cuenta y la refleja en el modelo común: Usuario, miembro como
 * entrenador principal y datos del equipo (entidad, categoría, nombre).
 */
export async function guardarCuenta(c: Cuenta) {
  const d = await db()
  const tx = d.transaction(['cuentas', 'usuarios', 'miembros', 'equipos'], 'readwrite')
  await tx.objectStore('cuentas').put(c)
  const u: Usuario = { id: c.id, nombre: c.nombre, email: c.email, usuario: c.usuario, telefono: c.telefono, foto: c.foto ?? null }
  await tx.objectStore('usuarios').put(u)
  const m: MiembroEquipo = { equipoId: EQUIPO_ID, usuarioId: c.id, rol: 'entrenador_principal', permisos: { verFicha: true, verNotasPrivadas: true, evaluar: true } }
  await tx.objectStore('miembros').put(m)
  const eq: Equipo | undefined = await tx.objectStore('equipos').get(EQUIPO_ID)
  if (eq) {
    const cat = categoria(c.categoria)
    await tx.objectStore('equipos').put({
      ...eq,
      entidad: c.entidad.trim(),
      categoria: cat.nombre,
      genero: c.genero,
      nombre: `${cat.nombre} ${c.equipo.trim()}`,
      modalidad: cat.modalidad,
      edadMin: cat.edadMin,
      edadMax: cat.edadMax,
      actualizadoEn: c.actualizadoEn,
    } satisfies Equipo)
  }
  await tx.done
}
