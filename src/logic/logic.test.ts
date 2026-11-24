import { describe, expect, it } from 'vitest'
import { crearDatosEjemplo, prefijarIds, USUARIO_AYUDANTE } from '../data/seed'
import { ITEMS_POR_DEFECTO } from '../data/items'
import { itemsAplicables, mediaGeneral, puntuacionesPorArea, resumenJugador, serieEvolucion, ultimasPuntuaciones } from './stats'
import { minimizar, puedeVerNota, tieneConsentimientoFicha, validarConsentimiento } from './privacy'

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
  // El borrado completo en cascada se prueba contra PostgreSQL en supabase/tests/rls.test.ts.
})

describe('plantilla de ejemplo en la nube', () => {
  it('prefija todos los ids y referencias sin romper las relaciones', () => {
    const p = prefijarIds(ds, 'demo-x-')
    const ids = new Set(p.jugadores.map((j) => j.id))
    expect([...ids].every((id) => id.startsWith('demo-x-j-'))).toBe(true)
    expect(p.equipos[0].id).toBe('demo-x-eq-infantil-a')
    expect(p.jugadores.every((j) => j.equipoId === p.equipos[0].id)).toBe(true)
    for (const s of ['estados', 'evaluaciones', 'pruebas', 'notas', 'asistencias', 'participaciones', 'cargas'] as const) {
      expect((p[s] as { jugadorId: string }[]).every((r) => ids.has(r.jugadorId))).toBe(true)
    }
    const eventos = new Set(p.eventos.map((e) => e.id))
    expect(p.asistencias.every((a) => eventos.has(a.eventoId))).toBe(true)
    expect(p.evaluaciones.flatMap((e) => e.puntuaciones).every((x) => !x.itemId.startsWith('demo-'))).toBe(true)
    expect(ds.jugadores[0].id).toBe('j-01') // no modifica el original
  })
})

describe('acceso', async () => {
  const A = await import('../auth/auth')
  it('registro como en Informes: entrenador (teléfono opcional) o familia (con código)', () => {
    const ok = { tipo: 'entrenador' as const, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@club.es', password: 'balon2026', telefono: '', codigo: '', acepta: true }
    expect(A.validarRegistro(ok)).toEqual({})
    expect(A.validarRegistro({ ...ok, telefono: '600 123 456' })).toEqual({})
    const mal = A.validarRegistro({ ...ok, nombre: '', apellidos: '', email: 'x@', telefono: '123', password: 'corta', acepta: false })
    expect(Object.keys(mal).sort()).toEqual(['acepta', 'apellidos', 'email', 'nombre', 'password', 'telefono'])
    // Familia: el código es obligatorio, de 6 a 8 letras o números (se pasa a mayúsculas).
    const familia = { ...ok, tipo: 'familia' as const }
    expect(A.validarRegistro({ ...familia, codigo: '' }).codigo).toBeTruthy()
    expect(A.validarRegistro({ ...familia, codigo: 'abc12' }).codigo).toBeTruthy()
    expect(A.validarRegistro({ ...familia, codigo: 'abc123' })).toEqual({})
    expect(A.validarRegistro({ ...familia, codigo: 'abc 123' })).toEqual({})
  })
  it('perfil: teléfono y datos del club son opcionales, pero si se rellenan se validan', () => {
    const base = { nombre: 'Ana Ruiz', usuario: '', email: 'ana@club.es', telefono: '', entidad: '', categoria: '', equipo: '', genero: 'femenino' as const }
    expect(A.validarPerfil(base)).toEqual({})
    expect(Object.keys(A.validarPerfil({ ...base, usuario: 'a b', telefono: '123', categoria: 'nada' })).sort()).toEqual(['categoria', 'telefono', 'usuario'])
    expect(A.normalizarTelefono('600 12 34 56')).toBe('+34600123456')
    expect(A.normalizarTelefono('0034 600123456')).toBe('+34600123456')
  })
  it('usuario interno a partir del email y códigos de equipo', async () => {
    const C = await import('../db/cuenta')
    expect(C.generarUsuario('Ana.Ruiz+club@x.es', () => 1234)).toBe('ana.ruizclub1234')
    expect(C.generarUsuario('muy.largo.nombre.de.email@x.es', () => 5678)).toBe('muy.largo.nomb5678')
    expect(C.generarUsuario('a@x.es', () => 1000)).toMatch(/^[a-z0-9._]{3,20}$/)
    expect(C.normalizarCodigo(' ab-12 cd ')).toBe('AB12CD')
    expect(C.codigoValido('ab12cd')).toBe(true)
    expect(C.codigoValido('ab12')).toBe(false)
  })
  // Contraseñas, sesiones y roles: Supabase Auth + supabase/tests/rls.test.ts
})

describe('evaluaciones vacías (nota quitada o deshecha)', () => {
  it('no cuentan para la media, la tendencia ni la última evaluación', () => {
    const j = ds.jugadores.find((x) => x.dorsal === 10)!
    const antes = resumenJugador(j, ds.evaluaciones, ds.items, new Date('2026-11-19T10:00:00Z'))
    const vacia = { ...ds.evaluaciones[0], id: 'vacia', jugadorId: j.id, fecha: '2026-11-19T09:00:00Z', puntuaciones: [] }
    const despues = resumenJugador(j, [...ds.evaluaciones, vacia], ds.items, new Date('2026-11-19T10:00:00Z'))
    expect(despues.media).toBe(antes.media)
    expect(despues.numEvaluaciones).toBe(antes.numEvaluaciones)
    expect(despues.ultimaEvaluacion).toBe(antes.ultimaEvaluacion)
  })
  it('cada jugador se compara consigo mismo: áreas de hace 30 días', () => {
    const j = ds.jugadores.find((x) => x.dorsal === 10)!
    const r = resumenJugador(j, ds.evaluaciones, ds.items, new Date('2026-11-19T10:00:00Z'))
    expect(r.areasAnteriores).not.toBeNull()
    expect(Object.keys(r.areasAnteriores!).sort()).toEqual(['fisica', 'mental', 'tactica', 'tecnica'])
  })
})
