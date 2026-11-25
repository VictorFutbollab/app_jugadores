import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../state/store'
import { href, ir, volver, type Ruta } from '../state/router'
import { Avatar, AvatarFutbol, Cabecera, EstadoChip, Vacio } from '../ui/components'
import { Icon, type NombreIcono } from '../ui/Icon'
import { Campo, CamposEquipo } from './Acceso'
import * as R from '../db/remote'
import { categoria } from '../data/categorias'
import type { Errores } from '../auth/auth'
import { ESTADO_INFO, POSICION_NOMBRE, POSICION_ORDEN, fechaCorta, fechaLarga, num1, uid } from '../logic/format'
import { tieneConsentimientoFicha, validarConsentimiento } from '../logic/privacy'
import {
  FILTROS_ADMIN,
  ROLES,
  ROL_NOMBRE,
  TIPOS_ACCESO,
  coincideBusqueda,
  conAcceso,
  csvJugadores,
  cumpleFiltro,
  describirRegistro,
  dorsalLibre,
  filaAdmin,
  motivosAtencion,
  ordenarFilas,
  quedaAlgunAdmin,
  tipoAcceso,
  validarJugador,
  type ErroresJugador,
  type FilaAdmin,
  type FiltroAdmin,
  type MotivoAtencion,
  type OrdenAdmin,
  type TipoAcceso,
  type TipoRegistro,
} from '../logic/admin'
import type { Consentimiento, ContactoFamilia, Cuenta, Estado, FirmanteTipo, Genero, Jugador, MiembroEquipo, Pierna, Posicion, Rol, TipoEstado } from '../model/types'

const hoyISO = () => new Date().toISOString().slice(0, 10)

/** Bloque plegable con resumen de una línea: se ve todo de un vistazo y se abre solo lo que se quiere cambiar. */
function Seccion({ titulo, resumen, abierta, aviso, children }: { titulo: string; resumen: ReactNode; abierta?: boolean; aviso?: boolean; children: ReactNode }) {
  return (
    <details className="seccion" open={abierta}>
      <summary>
        <span className="seccion-tit">{titulo}</span>
        <span className={`seccion-res ${aviso ? 'aviso' : ''}`}>{resumen}</span>
        <Icon n="atras" size={18} className="seccion-flecha" />
      </summary>
      <div className="seccion-cuerpo">{children}</div>
    </details>
  )
}

/**
 * Segunda barrera en la interfaz (la primera es la redirección en App.tsx).
 * La protección real está en el servidor: aunque alguien forzara esta pantalla,
 * cada lectura y escritura de administración la rechaza la base de datos.
 */
function SinPermiso() {
  const { cerrarSesion } = useApp()
  return (
    <>
      <Cabecera titulo="Administración" />
      <Vacio>Solo los administradores del club pueden entrar aquí.</Vacio>
      <button className="btn ancho" onClick={cerrarSesion}>
        <Icon n="salir" /> Cerrar sesión
      </button>
    </>
  )
}

// ═════════════════════════ Panel ═════════════════════════

export type SeccionAdmin = 'resumen' | 'jugadores' | 'entrenadores' | 'actividad'

const MENU: { id: SeccionAdmin; nombre: string; icono: NombreIcono }[] = [
  { id: 'resumen', nombre: 'Resumen', icono: 'inicio' },
  { id: 'jugadores', nombre: 'Jugadores', icono: 'plantilla' },
  { id: 'entrenadores', nombre: 'Entrenadores', icono: 'familia' },
  { id: 'actividad', nombre: 'Actividad', icono: 'reloj' },
]

/**
 * Zona de administración independiente: su propio menú y sin la barra del entrenador.
 * La interfaz solo se muestra a admins; cada operación la vuelve a comprobar el servidor.
 */
export function Admin({ seccion = 'resumen', jugadorId }: { seccion?: SeccionAdmin; jugadorId?: string }) {
  const { esAdmin, equipos, equipoActivo, setEquipoActivo, cerrarSesion } = useApp()
  if (!esAdmin) return <SinPermiso />
  if (equipos.length === 0) {
    return (
      <div className="admin-sin-menu">
        <Cabecera titulo="Administración" sub="Empieza creando tu primer equipo" />
        <NuevoEquipo />
        <button className="btn ancho" onClick={cerrarSesion} style={{ marginTop: 16 }}>
          <Icon n="salir" /> Cerrar sesión
        </button>
      </div>
    )
  }
  return (
    <div className="admin-marco">
      <nav className="admin-menu" aria-label="Administración">
        <span className="admin-menu-tit">Administración</span>
        {MENU.map((m) => (
          <a key={m.id} href={href({ nombre: 'admin', seccion: m.id })} aria-label={m.nombre} title={m.nombre} className={seccion === m.id ? 'on' : ''} aria-current={seccion === m.id ? 'page' : undefined}>
            <Icon n={m.icono} size={20} />
            <span>{m.nombre}</span>
          </a>
        ))}
        <button type="button" className="admin-salir" onClick={cerrarSesion} aria-label="Cerrar sesión" title="Cerrar sesión">
          <Icon n="salir" size={20} />
          <span>Cerrar sesión</span>
        </button>
      </nav>
      <div className="admin-contenido">
        {equipos.length > 1 && !jugadorId && (
          <label className="admin-equipo">
            <span>Equipo</span>
            <select value={equipoActivo} onChange={(e) => setEquipoActivo(e.target.value)}>
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {e.entidad}
                </option>
              ))}
            </select>
          </label>
        )}
        {jugadorId ? <AdminJugador id={jugadorId} /> : seccion === 'jugadores' ? <TablaJugadores /> : seccion === 'entrenadores' ? <Entrenadores /> : seccion === 'actividad' ? <Actividad /> : <Resumen />}
      </div>
    </div>
  )
}

const MOTIVO: Record<MotivoAtencion, { texto: string; clase: string }> = {
  consentimiento: { texto: 'Falta consentimiento', clase: 'aviso' },
  no_disponible: { texto: 'No disponible', clase: 'peligro' },
  sin_evaluar: { texto: 'Sin evaluar', clase: 'neutro' },
}

function Motivos({ f }: { f: FilaAdmin }) {
  return (
    <span className="motivos">
      {motivosAtencion(f).map((m) => (
        <span key={m} className={`chip ${MOTIVO[m].clase}`}>
          {MOTIVO[m].texto}
        </span>
      ))}
    </span>
  )
}

function useFilas() {
  const { ds, resumen, externos, estadoDe } = useApp()
  return useMemo(() => {
    const hoy = new Date()
    return ds.jugadores.filter((j) => !j.eliminadoEn).map((j) => filaAdmin(j, estadoDe(j.id), resumen.get(j.id), externos.get(j.id), hoy))
  }, [ds.jugadores, resumen, externos, estadoDe])
}

/** Personas registradas que no están en ningún equipo (no ven nada hasta que un admin las añade). */
function useEsperando() {
  const { perfiles, miembrosTodos } = useApp()
  return perfiles.filter((p) => p.role !== 'admin' && !miembrosTodos.some((m) => m.usuarioId === p.id))
}

// ───────────── Resumen (portada) ─────────────

function Tarjeta({ to, valor, nombre, aviso }: { to: Ruta; valor: number; nombre: string; aviso?: boolean }) {
  return (
    <a href={href(to)} className={`admin-tarjeta ${aviso && valor > 0 ? 'aviso' : ''}`}>
      <span className="admin-tarjeta-v num">{valor}</span>
      <span className="admin-tarjeta-e">{nombre}</span>
    </a>
  )
}

function Resumen() {
  const { ds } = useApp()
  const filas = useFilas()
  const esperando = useEsperando()
  const [verTodos, setVerTodos] = useState(false)
  const equipo = ds.equipos[0]
  const activos = filas.filter((f) => !f.j.archivado)
  const atencion = activos.filter((f) => motivosAtencion(f).length > 0)
  const lista = verTodos ? atencion : atencion.slice(0, 5)

  return (
    <>
      <Cabecera titulo="Resumen" sub={`${equipo.nombre} · ${equipo.entidad} · temporada ${equipo.temporada}`} />
      <div className="admin-tarjetas">
        <Tarjeta to={{ nombre: 'admin', seccion: 'jugadores' }} valor={activos.length} nombre="Jugadores activos" />
        <Tarjeta to={{ nombre: 'admin', seccion: 'jugadores' }} valor={atencion.length} nombre="Necesitan atención" aviso />
        <Tarjeta to={{ nombre: 'admin', seccion: 'entrenadores' }} valor={ds.miembros.length} nombre="Cuerpo técnico" />
        <Tarjeta to={{ nombre: 'admin', seccion: 'entrenadores' }} valor={esperando.length} nombre="Esperan equipo" aviso />
      </div>

      <div className="admin-acciones">
        <a className="btn primario" href={href({ nombre: 'admin-jugador', id: 'nuevo' })}>
          <Icon n="mas" size={18} /> Dar de alta un jugador
        </a>
        {esperando.length > 0 && (
          <a className="btn" href={href({ nombre: 'admin', seccion: 'entrenadores' })}>
            <Icon n="familia" size={18} /> Aceptar entrenadores ({esperando.length})
          </a>
        )}
      </div>

      <section className="bloque">
        <h2>Necesitan atención</h2>
        {atencion.length === 0 ? (
          <p className="ok con-icono">
            <Icon n="check" size={18} /> Todo en orden: nadie necesita nada ahora mismo.
          </p>
        ) : (
          <>
            <ul className="filas">
              {lista.map((f) => (
                <li key={f.j.id}>
                  <a href={href({ nombre: 'admin-jugador', id: f.j.id })} className="fila">
                    <Avatar j={f.j} size={36} />
                    <span className="num dorsal-mini">{f.j.dorsal}</span>
                    <span className="crece">
                      {f.j.nombre} {f.j.apellidos.split(' ')[0]}
                    </span>
                    <Motivos f={f} />
                  </a>
                </li>
              ))}
            </ul>
            {atencion.length > 5 && (
              <button className="enlace pequeno" onClick={() => setVerTodos((v) => !v)}>
                {verTodos ? 'Ver menos' : `Ver los ${atencion.length}`}
              </button>
            )}
          </>
        )}
      </section>

      <ActividadReciente />
    </>
  )
}

// ───────────── Jugadores ─────────────

const COLUMNAS: { id: OrdenAdmin | null; nombre: string; num?: boolean; clase?: string }[] = [
  { id: 'dorsal', nombre: 'Nº', num: true },
  { id: 'nombre', nombre: 'Jugador' },
  { id: null, nombre: 'Estado', clase: 'col-estado' },
  { id: 'media', nombre: 'Media', num: true, clase: 'col-media' },
  { id: null, nombre: 'Avisos', clase: 'col-avisos' },
]

function TablaJugadores() {
  const filasTodas = useFilas()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<FiltroAdmin>('activos')
  const [orden, setOrden] = useState<OrdenAdmin>('dorsal')
  const [asc, setAsc] = useState(true)

  const filas = ordenarFilas(
    filasTodas.filter((f) => cumpleFiltro(f, filtro) && coincideBusqueda(f.j, q)),
    orden,
    asc,
  )
  const cuenta = (f: FiltroAdmin) => filasTodas.filter((x) => cumpleFiltro(x, f)).length

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

  return (
    <>
      <Cabecera
        titulo="Jugadores"
        sub={`${cuenta('activos')} activos`}
        accion={
          <a className="btn primario" href={href({ nombre: 'admin-jugador', id: 'nuevo' })}>
            <Icon n="mas" size={18} /> Alta
          </a>
        }
      />

      <div className="segmentado admin-filtro" role="radiogroup" aria-label="Filtrar">
        {FILTROS_ADMIN.map((f) => (
          <button key={f.id} role="radio" aria-checked={filtro === f.id} className={filtro === f.id ? 'on' : ''} onClick={() => setFiltro(f.id)}>
            {f.nombre} <span className="filtro-n">{cuenta(f.id)}</span>
          </button>
        ))}
      </div>
      <input className="buscar admin-buscar" type="search" placeholder="Buscar por nombre o dorsal" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar jugador" />

      {filas.length === 0 ? (
        <Vacio>{filtro === 'atencion' ? 'Nadie necesita atención ahora mismo.' : 'No hay jugadores con este filtro.'}</Vacio>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla-admin">
            <thead>
              <tr>
                {COLUMNAS.map((c) => (
                  <th key={c.nombre} className={`${c.num ? 'num' : ''} ${c.clase ?? ''}`} aria-sort={c.id && c.id === orden ? (asc ? 'ascending' : 'descending') : undefined}>
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
              {filas.map((f) => (
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
                  <td className="col-estado">{f.estado ? <EstadoChip e={f.estado} /> : '—'}</td>
                  <td className="num col-media">
                    <strong>{num1(f.r?.media)}</strong>
                  </td>
                  <td className="col-avisos">
                    <Motivos f={f} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="admin-pie">
        <span className="nota-pie">
          {filas.length} de {filasTodas.length} jugadores · toca uno para editarlo
        </span>
        <button className="enlace pequeno" onClick={exportar} disabled={filas.length === 0}>
          Exportar a Excel (CSV)
        </button>
      </div>
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

  const k0 = j.contactos?.find((k) => k.nombre || k.telefono)
  const resumenContacto = k0 ? `${k0.nombre || k0.relacion}${k0.telefono ? ` · ${k0.telefono}` : ''}` : 'Sin contacto'
  const resumenConsent = !c ? 'Pendiente: sin él solo se guardan nombre y dorsal' : c.retiradoEn ? `Retirado el ${fechaCorta(c.retiradoEn)}` : `Firmado${c.firmante ? ` por ${c.firmante}` : ''} · ${fechaCorta(c.fecha)}`
  const resumenFicha = !fichaPermitida ? 'Necesita consentimiento' : [j.posiciones?.length ? j.posiciones.join(', ') : null, j.fechaNacimiento ? `nacido en ${j.fechaNacimiento.slice(0, 4)}` : null, j.pierna ? `pierna ${j.pierna}` : null].filter(Boolean).join(' · ') || 'Sin completar'
  const resumenEstado = `${ESTADO_INFO[est.tipo].nombre}${est.tipo !== 'disponible' && est.vueltaPrevista ? ` · vuelve el ${fechaCorta(est.vueltaPrevista)}` : ''}`

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
        <Seccion titulo="Datos básicos" resumen={j.nombre ? `${j.nombre} ${j.apellidos} · dorsal ${Number.isNaN(j.dorsal) ? '—' : j.dorsal}` : 'Nombre, apellidos y dorsal'} abierta>
        <fieldset className="grupo plano">
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
        </Seccion>

        <Seccion titulo="Contacto de la familia" resumen={resumenContacto} abierta={nuevo}>
        <fieldset className="grupo plano">
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
        </Seccion>

        <Seccion titulo="Consentimiento" resumen={resumenConsent} aviso={!fichaPermitida} abierta={nuevo || !!errConsent}>
        <fieldset className="grupo plano">
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
        </Seccion>

        <Seccion titulo="Ficha deportiva" resumen={resumenFicha}>
        <fieldset className="grupo plano" disabled={!fichaPermitida}>
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
        </Seccion>

        <Seccion titulo="Disponibilidad" resumen={resumenEstado} aviso={est.tipo !== 'disponible'}>
        <fieldset className="grupo plano">
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
        </Seccion>
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

const PUESTOS: Rol[] = ['ayudante', 'preparador_fisico', 'coordinador']

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
    <p className={`aviso-flotante ${msg.ok ? 'ok' : 'error'}`} role="status">
      {msg.t}
    </p>
  )
  return { hecho, nodo }
}

function FotoPerfil({ c, nombre, size = 40 }: { c?: Cuenta; nombre: string; size?: number }) {
  return c?.foto ? (
    <img src={c.foto} alt="" className="avatar redondo" width={size} height={size} />
  ) : (
    <AvatarFutbol size={size} className="avatar redondo" etiqueta={`Foto de ${nombre}`} />
  )
}

function SelectorAcceso({ valor, onCambio, etiqueta }: { valor: TipoAcceso; onCambio: (t: Exclude<TipoAcceso, 'personalizado'>) => void; etiqueta: string }) {
  return (
    <select className="selector-acceso" value={valor} onChange={(e) => onCambio(e.target.value as Exclude<TipoAcceso, 'personalizado'>)} aria-label={etiqueta}>
      {TIPOS_ACCESO.map((t) => (
        <option key={t.id} value={t.id}>
          {t.nombre}
        </option>
      ))}
      {valor === 'personalizado' && (
        <option value="personalizado" disabled>
          Personalizado
        </option>
      )}
    </select>
  )
}

function Entrenadores() {
  const { ds, perfiles, cuenta: yo, guardarMiembro, quitarMiembro, cambiarAdmin } = useApp()
  const { hecho, nodo } = useMensaje()
  const esperando = useEsperando()
  const [accesoNuevo, setAccesoNuevo] = useState<Record<string, Exclude<TipoAcceso, 'personalizado'>>>({})
  const [quitar, setQuitar] = useState<string | null>(null)
  const equipo = ds.equipos[0]
  const perfil = (id: string) => perfiles.find((p) => p.id === id)
  const nombreDe = (id: string) => perfil(id)?.nombre || ds.usuarios.find((u) => u.id === id)?.nombre || 'Sin nombre'
  const miembros = [...ds.miembros].sort((a, b) => ROLES.indexOf(a.rol) - ROLES.indexOf(b.rol) || nombreDe(a.usuarioId).localeCompare(nombreDe(b.usuarioId)))
  const otras = perfiles.filter((p) => !miembros.some((m) => m.usuarioId === p.id) && !esperando.some((e) => e.id === p.id))

  const anadir = (c: Cuenta) => {
    const t = accesoNuevo[c.id] ?? 'ayudante'
    return hecho(guardarMiembro(conAcceso({ equipoId: equipo.id, usuarioId: c.id, rol: 'ayudante', permisos: { verFicha: false, verNotasPrivadas: false, evaluar: false } }, t)), `${c.nombre || c.usuario} ya está en ${equipo.nombre}.`)
  }
  const FilaCuenta = ({ c }: { c: Cuenta }) => (
    <li className="fila fila-cuenta">
      <FotoPerfil c={c} nombre={c.nombre} />
      <span className="crece">
        <strong>{c.nombre || c.usuario}</strong>
        <span className="sub">
          {c.email}
          {c.entidad && ` · dice entrenar en ${c.entidad}${c.equipo ? ` (${c.equipo})` : ''}`}
        </span>
      </span>
      <SelectorAcceso valor={accesoNuevo[c.id] ?? 'ayudante'} onCambio={(t) => setAccesoNuevo((x) => ({ ...x, [c.id]: t }))} etiqueta={`Acceso para ${c.nombre}`} />
      <button className="btn primario" onClick={() => anadir(c)}>
        Añadir
      </button>
    </li>
  )

  return (
    <>
      <Cabecera titulo="Entrenadores" sub={`${miembros.length} en ${equipo.nombre}`} />
      {nodo}

      {esperando.length > 0 && (
        <section className="bloque destacado">
          <h2>Esperan equipo · {esperando.length}</h2>
          <p className="sub">Se han registrado y aún no ven nada. Elige su acceso y añádelos a {equipo.nombre}.</p>
          <ul className="filas">
            {esperando.map((c) => (
              <FilaCuenta key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}

      <section className="bloque">
        <h2>Cuerpo técnico de {equipo.nombre}</h2>
        <ul className="miembros-lista">
          {miembros.map((m) => {
            const c = perfil(m.usuarioId)
            const nombre = nombreDe(m.usuarioId)
            const acceso = tipoAcceso(m)
            const principal = m.rol === 'entrenador_principal'
            const bloqueaAdmin = c?.role === 'admin' && !quedaAlgunAdmin(perfiles, c.id, false)
            return (
              <li key={m.usuarioId} className="miembro-fila">
                <div className="miembro-linea">
                  <FotoPerfil c={c} nombre={nombre} />
                  <span className="crece">
                    <strong>{nombre}</strong>
                    <span className="miembro-chips">
                      {c?.id === yo.id && <span className="chip">Tú</span>}
                      {c?.role === 'admin' && (
                        <span className="chip admin">
                          <Icon n="escudo" size={13} /> Admin
                        </span>
                      )}
                      <span className="sub">{acceso === 'personalizado' ? 'Acceso personalizado' : TIPOS_ACCESO.find((t) => t.id === acceso)!.descripcion}</span>
                    </span>
                  </span>
                  <SelectorAcceso valor={acceso} onCambio={(t) => hecho(guardarMiembro(conAcceso(m, t)), `${nombre}: ${TIPOS_ACCESO.find((x) => x.id === t)!.nombre.toLowerCase()}.`)} etiqueta={`Acceso de ${nombre}`} />
                </div>
                <details className="mas-opciones">
                  <summary>Más opciones</summary>
                  <div className="mas-opciones-cuerpo">
                    {!principal && (
                      <Campo etiqueta="Puesto">
                        <select value={m.rol} onChange={(e) => hecho(guardarMiembro({ ...m, rol: e.target.value as Rol }))}>
                          {PUESTOS.map((r) => (
                            <option key={r} value={r}>
                              {ROL_NOMBRE[r]}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    )}
                    <div className="checks-fila" role="group" aria-label={`Permisos de ${nombre}`}>
                      {PERMISOS.map(([k, n]) => (
                        <label key={k} className="check">
                          <input type="checkbox" checked={principal || m.permisos[k]} disabled={principal} onChange={(e) => hecho(guardarMiembro({ ...m, permisos: { ...m.permisos, [k]: e.target.checked } }))} /> {n}
                        </label>
                      ))}
                      {c && (
                        <label className="check" title={bloqueaAdmin ? 'Tiene que quedar al menos un administrador' : undefined}>
                          <input type="checkbox" checked={c.role === 'admin'} disabled={bloqueaAdmin} onChange={(e) => hecho(cambiarAdmin(c.id, e.target.checked), e.target.checked ? `${nombre} ya es administrador.` : `${nombre} ya no es administrador.`)} /> Administrador del club
                        </label>
                      )}
                    </div>
                    {quitar === m.usuarioId ? (
                      <div className="confirmar">
                        <p>
                          ¿Quitar a <strong>{nombre}</strong> de {equipo.nombre}? Dejará de ver a sus jugadores. Su cuenta no se borra.
                        </p>
                        <div className="botones">
                          <button className="btn" onClick={() => setQuitar(null)}>
                            Cancelar
                          </button>
                          <button className="btn peligro" onClick={() => hecho(quitarMiembro(m.equipoId, m.usuarioId), `${nombre} ya no está en ${equipo.nombre}.`).then(() => setQuitar(null))}>
                            Sí, quitar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="enlace pequeno peligro-txt" onClick={() => setQuitar(m.usuarioId)}>
                        Quitar del equipo
                      </button>
                    )}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
        {miembros.length === 0 && (
          <p className="sub" style={{ margin: 0 }}>
            Todavía no hay nadie en este equipo. Añade abajo a un entrenador que ya tenga cuenta, o pídele que se registre y aparecerá en "Esperan equipo".
          </p>
        )}
      </section>

      {otras.length > 0 && (
        <details className="bloque plegable">
          <summary>
            <h2>Añadir a alguien de otro equipo · {otras.length}</h2>
          </summary>
          <ul className="filas">
            {otras.map((c) => (
              <FilaCuenta key={c.id} c={c} />
            ))}
          </ul>
        </details>
      )}

      <details className="bloque plegable">
        <summary>
          <h2>Crear otro equipo</h2>
        </summary>
        <NuevoEquipo sinTitulo />
      </details>
    </>
  )
}

/** Alta de un equipo (también la usa el primer admin, cuando aún no hay ninguno). */
export function NuevoEquipo({ sinTitulo }: { sinTitulo?: boolean }) {
  const { crearEquipo, cargarEjemplo, usuarioId } = useApp()
  const { hecho, nodo } = useMensaje()
  const [d, setD] = useState({ entidad: '', categoria: '', equipo: 'A', genero: 'masculino' as Genero })
  const [err, setErr] = useState<Errores>({})
  const contenido = (
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
          O probar con una plantilla de ejemplo
        </button>
      </div>
      {nodo}
    </form>
  )
  if (sinTitulo) return contenido
  return (
    <section className="bloque">
      <h2>Nuevo equipo</h2>
      {contenido}
    </section>
  )
}

// ═════════════════════════ Registro de actividad ═════════════════════════

function useNombresRegistro() {
  const { ds, perfiles, equipos } = useApp()
  return useMemo(
    () => ({
      jugador: (id: string) => {
        const j = ds.jugadores.find((x) => x.id === id)
        return j ? `${j.nombre} ${j.apellidos.split(' ')[0]}` : undefined
      },
      jugadorDeEstado: (id: string) => ds.estados.find((e) => e.id === id)?.jugadorId ?? (id.startsWith('st-') ? id.slice(3) : undefined),
      persona: (id: string) => {
        const p = perfiles.find((x) => x.id === id)
        return p ? p.nombre || p.usuario : undefined
      },
      equipo: (id: string) => equipos.find((e) => e.id === id)?.nombre,
    }),
    [ds, perfiles, equipos],
  )
}

function useActividad(limite: number) {
  const [filas, setFilas] = useState<R.EntradaActividad[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    R.leerActividad(limite)
      .then(setFilas)
      .catch((e: Error) => setError(e.message))
  }, [limite])
  return { filas, error }
}

function FraseActividad({ x, conFecha }: { x: R.EntradaActividad; conFecha?: boolean }) {
  const { perfiles } = useApp()
  const nombres = useNombresRegistro()
  const quien = x.actor ? (perfiles.find((p) => p.id === x.actor)?.nombre ?? 'Una cuenta borrada') : 'El servidor'
  const d = describirRegistro(x, nombres)
  const f = new Date(x.creado_en)
  return (
    <li className="actividad-fila">
      <span className={`actividad-punto ${d.tipo}`} aria-hidden />
      <span className="crece">
        <strong>{quien}</strong> {d.texto}
      </span>
      <span className="actividad-hora">{conFecha ? f.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' · ' : ''}{f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
    </li>
  )
}

function ActividadReciente() {
  const { filas, error } = useActividad(5)
  if (error || !filas || filas.length === 0) return null
  return (
    <section className="bloque">
      <h2>Últimos cambios</h2>
      <ul className="actividad">
        {filas.map((x) => (
          <FraseActividad key={x.id} x={x} conFecha />
        ))}
      </ul>
      <a className="enlace pequeno" href={href({ nombre: 'admin', seccion: 'actividad' })}>
        Ver toda la actividad
      </a>
    </section>
  )
}

const FILTROS_ACTIVIDAD: { id: TipoRegistro | 'todo'; nombre: string }[] = [
  { id: 'todo', nombre: 'Todo' },
  { id: 'jugadores', nombre: 'Jugadores' },
  { id: 'equipo', nombre: 'Equipos y accesos' },
  { id: 'roles', nombre: 'Administradores' },
]

function Actividad() {
  const { filas, error } = useActividad(200)
  const nombres = useNombresRegistro()
  const [filtro, setFiltro] = useState<TipoRegistro | 'todo'>('todo')
  if (error) return <p className="error">{error}</p>
  if (!filas) return <Vacio>Cargando…</Vacio>
  const visibles = filas.filter((x) => filtro === 'todo' || describirRegistro(x, nombres).tipo === filtro)
  const dias = new Map<string, R.EntradaActividad[]>()
  for (const x of visibles) {
    const d = new Date(x.creado_en).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    dias.set(d, [...(dias.get(d) ?? []), x])
  }
  return (
    <>
      <Cabecera titulo="Actividad" sub="Quién cambió qué. Lo guarda el servidor y nadie puede editarlo ni borrarlo." />
      <div className="filtros" role="radiogroup" aria-label="Filtrar actividad">
        {FILTROS_ACTIVIDAD.map((f) => (
          <button key={f.id} role="radio" aria-checked={filtro === f.id} className={`filtro ${filtro === f.id ? 'on' : ''}`} onClick={() => setFiltro(f.id)}>
            {f.nombre}
          </button>
        ))}
      </div>
      {visibles.length === 0 ? (
        <Vacio>Todavía no hay actividad de este tipo.</Vacio>
      ) : (
        [...dias].map(([dia, xs]) => (
          <section key={dia} className="bloque">
            <h2>{dia}</h2>
            <ul className="actividad">
              {xs.map((x) => (
                <FraseActividad key={x.id} x={x} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
