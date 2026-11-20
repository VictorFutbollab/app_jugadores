import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { href, ir, volver } from '../state/router'
import { Avatar, Cabecera, EstadoChip, Tendencia, Vacio } from '../ui/components'
import { Icon } from '../ui/Icon'
import { Campo, CamposEquipo } from './Acceso'
import * as R from '../db/remote'
import { categoria } from '../data/categorias'
import type { Errores } from '../auth/auth'
import { ESTADO_INFO, POSICION_NOMBRE, POSICION_ORDEN, fechaCorta, fechaLarga, iniciales, num0, num1, pct, uid } from '../logic/format'
import { tieneConsentimientoFicha, validarConsentimiento } from '../logic/privacy'
import {
  DIAS_SIN_EVALUAR,
  FILTROS_ADMIN,
  ROLES,
  ROL_NOMBRE,
  coincideBusqueda,
  csvJugadores,
  cumpleFiltro,
  dorsalLibre,
  filaAdmin,
  ordenarFilas,
  quedaAlgunAdmin,
  validarJugador,
  type ErroresJugador,
  type FiltroAdmin,
  type OrdenAdmin,
} from '../logic/admin'
import type { Consentimiento, ContactoFamilia, Cuenta, Estado, FirmanteTipo, Genero, Jugador, MiembroEquipo, Pierna, Posicion, Rol, TipoEstado } from '../model/types'

const hoyISO = () => new Date().toISOString().slice(0, 10)

/**
 * Segunda barrera en la interfaz (la primera es la redirección en App.tsx).
 * La protección real está en el servidor: aunque alguien forzara esta pantalla,
 * cada lectura y escritura de administración la rechaza la base de datos.
 */
function SinPermiso() {
  return (
    <>
      <Cabecera titulo="Administración" atras={() => volver({ nombre: 'inicio' })} />
      <Vacio>Solo los administradores del club pueden entrar aquí.</Vacio>
    </>
  )
}

// ═════════════════════════ Panel ═════════════════════════

export type SeccionAdmin = 'jugadores' | 'entrenadores' | 'actividad'

export function Admin({ seccion = 'jugadores' }: { seccion?: SeccionAdmin }) {
  const { esAdmin, equipos, equipoActivo, setEquipoActivo } = useApp()
  if (!esAdmin) return <SinPermiso />
  if (equipos.length === 0) {
    return (
      <>
        <Cabecera titulo="Administración" sub="Todavía no hay ningún equipo" />
        <NuevoEquipo />
      </>
    )
  }
  return (
    <>
      <Cabecera
        titulo="Administración"
        sub="Control de la plantilla y del cuerpo técnico"
        accion={
          equipos.length > 1 && (
            <select className="selector-equipo" value={equipoActivo} onChange={(e) => setEquipoActivo(e.target.value)} aria-label="Equipo">
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {e.entidad}
                </option>
              ))}
            </select>
          )
        }
      />
      <div className="segmentado admin-secciones" role="tablist" aria-label="Secciones de administración">
        {(
          [
            ['jugadores', 'Jugadores'],
            ['entrenadores', 'Entrenadores'],
            ['actividad', 'Actividad'],
          ] as const
        ).map(([s, n]) => (
          <button key={s} role="tab" aria-selected={seccion === s} className={seccion === s ? 'on' : ''} onClick={() => ir({ nombre: 'admin', seccion: s }, true)}>
            {n}
          </button>
        ))}
      </div>
      {seccion === 'entrenadores' ? <Entrenadores /> : seccion === 'actividad' ? <Actividad /> : <TablaJugadores />}
    </>
  )
}

// ───────────── Tabla de control ─────────────

const COLUMNAS: { id: OrdenAdmin | null; nombre: string; num?: boolean }[] = [
  { id: 'dorsal', nombre: 'Nº', num: true },
  { id: 'nombre', nombre: 'Jugador' },
  { id: null, nombre: 'Estado' },
  { id: 'media', nombre: 'Media', num: true },
  { id: 'asistencia', nombre: 'Asist.', num: true },
  { id: 'minutos', nombre: 'Min.', num: true },
  { id: 'ultima', nombre: 'Última eval.' },
  { id: null, nombre: 'Consent.' },
]

function TablaJugadores() {
  const { ds, resumen, externos, estadoDe } = useApp()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<FiltroAdmin>('activos')
  const [orden, setOrden] = useState<OrdenAdmin>('dorsal')
  const [asc, setAsc] = useState(true)

  const todas = useMemo(() => {
    const hoy = new Date()
    return ds.jugadores.filter((j) => !j.eliminadoEn).map((j) => filaAdmin(j, estadoDe(j.id), resumen.get(j.id), externos.get(j.id), hoy))
  }, [ds.jugadores, resumen, externos, estadoDe])
  const filas = ordenarFilas(
    todas.filter((f) => cumpleFiltro(f, filtro) && coincideBusqueda(f.j, q)),
    orden,
    asc,
  )
  const cuenta = (f: FiltroAdmin) => todas.filter((x) => cumpleFiltro(x, f)).length

  const ordenarPor = (o: OrdenAdmin) => {
    if (o === orden) setAsc((a) => !a)
    else {
      setOrden(o)
      setAsc(o === 'dorsal' || o === 'nombre') // números "mejor primero", textos de la A a la Z
    }
  }

  const exportar = () => {
    const blob = new Blob(['﻿' + csvJugadores(filas)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `futbollab-jugadores-${hoyISO()}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const KPIS: { f: FiltroAdmin; nombre: string }[] = [
    { f: 'activos', nombre: 'Activos' },
    { f: 'sin_consentimiento', nombre: 'Sin consentimiento' },
    { f: 'no_disponibles', nombre: 'No disponibles' },
    { f: 'sin_evaluar', nombre: `Sin evaluar ${DIAS_SIN_EVALUAR} d` },
  ]

  return (
    <>
      <div className="kpis admin-kpis">
        {KPIS.map((k) => (
          <button key={k.f} className={`kpi ${filtro === k.f ? 'on' : ''}`} onClick={() => setFiltro(k.f)} aria-pressed={filtro === k.f}>
            <span className="kpi-v num">{cuenta(k.f)}</span>
            <span className="kpi-e">{k.nombre}</span>
          </button>
        ))}
      </div>

      <div className="herramientas admin-herramientas">
        <input className="buscar" type="search" placeholder="Buscar por nombre o dorsal" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar jugador" />
        <button className="btn" onClick={exportar} disabled={filas.length === 0}>
          <Icon n="descargar" size={18} /> <span className="ocultar-movil">Exportar</span> CSV
        </button>
        <a className="btn primario" href={href({ nombre: 'admin-jugador', id: 'nuevo' })}>
          <Icon n="mas" size={18} /> Nuevo <span className="ocultar-movil">jugador</span>
        </a>
      </div>

      <div className="filtros" role="radiogroup" aria-label="Filtrar">
        {FILTROS_ADMIN.map((f) => (
          <button key={f.id} role="radio" aria-checked={filtro === f.id} className={`filtro ${filtro === f.id ? 'on' : ''}`} onClick={() => setFiltro(f.id)}>
            {f.nombre} <span className="filtro-n">{cuenta(f.id)}</span>
          </button>
        ))}
      </div>

      {filas.length === 0 ? (
        <Vacio>No hay jugadores con este filtro.</Vacio>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla-admin">
            <thead>
              <tr>
                {COLUMNAS.map((c) => (
                  <th key={c.nombre} className={c.num ? 'num' : ''} aria-sort={c.id && c.id === orden ? (asc ? 'ascending' : 'descending') : undefined}>
                    {c.id ? (
                      <button className="th-orden" onClick={() => ordenarPor(c.id!)}>
                        {c.nombre}
                        {c.id === orden && <span aria-hidden>{asc ? ' ▲' : ' ▼'}</span>}
                      </button>
                    ) : (
                      c.nombre
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const sinEvaluar = f.consentimiento && !f.j.archivado && (f.diasSinEvaluar == null || f.diasSinEvaluar >= DIAS_SIN_EVALUAR)
                return (
                  <tr key={f.j.id} className={f.j.archivado ? 'archivado' : ''} onClick={() => ir({ nombre: 'admin-jugador', id: f.j.id })}>
                    <td className="num dorsal-celda">{f.j.dorsal}</td>
                    <td>
                      <a className="celda-jugador" href={href({ nombre: 'admin-jugador', id: f.j.id })} onClick={(e) => e.stopPropagation()}>
                        <Avatar j={f.j} size={32} />
                        <span>
                          <strong>
                            {f.j.nombre} {f.j.apellidos}
                          </strong>
                          <span className="sub">
                            {f.j.posiciones?.[0] ? POSICION_NOMBRE[f.j.posiciones[0]] : '—'}
                            {f.j.archivado && ' · archivado'}
                          </span>
                        </span>
                      </a>
                    </td>
                    <td>{f.estado ? <EstadoChip e={f.estado} /> : '—'}</td>
                    <td className="num">
                      <strong>{num1(f.r?.media)}</strong>
                      {f.r?.media != null && (
                        <>
                          <br />
                          <Tendencia v={f.r.tendencia} />
                        </>
                      )}
                    </td>
                    <td className="num">{pct(f.x?.asistenciaPct)}</td>
                    <td className="num">{num0(f.x?.minutos)}</td>
                    <td className={sinEvaluar ? 'alerta' : ''}>
                      {f.r?.ultimaEvaluacion ? fechaCorta(f.r.ultimaEvaluacion) : '—'}
                      {sinEvaluar && f.diasSinEvaluar != null && <span className="sub"> · hace {f.diasSinEvaluar} d</span>}
                    </td>
                    <td>
                      {f.consentimiento ? (
                        <span className="chip familia">
                          <Icon n="check" size={13} /> Sí
                        </span>
                      ) : (
                        <span className="chip aviso">
                          <Icon n="aviso" size={13} /> Falta
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="nota-pie">
        {filas.length} de {todas.length} jugadores. Toca una fila para editar. El CSV exporta lo que ves, con separador «;» para Excel.
      </p>
    </>
  )
}

// ═════════════════════════ Alta y edición de un jugador ═════════════════════════

const PIERNAS: [Pierna, string][] = [
  ['derecha', 'Derecha'],
  ['izquierda', 'Izquierda'],
  ['ambas', 'Ambas'],
]
const TIPOS_ESTADO: TipoEstado[] = ['disponible', 'lesionado', 'enfermo', 'sancionado']
const FIRMANTES: [FirmanteTipo, string][] = [
  ['madre', 'Madre'],
  ['padre', 'Padre'],
  ['tutor_legal', 'Tutor legal'],
  ['jugador_mayor_14', 'El propio jugador (14 años o más)'],
]
const RELACIONES = ['Madre', 'Padre', 'Tutor legal', 'Otro familiar']
const contactoVacio = (): ContactoFamilia => ({ nombre: '', relacion: 'Madre', telefono: '', email: '' })
const consentimientoNuevo = (): Consentimiento => ({
  fecha: hoyISO(),
  firmante: '',
  firmanteTipo: 'madre',
  alcance: { ficha: true, fotos: false, notasVoz: false },
  version: '2026.1',
})

export function AdminJugador({ id }: { id: string }) {
  const { esAdmin, ds, usuarioId, estadoDe, guardarJugador, guardarEstado, borrarJugador, exportarJugador } = useApp()
  const nuevo = id === 'nuevo'
  const original = ds.jugadores.find((x) => x.id === id && !x.eliminadoEn)
  const equipoId = ds.equipos[0].id

  const [j, setJ] = useState<Jugador>(() => {
    if (original) return { ...original, contactos: original.contactos?.length ? original.contactos : [contactoVacio()] }
    const ahora = new Date().toISOString()
    return {
      id: `j-${uid()}`,
      creadoEn: ahora,
      actualizadoEn: ahora,
      creadoPor: usuarioId,
      equipoId,
      nombre: '',
      apellidos: '',
      dorsal: dorsalLibre(ds.jugadores, equipoId),
      foto: null,
      fechaNacimiento: null,
      posiciones: [],
      pierna: null,
      contactos: [contactoVacio()],
      consentimiento: null,
    }
  })
  const estadoPrevio = original ? estadoDe(original.id) : undefined
  const [est, setEst] = useState<Estado>(
    () =>
      estadoPrevio ?? {
        id: `st-${j.id}`,
        creadoEn: j.creadoEn,
        actualizadoEn: j.creadoEn,
        creadoPor: usuarioId,
        jugadorId: j.id,
        tipo: 'disponible',
        desde: hoyISO(),
        vueltaPrevista: null,
        nota: '',
      },
  )
  const [err, setErr] = useState<ErroresJugador>({})
  const [errConsent, setErrConsent] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)

  if (!esAdmin) return <SinPermiso />
  if (!nuevo && !original) {
    return (
      <>
        <Cabecera titulo="Jugador" atras={() => volver({ nombre: 'admin' })} />
        <Vacio>Este jugador no existe o se ha borrado por completo.</Vacio>
      </>
    )
  }

  const set = <K extends keyof Jugador>(k: K, v: Jugador[K]) => {
    setJ((x) => ({ ...x, [k]: v }))
    setAviso(null)
    if (k in err) setErr((e) => ({ ...e, [k]: undefined }))
  }
  const c = j.consentimiento
  const fichaPermitida = tieneConsentimientoFicha(j)
  const setConsent = (cambio: Partial<Consentimiento>) => {
    set('consentimiento', { ...(c ?? consentimientoNuevo()), ...cambio })
    setErrConsent(null)
  }
  const setContacto = (i: number, cambio: Partial<ContactoFamilia>) => set('contactos', (j.contactos ?? []).map((k, n) => (n === i ? { ...k, ...cambio } : k)))
  const togglePos = (p: Posicion) => {
    const pos = j.posiciones ?? []
    set('posiciones', pos.includes(p) ? pos.filter((x) => x !== p) : [...pos, p])
  }
  const setEstado = (cambio: Partial<Estado>) => {
    setEst((e) => ({ ...e, ...cambio }))
    setAviso(null)
  }

  const guardar = async () => {
    const e = validarJugador(j, ds.jugadores)
    setErr(e)
    let errorConsent: string | null = null
    if (c && !c.retiradoEn) {
      const v = validarConsentimiento(c, j.fechaNacimiento)
      if (!v.ok) errorConsent = v.error!
    }
    setErrConsent(errorConsent)
    if (Object.values(e).some(Boolean) || errorConsent) {
      setAviso('Revisa los campos marcados.')
      return
    }
    setGuardando(true)
    try {
      await guardarDeVerdad()
    } catch (e) {
      setAviso(`No se ha guardado: ${(e as Error).message}`)
    } finally {
      setGuardando(false)
    }
  }

  const guardarDeVerdad = async () => {
    {
      const limpio: Jugador = {
        ...j,
        nombre: j.nombre.trim(),
        apellidos: j.apellidos.trim(),
        contactos: (j.contactos ?? [])
          .map((k) => ({ ...k, nombre: k.nombre.trim(), telefono: k.telefono?.trim(), email: k.email?.trim() }))
          .filter((k) => k.nombre || k.telefono || k.email),
      }
      await guardarJugador(limpio)
      const estadoLimpio: Estado = { ...est, vueltaPrevista: est.tipo === 'disponible' ? null : est.vueltaPrevista || null, nota: est.nota?.trim() }
      if (nuevo || JSON.stringify(estadoLimpio) !== JSON.stringify(estadoPrevio)) await guardarEstado(estadoLimpio)
      if (nuevo) ir({ nombre: 'admin-jugador', id: limpio.id }, true)
      setJ({ ...limpio, contactos: limpio.contactos?.length ? limpio.contactos : [contactoVacio()] })
      setAviso(nuevo ? 'Jugador dado de alta.' : 'Cambios guardados.')
    }
  }

  const archivar = async (valor: boolean) => {
    if (!original) return
    if (!valor) {
      const e = validarJugador({ ...original, archivado: false }, ds.jugadores)
      if (e.dorsal) return setAviso(`No se puede recuperar: ${e.dorsal} Cambia antes el dorsal.`)
    }
    try {
      await guardarJugador({ ...original, archivado: valor })
    } catch (e) {
      return setAviso(`No se ha guardado: ${(e as Error).message}`)
    }
    setJ((x) => ({ ...x, archivado: valor }))
    setAviso(valor ? 'Jugador archivado: ya no aparece en la plantilla ni en la evaluación.' : 'Jugador recuperado.')
  }

  return (
    <>
      <Cabecera
        titulo={nuevo ? 'Nuevo jugador' : `${original!.dorsal} · ${original!.nombre} ${original!.apellidos.split(' ')[0]}`}
        sub={nuevo ? 'Alta en la plantilla' : j.archivado ? 'Archivado' : 'Edición del administrador'}
        atras={() => volver({ nombre: 'admin' })}
      />

      <div className="form">
        <fieldset className="grupo">
          <legend>Datos básicos</legend>
          <div className="fila-campos">
            <Campo etiqueta="Nombre" error={err.nombre}>
              <input value={j.nombre} onChange={(e) => set('nombre', e.target.value)} autoComplete="off" />
            </Campo>
            <Campo etiqueta="Dorsal" error={err.dorsal}>
              <input type="number" inputMode="numeric" min={1} max={99} value={Number.isNaN(j.dorsal) ? '' : j.dorsal} onChange={(e) => set('dorsal', e.target.valueAsNumber)} />
            </Campo>
          </div>
          <Campo etiqueta="Apellidos" error={err.apellidos}>
            <input value={j.apellidos} onChange={(e) => set('apellidos', e.target.value)} autoComplete="off" />
          </Campo>
          <p className="campo-ayuda">Nombre, dorsal y el contacto de la familia se pueden guardar siempre. El resto necesita el consentimiento.</p>
        </fieldset>

        <fieldset className="grupo">
          <legend>Contacto de la familia</legend>
          {(j.contactos ?? []).map((k, i) => (
            <div key={i} className="contacto">
              <div className="fila-campos ancha">
                <Campo etiqueta="Nombre">
                  <input value={k.nombre} onChange={(e) => setContacto(i, { nombre: e.target.value })} autoComplete="off" />
                </Campo>
                <Campo etiqueta="Relación">
                  <select value={k.relacion} onChange={(e) => setContacto(i, { relacion: e.target.value })}>
                    {RELACIONES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Campo>
              </div>
              <div className="fila-campos mitad">
                <Campo etiqueta="Teléfono">
                  <input type="tel" inputMode="tel" value={k.telefono ?? ''} onChange={(e) => setContacto(i, { telefono: e.target.value })} />
                </Campo>
                <Campo etiqueta="Email">
                  <input type="email" value={k.email ?? ''} onChange={(e) => setContacto(i, { email: e.target.value })} autoCapitalize="none" />
                </Campo>
              </div>
              {(j.contactos?.length ?? 0) > 1 && (
                <button type="button" className="enlace pequeno" onClick={() => set('contactos', j.contactos!.filter((_, n) => n !== i))}>
                  Quitar este contacto
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn" onClick={() => set('contactos', [...(j.contactos ?? []), contactoVacio()])}>
            <Icon n="mas" size={18} /> Añadir otro contacto
          </button>
        </fieldset>

        <fieldset className="grupo">
          <legend>Consentimiento RGPD</legend>
          {!c ? (
            <>
              <p className="aviso-permiso">Sin consentimiento solo se guardan el nombre, el dorsal y el contacto de la familia. No se puede evaluar ni guardar la ficha.</p>
              <button type="button" className="btn primario" onClick={() => setConsent({})}>
                Registrar consentimiento
              </button>
            </>
          ) : c.retiradoEn ? (
            <>
              <p className="aviso-permiso">
                Retirado el {fechaLarga(c.retiradoEn)}. Al guardar se eliminan de la ficha la fecha de nacimiento, las posiciones y la pierna.
              </p>
              <div className="botones">
                <button type="button" className="btn" onClick={() => setConsent({ retiradoEn: null })}>
                  Deshacer
                </button>
                <button type="button" className="btn primario" onClick={() => set('consentimiento', consentimientoNuevo())}>
                  Registrar uno nuevo
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="fila-campos ancha">
                <Campo etiqueta="Quién firma">
                  <select value={c.firmanteTipo} onChange={(e) => setConsent({ firmanteTipo: e.target.value as FirmanteTipo })}>
                    {FIRMANTES.map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Fecha">
                  <input type="date" value={c.fecha} max={hoyISO()} onChange={(e) => setConsent({ fecha: e.target.value })} />
                </Campo>
              </div>
              <Campo etiqueta="Nombre de quien firma">
                <input value={c.firmante} onChange={(e) => setConsent({ firmante: e.target.value })} autoComplete="off" />
              </Campo>
              <div className="checks-fila" role="group" aria-label="Autoriza">
                {(
                  [
                    ['ficha', 'Ficha y evaluaciones'],
                    ['fotos', 'Fotos'],
                    ['notasVoz', 'Notas de voz'],
                  ] as const
                ).map(([k, n]) => (
                  <label key={k} className="check">
                    <input type="checkbox" checked={c.alcance[k]} onChange={(e) => setConsent({ alcance: { ...c.alcance, [k]: e.target.checked } })} /> {n}
                  </label>
                ))}
              </div>
              {errConsent && (
                <p className="error" role="alert">
                  {errConsent}
                </p>
              )}
              {original?.consentimiento && !original.consentimiento.retiradoEn && (
                <button type="button" className="enlace pequeno" onClick={() => setConsent({ retiradoEn: new Date().toISOString() })}>
                  La familia retira el consentimiento
                </button>
              )}
              {!original?.consentimiento && (
                <button type="button" className="enlace pequeno" onClick={() => set('consentimiento', null)}>
                  Cancelar el registro
                </button>
              )}
            </>
          )}
        </fieldset>

        <fieldset className="grupo" disabled={!fichaPermitida}>
          <legend>Ficha deportiva</legend>
          {!fichaPermitida && <p className="aviso-permiso">Necesita el consentimiento de ficha para guardar estos datos.</p>}
          <Campo etiqueta="Fecha de nacimiento">
            <input type="date" value={j.fechaNacimiento ?? ''} max={hoyISO()} onChange={(e) => set('fechaNacimiento', e.target.value || null)} />
          </Campo>
          <div className="campo">
            <span className="campo-et">Posiciones (la primera que marques es la principal)</span>
            <div className="chips">
              {POSICION_ORDEN.map((p) => {
                const n = (j.posiciones ?? []).indexOf(p)
                return (
                  <button type="button" key={p} className={`chip-btn ${n >= 0 ? 'on' : ''}`} aria-pressed={n >= 0} onClick={() => togglePos(p)} title={POSICION_NOMBRE[p]}>
                    {p}
                    {n === 0 && ' ★'}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="campo">
            <span className="campo-et">Pierna dominante</span>
            <div className="segmentado pequeno" role="radiogroup" aria-label="Pierna dominante">
              {PIERNAS.map(([v, n]) => (
                <button type="button" key={v} role="radio" aria-checked={j.pierna === v} className={j.pierna === v ? 'on' : ''} onClick={() => set('pierna', j.pierna === v ? null : v)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="grupo">
          <legend>Disponibilidad</legend>
          <div className="segmentado pequeno estados-sel" role="radiogroup" aria-label="Estado">
            {TIPOS_ESTADO.map((t) => (
              <button type="button" key={t} role="radio" aria-checked={est.tipo === t} className={est.tipo === t ? 'on' : ''} onClick={() => setEstado({ tipo: t, desde: t === est.tipo ? est.desde : hoyISO() })}>
                {ESTADO_INFO[t].nombre}
              </button>
            ))}
          </div>
          <div className="fila-campos mitad">
            <Campo etiqueta="Desde">
              <input type="date" value={est.desde.slice(0, 10)} onChange={(e) => setEstado({ desde: e.target.value })} />
            </Campo>
            {est.tipo !== 'disponible' && (
              <Campo etiqueta="Vuelta prevista">
                <input type="date" value={est.vueltaPrevista?.slice(0, 10) ?? ''} min={est.desde.slice(0, 10)} onChange={(e) => setEstado({ vueltaPrevista: e.target.value || null })} />
              </Campo>
            )}
          </div>
          {est.tipo !== 'disponible' && (
            <Campo etiqueta="Nota" ayuda="Sin diagnósticos médicos: son datos de salud (art. 9 RGPD).">
              <input value={est.nota ?? ''} onChange={(e) => setEstado({ nota: e.target.value })} placeholder="Ej.: sigue el plan del fisio del club" />
            </Campo>
          )}
        </fieldset>
      </div>

      <div className="barra-accion">
        {aviso && (
          <p className={/^(Revisa|No se)/.test(aviso) ? 'error' : 'ok'} role="status">
            {aviso}
          </p>
        )}
        <div className="botones">
          <button className="btn" onClick={() => volver({ nombre: 'admin' })}>
            Volver
          </button>
          <button className="btn primario crece" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : nuevo ? 'Dar de alta' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {!nuevo && original && (
        <section className="bloque">
          <h2>Más acciones</h2>
          <div className="botones">
            {!original.archivado && tieneConsentimientoFicha(original) && (
              <a className="btn" href={href({ nombre: 'jugador', id: original.id })}>
                <Icon n="ojo" size={18} /> Ver ficha
              </a>
            )}
            <button className="btn" onClick={() => archivar(!original.archivado)}>
              {original.archivado ? 'Recuperar' : 'Archivar'}
            </button>
            <button className="btn" onClick={() => exportarJugador(original.id)}>
              <Icon n="descargar" size={18} /> Exportar datos
            </button>
            {!confirmarBorrar && (
              <button className="btn peligro" onClick={() => setConfirmarBorrar(true)}>
                <Icon n="papelera" size={18} /> Borrar todo
              </button>
            )}
          </div>
          <p className="nota-pie">Archivar lo saca de la plantilla sin perder su historial (por ejemplo, si deja el equipo). Se puede recuperar.</p>
          {confirmarBorrar && (
            <div className="confirmar" role="alertdialog" aria-label="Confirmar borrado">
              <p>
                Se borrarán para siempre la ficha, evaluaciones, pruebas, notas, estados, asistencia, minutos y carga de <strong>{original.nombre}</strong>. No se puede deshacer.
              </p>
              <div className="botones">
                <button className="btn" onClick={() => setConfirmarBorrar(false)}>
                  Cancelar
                </button>
                <button
                  className="btn peligro"
                  onClick={async () => {
                    try {
                      await borrarJugador(original.id)
                      ir({ nombre: 'admin' }, true)
                    } catch (e) {
                      setConfirmarBorrar(false)
                      setAviso(`No se ha borrado: ${(e as Error).message}`)
                    }
                  }}
                >
                  Sí, borrar todo
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )
}


// ═════════════════════════ Entrenadores y equipos ═════════════════════════

const PERMISOS: [keyof MiembroEquipo['permisos'], string][] = [
  ['verFicha', 'Ver la ficha'],
  ['evaluar', 'Evaluar'],
  ['verNotasPrivadas', 'Ver notas privadas'],
]

/** Permisos con los que entra cada rol al añadirlo (luego se ajustan uno a uno). */
const PERMISOS_POR_ROL: Record<Rol, MiembroEquipo['permisos']> = {
  entrenador_principal: { verFicha: true, verNotasPrivadas: true, evaluar: true },
  ayudante: { verFicha: true, verNotasPrivadas: false, evaluar: true },
  preparador_fisico: { verFicha: true, verNotasPrivadas: false, evaluar: false },
  coordinador: { verFicha: true, verNotasPrivadas: false, evaluar: false },
}

function useMensaje() {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const hecho = async (p: Promise<void>, t = 'Guardado.') => {
    try {
      await p
      setMsg({ ok: true, t })
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message })
    }
  }
  const nodo = msg && (
    <p className={msg.ok ? 'ok' : 'error'} role="status">
      {msg.t}
    </p>
  )
  return { hecho, nodo }
}

function FotoPerfil({ c }: { c?: Cuenta; nombre: string }) {
  const nombre = c?.nombre ?? '?'
  return c?.foto ? (
    <img src={c.foto} alt="" className="avatar" width={44} height={44} />
  ) : (
    <span className="avatar ini" style={{ width: 44, height: 44, fontSize: 17 }} aria-hidden>
      {iniciales(nombre, nombre.split(' ')[1] ?? '')}
    </span>
  )
}

function CasillaAdmin({ c, nombre, hecho }: { c: Cuenta; nombre: string; hecho: (p: Promise<void>, t?: string) => Promise<void> }) {
  const { perfiles, cambiarAdmin } = useApp()
  const esAdmin = c.role === 'admin'
  const bloqueado = esAdmin && !quedaAlgunAdmin(perfiles, c.id, false)
  return (
    <label className="check" title={bloqueado ? 'Tiene que quedar al menos un administrador' : undefined}>
      <input
        type="checkbox"
        checked={esAdmin}
        disabled={bloqueado}
        onChange={(e) => hecho(cambiarAdmin(c.id, e.target.checked), e.target.checked ? `${nombre} ya es administrador.` : `${nombre} ya no es administrador.`)}
      />{' '}
      Administrador
    </label>
  )
}

function Entrenadores() {
  const { ds, perfiles, cuenta: yo, guardarMiembro, quitarMiembro } = useApp()
  const { hecho, nodo } = useMensaje()
  const [quitar, setQuitar] = useState<string | null>(null)
  const [rolNuevo, setRolNuevo] = useState<Record<string, Rol>>({})
  const equipo = ds.equipos[0]
  const perfil = (id: string) => perfiles.find((p) => p.id === id)
  const nombreDe = (id: string) => perfil(id)?.nombre || ds.usuarios.find((u) => u.id === id)?.nombre || 'Sin nombre'
  const miembros = [...ds.miembros].sort((a, b) => ROLES.indexOf(a.rol) - ROLES.indexOf(b.rol) || nombreDe(a.usuarioId).localeCompare(nombreDe(b.usuarioId)))
  const fuera = perfiles.filter((p) => !miembros.some((m) => m.usuarioId === p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <>
      <p className="sub admin-intro">
        {miembros.length} personas en {equipo.nombre}. El entrenador principal siempre puede todo; al resto le das solo lo que necesite. Los cambios se guardan al momento y el servidor los vuelve a comprobar.
      </p>
      {nodo}
      <ul className="miembros">
        {miembros.map((m) => {
          const c = perfil(m.usuarioId)
          const principal = m.rol === 'entrenador_principal'
          const nombre = nombreDe(m.usuarioId)
          return (
            <li key={m.usuarioId} className="miembro">
              <div className="miembro-cab">
                <FotoPerfil c={c} nombre={nombre} />
                <div className="crece">
                  <strong>{nombre}</strong>
                  <span className="sub">{c ? `@${c.usuario} · ${c.email}` : 'Usuario sin perfil visible'}</span>
                  <span className="miembro-chips">
                    {c?.id === yo.id && <span className="chip">Tú</span>}
                    {c?.role === 'admin' && (
                      <span className="chip admin">
                        <Icon n="escudo" size={13} /> Admin
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="miembro-controles">
                <Campo etiqueta="Rol en el equipo">
                  <select value={m.rol} onChange={(e) => hecho(guardarMiembro({ ...m, rol: e.target.value as Rol }), `${nombre}: ahora es ${ROL_NOMBRE[e.target.value as Rol].toLowerCase()}.`)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROL_NOMBRE[r]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <div className="checks-fila" role="group" aria-label={`Permisos de ${nombre}`}>
                  {PERMISOS.map(([k, n]) => (
                    <label key={k} className="check">
                      <input type="checkbox" checked={principal || m.permisos[k]} disabled={principal} onChange={(e) => hecho(guardarMiembro({ ...m, permisos: { ...m.permisos, [k]: e.target.checked } }))} /> {n}
                    </label>
                  ))}
                  {c && <CasillaAdmin c={c} nombre={nombre} hecho={hecho} />}
                </div>
                {principal && <p className="campo-ayuda">Como entrenador principal tiene todos los permisos.</p>}
                {quitar === m.usuarioId ? (
                  <div className="botones">
                    <button className="btn" onClick={() => setQuitar(null)}>
                      Cancelar
                    </button>
                    <button className="btn peligro" onClick={() => hecho(quitarMiembro(m.equipoId, m.usuarioId), `${nombre} ya no está en ${equipo.nombre}.`).then(() => setQuitar(null))}>
                      Sí, quitar del equipo
                    </button>
                  </div>
                ) : (
                  <button className="enlace pequeno" onClick={() => setQuitar(m.usuarioId)}>
                    Quitar del equipo
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <section className="bloque">
        <h2>Cuentas que no están en este equipo</h2>
        {fuera.length === 0 ? (
          <p className="sub">Todas las cuentas registradas están ya en {equipo.nombre}.</p>
        ) : (
          <ul className="filas">
            {fuera.map((c) => (
              <li key={c.id}>
                <div className="fila fila-cuenta">
                  <FotoPerfil c={c} nombre={c.nombre} />
                  <span className="crece">
                    <strong>{c.nombre || c.usuario}</strong>
                    <span className="sub">
                      {' '}
                      · {c.email}
                      {c.entidad && ` · dice entrenar en ${c.entidad} (${c.equipo})`}
                    </span>
                  </span>
                  <select value={rolNuevo[c.id] ?? 'ayudante'} onChange={(e) => setRolNuevo((x) => ({ ...x, [c.id]: e.target.value as Rol }))} aria-label={`Rol para ${c.nombre}`}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROL_NOMBRE[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    onClick={() => {
                      const rol = rolNuevo[c.id] ?? 'ayudante'
                      return hecho(guardarMiembro({ equipoId: equipo.id, usuarioId: c.id, rol, permisos: PERMISOS_POR_ROL[rol] }), `${c.nombre} añadido a ${equipo.nombre}.`)
                    }}
                  >
                    Añadir
                  </button>
                  <CasillaAdmin c={c} nombre={c.nombre} hecho={hecho} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="nota-pie">Quien se registra entra como usuario normal y sin equipo: no ve ningún dato hasta que un administrador lo añade aquí.</p>
      </section>

      <NuevoEquipo />

      <section className="bloque">
        <h2>Cómo funciona</h2>
        <ul className="lista-texto">
          <li>Los permisos y el rol de administrador se guardan y se comprueban en el servidor, no en este dispositivo.</li>
          <li>Siempre tiene que quedar al menos un administrador.</li>
          <li>Para probar los permisos del ayudante, en Mi perfil elige «Ver la app como ayudante» (solo cambia lo que ves).</li>
          <li>Todo cambio de jugadores, equipos, miembros y roles queda en la pestaña Actividad.</li>
        </ul>
      </section>
    </>
  )
}

/** Alta de un equipo (también la usa el primer admin, cuando aún no hay ninguno). */
export function NuevoEquipo() {
  const { crearEquipo, cargarEjemplo, usuarioId } = useApp()
  const { hecho, nodo } = useMensaje()
  const [d, setD] = useState({ entidad: '', categoria: '', equipo: 'A', genero: 'masculino' as Genero })
  const [err, setErr] = useState<Errores>({})
  return (
    <section className="bloque">
      <h2>Nuevo equipo</h2>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault()
          const v: Errores = {}
          if (d.entidad.trim().length < 2) v.entidad = 'Escribe el club o la escuela.'
          if (!d.categoria) v.categoria = 'Elige una categoría.'
          if (!d.equipo.trim()) v.equipo = 'Indica el equipo (A, B…).'
          setErr(v)
          if (Object.values(v).some(Boolean)) return
          const cat = categoria(d.categoria)
          const ahora = new Date()
          const y = ahora.getMonth() >= 6 ? ahora.getFullYear() : ahora.getFullYear() - 1
          const iso = ahora.toISOString()
          await hecho(
            crearEquipo({
              id: `eq-${uid()}`,
              creadoEn: iso,
              actualizadoEn: iso,
              creadoPor: usuarioId,
              clubId: 'club',
              entidad: d.entidad.trim(),
              genero: d.genero,
              nombre: `${cat.nombre} ${d.equipo.trim()}`,
              categoria: cat.nombre,
              temporada: `${y}-${String((y + 1) % 100).padStart(2, '0')}`,
              modalidad: cat.modalidad,
              edadMin: cat.edadMin,
              edadMax: cat.edadMax,
            }),
            'Equipo creado. Ahora añade a su cuerpo técnico y a sus jugadores.',
          )
        }}
      >
        <CamposEquipo d={d} err={err} set={(k, v) => setD((x) => ({ ...x, [k]: v }))} />
        <div className="botones">
          <button className="btn primario" type="submit">
            Crear equipo
          </button>
          <button type="button" className="btn" onClick={() => hecho(cargarEjemplo(), 'Plantilla de ejemplo cargada en un equipo nuevo.')}>
            O cargar una plantilla de ejemplo
          </button>
        </div>
        {nodo}
      </form>
    </section>
  )
}

// ═════════════════════════ Registro de actividad ═════════════════════════

const ACCION: Record<string, string> = { INSERT: 'creó', UPDATE: 'modificó', DELETE: 'borró', CAMBIO_ROL: 'cambió el rol de' }
const TABLA: Record<string, string> = { jugadores: 'jugador', estados: 'estado', equipos: 'equipo', miembros: 'miembro del equipo', items: 'ítem', profiles: 'cuenta' }

function Actividad() {
  const { perfiles } = useApp()
  const [filas, setFilas] = useState<R.EntradaActividad[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    R.leerActividad(100)
      .then(setFilas)
      .catch((e: Error) => setError(e.message))
  }, [])
  const quien = (id: string | null) => (id ? (perfiles.find((p) => p.id === id)?.nombre ?? 'Cuenta borrada') : 'Proceso del servidor')
  const resumen = (x: R.EntradaActividad) => {
    if (!x.cambios) return ''
    if (x.accion === 'CAMBIO_ROL') {
      const r = x.cambios.role as { antes: string; despues: string }
      return `${r.antes} → ${r.despues}`
    }
    if (x.accion === 'UPDATE') return `Campos: ${Object.keys(x.cambios).join(', ')}`
    return Object.values(x.cambios).filter((v) => typeof v === 'string' || typeof v === 'number').join(' ')
  }
  if (error) return <p className="error">{error}</p>
  if (!filas) return <Vacio>Cargando…</Vacio>
  return (
    <>
      <p className="sub admin-intro">Últimas 100 acciones sobre jugadores, estados, equipos, miembros y roles. Lo guarda el servidor y nadie puede editarlo ni borrarlo desde la app.</p>
      {filas.length === 0 ? (
        <Vacio>Todavía no hay actividad.</Vacio>
      ) : (
        <ul className="actividad">
          {filas.map((x) => (
            <li key={x.id}>
              <span className="actividad-fecha">{new Date(x.creado_en).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span>
                <strong>{quien(x.actor)}</strong> {x.actor_es_admin && <span className="chip admin">Admin</span>} {ACCION[x.accion] ?? x.accion} {TABLA[x.tabla] ?? x.tabla}{' '}
                <code>{x.tabla === 'profiles' ? quien(x.registro_id) : x.registro_id}</code>
                {resumen(x) && <span className="sub"> · {resumen(x)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
