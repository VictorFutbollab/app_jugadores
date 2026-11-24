import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Dataset } from '../data/seed'
import { USUARIO_AYUDANTE } from '../data/seed'
import * as DB from '../db/db'
import * as R from '../db/remote'
import { errorLegible, supabase, supabaseConfigurado } from '../db/supabase'
import * as SC from '../db/offline'
import type { Consentimiento, Cuenta, Equipo, Estado, Evaluacion, Jugador, MiembroEquipo } from '../model/types'
import { datosExternos, resumenJugador, type DatosExternos, type ResumenJugador } from '../logic/stats'
import { minimizar } from '../logic/privacy'
import { quedaAlgunAdmin } from '../logic/admin'
import { Acceso, type Panel } from '../screens/Acceso'

const CLAVE_PANEL = 'panel'
function leerPanel(): Panel {
  try {
    return localStorage.getItem(CLAVE_PANEL) === 'admin' ? 'admin' : 'usuario'
  } catch {
    return 'usuario'
  }
}
function guardarPanel(p: Panel) {
  try {
    localStorage.setItem(CLAVE_PANEL, p)
  } catch {
    /* sin almacenamiento: vale para esta visita */
  }
}
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
  // ── Sin conexión ──
  /** Fecha de la copia local con la que se está trabajando sin señal; null si hay conexión. */
  sinConexion: string | null
  /** Notas de evaluación guardadas en el móvil a la espera de subirlas. */
  pendientes: number
  // ── Equipos ──
  equipos: Equipo[]
  equipoActivo: string
  setEquipoActivo: (id: string) => void
  // ── Administración (el servidor exige rol admin en cada operación) ──
  /** Rol admin según el servidor y sin estar simulando ser ayudante. Solo para la interfaz. */
  esAdmin: boolean
  /** 'admin' si se entró por el acceso de administración (email + contraseña + PIN); si no, 'usuario'. */
  panel: Panel
  perfiles: Cuenta[]
  /** Miembros de todos los equipos visibles (el admin los ve todos). */
  miembrosTodos: MiembroEquipo[]
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
  const [sinConexion, setSinConexion] = useState<string | null>(null)
  const [numPendientes, setNumPendientes] = useState(0)
  // Panel por el que se entró. El de admin solo se abre desde su propio acceso (email + contraseña + PIN).
  const [panel, setPanelState] = useState<Panel>(() => leerPanel())
  const setPanel = (p: Panel) => {
    setPanelState(p)
    guardarPanel(p)
  }
  const entrando = useRef(false)
  const subiendo = useRef(false)
  const usuarioRef = useRef<string | null>(null)
  const pendientesRef = useRef(0)
  const ponerPendientes = (n: number) => {
    pendientesRef.current = n
    setNumPendientes(n)
  }

  const recargar = useCallback(async () => {
    const [d, p] = await Promise.all([R.cargarTodo(), R.listarPerfiles()])
    // Las notas que aún esperan en la cola se siguen viendo hasta que se suban.
    const cola = SC.MODO_SIN_CONEXION && usuarioRef.current ? await SC.pendientes(usuarioRef.current) : []
    setTodo(SC.conPendientes(d, cola))
    setPerfiles(p)
    setSinConexion(null)
    ponerPendientes(cola.length)
  }, [])

  /** Sube las notas pendientes. Devuelve si ha cambiado algo en el servidor. */
  const subirCola = useCallback(async (): Promise<boolean> => {
    const uid = usuarioRef.current
    if (!SC.MODO_SIN_CONEXION || !uid || subiendo.current) return false
    subiendo.current = true
    try {
      const r = await SC.subirPendientes(uid, (e) => R.guardar('evaluaciones', e))
      ponerPendientes(r.quedan)
      if (r.rechazadas.length) {
        setAviso(
          r.rechazadas.length === 1
            ? `Una nota no se ha podido guardar: ${r.rechazadas[0].motivo}`
            : `${r.rechazadas.length} notas no se han podido guardar: ${r.rechazadas[0].motivo}`,
        )
      }
      return r.subidas > 0 || r.rechazadas.length > 0
    } finally {
      subiendo.current = false
    }
  }, [])

  const limpiar = useCallback(() => {
    usuarioRef.current = null
    setPanelState('usuario')
    guardarPanel('usuario')
    setCuenta(null)
    setTodo(null)
    setPerfiles([])
    setVerComoState('yo')
    setSinConexion(null)
    ponerPendientes(0)
    setFase('fuera')
  }, [])

  /** Sin señal: abre con la última copia guardada en este móvil (si la hay). */
  const abrirSinConexion = useCallback(async (): Promise<boolean> => {
    if (!SC.MODO_SIN_CONEXION) return false
    let uid: string | undefined
    try {
      uid = (await supabase.auth.getSession()).data.session?.user.id
    } catch {
      /* sin señal la sesión puede no poder renovarse */
    }
    uid ??= await SC.ultimoUsuario()
    const copia = uid ? await SC.leerCopia(uid) : undefined
    if (!copia) return false
    usuarioRef.current = copia.usuario
    const cola = await SC.pendientes(copia.usuario)
    setCuenta(copia.cuenta)
    setTodo(SC.conPendientes(copia.todo, cola))
    setPerfiles(copia.perfiles)
    setSinConexion(copia.fecha)
    ponerPendientes(cola.length)
    setFase('dentro')
    return true
  }, [])

  /** Recupera la sesión: el rol se comprueba siempre contra el servidor. */
  const entrar = useCallback(async () => {
    if (entrando.current) return
    entrando.current = true
    try {
      setErrorCarga(null)
      const c = await R.perfilActual()
      if (!c) {
        if (usuarioRef.current) await SC.borrarCopia(usuarioRef.current) // la sesión ya no vale: fuera la copia
        await supabase.auth.signOut({ scope: 'local' })
        return limpiar()
      }
      usuarioRef.current = c.id
      setCuenta(c)
      await subirCola() // primero lo pendiente, para que lo que se cargue ya lo incluya
      await recargar()
      setFase('dentro')
    } catch (e) {
      if (SC.esErrorDeRed(e) && (await abrirSinConexion())) return
      setErrorCarga(SC.esErrorDeRed(e) ? 'Sin cobertura y todavía no hay datos guardados en este móvil. Entra una vez con conexión.' : errorLegible(e).message)
      setFase((f) => (f === 'dentro' ? f : 'fuera'))
    } finally {
      entrando.current = false
    }
  }, [limpiar, recargar, subirCola, abrirSinConexion])

  useEffect(() => {
    ;(async () => {
      setTemaState((await DB.leerAjuste<Tema>('tema')) ?? 'oscuro')
      setVerComoState((await DB.leerAjuste<VerComo>('verComo')) ?? 'yo')
      setEquipoElegido((await DB.leerAjuste<string>('equipoActivo')) ?? null)
      if (!supabaseConfigurado) return setFase('fuera')
      let haySesion = false
      try {
        haySesion = !!(await supabase.auth.getSession()).data.session
      } catch {
        /* sin señal */
      }
      if (haySesion) await entrar()
      else if (navigator.onLine === false && (await abrirSinConexion())) return
      else setFase('fuera')
    })()
    // Cierre de sesión (aquí o en otra pestaña) o sesión revocada: fuera todo lo cargado.
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') setTimeout(limpiar, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [entrar, limpiar, abrirSinConexion])

  // Al volver a la pestaña se vuelve a leer el rol: si un admin te lo quitó, se nota al momento.
  // Y si había notas pendientes o se estaba sin señal, se intenta subir y sincronizar.
  useEffect(() => {
    if (fase !== 'dentro') return
    const alVolver = async () => {
      if (document.visibilityState !== 'visible') return
      if (sinConexion) return void entrar()
      try {
        const c = await R.perfilActual()
        if (!c) return limpiar()
        setCuenta(c)
        if (pendientesRef.current > 0 && (await subirCola())) await recargar()
      } catch {
        /* sin conexión: se reintenta en la próxima visita */
      }
    }
    // Vuelve la señal: sincroniza (si se estaba con la copia) o sube lo pendiente.
    const alReconectar = async () => {
      if (sinConexion) return void entrar()
      try {
        if (await subirCola()) await recargar()
      } catch {
        /* se reintentará */
      }
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', alReconectar)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', alReconectar)
    }
  }, [fase, limpiar, sinConexion, entrar, subirCola, recargar])

  // Copia local de lo último que se ha visto con conexión (para abrir sin cobertura).
  useEffect(() => {
    if (!SC.MODO_SIN_CONEXION || fase !== 'dentro' || sinConexion || !cuenta || !todo) return
    void SC.guardarCopia({ usuario: cuenta.id, fecha: new Date().toISOString(), cuenta, todo, perfiles })
  }, [fase, sinConexion, cuenta, todo, perfiles])

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
        onEntrar={async (p) => {
          await DB.guardarAjuste('verComo', 'yo')
          setVerComoState('yo')
          setPanel(p)
          ir(p === 'admin' ? { nombre: 'admin' } : { nombre: 'inicio' }, true)
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

  const sinSenal = () => SC.MODO_SIN_CONEXION && (!!sinConexion || navigator.onLine === false)

  /**
   * Ejecuta una operación y recarga desde el servidor (lo que manda es lo que quedó guardado).
   * Sin señal no se intenta: solo las notas de evaluación pueden esperar en la cola.
   */
  const yRecargar = async (op: () => Promise<unknown>) => {
    if (sinSenal()) throw new Error(SC.MENSAJE_NECESITA_RED)
    try {
      await op()
    } catch (e) {
      throw SC.esErrorDeRed(e) ? new Error(SC.MENSAJE_NECESITA_RED) : e
    } finally {
      if (!sinSenal()) await recargar().catch(() => undefined)
    }
  }

  const value: Ctx = {
    ds,
    cuenta,
    async guardarPerfil(c) {
      if (sinSenal()) throw new Error(SC.MENSAJE_NECESITA_RED)
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
      if (sinSenal()) throw new Error(SC.MENSAJE_NECESITA_RED)
      const comprobacion = await supabase.auth.signInWithPassword({ email: cuenta.email, password: actual })
      if (comprobacion.error) throw new Error('La contraseña actual no es correcta.')
      const r = await supabase.auth.updateUser({ password: nueva })
      if (r.error) throw errorLegible(r.error)
    },
    async cerrarSesion() {
      if (pendientesRef.current > 0) {
        const n = pendientesRef.current
        const seguir = window.confirm(`Tienes ${n === 1 ? '1 nota' : `${n} notas`} sin subir porque no hay cobertura. Si cierras sesión ahora se perderán. ¿Cerrar sesión igualmente?`)
        if (!seguir) return
      }
      // Fuera de este móvil la copia local y la cola de este usuario.
      await SC.borrarDatosLocales(cuenta.id)
      // Revoca la sesión en el servidor: el token deja de valer aunque no haya caducado.
      const r = await supabase.auth.signOut().catch((e: unknown) => ({ error: e }))
      if (r.error) await supabase.auth.signOut({ scope: 'local' }) // sin señal: al menos se cierra en este móvil
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
      // Se pinta al momento y se guarda en segundo plano.
      setTodo((prev) => prev && { ...prev, evaluaciones: [...prev.evaluaciones.filter((x) => x.id !== e.id), e] })
      const aLaCola = async () => {
        await SC.encolar(cuenta.id, e)
        ponerPendientes((await SC.pendientes(cuenta.id)).length)
      }
      // Sin señal, o con notas aún en cola (para respetar el orden): a la cola, y se intenta subir.
      if (sinSenal() || (SC.MODO_SIN_CONEXION && pendientesRef.current > 0)) {
        await aLaCola()
        if (!sinSenal()) void subirCola()
        return
      }
      try {
        await R.guardar('evaluaciones', e)
        await SC.quitarDeCola(e.id)
      } catch (err) {
        // Sin señal no se pierde: se guarda en el móvil y se sube al volver la conexión.
        if (SC.MODO_SIN_CONEXION && SC.esErrorDeRed(err)) return aLaCola()
        // Rechazo real del servidor (permisos, consentimiento): se deshace y se avisa.
        setAviso(`No se ha guardado la evaluación: ${errorLegible(err).message}`)
        await recargar().catch(() => undefined)
      }
    },
    marcarFavorito: (id, v) => yRecargar(() => R.marcarFavorito(id, v)).catch((e: Error) => setAviso(e.message)),
    registrarConsentimiento: (id, c, nac) => yRecargar(() => R.registrarConsentimiento(id, c, nac)),
    borrarJugador: (id) => yRecargar(() => R.borrarJugador(id)),
    async exportarJugador(id) {
      if (sinSenal()) throw new Error(SC.MENSAJE_NECESITA_RED)
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
    sinConexion,
    pendientes: numPendientes,
    equipos,
    equipoActivo,
    setEquipoActivo(id) {
      setEquipoElegido(id)
      void DB.guardarAjuste('equipoActivo', id)
    },
    // Solo dentro del panel de admin: en el panel normal no hay ningún acceso de administración.
    esAdmin: adminReal && panel === 'admin' && verComo === 'yo',
    panel,
    perfiles,
    miembrosTodos: todo.miembros,
    guardarJugador: (j) => yRecargar(() => R.guardar('jugadores', minimizar({ ...j, actualizadoEn: new Date().toISOString() }))),
    guardarEstado: (e) => yRecargar(() => R.guardar('estados', { ...e, actualizadoEn: new Date().toISOString() })),
    guardarMiembro: (m) => yRecargar(() => R.guardarMiembro(m)),
    quitarMiembro: (eq, u) => yRecargar(() => R.quitarMiembro(eq, u)),
    async cambiarAdmin(id, valor) {
      // Aviso rápido en la interfaz; la regla de verdad está en admin_set_role (servidor).
      if (!quedaAlgunAdmin(perfiles, id, valor)) throw new Error('Tiene que quedar al menos un administrador.')
      await yRecargar(() => R.cambiarRol(id, valor ? 'admin' : 'player'))
      if (id === cuenta.id) {
        const fresco = await R.perfilActual()
        if (fresco) setCuenta(fresco)
      }
    },
    crearEquipo: async (e) => {
      await yRecargar(() => R.crearEquipo(e))
      setEquipoElegido(e.id)
      void DB.guardarAjuste('equipoActivo', e.id)
    },
    async cargarEjemplo() {
      if (sinSenal()) throw new Error(SC.MENSAJE_NECESITA_RED)
      const id = await R.cargarEjemplo()
      await recargar()
      setEquipoElegido(id)
      void DB.guardarAjuste('equipoActivo', id)
    },
  }
  return <C.Provider value={value}>{children}</C.Provider>
}
