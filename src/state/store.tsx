import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dataset } from '../data/seed'
import { USUARIO_AYUDANTE } from '../data/seed'
import * as DB from '../db/db'
import * as R from '../db/remote'
import { errorLegible, supabase, supabaseConfigurado } from '../db/supabase'
import type { Consentimiento, Cuenta, Equipo, Estado, Evaluacion, Jugador, MiembroEquipo } from '../model/types'
import { datosExternos, resumenJugador, type DatosExternos, type ResumenJugador } from '../logic/stats'
import { minimizar } from '../logic/privacy'
import { quedaAlgunAdmin } from '../logic/admin'
import { Acceso } from '../screens/Acceso'
import { Logo } from '../ui/Logo'
import { ir } from './router'

export type Tema = 'oscuro' | 'claro'
export type VerComo = 'yo' | 'ayudante'

interface Ctx {
  /** Datos del equipo activo (lo que el servidor deja ver, filtrado al equipo elegido). */
  ds: Dataset
  cuenta: Cuenta
  guardarPerfil: (c: Cuenta) => Promise<void>
  cambiarPassword: (actual: string, nueva: string) => Promise<void>
  cerrarSesion: () => Promise<void>
  resumen: Map<string, ResumenJugador>
  externos: Map<string, DatosExternos>
  estadoDe: (jugadorId: string) => Dataset['estados'][number] | undefined
  yo: MiembroEquipo
  /** Siempre el id real de la cuenta (es lo que comprueba el servidor). */
  usuarioId: string
  verComo: VerComo
  setVerComo: (v: VerComo) => void
  tema: Tema
  setTema: (t: Tema) => void
  jugadoresVisibles: Jugador[]
  guardarEvaluacion: (e: Evaluacion) => Promise<void>
  marcarFavorito: (id: string, valor: boolean) => Promise<void>
  registrarConsentimiento: (id: string, c: Consentimiento, fechaNacimiento: string | null) => Promise<void>
  borrarJugador: (id: string) => Promise<void>
  exportarJugador: (id: string) => Promise<void>
  /** Último error de una operación en segundo plano (p. ej. al guardar una nota de evaluación). */
  aviso: string | null
  cerrarAviso: () => void
  // ── Equipos ──
  equipos: Equipo[]
  equipoActivo: string
  setEquipoActivo: (id: string) => void
  // ── Administración (el servidor exige rol admin en cada operación) ──
  /** Rol admin según el servidor y sin estar simulando ser ayudante. Solo para la interfaz. */
  esAdmin: boolean
  perfiles: Cuenta[]
  guardarJugador: (j: Jugador) => Promise<void>
  guardarEstado: (e: Estado) => Promise<void>
  guardarMiembro: (m: MiembroEquipo) => Promise<void>
  quitarMiembro: (equipoId: string, usuarioId: string) => Promise<void>
  cambiarAdmin: (usuarioId: string, esAdmin: boolean) => Promise<void>
  crearEquipo: (e: Equipo) => Promise<void>
  cargarEjemplo: () => Promise<void>
}

const C = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(C)
  if (!c) throw new Error('useApp fuera de AppProvider')
  return c
}

/** Quita del conjunto todo lo que no es del equipo elegido. */
function delEquipo(todo: Dataset, eq: string): Dataset {
  const jugadores = todo.jugadores.filter((j) => j.equipoId === eq)
  const ids = new Set(jugadores.map((j) => j.id))
  const deJugador = <T extends { jugadorId: string }>(xs: T[]) => xs.filter((x) => ids.has(x.jugadorId))
  return {
    usuarios: todo.usuarios,
    miembros: todo.miembros.filter((m) => m.equipoId === eq),
    equipos: todo.equipos.filter((e) => e.id === eq),
    jugadores,
    estados: deJugador(todo.estados),
    items: todo.items.filter((i) => i.equipoId == null || i.equipoId === eq),
    evaluaciones: deJugador(todo.evaluaciones),
    pruebas: deJugador(todo.pruebas),
    notas: deJugador(todo.notas),
    eventos: todo.eventos.filter((e) => e.equipoId === eq),
    asistencias: deJugador(todo.asistencias),
    participaciones: deJugador(todo.participaciones),
    cargas: deJugador(todo.cargas),
  }
}

const PERMISOS_TODOS = { verFicha: true, verNotasPrivadas: true, evaluar: true }
const PERMISOS_NINGUNO = { verFicha: false, verNotasPrivadas: false, evaluar: false }

export function AppProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<'cargando' | 'fuera' | 'dentro'>('cargando')
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [todo, setTodo] = useState<Dataset | null>(null)
  const [perfiles, setPerfiles] = useState<Cuenta[]>([])
  const [equipoElegido, setEquipoElegido] = useState<string | null>(null)
  const [tema, setTemaState] = useState<Tema>('oscuro')
  const [verComo, setVerComoState] = useState<VerComo>('yo')
  const [aviso, setAviso] = useState<string | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const entrando = useRef(false)

  const recargar = useCallback(async () => {
    const [d, p] = await Promise.all([R.cargarTodo(), R.listarPerfiles()])
    setTodo(d)
    setPerfiles(p)
  }, [])

  const limpiar = useCallback(() => {
    setCuenta(null)
    setTodo(null)
    setPerfiles([])
    setVerComoState('yo')
    setFase('fuera')
  }, [])

  /** Recupera la sesión: el rol se comprueba siempre contra el servidor. */
  const entrar = useCallback(async () => {
    if (entrando.current) return
    entrando.current = true
    try {
      setErrorCarga(null)
      const c = await R.perfilActual()
      if (!c) {
        await supabase.auth.signOut({ scope: 'local' })
        return limpiar()
      }
      setCuenta(c)
      await recargar()
      setFase('dentro')
    } catch (e) {
      setErrorCarga(errorLegible(e).message)
      setFase('fuera')
    } finally {
      entrando.current = false
    }
  }, [limpiar, recargar])

  useEffect(() => {
    ;(async () => {
      setTemaState((await DB.leerAjuste<Tema>('tema')) ?? 'oscuro')
      setVerComoState((await DB.leerAjuste<VerComo>('verComo')) ?? 'yo')
      setEquipoElegido((await DB.leerAjuste<string>('equipoActivo')) ?? null)
      if (!supabaseConfigurado) return setFase('fuera')
      const { data } = await supabase.auth.getSession()
      if (data.session) await entrar()
      else setFase('fuera')
    })()
    // Cierre de sesión (aquí o en otra pestaña) o sesión revocada: fuera todo lo cargado.
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') setTimeout(limpiar, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [entrar, limpiar])

  // Al volver a la pestaña se vuelve a leer el rol: si un admin te lo quitó, se nota al momento.
  useEffect(() => {
    if (fase !== 'dentro') return
    const f = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const c = await R.perfilActual()
        if (!c) return limpiar()
        setCuenta(c)
      } catch {
        /* sin conexión: se reintenta en la próxima visita */
      }
    }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [fase, limpiar])

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', tema === 'oscuro' ? '#0E1C2A' : '#F2F5F7')
  }, [tema])

  const equipos = useMemo(() => [...(todo?.equipos ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre)), [todo])
  const equipoActivo = equipos.find((e) => e.id === equipoElegido)?.id ?? equipos[0]?.id ?? ''
  const ds = useMemo(() => (todo ? delEquipo(todo, equipoActivo) : null), [todo, equipoActivo])

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

  if (!supabaseConfigurado) {
    return (
      <div className="cargando">
        <div className="bloque" style={{ maxWidth: 420 }}>
          <Logo alto={30} />
          <h2>Falta configurar Supabase</h2>
          <p className="sub">Crea el archivo .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (mira .env.example) y vuelve a arrancar con npm run dev.</p>
        </div>
      </div>
    )
  }

  if (fase === 'cargando' || (fase === 'dentro' && (!ds || !derivados || !cuenta))) {
    return (
      <div className="cargando" role="status" aria-label="Cargando">
        <Logo alto={40} />
      </div>
    )
  }

  if (fase === 'fuera' || !cuenta || !ds || !derivados || !todo) {
    return (
      <Acceso
        error={errorCarga}
        onEntrar={async () => {
          await DB.guardarAjuste('verComo', 'yo')
          setVerComoState('yo')
          ir({ nombre: 'inicio' }, true)
          window.scrollTo(0, 0)
          await entrar()
        }}
      />
    )
  }

  const adminReal = cuenta.role === 'admin'
  const miembro = ds.miembros.find((m) => m.usuarioId === cuenta.id)
  // "Ver como ayudante" solo recorta la interfaz; el servidor sigue aplicando los permisos reales.
  const yo: MiembroEquipo =
    verComo === 'ayudante'
      ? { equipoId: equipoActivo, usuarioId: USUARIO_AYUDANTE, rol: 'ayudante', permisos: { verFicha: true, verNotasPrivadas: false, evaluar: true } }
      : (miembro ?? { equipoId: equipoActivo, usuarioId: cuenta.id, rol: adminReal ? 'entrenador_principal' : 'ayudante', permisos: adminReal ? PERMISOS_TODOS : PERMISOS_NINGUNO })
  const jugadoresVisibles = ds.jugadores.filter((j) => !j.archivado && !j.eliminadoEn)

  /** Ejecuta una operación y recarga desde el servidor (lo que manda es lo que quedó guardado). */
  const yRecargar = async (p: Promise<unknown>) => {
    try {
      await p
    } finally {
      await recargar()
    }
  }

  const value: Ctx = {
    ds,
    cuenta,
    async guardarPerfil(c) {
      await R.guardarPerfil(c)
      if (c.email !== cuenta.email) {
        const r = await supabase.auth.updateUser({ email: c.email })
        if (r.error) throw errorLegible(r.error)
      }
      const fresco = await R.perfilActual()
      if (fresco) setCuenta(fresco)
      await recargar()
    },
    async cambiarPassword(actual, nueva) {
      const comprobacion = await supabase.auth.signInWithPassword({ email: cuenta.email, password: actual })
      if (comprobacion.error) throw new Error('La contraseña actual no es correcta.')
      const r = await supabase.auth.updateUser({ password: nueva })
      if (r.error) throw errorLegible(r.error)
    },
    async cerrarSesion() {
      // Revoca la sesión en el servidor: el token deja de valer aunque no haya caducado.
      await supabase.auth.signOut()
      limpiar()
      ir({ nombre: 'inicio' }, true)
    },
    ...derivados,
    estadoDe: (id) => derivados.estados.get(id),
    yo,
    usuarioId: cuenta.id,
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
      // Se pinta al momento y se guarda en segundo plano; si el servidor la rechaza, se deshace.
      setTodo((prev) => prev && { ...prev, evaluaciones: [...prev.evaluaciones.filter((x) => x.id !== e.id), e] })
      try {
        await R.guardar('evaluaciones', e)
      } catch (err) {
        setAviso(`No se ha guardado la evaluación: ${errorLegible(err).message}`)
        await recargar()
      }
    },
    marcarFavorito: (id, v) => yRecargar(R.marcarFavorito(id, v)),
    registrarConsentimiento: (id, c, nac) => yRecargar(R.registrarConsentimiento(id, c, nac)),
    borrarJugador: (id) => yRecargar(R.borrarJugador(id)),
    async exportarJugador(id) {
      const data = await R.exportarJugador(id)
      const j = ds.jugadores.find((x) => x.id === id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `futbollab-jugador-${j?.dorsal ?? ''}-${(j?.nombre ?? id).toLowerCase()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    },
    aviso,
    cerrarAviso: () => setAviso(null),
    equipos,
    equipoActivo,
    setEquipoActivo(id) {
      setEquipoElegido(id)
      void DB.guardarAjuste('equipoActivo', id)
    },
    esAdmin: adminReal && verComo === 'yo',
    perfiles,
    guardarJugador: (j) => yRecargar(R.guardar('jugadores', minimizar({ ...j, actualizadoEn: new Date().toISOString() }))),
    guardarEstado: (e) => yRecargar(R.guardar('estados', { ...e, actualizadoEn: new Date().toISOString() })),
    guardarMiembro: (m) => yRecargar(R.guardarMiembro(m)),
    quitarMiembro: (eq, u) => yRecargar(R.quitarMiembro(eq, u)),
    async cambiarAdmin(id, valor) {
      // Aviso rápido en la interfaz; la regla de verdad está en admin_set_role (servidor).
      if (!quedaAlgunAdmin(perfiles, id, valor)) throw new Error('Tiene que quedar al menos un administrador.')
      await yRecargar(R.cambiarRol(id, valor ? 'admin' : 'player'))
      if (id === cuenta.id) {
        const fresco = await R.perfilActual()
        if (fresco) setCuenta(fresco)
      }
    },
    crearEquipo: async (e) => {
      await yRecargar(R.crearEquipo(e))
      setEquipoElegido(e.id)
      void DB.guardarAjuste('equipoActivo', e.id)
    },
    async cargarEjemplo() {
      const id = await R.cargarEjemplo()
      await recargar()
      setEquipoElegido(id)
      void DB.guardarAjuste('equipoActivo', id)
    },
  }
  return <C.Provider value={value}>{children}</C.Provider>
}
