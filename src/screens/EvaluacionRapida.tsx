import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { ir } from '../state/router'
import { Avatar, Tendencia } from '../ui/components'
import { AREAS, AREA_COLOR, AREA_CORTO, POSICION_NOMBRE, num1, uid } from '../logic/format'
import { puedeEvaluar, tieneConsentimientoFicha } from '../logic/privacy'
import { itemsAplicables, resumenJugador } from '../logic/stats'
import type { ContextoEvaluacion, Evaluacion, ItemEvaluacion, Jugador, Puntuacion } from '../model/types'

const MAX_ITEMS = 4
const SUGERIDOS = ['tac-presion', 'tec-pase-corto', 'men-concentracion']

type Fase = 'preparar' | 'evaluar' | 'fin'

export function EvaluacionRapida() {
  const app = useApp()
  const { ds, jugadoresVisibles, estadoDe, yo } = app
  const [fase, setFase] = useState<Fase>('preparar')
  const [contexto, setContexto] = useState<ContextoEvaluacion>('partido')
  const [itemIds, setItemIds] = useState<string[]>(SUGERIDOS)
  const candidatos = useMemo(() => jugadoresVisibles.filter(tieneConsentimientoFicha).sort((a, b) => a.dorsal - b.dorsal), [jugadoresVisibles])
  const [sel, setSel] = useState<Set<string>>(() => new Set(candidatos.filter((j) => (estadoDe(j.id)?.tipo ?? 'disponible') === 'disponible').map((j) => j.id)))
  const sinConsent = jugadoresVisibles.length - candidatos.length
  const sesion = useRef({ id: uid(), inicio: 0, fin: 0 })
  const [antes, setAntes] = useState<Map<string, number | null>>(new Map())

  if (!puedeEvaluar(yo)) {
    return <p className="vacio">No tienes permiso para evaluar. Pídeselo al entrenador principal.</p>
  }

  const items = itemIds.map((id) => ds.items.find((i) => i.id === id)!).filter(Boolean)
  const jugadores = candidatos.filter((j) => sel.has(j.id))

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
  const campo = ds.items.filter((i) => i.activo && i.ambito !== 'portero')

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
        <h2>
          Qué vas a observar <span className="sub num">{itemIds.length}/{MAX_ITEMS}</span>
        </h2>
        {AREAS.map((a) => (
          <div key={a} className="grupo-items">
            <h3 style={{ color: AREA_COLOR[a] }}>{AREA_CORTO[a]}</h3>
            <div className="chips">
              {campo
                .filter((i) => i.area === a)
                .map((i) => (
                  <button
                    key={i.id}
                    className={`chip-btn ${itemIds.includes(i.id) ? 'on' : ''}`}
                    aria-pressed={itemIds.includes(i.id)}
                    disabled={!itemIds.includes(i.id) && itemIds.length >= MAX_ITEMS}
                    onClick={() => toggleItem(i.id)}
                    title={i.descripcion}
                  >
                    {i.nombre}
                  </button>
                ))}
            </div>
          </div>
        ))}
        <p className="nota-pie">A los porteros se les cambian los ítems de campo por ítems de portero.</p>
      </section>

      <section className="bloque">
        <h2>
          Jugadores <span className="sub num">{sel.size} seleccionados</span>
        </h2>
        <ul className="lista-sel">
          {candidatos.map((j) => {
            const est = estadoDe(j.id)?.tipo ?? 'disponible'
            return (
              <li key={j.id}>
                <label>
                  <input type="checkbox" checked={sel.has(j.id)} onChange={() => toggleJ(j.id)} />
                  <span className="num dorsal-mini">{j.dorsal}</span>
                  {j.nombre} {j.apellidos.split(' ')[0]}
                  {est !== 'disponible' && <span className="sub"> · {est}</span>}
                </label>
              </li>
            )
          })}
        </ul>
        {sinConsent > 0 && <p className="nota-pie con-icono"><Icon n="aviso" size={14} /> {sinConsent === 1 ? '1 jugador sin consentimiento no aparece.' : `${sinConsent} jugadores sin consentimiento no aparecen.`}</p>}
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
          Empezar · {jugadores.length} jugadores × {items.length} ítems
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

function Deslizador({ jugadores, items, contexto, sesionId, inicio, onFin }: { jugadores: Jugador[]; items: ItemEvaluacion[]; contexto: ContextoEvaluacion; sesionId: string; inicio: number; onFin: () => void }) {
  const { ds, guardarEvaluacion, usuarioId } = useApp()
  const [i, setI] = useState(0)
  const [punt, setPunt] = useState<Record<string, Record<string, Puntuacion['valor']>>>({})
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const avance = useRef<number | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const j = jugadores[i]
  const its = itemsPara(j, items, ds.items)
  const mias = punt[j.id] ?? {}

  const guardar = (jid: string, p: Record<string, Puntuacion['valor']>) => {
    const puntuaciones = Object.entries(p).map(([itemId, valor]) => ({ itemId, valor }))
    if (!puntuaciones.length) return
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

  const irA = (n: number) => {
    if (avance.current) clearTimeout(avance.current)
    if (n >= jugadores.length) return onFin()
    setI(Math.max(0, n))
  }

  const puntuar = (itemId: string, v: Puntuacion['valor']) => {
    const nuevo = { ...mias }
    if (nuevo[itemId] === v) delete nuevo[itemId]
    else nuevo[itemId] = v
    setPunt((p) => ({ ...p, [j.id]: nuevo }))
    guardar(j.id, nuevo) // guardado automático en cada toque
    if (its.every((it) => nuevo[it.id])) {
      if (avance.current) clearTimeout(avance.current)
      avance.current = window.setTimeout(() => irA(i + 1), 280)
    }
  }

  const seg = Math.floor((Date.now() - inicio) / 1000)
  const reloj = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`

  return (
    <div className="eval-pantalla">
      <div className="eval-top">
        <button className="icon-btn" aria-label="Terminar" onClick={onFin}>
          <Icon n="cerrar" />
        </button>
        <div className="progreso" aria-label={`Jugador ${i + 1} de ${jugadores.length}`}>
          {jugadores.map((x, k) => (
            <span key={x.id} className={k < i ? 'hecho' : k === i ? 'actual' : ''} />
          ))}
        </div>
        <span className="num reloj" aria-label="Tiempo">
          <Icon n="reloj" size={15} /> {reloj}
        </span>
      </div>

      <div
        className="eval-tarjeta"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform .2s' }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
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

        <ul className="eval-items">
          {its.map((it) => (
            <li key={it.id}>
              <div className="eval-item-nombre">
                <i style={{ background: AREA_COLOR[it.area] }} aria-hidden />
                {it.nombre}
                {it.grupo && <span className="sub"> · {it.grupo}</span>}
                {!mias[it.id] && <span className="sub no-obs"> · no observado</span>}
              </div>
              <div className="escala" role="radiogroup" aria-label={it.nombre}>
                {([1, 2, 3, 4, 5] as const).map((v) => (
                  <button key={v} role="radio" aria-checked={mias[it.id] === v} className={`nota n${v} ${mias[it.id] === v ? 'on' : ''}`} onClick={() => puntuar(it.id, v)}>
                    {v}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="nota-pie centrado">Desliza para cambiar de jugador · toca otra vez para quitar la nota</p>
      </div>

      <div className="eval-nav">
        <button className="btn" disabled={i === 0} onClick={() => irA(i - 1)}>
          Anterior
        </button>
        <span className="num sub">
          {i + 1} / {jugadores.length}
        </span>
        <button className="btn primario" onClick={() => irA(i + 1)}>
          {i === jugadores.length - 1 ? 'Terminar' : Object.keys(mias).length ? 'Siguiente' : 'Saltar'}
        </button>
      </div>
    </div>
  )
}

function Fin({ jugadores, sesionId, ms, antes }: { jugadores: Jugador[]; sesionId: string; ms: number; antes: Map<string, number | null> }) {
  const { ds } = useApp()
  const evs = ds.evaluaciones.filter((e) => e.id.startsWith(`evl-${sesionId}-`))
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
