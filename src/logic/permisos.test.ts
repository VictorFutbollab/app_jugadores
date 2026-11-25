import { describe, expect, it } from 'vitest'
import { accionesEntrenador, temporadaActual, validarEquipo } from './permisos'
import { minimizar } from './privacy'
import { validarJugador } from './admin'
import type { Jugador } from '../model/types'

const jugador = (x: Partial<Jugador> = {}): Jugador => ({
  id: 'j-1',
  creadoEn: '2026-11-25T10:00:00Z',
  actualizadoEn: '2026-11-25T10:00:00Z',
  creadoPor: 'u-1',
  equipoId: 'eq-1',
  nombre: 'Lucas',
  apellidos: 'García Pérez',
  dorsal: 7,
  foto: null,
  fechaNacimiento: null,
  posiciones: [],
  pierna: null,
  contactos: [],
  consentimiento: null,
  ...x,
})

describe('qué ve cada cuenta en el panel del entrenador', () => {
  it('una cuenta familia no ve "Añadir jugador" ni "Crear equipo", aunque el servidor dijera que puede editar', () => {
    const a = accionesEntrenador({ tipoCuenta: 'familia', puedeEditar: true })
    expect(a.anadirJugador).toBe(false)
    expect(a.crearEquipo).toBe(false)
    expect(a.editarEquipo).toBe(false)
    expect(a.editarJugador).toBe(false)
  })
  it('sin saber aún el tipo de cuenta no se enseña nada', () => {
    expect(accionesEntrenador({ tipoCuenta: null, puedeEditar: true })).toEqual({ crearEquipo: false, editarEquipo: false, anadirJugador: false, editarJugador: false })
  })
  it('un manager crea equipos; añade y edita solo donde puede_editar_equipo es verdadero', () => {
    expect(accionesEntrenador({ tipoCuenta: 'manager', puedeEditar: false })).toEqual({ crearEquipo: true, editarEquipo: false, anadirJugador: false, editarJugador: false })
    expect(accionesEntrenador({ tipoCuenta: 'manager', puedeEditar: true })).toEqual({ crearEquipo: true, editarEquipo: true, anadirJugador: true, editarJugador: true })
  })
  it('un admin puede todo en los equipos que puede editar', () => {
    expect(accionesEntrenador({ tipoCuenta: 'admin', puedeEditar: true }).anadirJugador).toBe(true)
  })
})

describe('privacidad al guardar (minimizar)', () => {
  it('un jugador sin consentimiento se guarda sin posiciones, pierna, fecha de nacimiento ni foto', () => {
    const j = minimizar(jugador({ posiciones: ['DC', 'ED'], pierna: 'izquierda', fechaNacimiento: '2013-04-02', foto: 'data:image/jpeg;base64,xxx' }))
    expect(j.posiciones).toEqual([])
    expect(j.pierna).toBeNull()
    expect(j.fechaNacimiento).toBeNull()
    expect(j.foto).toBeNull()
    expect(j.nombre).toBe('Lucas')
    expect(j.dorsal).toBe(7)
  })
  it('con la autorización retirada también se recorta', () => {
    const c = { fecha: '2026-09-01', firmante: 'Ana', firmanteTipo: 'madre' as const, alcance: { ficha: true, fotos: true, notasVoz: false }, version: '2026.1', retiradoEn: '2026-11-20T10:00:00Z' }
    const j = minimizar(jugador({ consentimiento: c, posiciones: ['DC'], pierna: 'derecha' }))
    expect(j.posiciones).toEqual([])
    expect(j.pierna).toBeNull()
  })
  it('con consentimiento de ficha se guarda todo', () => {
    const c = { fecha: '2026-09-01', firmante: 'Ana', firmanteTipo: 'madre' as const, alcance: { ficha: true, fotos: false, notasVoz: false }, version: '2026.1' }
    const j = minimizar(jugador({ consentimiento: c, posiciones: ['DC'], pierna: 'derecha', fechaNacimiento: '2013-04-02' }))
    expect(j.posiciones).toEqual(['DC'])
    expect(j.fechaNacimiento).toBe('2013-04-02')
  })
})

describe('formulario de jugador (validarJugador)', () => {
  const plantilla = [jugador({ id: 'j-1', dorsal: 7 }), jugador({ id: 'j-2', nombre: 'Hugo', apellidos: 'Martín', dorsal: 1 })]
  it('no permite dorsales repetidos en el equipo', () => {
    const e = validarJugador(jugador({ id: 'j-nuevo', dorsal: 7 }), plantilla)
    expect(e.dorsal).toMatch(/ya lo lleva Lucas/)
  })
  it('el mismo dorsal sí vale en otro equipo, o si el otro jugador está de baja', () => {
    expect(validarJugador(jugador({ id: 'j-nuevo', dorsal: 7, equipoId: 'eq-2' }), plantilla).dorsal).toBeUndefined()
    const conBaja = [jugador({ id: 'j-1', dorsal: 7, archivado: true })]
    expect(validarJugador(jugador({ id: 'j-nuevo', dorsal: 7 }), conBaja).dorsal).toBeUndefined()
  })
  it('editar a un jugador sin cambiar su dorsal no choca consigo mismo', () => {
    expect(validarJugador(jugador({ id: 'j-1', dorsal: 7 }), plantilla).dorsal).toBeUndefined()
  })
  it('nombre y dorsal son obligatorios', () => {
    const e = validarJugador(jugador({ id: 'j-nuevo', nombre: '  ', dorsal: Number.NaN }), plantilla)
    expect(e.nombre).toBeTruthy()
    expect(e.dorsal).toBeTruthy()
  })
})

describe('formulario de equipo (validarEquipo)', () => {
  const ok = { nombre: 'Infantil A', categoria: 'Infantil', modalidad: 'F11' as const, genero: 'masculino' as const, temporada: '2026-27', entidad: 'CF Ejemplo' }
  it('acepta un equipo completo', () => {
    expect(Object.values(validarEquipo(ok)).filter(Boolean)).toHaveLength(0)
  })
  it('pide nombre, categoría, temporada con formato y club', () => {
    const e = validarEquipo({ ...ok, nombre: '', categoria: '', temporada: '2026', entidad: 'x' })
    expect(e.nombre && e.categoria && e.temporada && e.entidad).toBeTruthy()
  })
  it('la temporada cambia en julio', () => {
    expect(temporadaActual(new Date('2026-06-30T12:00:00'))).toBe('2025-26')
    expect(temporadaActual(new Date('2026-07-01T12:00:00'))).toBe('2026-27')
  })
})
