import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { crearDatosEjemplo } from '../data/seed'
import type { Cuenta, Evaluacion } from '../model/types'
import { borrarDatosLocales, conPendientes, encolar, esErrorDeRed, guardarCopia, leerCopia, pendientes, subirPendientes, ultimoUsuario } from './offline'

const nota = (id: string, valor: 1 | 2 | 3 | 4 | 5 = 3): Evaluacion => ({
  id, creadoEn: '2026-11-23T10:00:00Z', actualizadoEn: '2026-11-23T10:00:00Z', creadoPor: 'u1',
  jugadorId: 'j-10', fecha: '2026-11-23T10:00:00Z', evaluadorId: 'u1', contexto: 'partido', puntuaciones: [{ itemId: 'tec-pase-corto', valor }],
})
const sinRed = Object.assign(new TypeError('Failed to fetch'), {})
const rechazo = Object.assign(new Error('No tienes permiso para hacer esto.'), { code: '42501' })

describe('sin conexión · detectar la falta de señal', () => {
  it('distingue la falta de red de un rechazo del servidor', () => {
    expect(esErrorDeRed(sinRed)).toBe(true)
    expect(esErrorDeRed({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true)
    expect(esErrorDeRed(rechazo)).toBe(false)
    expect(esErrorDeRed(rechazo, false)).toBe(true) // el navegador sabe que no hay red
  })
})

describe('sin conexión · cola de notas', () => {
  it('una nota sin señal se guarda y se sube después, sin duplicados', async () => {
    await encolar('u1', nota('ev-1', 2))
    await encolar('u1', nota('ev-1', 4)) // misma nota con más puntos: sustituye, no duplica
    await encolar('u1', nota('ev-2'))
    expect((await pendientes('u1')).map((e) => [e.id, e.puntuaciones[0].valor])).toEqual([['ev-1', 4], ['ev-2', 3]])

    const subidas: string[] = []
    const r = await subirPendientes('u1', async (e) => void subidas.push(e.id))
    expect(r).toEqual({ subidas: 2, rechazadas: [], quedan: 0 })
    expect(subidas).toEqual(['ev-1', 'ev-2'])
    expect(await pendientes('u1')).toEqual([])
  })
  it('si la señal vuelve a caer a mitad, para y conserva lo que falta', async () => {
    for (const id of ['a', 'b', 'c']) await encolar('u2', nota(id))
    let n = 0
    const r = await subirPendientes('u2', async () => {
      if (++n === 2) throw sinRed
    })
    expect(r).toEqual({ subidas: 1, rechazadas: [], quedan: 2 })
    expect((await pendientes('u2')).map((e) => e.id)).toEqual(['b', 'c'])
  })
  it('un rechazo de permisos sale de la cola y se avisa (no se reintenta para siempre)', async () => {
    await encolar('u3', nota('x'))
    await encolar('u3', nota('y'))
    const r = await subirPendientes('u3', async (e) => {
      if (e.id === 'x') throw rechazo
    })
    expect(r.subidas).toBe(1)
    expect(r.rechazadas.map((x) => [x.evaluacion.id, x.motivo])).toEqual([['x', 'No tienes permiso para hacer esto.']])
    expect(await pendientes('u3')).toEqual([])
  })
  it('las notas pendientes se ven en pantalla aunque el servidor aún no las tenga', () => {
    const ds = crearDatosEjemplo(new Date('2026-11-23T10:00:00Z'))
    const con = conPendientes(ds, [nota('ev-nueva', 5)])
    expect(con.evaluaciones.length).toBe(ds.evaluaciones.length + 1)
    expect(conPendientes(ds, [])).toBe(ds)
  })
})

describe('sin conexión · copia local y cierre de sesión', () => {
  const cuenta = { id: 'u9', nombre: 'Ana', email: 'ana@club.es', role: 'player' } as Cuenta
  it('guarda la última copia, la recupera y la borra al cerrar sesión junto con la cola', async () => {
    const todo = crearDatosEjemplo(new Date('2026-11-23T10:00:00Z'))
    await guardarCopia({ usuario: 'u9', fecha: '2026-11-23T18:40:00Z', cuenta, todo, perfiles: [cuenta] })
    expect(await ultimoUsuario()).toBe('u9')
    expect((await leerCopia('u9'))?.todo.jugadores).toHaveLength(18)
    await encolar('u9', nota('pend'))
    await encolar('otro', nota('ajena'))

    await borrarDatosLocales('u9')
    expect(await leerCopia('u9')).toBeUndefined()
    expect(await pendientes('u9')).toEqual([])
    expect(await ultimoUsuario()).toBeUndefined()
    expect((await pendientes('otro')).map((e) => e.id)).toEqual(['ajena']) // no toca lo de otros usuarios
  })
})
