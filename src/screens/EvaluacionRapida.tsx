import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { ir } from '../state/router'
import { Avatar, Tendencia, claseNota } from '../ui/components'
import { AREAS, AREA_COLOR, AREA_CORTO, ESTADO_INFO, POSICION_NOMBRE, num1, uid } from '../logic/format'
import { accionesEntrenador } from '../logic/permisos'
import { puedeEvaluar, tieneConsentimientoFicha } from '../logic/privacy'
import { itemsAplicables, resumenJugador } from '../logic/stats'
import type { Area, ContextoEvaluacion, Evaluacion, ItemEvaluacion, Jugador, Puntuacion } from '../model/types'

const MAX_ITEMS = 6
/** Ejemplo para el campo de "Añadir" de cada área. */
const EJEMPLO_AREA: Record<Area, string> = { tecnica: 'Tiro con la izquierda', tactica: 'Basculación', fisica: 'Salto', mental: 'Actitud en el banquillo' }

type Fase = 'preparar' | 'evaluar' | 'fin'

export function EvaluacionRapida() {
  const app = useApp()
  const { ds, jugadoresVisibles, estadoDe, yo, tipoCuenta, puedeEditar } = app
  const [fase, setFase] = useState<Fase>('preparar')
  const [contexto, setContexto] = useState<ContextoEvaluacion>('partido')
  const [itemIds, setItemIds] = useState<string[]>([]) // el entrenador elige qué valorar
  const candidatos = useMemo(() => jugadoresVisibles.filter(tieneConsentimientoFicha).sort((a, b) => a.dorsal - b.dorsal), [jugadoresVisibles])
  // Todos desmarcados: el entrenador elige a quién ha visto hoy.
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const sinConsent = jugadoresVisibles.length - candidatos.length
  const sesion = useRef({ id: uid(), inicio: 0, fin: 0 })
  const [antes, setAntes] = useState<Map<string, number | null>>(new Map())
  // Añadir un ítem propio: qué área está abierta, el texto y el estado del guardado.
  const [anadiendo, setAnadiendo] = useState<Area | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [guardandoItem, setGuardandoItem] = useState(false)
  const [avisoItem, setAvisoItem] = useState<string | null>(null)

  if (!puedeEvaluar(yo)) {
    return <p className="vacio">No tienes permiso para evaluar. Pídeselo al entrenador principal.</p>
  }

  const items = itemIds.map((id) => ds.items.find((i) => i.id === id)!).filter(Boolean)
  const jugadores = candidatos.filter((j) => sel.has(j.id))
  const puedeAnadirItems = accionesEntrenador({ tipoCuenta, puedeEditar }).editarEquipo

  if (fase === 'evaluar') {
    return (
      <Deslizador
        jugadores={jugadores}
        items={items}
        contexto={contexto}
        sesionId={sesion.current.id}
        inicio={sesion.current.inicio}
        onFin={() => {
          sesion.current.fin = Date.now()
          setFase('fin')
        }}
      />
    )
  }
  if (fase === 'fin') {
    return <Fin jugadores={jugadores} sesionId={sesion.current.id} ms={sesion.current.fin - sesion.current.inicio} antes={antes} />
  }

  const toggleItem = (id: string) =>
    setItemIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= MAX_ITEMS ? xs : [...xs, id]))
  const toggleJ = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const disponible = (j: Jugador) => (estadoDe(j.id)?.tipo ?? 'disponible') === 'disponible'
  const campo = ds.items.filter((i) => i.activo && !i.eliminadoEn && i.ambito !== 'portero')

  const abrirAnadir = (a: Area) => {
    setAnadiendo(a)
    setNuevoNombre('')
    setAvisoItem(null)
  }
  const guardarItem = async () => {
    if (!anadiendo || !nuevoNombre.trim()) return
    setGuardandoItem(true)
    setAvisoItem(null)
    try {
      const id = await app.anadirItemPropio(anadiendo, nuevoNombre)
      // Recién creado: se marca para esta sesión si cabe.
      setItemIds((xs) => (xs.includes(id) || xs.length >= MAX_ITEMS ? xs : [...xs, id]))
      setAnadiendo(null)
      setNuevoNombre('')
    } catch (e) {
      setAvisoItem(`No se ha guardado: ${(e as Error).message}`)
    } finally {
      setGuardandoItem(false)
    }
  }
  const quitarItem = async (id: string) => {
    setItemIds((xs) => xs.filter((x) => x !== id))
    try {
      await app.quitarItemPropio(id)
    } catch (e) {
      setAvisoItem(`No se ha quitado: ${(e as Error).message}`)
    }
  }

  return (
    <div className="eval-prep">
      <header className="cabecera">
        <button className="icon-btn" aria-label="Cerrar" onClick={() => ir({ nombre: 'inicio' }, true)}>
          <Icon n="cerrar" />
        </button>
        <div className="cabecera-txt">
          <h1>Evaluación rápida</h1>
          <p className="sub">Puntúa solo lo que hayas observado hoy</p>
        </div>
      </header>

      <section className="bloque">
        <h2>Contexto</h2>
        <div className="segmentado" role="radiogroup">
          {(['partido', 'entrenamiento'] as const).map((c) => (
            <button key={c} role="radio" aria-checked={contexto === c} className={contexto === c ? 'on' : ''} onClick={() => setContexto(c)}>
              {c === 'partido' ? 'Partido' : 'Entrenamiento'}
            </button>
          ))}
        </div>
      </section>

      <section className="bloque">
        <div className="bloque-tit-fila">
          <h2>Jugadores</h2>
          <span className="contador-sel num">
            {sel.size} de {candidatos.length}
          </span>
        </div>
        <div className="atajos" role="group" aria-label="Selección rápida">
          <button type="button" className="chip-btn" onClick={() => setSel(new Set(candidatos.map((j) => j.id)))}>
            Todos
          </button>
          <button type="button" className="chip-btn" onClick={() => setSel(new Set(candidatos.filter(disponible).map((j) => j.id)))}>
            Solo disponibles
          </button>
          <button type="button" className="chip-btn" onClick={() => setSel(new Set())} disabled={sel.size === 0}>
            Ninguno
          </button>
        </div>
        {candidatos.length === 0 ? (
          <p className="sub">Todavía no hay jugadores con consentimiento para evaluar.</p>
        ) : (
          <ul className="sel-jugadores">
            {candidatos.map((j) => {
              const est = estadoDe(j.id)?.tipo ?? 'disponible'
              const on = sel.has(j.id)
              return (
                <li key={j.id}>
                  <button type="button" className={`jug-sel ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleJ(j.id)}>
                    <span className="jug-sel-dorsal num">{j.dorsal}</span>
                    <span className="jug-sel-nombre">
                      {j.nombre} {j.apellidos.split(' ')[0]}
                      {est !== 'disponible' && <span className="jug-sel-estado">{ESTADO_INFO[est].nombre}</span>}
                    </span>
                    <span className="jug-sel-check" aria-hidden>
                      {on && <Icon n="check" size={16} />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {sinConsent > 0 && <p className="nota-pie con-icono"><Icon n="aviso" size={14} /> {sinConsent === 1 ? '1 jugador sin consentimiento no aparece.' : `${sinConsent} jugadores sin consentimiento no aparecen.`}</p>}
      </section>

      <section className="bloque">
        <div className="bloque-tit-fila">
          <h2>Qué vas a observar</h2>
          <span className="contador-sel num">
            {itemIds.length} de {MAX_ITEMS}
          </span>
        </div>
        <div className="areas-items">
          {AREAS.map((a) => (
            <div key={a} className="grupo-items">
              <h3>
                <i style={{ background: AREA_COLOR[a] }} aria-hidden /> {AREA_CORTO[a]}
              </h3>
              <div className="chips">
                {campo
                  .filter((i) => i.area === a)
                  .map((i) => {
                    const on = itemIds.includes(i.id)
                    const propio = i.id.startsWith('pro-')
                    return (
                      <span key={i.id} className={`chip-item ${propio ? 'propio' : ''}`}>
                        <button
                          type="button"
                          className={`chip-btn ${on ? 'on' : ''}`}
                          aria-pressed={on}
                          disabled={!on && itemIds.length >= MAX_ITEMS}
                          onClick={() => toggleItem(i.id)}
                          title={i.descripcion}
                        >
                          {i.nombre}
                        </button>
                        {propio && puedeAnadirItems && (
                          <button type="button" className="chip-quitar" aria-label={`Quitar ${i.nombre}`} title="Quitar de la lista" onClick={() => quitarItem(i.id)}>
                            <Icon n="cerrar" size={12} />
                          </button>
                        )}
                      </span>
                    )
                  })}
                {puedeAnadirItems && anadiendo !== a && (
                  <button type="button" className="chip-btn chip-anadir" onClick={() => abrirAnadir(a)}>
                    <Icon n="mas" size={14} /> Añadir
                  </button>
                )}
              </div>
              {anadiendo === a && (
                <form
                  className="anadir-item"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void guardarItem()
                  }}
                >
                  <input
                    autoFocus
                    value={nuevoNombre}
                    maxLength={40}
                    placeholder={`Nuevo en ${AREA_CORTO[a]} (p. ej. ${EJEMPLO_AREA[a]})`}
                    aria-label={`Nuevo campo de ${AREA_CORTO[a]}`}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                  />
                  <button type="submit" className="btn primario" disabled={!nuevoNombre.trim() || guardandoItem}>
                    {guardandoItem ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button type="button" className="btn" onClick={() => setAnadiendo(null)}>
                    Cancelar
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
        {avisoItem && (
          <p className="error" role="alert">
            {avisoItem}
          </p>
        )}
        <p className="nota-pie">
          Elige hasta {MAX_ITEMS} por sesión.{puedeAnadirItems ? ' Lo que añadas se guarda en el equipo y sirve para las próximas evaluaciones.' : ''} A los porteros se les cambian los ítems de campo por ítems de portero.
        </p>
      </section>

      <div className="barra-accion">
        <button
          className="btn primario grande"
          disabled={!items.length || !jugadores.length}
          onClick={() => {
            setAntes(new Map(jugadores.map((j) => [j.id, app.resumen.get(j.id)?.media ?? null])))
            sesion.current = { id: uid(), inicio: Date.now(), fin: 0 }
            setFase('evaluar')
          }}
        >
          {!jugadores.length ? 'Marca los jugadores que vas a evaluar' : !items.length ? 'Elige qué vas a observar' : `Empezar · ${jugadores.length} jugadores × ${items.length} ítems`}
        </button>
      </div>
    </div>
  )
}

/** Ítems de la sesión adaptados al jugador (porteros, edad). */
function itemsPara(j: Jugador, items: ItemEvaluacion[], todos: ItemEvaluacion[]) {
  const ok = new Set(itemsAplicables(todos, j).map((i) => i.id))
  const porteros = todos.filter((i) => i.ambito === 'portero' && ok.has(i.id))
  const out: ItemEvaluacion[] = []
  for (const it of items) {
    if (ok.has(it.id)) out.push(it)
    else {
      const sust = porteros.find((p) => !out.includes(p))
      if (sust) out.push(sust)
    }
  }
  return out
}

/** Qué significa cada nota 0–10, en el lenguaje del entrenador (nunca en negativo absoluto). */
export function etiquetaNota(v: number) {
  if (v <= 2) return 'Le cuesta'
  if (v <= 4) return 'En proceso'
  if (v <= 6) return 'Cumple'
  if (v <= 8) return 'Bien'
  return 'Destaca'
}
/** Espera tras mover la barrita antes de guardar (no se guarda en cada paso del arrastre). */
const ESPERA_GUARDADO = 500

/** Vibración muy corta al cambiar de nota (si el móvil la permite y no se ha pedido menos movimiento). */
const vibrar = () => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) navigator.vibrate(6)
}

function Deslizador({ jugadores, items, contexto, sesionId, inicio, onFin }: { jugadores: Jugador[]; items: ItemEvaluacion[]; contexto: ContextoEvaluacion; sesionId: string; inicio: number; onFin: () => void }) {
  const { ds, guardarEvaluacion, usuarioId } = useApp()
  const [i, setI] = useState(0)
  const [punt, setPunt] = useState<Record<string, Record<string, number>>>({})
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [, tick] = useState(0)
  const guardadas = useRef(new Set<string>())
  const pendientes = useRef(new Map<string, { t: number; p: Record<string, number> }>())

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const j = jugadores[i]
  const its = itemsPara(j, items, ds.items)
  const mias = punt[j.id] ?? {}

  /** Guarda la evaluación de un jugador en la escala 0–10. */
  const guardarYa = (jid: string, p: Record<string, number>) => {
    const puntuaciones: Puntuacion[] = Object.entries(p).map(([itemId, valor]) => ({ itemId, valor, escala: 10 }))
    // Sin notas: solo se guarda (vacía) si ya se había guardado algo, para que quitar la
    // única nota se refleje también en el servidor. Las vacías no cuentan en las medias.
    if (!puntuaciones.length && !guardadas.current.has(jid)) return
    guardadas.current.add(jid)
    const ahora = new Date().toISOString()
    const ev: Evaluacion = {
      id: `evl-${sesionId}-${jid}`,
      creadoEn: ahora,
      actualizadoEn: ahora,
      creadoPor: usuarioId,
      jugadorId: jid,
      fecha: ahora,
      evaluadorId: usuarioId,
      contexto,
      puntuaciones,
    }
    void guardarEvaluacion(ev)
  }
  /** Guardado automático, medio segundo después del último movimiento de la barrita. */
  const programar = (jid: string, p: Record<string, number>) => {
    const prev = pendientes.current.get(jid)
    if (prev) clearTimeout(prev.t)
    const t = window.setTimeout(() => {
      pendientes.current.delete(jid)
      guardarYa(jid, p)
    }, ESPERA_GUARDADO)
    pendientes.current.set(jid, { t, p })
  }
  /** Lo que quede por guardar, se guarda ya (al cambiar de jugador o al terminar). */
  const vaciar = () => {
    for (const [jid, { t, p }] of pendientes.current) {
      clearTimeout(t)
      guardarYa(jid, p)
    }
    pendientes.current.clear()
  }
  // Al salir de la pantalla no se pierde nada.
  useEffect(() => () => vaciar(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const irA = (n: number) => {
    vaciar()
    if (n >= jugadores.length) return onFin()
    setI(Math.max(0, n))
  }
  const terminar = () => {
    vaciar()
    onFin()
  }

  const puntuar = (itemId: string, v: number) => {
    if (mias[itemId] === v) return
    const nuevo = { ...mias, [itemId]: v }
    setPunt((p) => ({ ...p, [j.id]: nuevo }))
    programar(j.id, nuevo)
    vibrar()
  }
  const quitar = (itemId: string) => {
    const nuevo = { ...mias }
    delete nuevo[itemId]
    setPunt((p) => ({ ...p, [j.id]: nuevo }))
    programar(j.id, nuevo)
  }

  const seg = Math.floor((Date.now() - inicio) / 1000)
  const reloj = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
  const valorados = its.filter((it) => mias[it.id] != null).length

  return (
    <div className="eval-pantalla">
      <div className="eval-top">
        <button className="icon-btn" aria-label="Terminar" onClick={terminar}>
          <Icon n="cerrar" />
        </button>
        <div className="progreso-caja">
          <span className="eval-contador num" aria-live="polite">
            <strong>{i + 1}</strong> de {jugadores.length}
          </span>
          <div className="progreso" aria-hidden>
            {jugadores.map((x, k) => (
              <span key={x.id} className={k < i ? 'hecho' : k === i ? 'actual' : ''} />
            ))}
          </div>
        </div>
        <span className="num reloj" aria-label="Tiempo">
          <Icon n="reloj" size={15} /> {reloj}
        </span>
      </div>

      <div
        className="eval-tarjeta"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform .2s' }}
        onPointerDown={(e) => {
          // La barrita y los botones no cuentan como deslizar para cambiar de jugador.
          if ((e.target as HTMLElement).closest('button, input')) return
          start.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerMove={(e) => start.current && setDx(e.clientX - start.current.x)}
        onPointerUp={() => {
          if (start.current) {
            if (dx < -60) irA(i + 1)
            else if (dx > 60) irA(i - 1)
          }
          start.current = null
          setDx(0)
        }}
        onPointerCancel={() => {
          start.current = null
          setDx(0)
        }}
      >
        <div className="eval-jugador">
          <Avatar j={j} size={112} />
          <div>
            <div className="eval-dorsal num">{j.dorsal}</div>
            <div className="eval-nombre">
              {j.nombre} {j.apellidos.split(' ')[0]}
            </div>
            <div className="sub">{j.posiciones?.[0] && POSICION_NOMBRE[j.posiciones[0]]}</div>
          </div>
        </div>

        <ul className="eval-items eval-barras">
          {its.map((it) => {
            const v = mias[it.id]
            const sin = v == null
            return (
              <li key={it.id} className={sin ? 'sin-valor' : ''}>
                <div className="eval-item-cab">
                  <span className="eval-item-nombre">
                    <i style={{ background: AREA_COLOR[it.area] }} aria-hidden />
                    {it.nombre}
                    {it.grupo && <span className="sub"> · {it.grupo}</span>}
                  </span>
                  <span className={`eval-valor num ${sin ? 'vacio' : claseNota(v)}`}>{sin ? '–' : v}</span>
                </div>
                <input
                  type="range"
                  className={`barra-nota ${sin ? 'vacia' : claseNota(v)}`}
                  min={0}
                  max={10}
                  step={1}
                  value={v ?? 5}
                  aria-label={`${it.nombre}, de 0 a 10`}
                  aria-valuetext={sin ? 'Sin valorar' : `${v}: ${etiquetaNota(v)}`}
                  style={{ '--pct': `${(v ?? 5) * 10}%` } as CSSProperties}
                  onChange={(e) => puntuar(it.id, e.currentTarget.valueAsNumber)}
                  // Tocar justo en el centro de una barra sin valorar también cuenta.
                  onPointerUp={(e) => sin && puntuar(it.id, e.currentTarget.valueAsNumber)}
                  onKeyUp={(e) => sin && (e.key === 'Enter' || e.key === ' ') && puntuar(it.id, e.currentTarget.valueAsNumber)}
                />
                <div className="barra-escala" aria-hidden>
                  {Array.from({ length: 11 }, (_, k) => (
                    <span key={k}>{k}</span>
                  ))}
                </div>
                <div className="eval-item-pie">
                  <span className="sub">{sin ? 'Sin valorar · toca o arrastra la barra' : etiquetaNota(v)}</span>
                  {!sin && (
                    <button type="button" className="enlace pequeno" onClick={() => quitar(it.id)}>
                      Quitar nota
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="nota-pie centrado">
          {valorados} de {its.length} valorados · se guarda solo · desliza la tarjeta para cambiar de jugador
        </p>
      </div>

      <div className="eval-nav">
        <button className="btn" disabled={i === 0} onClick={() => irA(i - 1)}>
          Anterior
        </button>
        <span className="num sub">
          {i + 1} de {jugadores.length}
        </span>
        <button className="btn primario" onClick={() => irA(i + 1)}>
          {i === jugadores.length - 1 ? 'Terminar' : valorados ? 'Siguiente' : 'Saltar'}
        </button>
      </div>
    </div>
  )
}

function Fin({ jugadores, sesionId, ms, antes }: { jugadores: Jugador[]; sesionId: string; ms: number; antes: Map<string, number | null> }) {
  const { ds } = useApp()
  const evs = ds.evaluaciones.filter((e) => e.id.startsWith(`evl-${sesionId}-`) && e.puntuaciones.length > 0)
  const notas = evs.reduce((s, e) => s + e.puntuaciones.length, 0)
  const seg = Math.round(ms / 1000)
  return (
    <div className="eval-prep">
      <header className="cabecera">
        <div className="cabecera-txt">
          <h1>Evaluación guardada</h1>
          <p className="sub">
            {evs.length} de {jugadores.length} jugadores · {notas} notas · {Math.floor(seg / 60)} min {seg % 60} s
          </p>
        </div>
      </header>
      <section className="bloque">
        <ul className="lista-fin">
          {jugadores.map((j) => {
            const ev = evs.find((e) => e.jugadorId === j.id)
            const ahora = resumenJugador(j, ds.evaluaciones, ds.items).media
            const prev = antes.get(j.id) ?? null
            return (
              <li key={j.id}>
                <span className="num dorsal-mini">{j.dorsal}</span>
                <span className="crece">
                  {j.nombre} {j.apellidos.split(' ')[0]}
                </span>
                {ev ? (
                  <>
                    <span className="num">{num1(ahora)}</span>
                    <Tendencia v={ahora != null && prev != null ? ahora - prev : null} />
                  </>
                ) : (
                  <span className="sub">sin observar</span>
                )}
              </li>
            )
          })}
        </ul>
      </section>
      <div className="barra-accion">
        <button className="btn primario grande" onClick={() => ir({ nombre: 'plantilla' }, true)}>
          Ver plantilla
        </button>
      </div>
    </div>
  )
}
