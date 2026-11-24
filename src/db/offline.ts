/**
 * Modo sin conexión: la app sigue funcionando en el campo, sin cobertura.
 *
 * - Copia local: tras cada carga correcta se guarda en el móvil lo último que vio el
 *   usuario (solo lo que el servidor ya le dejaba ver). Si al abrir no hay señal, se usa.
 * - Cola: una nota de evaluación que no se puede subir por falta de señal no se pierde;
 *   se guarda aquí y se sube sola al volver la conexión.
 * - Al cerrar sesión se borran la copia y la cola del usuario.
 *
 * Esto no cambia ningún permiso: al subir, el servidor vuelve a comprobarlo todo (RLS).
 * Si rechaza una nota por permisos, sale de la cola y se avisa; no se reintenta.
 */
import type { Dataset } from '../data/seed'
import type { Cuenta, Evaluacion } from '../model/types'
import { db } from './db'

/** Interruptor general: en false, la app se comporta como antes (todo requiere conexión). */
export const MODO_SIN_CONEXION = true

export const MENSAJE_SIN_SENAL = 'Sin cobertura. Lo guardamos y lo subimos en cuanto vuelva la señal.'
export const MENSAJE_NECESITA_RED = 'Necesitas conexión para esto. Inténtalo cuando vuelva la señal.'

/** ¿El fallo se debe a la falta de red (y por tanto merece reintentarse)? */
export function esErrorDeRed(e: unknown, enLinea = typeof navigator === 'undefined' || navigator.onLine !== false): boolean {
  if (!enLinea) return true
  const err = e as { name?: string; message?: string; status?: number } | null
  const m = `${err?.name ?? ''} ${err?.message ?? String(e)}`
  return /Failed to fetch|NetworkError|Network request failed|Load failed|fetch failed|ERR_INTERNET|ERR_NETWORK|AuthRetryableFetchError|Sin conexión|timed? ?out/i.test(m) || err?.status === 0
}

// ───────────── Copia local ─────────────

export interface Copia {
  usuario: string
  fecha: string
  cuenta: Cuenta
  todo: Dataset
  perfiles: Cuenta[]
}

export async function guardarCopia(c: Copia) {
  try {
    const d = await db()
    await d.put('copia', c, c.usuario)
    await d.put('ajustes', c.usuario, 'ultimoUsuario') // para abrir sin señal aunque la sesión no se pueda renovar
  } catch {
    /* almacenamiento lleno o bloqueado: la app sigue funcionando con conexión */
  }
}

export async function leerCopia(usuario: string): Promise<Copia | undefined> {
  try {
    return (await (await db()).get('copia', usuario)) as Copia | undefined
  } catch {
    return undefined
  }
}

export async function ultimoUsuario(): Promise<string | undefined> {
  try {
    return (await (await db()).get('ajustes', 'ultimoUsuario')) as string | undefined
  } catch {
    return undefined
  }
}

// ───────────── Cola de notas pendientes ─────────────

interface EnCola {
  id: string
  usuario: string
  encoladaEn: string
  evaluacion: Evaluacion
}

/** Guarda (o sustituye: misma nota, más puntos) una evaluación pendiente de subir. */
export async function encolar(usuario: string, e: Evaluacion) {
  const fila: EnCola = { id: e.id, usuario, encoladaEn: new Date().toISOString(), evaluacion: e }
  await (await db()).put('cola', fila)
}

export async function pendientes(usuario: string): Promise<Evaluacion[]> {
  try {
    const filas = (await (await db()).getAllFromIndex('cola', 'usuario', usuario)) as EnCola[]
    return filas.sort((a, b) => a.encoladaEn.localeCompare(b.encoladaEn)).map((f) => f.evaluacion)
  } catch {
    return []
  }
}

export interface ResultadoSubida {
  subidas: number
  rechazadas: { evaluacion: Evaluacion; motivo: string }[]
  quedan: number
}

/**
 * Sube las notas pendientes en orden. Si falla la red, para y conserva el resto.
 * Si el servidor rechaza una por otro motivo (permisos, consentimiento), la saca
 * de la cola y la devuelve como rechazada para avisar al usuario.
 * Subir dos veces la misma nota no la duplica: se guarda por su identificador.
 */
export async function subirPendientes(usuario: string, enviar: (e: Evaluacion) => Promise<void>): Promise<ResultadoSubida> {
  const lista = await pendientes(usuario)
  const r: ResultadoSubida = { subidas: 0, rechazadas: [], quedan: 0 }
  const d = await db()
  for (let i = 0; i < lista.length; i++) {
    const e = lista[i]
    try {
      await enviar(e)
      await d.delete('cola', e.id)
      r.subidas++
    } catch (err) {
      if (esErrorDeRed(err)) {
        r.quedan = lista.length - i
        return r
      }
      await d.delete('cola', e.id)
      r.rechazadas.push({ evaluacion: e, motivo: (err as Error)?.message ?? String(err) })
    }
  }
  return r
}

/** Añade al conjunto las notas que aún están en la cola (para que no "desaparezcan" de la pantalla). */
export function conPendientes(todo: Dataset, cola: Evaluacion[]): Dataset {
  if (cola.length === 0) return todo
  const ids = new Set(cola.map((e) => e.id))
  return { ...todo, evaluaciones: [...todo.evaluaciones.filter((e) => !ids.has(e.id)), ...cola] }
}

/** Una nota que se acaba de guardar directamente ya no debe subirse desde la cola (evita pisarla con una versión vieja). */
export async function quitarDeCola(id: string) {
  try {
    await (await db()).delete('cola', id)
  } catch {
    /* nada que quitar */
  }
}

/** Si el servidor dice que la sesión ya no vale, la copia de ese usuario no debe quedarse en el móvil. */
export async function borrarCopia(usuario: string) {
  try {
    await (await db()).delete('copia', usuario)
  } catch {
    /* nada que borrar */
  }
}

/** Al cerrar sesión: fuera la copia y la cola de ese usuario de este dispositivo. */
export async function borrarDatosLocales(usuario: string) {
  try {
    const d = await db()
    await d.delete('copia', usuario)
    const claves = await d.getAllKeysFromIndex('cola', 'usuario', usuario)
    for (const k of claves) await d.delete('cola', k)
    if ((await d.get('ajustes', 'ultimoUsuario')) === usuario) await d.delete('ajustes', 'ultimoUsuario')
  } catch {
    /* nada que borrar */
  }
}
