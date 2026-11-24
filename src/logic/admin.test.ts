import { describe, expect, it } from 'vitest'
import { crearDatosEjemplo, EQUIPO_ID } from '../data/seed'
import { datosExternos, resumenJugador } from './stats'
import { celdaCsv, conAcceso, csvJugadores, cumpleFiltro, coincideBusqueda, describirRegistro, dorsalLibre, filaAdmin, motivosAtencion, ordenarFilas, quedaAlgunAdmin, tipoAcceso, validarJugador } from './admin'

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

describe('panel de admin · cuentas (aviso en la interfaz; la regla real está en el servidor)', () => {
  it('no deja quitar el último admin', () => {
    const cs = [
      { id: 'a', role: 'admin' as const },
      { id: 'b', role: 'player' as const },
    ]
    expect(quedaAlgunAdmin(cs, 'a', false)).toBe(false)
    expect(quedaAlgunAdmin(cs, 'b', true)).toBe(true)
    expect(quedaAlgunAdmin([...cs, { id: 'c', role: 'admin' as const }], 'a', false)).toBe(true)
  })
})

describe('panel de admin · simplificación', () => {
  it('"Necesitan atención" junta sin consentimiento, no disponibles y sin evaluar, con el motivo', () => {
    const atencion = filas.filter((f) => cumpleFiltro(f, 'atencion'))
    const dorsales = atencion.map((f) => f.j.dorsal)
    for (const d of [18, 5, 14, 16]) expect(dorsales).toContain(d)
    expect(motivosAtencion(filas.find((f) => f.j.dorsal === 18)!)).toEqual(['consentimiento'])
    expect(motivosAtencion(filas.find((f) => f.j.dorsal === 5)!)).toContain('no_disponible')
    expect(motivosAtencion({ ...filas[0], j: { ...filas[0].j, archivado: true } })).toEqual([])
  })
  it('tipos de acceso en lugar de casillas: se detectan y se aplican', () => {
    const ay = { rol: 'ayudante' as const, permisos: { verFicha: true, verNotasPrivadas: false, evaluar: true } }
    expect(tipoAcceso(ay)).toBe('ayudante')
    expect(tipoAcceso({ ...ay, permisos: { ...ay.permisos, evaluar: false } })).toBe('consulta')
    expect(tipoAcceso({ ...ay, permisos: { verFicha: false, verNotasPrivadas: true, evaluar: false } })).toBe('personalizado')
    expect(tipoAcceso(conAcceso(ay, 'principal'))).toBe('principal')
    const pf = conAcceso({ rol: 'preparador_fisico' as const, permisos: ay.permisos }, 'consulta')
    expect(pf.rol).toBe('preparador_fisico') // conserva el puesto
    expect(conAcceso({ rol: 'entrenador_principal' as const, permisos: ay.permisos }, 'ayudante').rol).toBe('ayudante')
  })
  it('el registro de actividad se lee como frases', () => {
    const n = { jugador: (id: string) => (id === 'j-10' ? 'Lucas Serrano' : undefined), jugadorDeEstado: () => 'j-10', persona: () => 'Ana', equipo: () => 'Infantil A' }
    expect(describirRegistro({ accion: 'INSERT', tabla: 'jugadores', registro_id: 'j-99', cambios: { nombre: 'Unai', dorsal: 18 } }, n).texto).toBe('dio de alta a Unai (18)')
    expect(describirRegistro({ accion: 'UPDATE', tabla: 'jugadores', registro_id: 'j-10', cambios: { dorsal: { antes: 10, despues: 11 } } }, n).texto).toBe('editó la ficha de Lucas Serrano (dorsal)')
    expect(describirRegistro({ accion: 'UPDATE', tabla: 'jugadores', registro_id: 'j-10', cambios: { archivado: { antes: false, despues: true } } }, n).texto).toBe('archivó a Lucas Serrano')
    expect(describirRegistro({ accion: 'UPDATE', tabla: 'estados', registro_id: 'st-j-10', cambios: { tipo: { antes: 'disponible', despues: 'lesionado' } } }, n).texto).toBe('marcó a Lucas Serrano como lesionado')
    expect(describirRegistro({ accion: 'INSERT', tabla: 'miembros', registro_id: 'eq/u1', cambios: { rol: 'ayudante' } }, n).texto).toBe('añadió a Ana a Infantil A')
    const rol = describirRegistro({ accion: 'CAMBIO_ROL', tabla: 'profiles', registro_id: 'u1', cambios: { role: { antes: 'player', despues: 'admin' } } }, n)
    expect(rol).toEqual({ texto: 'nombró administrador a Ana', tipo: 'roles' })
  })
})
