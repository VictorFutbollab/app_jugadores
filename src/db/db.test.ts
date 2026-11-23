import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it } from 'vitest'

describe('base de datos local en la versión con servidor', () => {
  it('no borra nada de la versión local (v4): cuentas y jugadores siguen intactos para migrarlos', async () => {
    const v4 = await openDB('futbollab-jugadores', 4, {
      upgrade(d) {
        d.createObjectStore('ajustes')
        d.createObjectStore('cuentas', { keyPath: 'id' })
        d.createObjectStore('jugadores', { keyPath: 'id' })
      },
    })
    await v4.put('cuentas', { id: 'u-1', email: 'ana@club.es', credencial: { hash: 'secreto', sal: 's', iteraciones: 1 } })
    await v4.put('jugadores', { id: 'j-1', nombre: 'Lucas' })
    await v4.put('ajustes', 'claro', 'tema')
    v4.close()

    const DB = await import('./db')
    expect(await DB.leerAjuste('tema')).toBe('claro')
    const datos = await DB.leerDatosLocales()
    expect(datos.jugadores).toEqual([{ id: 'j-1', nombre: 'Lucas' }])
    expect(datos.cuentas).toEqual([{ id: 'u-1', email: 'ana@club.es' }]) // sin la contraseña derivada
    // y siguen en el navegador tras abrir la versión nueva
    const d = await openDB('futbollab-jugadores')
    expect(await d.get('cuentas', 'u-1')).toBeTruthy()
    d.close()
  })
})
