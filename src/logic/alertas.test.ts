import { describe, expect, it } from 'vitest'
import { crearDatosEjemplo } from '../data/seed'
import { datosExternos, resumenJugador } from './stats'
import { alertasInicio, masMejoran, minutosEvaluar } from './alertas'

const hoy = new Date('2026-11-19T10:00:00Z')
const ds = crearDatosEjemplo(hoy)
const resumen = new Map(ds.jugadores.map((j) => [j.id, resumenJugador(j, ds.evaluaciones, ds.items, hoy)]))
const externos = new Map(ds.jugadores.map((j) => [j.id, datosExternos(j.id, ds.asistencias, ds.participaciones, ds.cargas, hoy)]))
const estados = new Map(ds.estados.map((e) => [e.jugadorId, e]))

describe('Inicio · "Necesitan tu mirada"', () => {
  const alertas = alertasInicio(ds.jugadores, resumen, externos, (id) => estados.get(id), hoy)
  it('primero quién no puede jugar, luego el consentimiento', () => {
    expect(alertas.slice(0, 3).every((a) => a.tipo === 'no_disponible')).toBe(true)
    expect(alertas[3].tipo).toBe('consentimiento')
    expect(alertas[3].jugador.dorsal).toBe(18)
  })
  it('cada aviso es una frase de entrenador, sin negativos absolutos', () => {
    for (const a of alertas) {
      expect(a.frase).toMatch(/^[A-ZÁÉÍÓÚÑ].*\.$/)
      expect(a.frase).not.toMatch(/malo|mal jugador|rendimiento bajo|error/i)
    }
    expect(alertas.find((a) => a.tipo === 'no_disponible')?.frase).toMatch(/vuelve el/)
  })
  it('sin consentimiento no se piden más cosas de ese jugador', () => {
    expect(alertas.filter((a) => a.jugador.dorsal === 18).map((a) => a.tipo)).toEqual(['consentimiento'])
  })
})

describe('Inicio · "Más mejoran este mes" y tiempo estimado', () => {
  it('solo mejoras reales y como mucho 3', () => {
    const m = masMejoran(ds.jugadores, resumen)
    expect(m.length).toBeLessThanOrEqual(3)
    expect(m.every((j) => resumen.get(j.id)!.tendencia! > 0)).toBe(true)
  })
  it('18 jugadores, unos 9 minutos', () => {
    expect(minutosEvaluar(18)).toBe(9)
    expect(minutosEvaluar(1)).toBe(1)
  })
})
