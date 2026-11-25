import { useState } from 'react'
import { useApp } from '../state/store'
import { volver, type Ruta } from '../state/router'
import { Cabecera, Vacio } from '../ui/components'
import { Campo } from './Acceso'
import { CATEGORIAS } from '../data/categorias'
import { uid } from '../logic/format'
import { GENEROS, MODALIDADES, accionesEntrenador, temporadaActual, validarEquipo, type DatosEquipo, type ErroresEquipo } from '../logic/permisos'
import type { Equipo as TEquipo } from '../model/types'

/**
 * Crear (id "nuevo") o editar un equipo desde el panel del entrenador.
 * Crear: R.crearEquipo → inf_crear_equipo (quien lo crea queda como entrenador principal).
 * Editar: R.guardar('equipos') → inf_guardar_equipo (combina con lo que guardan otras apps).
 */
export function EquipoForm({ id }: { id: string }) {
  const { equipos, tipoCuenta, puedeEditar, equipoActivo, crearEquipo, editarEquipo, usuarioId } = useApp()
  const nuevo = id === 'nuevo'
  const original = equipos.find((e) => e.id === id)
  const acciones = accionesEntrenador({ tipoCuenta, puedeEditar: puedeEditar && original?.id === equipoActivo })
  const salida: Ruta = nuevo ? { nombre: 'inicio' } : { nombre: 'plantilla' }

  const [d, setD] = useState<DatosEquipo>(() => ({
    nombre: original?.nombre ?? '',
    categoria: original?.categoria ?? '',
    modalidad: original?.modalidad ?? 'F7',
    genero: original?.genero ?? 'masculino',
    temporada: original?.temporada ?? temporadaActual(),
    entidad: original?.entidad ?? '',
  }))
  const [err, setErr] = useState<ErroresEquipo>({})
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  if (nuevo ? !acciones.crearEquipo : !acciones.editarEquipo) {
    return (
      <>
        <Cabecera titulo={nuevo ? 'Nuevo equipo' : 'Equipo'} atras={() => volver(salida)} />
        <Vacio>{nuevo ? 'Los equipos los crea el entrenador. Si eres familiar o delegado, pídele el código del equipo.' : 'Esto solo lo puede cambiar el entrenador.'}</Vacio>
      </>
    )
  }
  if (!nuevo && !original) {
    return (
      <>
        <Cabecera titulo="Equipo" atras={() => volver(salida)} />
        <Vacio>Este equipo no existe o ya no tienes acceso.</Vacio>
      </>
    )
  }

  const set = <K extends keyof DatosEquipo>(k: K, v: DatosEquipo[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    setErr((e) => ({ ...e, [k]: undefined }))
    setAviso(null)
  }
  const elegirCategoria = (nombre: string) => {
    const cat = CATEGORIAS.find((c) => c.nombre === nombre)
    setD((x) => ({ ...x, categoria: nombre, modalidad: cat?.modalidad ?? x.modalidad }))
    setErr((e) => ({ ...e, categoria: undefined }))
    setAviso(null)
  }

  const guardar = async () => {
    const v = validarEquipo(d)
    setErr(v)
    if (Object.values(v).some(Boolean)) return setAviso({ ok: false, t: 'Revisa los campos marcados.' })
    const cat = CATEGORIAS.find((c) => c.nombre === d.categoria)
    const limpio = { ...d, nombre: d.nombre.trim(), entidad: d.entidad.trim(), temporada: d.temporada.trim(), edadMin: cat?.edadMin ?? original?.edadMin ?? 0, edadMax: cat?.edadMax ?? original?.edadMax ?? 99 }
    const ahora = new Date().toISOString()
    setGuardando(true)
    try {
      if (nuevo) {
        const e: TEquipo = { id: `eq-${uid()}`, creadoEn: ahora, actualizadoEn: ahora, creadoPor: usuarioId, clubId: 'club', ...limpio }
        await crearEquipo(e)
        location.replace('#plantilla')
      } else {
        await editarEquipo({ ...original!, ...limpio })
        setAviso({ ok: true, t: 'Equipo guardado.' })
      }
    } catch (e) {
      setAviso({ ok: false, t: `No se ha guardado: ${(e as Error).message}` })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Cabecera titulo={nuevo ? 'Nuevo equipo' : 'Editar equipo'} sub={nuevo ? 'Quedarás como entrenador principal' : original!.nombre} atras={() => volver(salida)} />
      <div className="form">
        <fieldset className="grupo">
          <legend>Equipo</legend>
          <Campo etiqueta="Nombre del equipo" error={err.nombre} ayuda="Por ejemplo: Infantil A">
            <input value={d.nombre} onChange={(e) => set('nombre', e.target.value)} autoComplete="off" maxLength={60} />
          </Campo>
          <div className="fila-campos mitad">
            <Campo etiqueta="Categoría" error={err.categoria}>
              <select value={d.categoria} onChange={(e) => elegirCategoria(e.target.value)}>
                <option value="">Elige…</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
                {/* Una categoría escrita en otra app (Informes) se conserva tal cual */}
                {d.categoria && !CATEGORIAS.some((c) => c.nombre === d.categoria) && <option value={d.categoria}>{d.categoria}</option>}
              </select>
            </Campo>
            <Campo etiqueta="Temporada" error={err.temporada}>
              <input value={d.temporada} onChange={(e) => set('temporada', e.target.value)} placeholder="2026-27" inputMode="numeric" maxLength={7} />
            </Campo>
          </div>
          <div className="campo">
            <span className="campo-et">Modalidad</span>
            <div className="segmentado pequeno" role="radiogroup" aria-label="Modalidad">
              {MODALIDADES.map((m) => (
                <button type="button" key={m} role="radio" aria-checked={d.modalidad === m} className={d.modalidad === m ? 'on' : ''} onClick={() => set('modalidad', m)}>
                  {m}
                </button>
              ))}
            </div>
            {err.modalidad && <span className="campo-error">{err.modalidad}</span>}
          </div>
          <div className="campo">
            <span className="campo-et">Género</span>
            <div className="segmentado pequeno" role="radiogroup" aria-label="Género">
              {GENEROS.map(([g, n]) => (
                <button type="button" key={g} role="radio" aria-checked={d.genero === g} className={d.genero === g ? 'on' : ''} onClick={() => set('genero', g)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Campo etiqueta="Entidad o club" error={err.entidad}>
            <input value={d.entidad} onChange={(e) => set('entidad', e.target.value)} autoComplete="organization" maxLength={120} />
          </Campo>
        </fieldset>
      </div>

      <div className="barra-accion">
        {aviso && (
          <p className={aviso.ok ? 'ok' : 'error'} role="status">
            {aviso.t}
          </p>
        )}
        <div className="botones">
          <button className="btn" onClick={() => volver(salida)}>
            Volver
          </button>
          <button className="btn primario crece" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : nuevo ? 'Crear equipo' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  )
}
