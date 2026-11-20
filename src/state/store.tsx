import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Dataset } from '../data/seed'
import { USUARIO_AYUDANTE } from '../data/seed'
import * as DB from '../db/db'
import type { Cuenta, Evaluacion, Jugador, MiembroEquipo } from '../model/types'
import { datosExternos, resumenJugador, type DatosExternos, type ResumenJugador } from '../logic/stats'
import { tieneConsentimientoFicha } from '../logic/privacy'
import { Acceso } from '../screens/Acceso'
import { Logo } from '../ui/Logo'
import { ir } from './router'

export type Tema = 'oscuro' | 'claro'
export type VerComo = 'yo' | 'ayudante'

interface Ctx {
  ds: Dataset
  cuenta: Cuenta
  guardarPerfil: (c: Cuenta) => Promise<void>
  cerrarSesion: () => Promise<void>
  resumen: Map<string, ResumenJugador>
  externos: Map<string, DatosExternos>
  estadoDe: (jugadorId: string) => Dataset['estados'][number] | undefined
  yo: MiembroEquipo
  usuarioId: string
  verComo: VerComo
  setVerComo: (v: VerComo) => void
  tema: Tema
  setTema: (t: Tema) => void
  jugadoresVisibles: Jugador[]
  guardarEvaluacion: (e: Evaluacion) => Promise<void>
  actualizarJugador: (j: Jugador) => Promise<void>
  borrarJugador: (id: string) => Promise<number>
  exportarJugador: (id: string) => Promise<void>
  restablecer: () => Promise<void>
}

const C = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(C)
  if (!c) throw new Error('useApp fuera de AppProvider')
  return c
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [listo, setListo] = useState(false)
  const [ds, setDs] = useState<Dataset | null>(null)
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [tema, setTemaState] = useState<Tema>('oscuro')
  const [verComo, setVerComoState] = useState<VerComo>('yo')

  const recargar = useCallback(async () => setDs(await DB.cargarTodo()), [])

  useEffect(() => {
    ;(async () => {
      await DB.sembrarSiVacio()
      setTemaState((await DB.leerAjuste<Tema>('tema')) ?? 'oscuro')
      setVerComoState((await DB.leerAjuste<VerComo>('verComo')) ?? 'yo')
      const sesion = await DB.leerAjuste<string>('sesion')
      if (sesion) setCuenta((await DB.cuentaPorId(sesion)) ?? null)
      await recargar()
      setListo(true)
    })()
  }, [recargar])

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', tema === 'oscuro' ? '#0B1510' : '#F4F2EC')
  }, [tema])

  const derivados = useMemo(() => {
    if (!ds) return null
    const hoy = new Date()
    const resumen = new Map<string, ResumenJugador>()
    const externos = new Map<string, DatosExternos>()
    for (const j of ds.jugadores) {
      resumen.set(j.id, resumenJugador(j, ds.evaluaciones, ds.items, hoy))
      externos.set(j.id, datosExternos(j.id, ds.asistencias, ds.participaciones, ds.cargas, hoy))
    }
    const estados = new Map(ds.estados.map((e) => [e.jugadorId, e]))
    return { resumen, externos, estados }
  }, [ds])

  if (!listo || !ds || !derivados) {
    return (
      <div className="cargando" role="status" aria-label="Cargando">
        <Logo alto={40} />
      </div>
    )
  }

  if (!cuenta) {
    return (
      <Acceso
        onEntrar={async (c) => {
          await DB.guardarAjuste('sesion', c.id)
          await DB.guardarAjuste('verComo', 'yo')
          setVerComoState('yo')
          ir({ nombre: 'inicio' }, true)
          window.scrollTo(0, 0)
          setCuenta(c)
          await recargar()
        }}
      />
    )
  }

  const usuarioId = verComo === 'ayudante' ? USUARIO_AYUDANTE : cuenta.id
  const yo = ds.miembros.find((m) => m.usuarioId === usuarioId) ?? {
    equipoId: ds.equipos[0].id,
    usuarioId,
    rol: 'entrenador_principal' as const,
    permisos: { verFicha: true, verNotasPrivadas: true, evaluar: true },
  }
  const jugadoresVisibles = ds.jugadores.filter((j) => !j.archivado && !j.eliminadoEn)

  const value: Ctx = {
    ds,
    cuenta,
    async guardarPerfil(c) {
      const nueva = { ...c, actualizadoEn: new Date().toISOString() }
      setCuenta(nueva)
      await DB.guardarCuenta(nueva)
      await recargar()
    },
    async cerrarSesion() {
      await DB.guardarAjuste('sesion', null)
      setCuenta(null)
    },
    ...derivados,
    estadoDe: (id) => derivados.estados.get(id),
    yo,
    usuarioId,
    verComo,
    setVerComo(v) {
      setVerComoState(v)
      void DB.guardarAjuste('verComo', v)
    },
    tema,
    setTema(t) {
      setTemaState(t)
      void DB.guardarAjuste('tema', t)
    },
    jugadoresVisibles,
    async guardarEvaluacion(e) {
      const j = ds.jugadores.find((x) => x.id === e.jugadorId)
      if (!j || !tieneConsentimientoFicha(j)) throw new Error('Sin consentimiento no se pueden guardar evaluaciones.')
      setDs((prev) => prev && { ...prev, evaluaciones: [...prev.evaluaciones.filter((x) => x.id !== e.id), e] })
      await DB.guardar('evaluaciones', e)
    },
    async actualizarJugador(j) {
      const nuevo = { ...j, actualizadoEn: new Date().toISOString() }
      setDs((prev) => prev && { ...prev, jugadores: prev.jugadores.map((x) => (x.id === j.id ? nuevo : x)) })
      await DB.guardar('jugadores', nuevo)
    },
    async borrarJugador(id) {
      const n = await DB.borrarJugadorCompleto(id)
      await recargar()
      return n
    },
    async exportarJugador(id) {
      const data = await DB.exportarJugador(id)
      const j = ds.jugadores.find((x) => x.id === id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `futbollab-jugador-${j?.dorsal ?? ''}-${(j?.nombre ?? id).toLowerCase()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    },
    async restablecer() {
      await DB.restablecer(cuenta.id)
      await recargar()
    },
  }
  return <C.Provider value={value}>{children}</C.Provider>
}
