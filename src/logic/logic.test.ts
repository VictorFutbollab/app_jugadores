import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { crearDatosEjemplo, USUARIO_AYUDANTE } from '../data/seed'
import { ITEMS_POR_DEFECTO } from '../data/items'
import { itemsAplicables, mediaGeneral, puntuacionesPorArea, resumenJugador, serieEvolucion, ultimasPuntuaciones } from './stats'
import { minimizar, puedeVerNota, tieneConsentimientoFicha, validarConsentimiento } from './privacy'
import * as DB from '../db/db'

const ds = crearDatosEjemplo(new Date('2026-11-19T10:00:00Z'))

describe('datos de ejemplo', () => {
  it('Infantil A con 18 jugadores, 1 sin consentimiento y 14 disponibles evaluables', () => {
    expect(ds.jugadores).toHaveLength(18)
    const sin = ds.jugadores.filter((j) => !tieneConsentimientoFicha(j))
    expect(sin.map((j) => j.dorsal)).toEqual([18])
    const noDisp = new Set(ds.estados.filter((e) => e.tipo !== 'disponible').map((e) => e.jugadorId))
    expect(ds.jugadores.filter((j) => tieneConsentimientoFicha(j) && !noDisp.has(j.id))).toHaveLength(14)
  })
  it('el jugador sin consentimiento solo guarda nombre y dorsal', () => {
    const j = ds.jugadores.find((x) => x.dorsal === 18)!
    expect(j.fechaNacimiento).toBeUndefined()
    expect(j.posiciones).toBeUndefined()
    expect(ds.evaluaciones.some((e) => e.jugadorId === j.id)).toBe(false)
    const m = minimizar({ ...j, fechaNacimiento: '2014-01-01', posiciones: ['DC'] })
    expect(m.fechaNacimiento).toBeNull()
    expect(m.posiciones).toEqual([])
  })
})

describe('ítems y medias', () => {
  it('porteros evalúan ítems de portero y no de campo', () => {
    const por = ds.jugadores.find((j) => j.dorsal === 1)!
    const ids = itemsAplicables(ITEMS_POR_DEFECTO, por).map((i) => i.id)
    expect(ids).toContain('por-blocaje')
    expect(ids).not.toContain('tec-regate')
    const campo = itemsAplicables(ITEMS_POR_DEFECTO, ds.jugadores.find((j) => j.dorsal === 10)!).map((i) => i.id)
    expect(campo).not.toContain('por-blocaje')
  })
  it('lo no observado no cuenta como cero', () => {
    const ult = ultimasPuntuaciones([
      { id: 'a', creadoEn: '', actualizadoEn: '', creadoPor: '', jugadorId: 'x', fecha: '2026-10-01', evaluadorId: '', contexto: 'partido', puntuaciones: [{ itemId: 'tec-pase-corto', valor: 4 }] },
    ])
    const sc = puntuacionesPorArea(ult, ITEMS_POR_DEFECTO)
    expect(sc.tecnica).toBe(4)
    expect(sc.tactica).toBeNull()
    expect(mediaGeneral(sc)).toBe(4)
  })
  it('en iniciación pesan más actitud y coordinación', () => {
    const sc = { tecnica: 2, tactica: 2, fisica: 2, mental: 5 }
    expect(mediaGeneral(sc, 8)!).toBeGreaterThan(mediaGeneral(sc, 12)!)
  })
  it('resumen y evolución calculan media y tendencia', () => {
    const j = ds.jugadores.find((x) => x.dorsal === 16)!
    const r = resumenJugador(j, ds.evaluaciones, ds.items, new Date('2026-11-19T10:00:00Z'))
    expect(r.media).not.toBeNull()
    expect(r.tendencia).not.toBeNull()
    expect(serieEvolucion(j, ds.evaluaciones, ds.items).length).toBeGreaterThanOrEqual(3)
  })
})

describe('privacidad', () => {
  it('menor de 14 no puede firmar su propio consentimiento', () => {
    const c = { fecha: '2026-11-19', firmante: 'Unai', firmanteTipo: 'jugador_mayor_14' as const, alcance: { ficha: true, fotos: false, notasVoz: false }, version: '2026.1' }
    expect(validarConsentimiento(c, '2014-03-28').ok).toBe(false)
    expect(validarConsentimiento(c, '2011-03-28').ok).toBe(true)
    expect(validarConsentimiento({ ...c, firmanteTipo: 'madre', firmante: 'Ana' }, null).ok).toBe(true)
  })
  it('un ayudante sin permiso no ve notas privadas de otros', () => {
    const ay = ds.miembros.find((m) => m.usuarioId === USUARIO_AYUDANTE)!
    const princ = ds.miembros.find((m) => m.rol === 'entrenador_principal')!
    const privadas = ds.notas.filter((n) => n.visibilidad === 'privada' && n.autorId !== USUARIO_AYUDANTE)
    expect(privadas.length).toBeGreaterThan(0)
    expect(privadas.every((n) => !puedeVerNota(ay, n))).toBe(true)
    expect(privadas.every((n) => puedeVerNota(princ, n))).toBe(true)
    const propia = ds.notas.find((n) => n.autorId === USUARIO_AYUDANTE)!
    expect(puedeVerNota(ay, propia)).toBe(true)
  })
  it('exportar y borrar todo lo de un jugador en un paso', async () => {
    await DB.restablecer()
    const id = 'j-10'
    const exp = (await DB.exportarJugador(id)) as Record<string, unknown[]>
    expect(exp.evaluaciones.length).toBeGreaterThan(0)
    expect(exp.asistencias.length).toBeGreaterThan(0)
    const n = await DB.borrarJugadorCompleto(id)
    expect(n).toBeGreaterThan(10)
    const todo = await DB.cargarTodo()
    expect(todo.jugadores.find((j) => j.id === id)).toBeUndefined()
    for (const s of ['estados', 'evaluaciones', 'pruebas', 'notas', 'asistencias', 'participaciones', 'cargas'] as const) {
      expect((todo[s] as { jugadorId: string }[]).some((r) => r.jugadorId === id)).toBe(false)
    }
  })
})

describe('acceso', async () => {
  const A = await import('../auth/auth')
  it('valida usuario, email, teléfono y contraseña', () => {
    const ok = { nombre: 'Ana Ruiz', usuario: 'ana.ruiz', email: 'ana@club.es', telefono: '600 123 456', password: 'balon2026', entidad: 'CD Ejemplo', categoria: 'infantil', equipo: 'A', genero: 'femenino' as const, aceptaPrivacidad: true }
    expect(A.validarRegistro(ok)).toEqual({})
    const mal = A.validarRegistro({ ...ok, usuario: 'a b', email: 'x@', telefono: '123', password: 'corta', aceptaPrivacidad: false, categoria: '' })
    expect(Object.keys(mal).sort()).toEqual(['aceptaPrivacidad', 'categoria', 'email', 'password', 'telefono', 'usuario'])
    expect(A.normalizarTelefono('600 12 34 56')).toBe('+34600123456')
    expect(A.normalizarTelefono('0034 600123456')).toBe('+34600123456')
  })
  it('la contraseña se guarda derivada y se comprueba', async () => {
    const c = await A.crearCredencial('balon2026', 1000)
    expect(c.hash).not.toContain('balon')
    expect(await A.comprobarPassword(c, 'balon2026')).toBe(true)
    expect(await A.comprobarPassword(c, 'otra')).toBe(false)
  })
  it('registrar actualiza equipo y permite buscar por usuario o email', async () => {
    await DB.restablecer()
    const ahora = new Date().toISOString()
    await DB.guardarCuenta({ id: 'u-test', nombre: 'Ana Ruiz', usuario: 'ana', email: 'ana@club.es', telefono: '+34600123456', entidad: 'CD Ejemplo', categoria: 'alevin', equipo: 'B', genero: 'femenino', aceptaPrivacidadEn: ahora, creadoEn: ahora, actualizadoEn: ahora, credencial: await A.crearCredencial('balon2026', 1000) })
    expect((await DB.cuentaPorUsuarioOEmail('ANA@club.es'))?.id).toBe('u-test')
    expect(await DB.existe('usuario', 'ana')).toBe(true)
    expect(await DB.existe('usuario', 'ana', 'u-test')).toBe(false)
    const ds = await DB.cargarTodo()
    expect(ds.equipos[0]).toMatchObject({ nombre: 'Alevín B', entidad: 'CD Ejemplo', modalidad: 'F7' })
    expect(ds.miembros.find((m) => m.usuarioId === 'u-test')?.rol).toBe('entrenador_principal')
  })
})
