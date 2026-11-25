import { useState } from 'react'
import { Icon } from '../ui/Icon'
import { useApp } from '../state/store'
import { href, ir, volver } from '../state/router'
import { Avatar, BarrasArea, Cabecera, Dato, Enlace, EstadoChip, Tendencia, Vacio, claseNota } from '../ui/components'
import { RadarAreas } from '../ui/RadarAreas'
import { AREAS, AREA_COLOR, AREA_CORTO, POSICION_NOMBRE, edad, fechaCorta, fechaLarga, num0, num1, pct } from '../logic/format'
import { FLAGS } from '../config'
import { puedeVerFicha, puedeVerNota, tieneConsentimientoFicha, validarConsentimiento } from '../logic/privacy'
import type { Consentimiento, FirmanteTipo, Jugador as TJugador } from '../model/types'

const PESTANAS = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'notas', nombre: 'Notas' },
  { id: 'datos', nombre: 'Datos y privacidad' },
]

export function Jugador({ id, pestana = 'resumen' }: { id: string; pestana?: string }) {
  const app = useApp()
  const { ds, resumen, yo, marcarFavorito } = app
  const j = ds.jugadores.find((x) => x.id === id)
  if (!j) {
    return (
      <>
        <Cabecera titulo="Jugador" atras={() => volver()} />
        <Vacio>No hay datos de este jugador: se han borrado por completo o no existe.</Vacio>
      </>
    )
  }
  if (!puedeVerFicha(yo)) {
    return (
      <>
        <Cabecera titulo={`${j.dorsal} · ${j.nombre}`} atras={() => volver()} />
        <Vacio>No tienes permiso para ver la ficha. Pídeselo al entrenador principal.</Vacio>
      </>
    )
  }
  const r = resumen.get(j.id)!
  const ficha = tieneConsentimientoFicha(j)
  const fav = (
    <>
      {yo.rol === 'entrenador_principal' && (
        <a className="icon-btn" href={href({ nombre: 'jugador-editar', id: j.id })} aria-label="Editar jugador" title="Editar jugador">
          <Icon n="lapiz" />
        </a>
      )}
      <button className="icon-btn" aria-pressed={!!j.favorito} aria-label={j.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'} onClick={() => marcarFavorito(j.id, !j.favorito)}>
        <Icon n="estrella" relleno={!!j.favorito} />
      </button>
    </>
  )
  return (
    <>
      <Cabecera titulo={`${j.nombre} ${j.apellidos.split(" ")[0]}`} atras={() => volver()} accion={fav} />
      <section className="hero">
        <Avatar j={j} size={84} />
        <div>
          <div className="hero-dorsal num">{j.dorsal}</div>
          {ficha ? (
            <>
              <p className="hero-linea">
                {j.posiciones?.map((p) => POSICION_NOMBRE[p]).join(' · ')}
              </p>
              <p className="hero-linea sub">
                {edad(j.fechaNacimiento)} años · pierna {j.pierna}
              </p>
              <EstadoChip e={app.estadoDe(j.id)} />
            </>
          ) : (
            <span className="chip aviso"><Icon n="aviso" size={13} /> Falta consentimiento</span>
          )}
        </div>
        {ficha && (
          <div className="hero-media">
            <span className="media grande num">{num1(r.media)}</span>
            <Tendencia v={r.tendencia} />
            <span className="sub">media · 30 días</span>
          </div>
        )}
      </section>

      {!ficha ? (
        <SinConsentimiento j={j} />
      ) : (
        <>
          <nav className="pestanas" role="tablist">
            {PESTANAS.map((p) => (
              <button key={p.id} role="tab" aria-selected={pestana === p.id} className={pestana === p.id ? 'on' : ''} onClick={() => ir({ nombre: 'jugador', id: j.id, pestana: p.id }, true)}>
                {p.nombre}
              </button>
            ))}
          </nav>
          {pestana === 'notas' ? <Notas j={j} /> : pestana === 'datos' ? <DatosPrivacidad j={j} /> : <Resumen j={j} />}
        </>
      )}
    </>
  )
}

function Resumen({ j }: { j: TJugador }) {
  const { resumen, externos, estadoDe, ds } = useApp()
  const r = resumen.get(j.id)!
  const x = externos.get(j.id)!
  // Cada jugador se compara consigo mismo (hace 30 días), nunca con la media de sus compañeros.
  const antes = r.areasAnteriores ?? undefined
  const est = estadoDe(j.id)
  const ultima = ds.evaluaciones.filter((e) => e.jugadorId === j.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  const nombreItem = (id: string) => ds.items.find((i) => i.id === id)?.nombre ?? id
  const cargaDelta = x.cargaMediaSemanal ? (x.cargaSemana - x.cargaMediaSemanal) / x.cargaMediaSemanal : null
  // Su área más alta y la más baja, comparando al jugador solo consigo mismo.
  const conNota = AREAS.filter((a) => r.areas[a] != null)
  const ordenadas = [...conNota].sort((a, b) => r.areas[b]! - r.areas[a]!)
  const fuerte = ordenadas.length >= 2 && r.areas[ordenadas[0]]! > r.areas[ordenadas[ordenadas.length - 1]]! ? ordenadas[0] : null
  const flojo = fuerte ? ordenadas[ordenadas.length - 1] : null
  return (
    <>
      {est && est.tipo !== 'disponible' && (
        <div className={`aviso-estado estado-${est.tipo}`}>
          <strong>{est.tipo === 'lesionado' ? 'Lesionado' : est.tipo === 'enfermo' ? 'Enfermo' : 'Sancionado'}</strong> desde el {fechaCorta(est.desde)}
          {est.vueltaPrevista && <> · vuelta prevista el {fechaCorta(est.vueltaPrevista)}</>}
          {est.nota && <p className="sub">{est.nota}</p>}
        </div>
      )}
      <div className="ficha-rejilla">
      <section className="bloque">
        <h2>Áreas</h2>
        {FLAGS.disenoV2 ? (
          <>
            {fuerte && flojo && (
              <div className="fuerte-flojo">
                <span>
                  <small>Punto fuerte</small>
                  <strong style={{ color: AREA_COLOR[fuerte] }}>{AREA_CORTO[fuerte]}</strong>
                  <span className="num">{num1(r.areas[fuerte])}</span>
                </span>
                <span>
                  <small>A trabajar</small>
                  <strong style={{ color: AREA_COLOR[flojo] }}>{AREA_CORTO[flojo]}</strong>
                  <span className="num">{num1(r.areas[flojo])}</span>
                </span>
              </div>
            )}
            <BarrasArea areas={r.areas} comparar={antes} />
            <details className="ver-radar">
              <summary>Ver en radar</summary>
              <RadarAreas areas={r.areas} comparar={antes} etiquetaComparar="Hace 30 días" />
            </details>
          </>
        ) : (
          <>
            <RadarAreas areas={r.areas} comparar={antes} etiquetaComparar="Hace 30 días" />
            <BarrasArea areas={r.areas} comparar={antes} />
          </>
        )}
        <p className="nota-pie">{antes ? 'La línea discontinua y la raya vertical marcan cómo estaba hace 30 días. ' : 'Aún no hay evaluaciones de hace 30 días para comparar. '}{r.numEvaluaciones} evaluaciones{r.ultimaEvaluacion && `, la última el ${fechaCorta(r.ultimaEvaluacion)}`}.</p>
        <div className="botones">
          <Enlace to={{ nombre: 'evolucion', id: j.id }} className="btn">
            Ver evolución
          </Enlace>
        </div>
      </section>

      <section className="bloque">
        <h2>Temporada</h2>
        <div className="datos">
          <Dato etiqueta="Minutos" valor={num0(x.minutos)} extra={`${x.partidos} partidos · ${x.titularidades} de titular`} fuente="Temporada" />
          <Dato etiqueta="Asistencia" valor={pct(x.asistenciaPct)} extra={`${x.entrenosPresente}/${x.entrenosTotal} entrenos`} fuente="Sesiones" />
          <Dato etiqueta="Goles" valor={x.goles} fuente="Temporada" />
          <Dato etiqueta="Asistencias" valor={x.asistencias} fuente="Temporada" />
          <Dato
            etiqueta="Carga 7 días"
            valor={num0(x.cargaSemana)}
            extra={cargaDelta == null ? undefined : <Tendencia v={cargaDelta * 100} sufijo=" % vs media" />}
            fuente="Sesiones"
          />
        </div>
      </section>

      {ultima && (
        <section className="bloque">
          <h2>Última evaluación · {fechaCorta(ultima.fecha)}</h2>
          <ul className="lista-puntos">
            {ultima.puntuaciones.map((p) => (
              <li key={p.itemId}>
                <span>{nombreItem(p.itemId)}</span>
                <span className={`puntos num ${claseNota(p.valor)}`} aria-label={`${p.valor} de 5`}>
                  <span className="segmentos" aria-hidden>
                    {[1, 2, 3, 4, 5].map((k) => (
                      <i key={k} className={k <= p.valor ? 'on' : ''} />
                    ))}
                  </span>
                  {p.valor}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </>
  )
}

function Notas({ j }: { j: TJugador }) {
  const { ds, yo } = useApp()
  const todas = ds.notas.filter((n) => n.jugadorId === j.id && !n.eliminadoEn).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const visibles = todas.filter((n) => puedeVerNota(yo, n))
  return (
    <section className="bloque">
      {yo.rol !== 'entrenador_principal' && !yo.permisos.verNotasPrivadas && (
        <p className="aviso-permiso">Ves solo las notas aptas para la familia y las tuyas. Las privadas las ve el entrenador principal.</p>
      )}
      {visibles.length === 0 ? (
        <Vacio>Sin notas de seguimiento.</Vacio>
      ) : (
        <ul className="notas">
          {visibles.map((n) => (
            <li key={n.id}>
              <div className="nota-cab">
                <span className={`chip ${n.visibilidad === 'privada' ? 'privada' : 'familia'}`}>{n.visibilidad === 'privada' ? <><Icon n="candado" size={13} /> Privada</> : <><Icon n="familia" size={13} /> Apta para familia</>}</span>
                <span className="sub">
                  {fechaCorta(n.fecha)} · {ds.usuarios.find((u) => u.id === n.autorId)?.nombre}
                </span>
              </div>
              <p>{n.texto}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="nota-pie">Crear notas de texto o voz llega en la fase 2.</p>
    </section>
  )
}

function DatosPrivacidad({ j }: { j: TJugador }) {
  const { yo, exportarJugador, borrarJugador, esAdmin } = useApp()
  const [confirmar, setConfirmar] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const c = j.consentimiento!
  const principal = yo.rol === 'entrenador_principal'
  const tipo: Record<FirmanteTipo, string> = { madre: 'Madre', padre: 'Padre', tutor_legal: 'Tutor legal', jugador_mayor_14: 'El propio jugador (≥14)' }
  return (
    <>
      <section className="bloque">
        <h2>Datos básicos</h2>
        <dl className="dl">
          <dt>Nacimiento</dt>
          <dd>{j.fechaNacimiento ? fechaLarga(j.fechaNacimiento) : '–'}</dd>
          <dt>Posiciones</dt>
          <dd>{j.posiciones?.map((p) => POSICION_NOMBRE[p]).join(', ')}</dd>
          <dt>Pierna</dt>
          <dd>{j.pierna}</dd>
          {j.contactos?.map((k, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <dt>Contacto</dt>
              <dd>
                {k.nombre} ({k.relacion}) · {k.telefono}
              </dd>
            </span>
          ))}
        </dl>
      </section>
      <section className="bloque">
        <h2>Consentimiento</h2>
        <dl className="dl">
          <dt>Firmante</dt>
          <dd>
            {c.firmante} · {tipo[c.firmanteTipo]}
          </dd>
          <dt>Fecha</dt>
          <dd>{fechaLarga(c.fecha)}</dd>
          <dt>Alcance</dt>
          <dd>
            Ficha: {c.alcance.ficha ? 'sí' : 'no'} · Fotos: {c.alcance.fotos ? 'sí' : 'no'} · Notas de voz: {c.alcance.notasVoz ? 'sí' : 'no'}
          </dd>
          <dt>Versión</dt>
          <dd>{c.version}</dd>
        </dl>
      </section>
      <section className="bloque">
        <h2>Derechos de la familia</h2>
        {!principal && !esAdmin ? (
          <p className="aviso-permiso">Solo el entrenador principal puede exportar los datos, y solo un administrador puede borrarlos.</p>
        ) : (
          <>
            {!esAdmin && <p className="aviso-permiso">Si la familia pide borrar sus datos, avisa a un administrador del club: él hace el borrado completo.</p>}
            <div className="botones">
              <button className="btn" onClick={() => exportarJugador(j.id).catch((e) => setError((e as Error).message))}>
                Exportar todos sus datos
              </button>
              {esAdmin && !confirmar && (
                <button className="btn peligro" onClick={() => setConfirmar(true)}>
                  Borrar todos sus datos
                </button>
              )}
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {esAdmin && confirmar && (
              <div className="confirmar" role="alertdialog" aria-label="Confirmar borrado">
                <p>
                  Se borrarán para siempre la ficha, evaluaciones, pruebas, notas, estados, asistencia, minutos y carga de <strong>{j.nombre}</strong>. No pasa por la papelera y no se puede deshacer.
                </p>
                <div className="botones">
                  <button className="btn" onClick={() => setConfirmar(false)}>
                    Cancelar
                  </button>
                  <button
                    className="btn peligro"
                    disabled={borrando}
                    onClick={async () => {
                      setBorrando(true)
                      try {
                        await borrarJugador(j.id)
                        ir({ nombre: 'plantilla' }, true)
                      } catch (e) {
                        setError((e as Error).message)
                        setBorrando(false)
                      }
                    }}
                  >
                    {borrando ? 'Borrando…' : 'Sí, borrar todo'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}

function SinConsentimiento({ j }: { j: TJugador }) {
  const { registrarConsentimiento, yo } = useApp()
  const hoy = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState<Consentimiento>({
    fecha: hoy,
    firmante: '',
    firmanteTipo: 'madre',
    alcance: { ficha: true, fotos: false, notasVoz: false },
    version: '2026.1',
  })
  const [nac, setNac] = useState('')
  const [error, setError] = useState<string | null>(null)
  const k = j.contactos?.[0]
  return (
    <section className="bloque">
      <h2>Falta el consentimiento</h2>
      <p>
        Mientras no haya consentimiento, solo se guardan su nombre y su dorsal. No se pueden registrar evaluaciones, fotos ni notas.
      </p>
      {k && (
        <p className="sub">
          Contacto: {k.nombre} ({k.relacion}) · {k.telefono}
        </p>
      )}
      {yo.rol !== 'entrenador_principal' ? (
        <p className="aviso-permiso">Solo el entrenador principal puede registrar el consentimiento.</p>
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault()
            const v = validarConsentimiento(f, nac || null)
            if (!v.ok) return setError(v.error!)
            try {
              await registrarConsentimiento(j.id, f, nac || null) // el servidor vuelve a validar y comprueba el rol
            } catch (x) {
              setError((x as Error).message)
            }
          }}
        >
          <label>
            Quién firma
            <select value={f.firmanteTipo} onChange={(e) => setF({ ...f, firmanteTipo: e.target.value as FirmanteTipo })}>
              <option value="madre">Madre</option>
              <option value="padre">Padre</option>
              <option value="tutor_legal">Tutor legal</option>
              <option value="jugador_mayor_14">El propio jugador (14 años o más)</option>
            </select>
          </label>
          <label>
            Nombre de quien firma
            <input value={f.firmante} onChange={(e) => setF({ ...f, firmante: e.target.value })} required />
          </label>
          <label>
            Fecha
            <input type="date" value={f.fecha} max={hoy} onChange={(e) => setF({ ...f, fecha: e.target.value })} required />
          </label>
          <label>
            Fecha de nacimiento del jugador
            <input type="date" value={nac} onChange={(e) => setNac(e.target.value)} />
          </label>
          <fieldset>
            <legend>Autoriza</legend>
            {(
              [
                ['ficha', 'Ficha y evaluaciones'],
                ['fotos', 'Fotos'],
                ['notasVoz', 'Notas de voz'],
              ] as const
            ).map(([key, n]) => (
              <label key={key} className="check">
                <input type="checkbox" checked={f.alcance[key]} onChange={(e) => setF({ ...f, alcance: { ...f.alcance, [key]: e.target.checked } })} /> {n}
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primario" type="submit">
            Registrar consentimiento
          </button>
          <p className="nota-pie">En la fase 2 la familia firmará desde un enlace y quedará guardado el documento firmado.</p>
        </form>
      )}
    </section>
  )
}

