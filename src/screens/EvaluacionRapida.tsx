import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { href, ir } from '../state/router'
import { Tendencia, claseNota } from '../ui/components'
import { AREAS, AREA_COLOR, AREA_CORTO, ESTADO_INFO, num1, uid } from '../logic/format'
import { accionesEntrenador } from '../logic/permisos'
import { puedeEvaluar, tieneConsentimientoFicha } from '../logic/privacy'
import { resumenJugador } from '../logic/stats'
import type { Area, ContextoEvaluacion, Evaluacion, ItemEvaluacion, Jugador, Puntuacion } from '../model/types'

/** Ejemplo para el campo de "Añadir" de cada área. */
const EJEMPLO_AREA: Record<Area, string> = { tecnica: 'Tiro con la izquierda', tactica: 'Basculación', fisica: 'Salto', mental: 'Actitud en el banquillo' }

/** Qué significa cada nota 0–10, en el lenguaje del entrenador (nunca en negativo absoluto). */
function etiquetaNota(v: number) {
  if (v <= 2) return 'Le cuesta'
  if (v <= 4) return 'En proceso'
  if (v <= 6) return 'Cumple'
  if (v <= 8) return 'Bien'
  return 'Destaca'
}

/** Vibración muy corta al cambiar de nota (si el móvil la permite y no se ha pedido menos movimiento). */
const vibrar = () => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) navigator.vibrate(6)
}

/** Notas de la sesión: jugador → aspecto → nota 0–10. */
type Notas = Record<string, Record<string, number>>

/**
 * Evaluación en una sola pantalla:
 *  1. Contexto (partido o entrenamiento).
 *  2. Jugadores que vas a valorar (al entrar, marcados los disponibles).
 *  3. Aspectos por área: al tocar uno se abre la barrita 0–10 para cada jugador marcado.
 *  4. "Guardar evaluación": se guarda la nota de cada jugador y se ve cómo ha evolucionado.
 */
export function EvaluacionRapida() {
  const app = useApp()
  const { ds, jugadoresVisibles, estadoDe, yo, tipoCuenta, puedeEditar, guardarEvaluacion, usuarioId } = app
  const [contexto, setContexto] = useState<ContextoEvaluacion>('partido')
  const candidatos = useMemo(() => jugadoresVisibles.filter(tieneConsentimientoFicha).sort((a, b) => a.dorsal - b.dorsal), [jugadoresVisibles])
  // De entrada, marcados los disponibles (los lesionados, enfermos o sancionados, no).
  const disponibles = () => new Set(candidatos.filter((j) => (estadoDe(j.id)?.tipo ?? 'disponible') === 'disponible').map((j) => j.id))
  const [sel, setSel] = useState<Set<string>>(disponibles)
  const [notas, setNotas] = useState<Notas>({})
  const [abierto, setAbierto] = useState<ItemEvaluacion | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState<{ sesionId: string; jugadores: Jugador[]; antes: Map<string, number | null> } | null>(null)
  const sinConsent = jugadoresVisibles.length - candidatos.length
  // Añadir un aspecto propio: qué área está abierta, el texto y el estado del guardado.
  const [anadiendo, setAnadiendo] = useState<Area | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [guardandoItem, setGuardandoItem] = useState(false)
  const [avisoItem, setAvisoItem] = useState<string | null>(null)

  if (!puedeEvaluar(yo)) {
    return <p className="vacio">No tienes permiso para evaluar. Pídeselo al entrenador principal.</p>
  }
  if (hecho) {
    return (
      <Fin
        {...hecho}
        onOtra={() => {
          setHecho(null)
          setNotas({})
          setSel(disponibles())
        }}
      />
    )
  }

  const puedeAnadirItems = accionesEntrenador({ tipoCuenta, puedeEditar }).editarEquipo
  const jugadores = candidatos.filter((j) => sel.has(j.id))
  const disponible = (j: Jugador) => (estadoDe(j.id)?.tipo ?? 'disponible') === 'disponible'
  const campo = ds.items.filter((i) => i.activo && !i.eliminadoEn && i.ambito !== 'portero')
  // Solo cuentan las notas de los jugadores que siguen marcados.
  const totalNotas = jugadores.reduce((s, j) => s + Object.keys(notas[j.id] ?? {}).length, 0)
  const conNota = jugadores.filter((j) => Object.keys(notas[j.id] ?? {}).length > 0)

  const toggleJ = (id: string) =>
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const ponerNota = (jid: string, itemId: string, v: number | null) =>
    setNotas((n) => {
      const delJ = { ...(n[jid] ?? {}) }
      if (v == null) delete delJ[itemId]
      else delJ[itemId] = v
      return { ...n, [jid]: delJ }
    })
  const notasDelItem = (itemId: string) => jugadores.map((j) => notas[j.id]?.[itemId]).filter((v): v is number => v != null)

  const guardar = async () => {
    if (!totalNotas) return
    setGuardando(true)
    setAviso(null)
    const sesionId = uid()
    const antes = new Map(conNota.map((j) => [j.id, app.resumen.get(j.id)?.media ?? null]))
    const ahora = new Date().toISOString()
    try {
      for (const j of conNota) {
        const puntuaciones: Puntuacion[] = Object.entries(notas[j.id]).map(([itemId, valor]) => ({ itemId, valor, escala: 10 }))
        const ev: Evaluacion = {
          id: `evl-${sesionId}-${j.id}`,
          creadoEn: ahora,
          actualizadoEn: ahora,
          creadoPor: usuarioId,
          jugadorId: j.id,
          fecha: ahora,
          evaluadorId: usuarioId,
          contexto,
          puntuaciones,
        }
        // Sin cobertura se queda en el móvil y se sube al volver la señal (como siempre).
        await guardarEvaluacion(ev)
      }
      setHecho({ sesionId, jugadores: conNota, antes })
      window.scrollTo(0, 0)
    } catch (e) {
      setAviso(`No se ha guardado: ${(e as Error).message}`)
    } finally {
      setGuardando(false)
    }
  }
  const salir = () => {
    if (totalNotas && !window.confirm('Tienes notas sin guardar. ¿Salir sin guardarlas?')) return
    ir({ nombre: 'inicio' }, true)
  }

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
      await app.anadirItemPropio(anadiendo, nuevoNombre)
      setAnadiendo(null)
      setNuevoNombre('')
    } catch (e) {
      setAvisoItem(`No se ha guardado: ${(e as Error).message}`)
    } finally {
      setGuardandoItem(false)
    }
  }
  const quitarItem = async (id: string) => {
    setNotas((n) => Object.fromEntries(Object.entries(n).map(([jid, x]) => [jid, Object.fromEntries(Object.entries(x).filter(([k]) => k !== id))])))
    try {
      await app.quitarItemPropio(id)
    } catch (e) {
      setAvisoItem(`No se ha quitado: ${(e as Error).message}`)
    }
  }

  return (
    <div className="eval-prep">
      <header className="cabecera">
        <button className="icon-btn" aria-label="Cerrar" onClick={salir}>
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
              const n = Object.keys(notas[j.id] ?? {}).length
              return (
                <li key={j.id}>
                  <button type="button" className={`jug-sel ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleJ(j.id)}>
                    <span className="jug-sel-dorsal num">{j.dorsal}</span>
                    <span className="jug-sel-nombre">
                      {j.nombre} {j.apellidos.split(' ')[0]}
                      {est !== 'disponible' && <span className="jug-sel-estado">{ESTADO_INFO[est].nombre}</span>}
                      {on && n > 0 && <span className="jug-sel-notas">{n === 1 ? '1 nota' : `${n} notas`}</span>}
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
          {totalNotas > 0 && <span className="contador-sel num">{totalNotas === 1 ? '1 nota' : `${totalNotas} notas`}</span>}
        </div>
        <p className="sub ayuda-observar">{jugadores.length ? 'Toca un aspecto para ponerle nota de 0 a 10.' : 'Marca antes los jugadores que vas a valorar.'}</p>

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
                    const vs = notasDelItem(i.id)
                    const propio = i.id.startsWith('pro-')
                    // Con un solo jugador se ve su nota; con varios, cuántos llevan nota.
                    const marca = !vs.length ? null : jugadores.length === 1 ? String(vs[0]) : `${vs.length}/${jugadores.length}`
                    return (
                      <span key={i.id} className={`chip-item ${propio ? 'propio' : ''}`}>
                        <button type="button" className={`chip-btn ${vs.length ? 'on' : ''}`} onClick={() => setAbierto(i)} title={i.descripcion} aria-haspopup="dialog">
                          {i.nombre}
                          {marca && <span className={`chip-nota num ${jugadores.length === 1 ? claseNota(vs[0]) : ''}`}>{marca}</span>}
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
                    aria-label={`Nuevo aspecto de ${AREA_CORTO[a]}`}
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
        {puedeAnadirItems && <p className="nota-pie">Lo que añadas se guarda en el equipo y sirve para las próximas evaluaciones.</p>}
      </section>

      <div className="barra-accion">
        {aviso && (
          <p className="error" role="alert">
            {aviso}
          </p>
        )}
        <div className="botones">
          <button className="btn primario grande crece" disabled={!totalNotas || guardando} onClick={guardar}>
            <Icon n="check" size={20} />{' '}
            {guardando ? 'Guardando…' : totalNotas ? `Guardar evaluación · ${conNota.length === 1 ? '1 jugador' : `${conNota.length} jugadores`}` : 'Guardar evaluación'}
          </button>
        </div>
      </div>

      {abierto && (
        <PopupNota
          item={abierto}
          jugadores={jugadores}
          notas={notas}
          onNota={(jid, v) => {
            ponerNota(jid, abierto.id, v)
            if (v != null) vibrar()
          }}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </div>
  )
}

/** Ventana con la barrita 0–10 de un aspecto, una por cada jugador marcado. */
function PopupNota({ item, jugadores, notas, onNota, onCerrar }: { item: ItemEvaluacion; jugadores: Jugador[]; notas: Notas; onNota: (jid: string, v: number | null) => void; onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onCerrar)
  useEffect(() => {
    cerrar.current = onCerrar
  }, [onCerrar])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar.current()
    document.addEventListener('keydown', tecla)
    caja.current?.querySelector<HTMLElement>('input, button')?.focus()
    // La página de detrás no se desplaza mientras está abierta.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = antes
    }
  }, [])

  return (
    <div className="popup-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="popup-nota" role="dialog" aria-modal="true" aria-labelledby="popup-nota-tit" ref={caja}>
        <div className="popup-cab">
          <div>
            <span className="popup-area">
              <i style={{ background: AREA_COLOR[item.area] }} aria-hidden /> {AREA_CORTO[item.area]}
            </span>
            <h2 id="popup-nota-tit">{item.nombre}</h2>
            {item.descripcion && item.descripcion !== 'Añadido por el entrenador' && <p className="sub">{item.descripcion}</p>}
          </div>
          <button className="icon-btn" aria-label="Cerrar" onClick={onCerrar}>
            <Icon n="cerrar" />
          </button>
        </div>

        {jugadores.length === 0 ? (
          <p className="sub popup-vacio">Marca primero los jugadores que vas a valorar (en "Jugadores").</p>
        ) : (
          <ul className="eval-items eval-barras popup-lista">
            {jugadores.map((j) => {
              const v = notas[j.id]?.[item.id]
              const sin = v == null
              return (
                <li key={j.id} className={sin ? 'sin-valor' : ''}>
                  <div className="eval-item-cab">
                    <span className="eval-item-nombre">
                      <span className="jug-sel-dorsal num">{j.dorsal}</span>
                      {j.nombre} {j.apellidos.split(' ')[0]}
                    </span>
                    <span className={`eval-valor num ${sin ? 'vacio' : claseNota(v)}`}>{sin ? '–' : v}</span>
                  </div>
                  <input
                    type="range"
                    className={`barra-nota ${sin ? 'vacia' : claseNota(v)}`}
                    min={0}
                    max={10}
                    step={1}
                    value={v ?? 0}
                    aria-label={`${item.nombre} de ${j.nombre}, de 0 a 10`}
                    aria-valuetext={sin ? 'Sin valorar' : `${v}: ${etiquetaNota(v)}`}
                    style={{ '--pct': `${(v ?? 0) * 10}%` } as CSSProperties}
                    onChange={(e) => onNota(j.id, e.currentTarget.valueAsNumber)}
                    // Tocar justo en el centro de una barra sin valorar también cuenta.
                    onPointerUp={(e) => sin && onNota(j.id, e.currentTarget.valueAsNumber)}
                    onKeyUp={(e) => sin && (e.key === 'Enter' || e.key === ' ') && onNota(j.id, e.currentTarget.valueAsNumber)}
                  />
                  <div className="barra-escala" aria-hidden>
                    {Array.from({ length: 11 }, (_, k) => (
                      <span key={k}>{k}</span>
                    ))}
                  </div>
                  <div className="eval-item-pie">
                    <span className="sub">{sin ? 'Sin valorar · toca o arrastra la barra' : etiquetaNota(v)}</span>
                    {!sin && (
                      <button type="button" className="enlace pequeno" onClick={() => onNota(j.id, null)}>
                        Quitar nota
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="popup-pie">
          <button className="btn primario grande crece" onClick={onCerrar}>
            Hecho
          </button>
        </div>
      </div>
    </div>
  )
}

/** Tras guardar: la nota de hoy y cómo ha evolucionado cada jugador. */
function Fin({ jugadores, sesionId, antes, onOtra }: { jugadores: Jugador[]; sesionId: string; antes: Map<string, number | null>; onOtra: () => void }) {
  const { ds } = useApp()
  const evs = ds.evaluaciones.filter((e) => e.id.startsWith(`evl-${sesionId}-`) && e.puntuaciones.length > 0)
  const notas = evs.reduce((s, e) => s + e.puntuaciones.length, 0)
  const nombreItem = (id: string) => ds.items.find((i) => i.id === id)?.nombre ?? id
  return (
    <div className="eval-prep">
      <header className="cabecera">
        <button className="icon-btn" aria-label="Cerrar" onClick={() => ir({ nombre: 'inicio' }, true)}>
          <Icon n="cerrar" />
        </button>
        <div className="cabecera-txt">
          <h1>Evaluación guardada</h1>
          <p className="sub">
            {jugadores.length === 1 ? '1 jugador' : `${jugadores.length} jugadores`} · {notas === 1 ? '1 nota' : `${notas} notas`}
          </p>
        </div>
      </header>
      <section className="bloque">
        <h2>Cómo han evolucionado</h2>
        <ul className="lista-evolucion">
          {jugadores.map((j) => {
            const ev = evs.find((e) => e.jugadorId === j.id)
            const ahora = resumenJugador(j, ds.evaluaciones, ds.items).media
            const prev = antes.get(j.id) ?? null
            return (
              <li key={j.id}>
                <a className="evo-fila" href={href({ nombre: 'evolucion', id: j.id })}>
                  <span className="jug-sel-dorsal num">{j.dorsal}</span>
                  <span className="crece">
                    <strong>
                      {j.nombre} {j.apellidos.split(' ')[0]}
                    </strong>
                    <span className="sub evo-hoy">{ev?.puntuaciones.map((p) => `${nombreItem(p.itemId)} ${p.valor}`).join(' · ')}</span>
                  </span>
                  <span className="evo-media">
                    <span className={`num evo-media-v ${claseNota(ahora)}`}>{num1(ahora)}</span>
                    <Tendencia v={ahora != null && prev != null ? ahora - prev : null} />
                  </span>
                  <Icon n="evolucion" size={18} />
                </a>
              </li>
            )
          })}
        </ul>
        <p className="nota-pie">Media de 0 a 10 y cambio respecto a antes de esta evaluación. Toca un jugador para ver toda su evolución.</p>
      </section>
      <div className="barra-accion">
        <div className="botones">
          <button className="btn" onClick={onOtra}>
            Otra evaluación
          </button>
          <button className="btn primario crece" onClick={() => ir({ nombre: 'plantilla' }, true)}>
            Ver plantilla
          </button>
        </div>
      </div>
    </div>
  )
}
