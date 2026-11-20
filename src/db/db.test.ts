import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it } from 'vitest'

describe('base de datos local', () => {
  it('se recupera en los navegadores que abrieron la versión de prueba con servidor (v3 sin almacenes)', async () => {
    // Así dejó el navegador aquella versión: solo "ajustes", con el tema guardado.
    const v3 = await openDB('futbollab-jugadores', 3, { upgrade: (d) => void d.createObjectStore('ajustes') })
    await v3.put('ajustes', 'claro', 'tema')
    v3.close()

    const DB = await import('./db')
    expect(await DB.sembrarSiVacio()).toBe(true)
    const ds = await DB.cargarTodo()
    expect(ds.jugadores).toHaveLength(18)
    expect(await DB.leerAjuste('tema')).toBe('claro') // conserva las preferencias
    expect(await DB.listarCuentas()).toEqual([])
  })
})
