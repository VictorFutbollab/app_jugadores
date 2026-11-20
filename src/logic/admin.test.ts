import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { crearDatosEjemplo, EQUIPO_ID } from '../data/seed'
import { datosExternos, resumenJugador } from './stats'
import { celdaCsv, csvJugadores, cumpleFiltro, coincideBusqueda, dorsalLibre, filaAdmin, ordenarFilas, quedaAlgunAdmin, validarJugador } from './admin'
import * as DB from '../db/db'
import type { Cuenta } from '../model/types'

const hoy = new Date('2026-11-19T10:00:00Z')
const ds = crearDatosEjemplo(hoy)
const filas = ds.jugadores.map((j) =>
  filaAdmin(j, ds.estados.find((e) => e.jugadorId === j.id), resumenJugador(j, ds.evaluaciones, ds.items, hoy), datosExternos(j.id, ds.asistencias, ds.participaciones, ds.cargas, hoy), hoy),
)

describe('panel de admin · tabla', () => {
  it('filtra por consentimiento, disponibilidad y archivados', () => {
    expect(filas.filter((f) => cumpleFiltro(f, 'sin_consentimiento')).map((f) => f.j.dorsal)).toEqual([18])
    expect(filas.filter((f) => cumpleFiltro(f, 'no_disponibles')).map((f) => f.j.dorsal).sort((a, b) => a - b)).toEqual([5, 14, 16])
    const archivada = { ...filas[0], j: { ...filas[0].j, archivado: true } }
    expect(cumpleFiltro(archivada, 'activos')).toBe(false)
    expect(cumpleFiltro(archivada, 'archivados')).toBe(true)
    expect(cumpleFiltro(archivada, 'todos')).toBe(true)
  })
  it('busca sin tildes y por dorsal exacto', () => {
    const alex = ds.jugadores.find((j) => j.dorsal === 2)!
    expect(coincideBusqueda(alex, 'alex')).toBe(true)
    expect(coincideBusqueda(alex, 'ROMERO')).toBe(true)
    expect(coincideBusqueda(alex, '2')).toBe(true)
    expect(coincideBusqueda(alex, '12')).toBe(false)
  })
  it('ordena por media con los vacíos al final en los dos sentidos', () => {
    const desc = ordenarFilas(filas, 'media', false)
    const asc = ordenarFilas(filas, 'media', true)
    expect(desc.at(-1)!.j.dorsal).toBe(18)
    expect(asc.at(-1)!.j.dorsal).toBe(18)
    expect(desc[0].r!.media!).toBeGreaterThanOrEqual(desc[1].r!.media!)
  })
})

describe('panel de admin · alta y edición', () => {
  it('no deja repetir dorsal entre activos, pero sí con un archivado', () => {
    const nuevo = { id: 'nuevo', equipoId: EQUIPO_ID, nombre: 'Ana', apellidos: 'Gil', dorsal: 10 }
    expect(validarJugador(nuevo, ds.jugadores).dorsal).toContain('Lucas')
    expect(validarJugador({ ...nuevo, archivado: true }, ds.jugadores)).toEqual({})
    expect(validarJugador({ ...nuevo, dorsal: 0, nombre: ' ' }, ds.jugadores)).toMatchObject({ dorsal: expect.any(String), nombre: expect.any(String) })
    expect(validarJugador({ ...nuevo, dorsal: 19 }, ds.jugadores)).toEqual({})
  })
  it('propone el primer dorsal libre', () => {
    expect(dorsalLibre(ds.jugadores, EQUIPO_ID)).toBe(19)
    expect(dorsalLibre(ds.jugadores.filter((j) => j.dorsal !== 7), EQUIPO_ID)).toBe(7)
  })
})

describe('panel de admin · exportar', () => {
  it('CSV con ";" que escapa comillas y evita fórmulas, sin tocar los números negativos', () => {
    expect(celdaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(celdaCsv('-0,3')).toBe('-0,3')
    expect(celdaCsv('Pérez; hijo')).toBe('"Pérez; hijo"')
    const csv = csvJugadores(filas).split('\r\n')
    expect(csv).toHaveLength(19)
    expect(csv[0].startsWith('Dorsal;Nombre;Apellidos')).toBe(true)
  })
})

describe('panel de admin · cuentas', () => {
  const cuenta = (id: string, creadoEn: string, extra: Partial<Cuenta> = {}): Cuenta => ({
    id, nombre: id, usuario: id, email: `${id}@club.es`, telefono: '+34600123456', entidad: 'CD Ejemplo', categoria: 'infantil', equipo: 'A', genero: 'mixto',
    aceptaPrivacidadEn: creadoEn, creadoEn, actualizadoEn: creadoEn, credencial: { hash: 'x', sal: 'x', iteraciones: 1 }, ...extra,
  })
  it('la cuenta más antigua pasa a ser admin si no hay ninguno', async () => {
    await DB.restablecer()
    await DB.guardarCuenta(cuenta('u-nueva', '2026-11-02T00:00:00Z'))
    await DB.guardarCuenta(cuenta('u-vieja', '2026-01-01T00:00:00Z'))
    await DB.asegurarAdmin()
    expect((await DB.listarCuentas()).filter((c) => c.esAdmin).map((c) => c.id)).toEqual(['u-vieja'])
    await DB.asegurarAdmin() // si ya hay admin no cambia nada
    expect((await DB.listarCuentas()).filter((c) => c.esAdmin).map((c) => c.id)).toEqual(['u-vieja'])
  })
  it('guardar la cuenta conserva el rol que le dio el admin', async () => {
    const ds2 = await DB.cargarTodo()
    const m = ds2.miembros.find((x) => x.usuarioId === 'u-nueva')!
    await DB.guardar('miembros', { ...m, rol: 'ayudante', permisos: { verFicha: true, verNotasPrivadas: false, evaluar: false } })
    await DB.guardarCuenta({ ...(await DB.cuentaPorId('u-nueva'))!, nombre: 'Otro nombre' })
    const m2 = (await DB.cargarTodo()).miembros.find((x) => x.usuarioId === 'u-nueva')!
    expect(m2.rol).toBe('ayudante')
    expect(m2.permisos.evaluar).toBe(false)
  })
  it('no deja quitar el último admin', () => {
    const cs = [{ id: 'a', esAdmin: true }, { id: 'b', esAdmin: false }]
    expect(quedaAlgunAdmin(cs, 'a', false)).toBe(false)
    expect(quedaAlgunAdmin(cs, 'b', true)).toBe(true)
    expect(quedaAlgunAdmin([...cs, { id: 'c', esAdmin: true }], 'a', false)).toBe(true)
  })
})
