import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { AvatarFutbol, Cabecera } from '../ui/components'
import { Icon } from '../ui/Icon'
import { Campo, CamposEquipo } from './Acceso'
import { categoria } from '../data/categorias'
import { formatearTelefono, normalizarEmail, normalizarTelefono, normalizarUsuario, prepararFoto, validarPerfil, type DatosRegistro, type Errores } from '../auth/auth'
import type { Cuenta } from '../model/types'
import { href } from '../state/router'
import { accionesEntrenador } from '../logic/permisos'

type Editable = Pick<DatosRegistro, 'nombre' | 'usuario' | 'email' | 'telefono' | 'entidad' | 'categoria' | 'equipo' | 'genero'>

const editable = (c: Cuenta): Editable => ({
  nombre: c.nombre,
  usuario: c.usuario,
  email: c.email,
  telefono: formatearTelefono(c.telefono),
  entidad: c.entidad,
  categoria: c.categoria,
  equipo: c.equipo,
  genero: c.genero,
})

/** Forma normalizada para saber si hay cambios reales que guardar. */
const normal = (x: Editable) =>
  JSON.stringify({
    ...x,
    nombre: x.nombre.trim(),
    usuario: normalizarUsuario(x.usuario),
    email: normalizarEmail(x.email),
    telefono: normalizarTelefono(x.telefono),
    entidad: x.entidad.trim(),
    equipo: x.equipo.trim(),
  })

export function Perfil() {
  // El panel de entrenador no tiene accesos de administración: eso está en su propio panel (con PIN).
  const { cuenta, guardarPerfil, cerrarSesion, tema, setTema, verComo, setVerComo, equipos, equipoActivo, setEquipoActivo, tipoCuenta } = useApp()
  const acciones = accionesEntrenador({ tipoCuenta, puedeEditar: false })
  const [d, setD] = useState<Editable>(() => editable(cuenta))
  const [err, setErr] = useState<Errores>({})
  const [estado, setEstado] = useState<'' | 'guardando' | 'guardado' | 'email'>('')
  const [errFoto, setErrFoto] = useState<string | null>(null)
  const temporizador = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Guardado automático: 700 ms después del último cambio, si todo es válido.
  useEffect(() => {
    if (temporizador.current) clearTimeout(temporizador.current)
    const sinCambios = normal(d) === normal(editable(cuenta))
    if (sinCambios) return
    temporizador.current = window.setTimeout(async () => {
      const v = validarPerfil(d)
      const usuario = normalizarUsuario(d.usuario)
      const email = normalizarEmail(d.email)
      setErr(v)
      if (Object.values(v).some(Boolean)) return setEstado('')
      setEstado('guardando')
      try {
        await guardarPerfil({ ...cuenta, ...d, usuario, email, telefono: normalizarTelefono(d.telefono), nombre: d.nombre.trim(), entidad: d.entidad.trim(), equipo: d.equipo.trim() })
        setEstado(email !== cuenta.email ? 'email' : 'guardado')
      } catch (e) {
        const m = (e as Error).message
        setErr(/usuario/i.test(m) ? { usuario: m } : /email/i.test(m) ? { email: m } : { nombre: m })
        setEstado('')
      }
    }, 700)
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    }
  }, [d, cuenta, guardarPerfil])

  const set = <K extends keyof DatosRegistro>(k: K, v: DatosRegistro[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    setEstado('')
  }

  return (
    <>
      <Cabecera
        titulo="Mi perfil"
        sub={
          estado === 'guardando'
            ? 'Guardando…'
            : estado === 'guardado'
              ? 'Cambios guardados'
              : estado === 'email'
                ? 'Te hemos enviado un enlace para confirmar el nuevo email'
                : 'Los cambios se guardan solos'
        }
      />

      <section className="perfil-cab">
        <div className="perfil-foto">
          {cuenta.foto ? <img src={cuenta.foto} alt="Tu foto de perfil" /> : <AvatarFutbol size={88} className="perfil-ini" />}
          <button className="perfil-foto-btn" aria-label="Cambiar foto" onClick={() => fileRef.current?.click()}>
            <Icon n="camara" size={18} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setErrFoto(null)
              try {
                await guardarPerfil({ ...cuenta, foto: await prepararFoto(f) })
              } catch (x) {
                setErrFoto((x as Error).message)
              }
            }}
          />
        </div>
        <div className="perfil-id">
          <strong>{cuenta.nombre}</strong>
          <span className="sub">{cuenta.email}</span>
          {/* Solo lo que esté rellenado: las cuentas nuevas no traen club ni categoría */}
          {(cuenta.categoria || cuenta.entidad) && (
            <span className="perfil-equipo">
              {[cuenta.categoria && `${categoria(cuenta.categoria).nombre} ${cuenta.equipo}`.trim(), cuenta.entidad].filter(Boolean).join(' · ')}
            </span>
          )}
          {cuenta.foto && (
            <button className="enlace pequeno" onClick={() => guardarPerfil({ ...cuenta, foto: null })}>
              Quitar foto
            </button>
          )}
          {errFoto && (
            <span className="error" role="alert">
              {errFoto}
            </span>
          )}
        </div>
      </section>

      <div className="form">
        <fieldset className="grupo">
          <legend>Tus datos</legend>
          <Campo etiqueta="Nombre y apellidos" error={err.nombre}>
            <input value={d.nombre} onChange={(e) => set('nombre', e.target.value)} autoComplete="name" />
          </Campo>
          <Campo etiqueta="Email" error={err.email}>
            <input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} autoCapitalize="none" />
          </Campo>
          <Campo etiqueta="Teléfono" error={err.telefono}>
            <input type="tel" inputMode="tel" value={d.telefono} onChange={(e) => set('telefono', e.target.value)} />
          </Campo>
        </fieldset>
        <CamposEquipo d={d} err={err} set={set} />
        <CambiarPassword />
      </div>

      {(equipos.length > 1 || acciones.crearEquipo) && (
        <section className="bloque">
          <h2>{equipos.length > 1 ? 'Equipo que estás viendo' : 'Tus equipos'}</h2>
          {equipos.length > 1 && (
            <div className="campo">
              <select value={equipoActivo} onChange={(e) => setEquipoActivo(e.target.value)} aria-label="Equipo">
                {equipos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre} · {e.entidad}
                  </option>
                ))}
              </select>
            </div>
          )}
          {acciones.crearEquipo && (
            <a className="btn" href={href({ nombre: 'equipo', id: 'nuevo' })} style={{ marginTop: equipos.length > 1 ? 12 : 0 }}>
              <Icon n="mas" size={18} /> Crear equipo
            </a>
          )}
        </section>
      )}

      <section className="bloque">
        <h2>Apariencia</h2>
        <div className="segmentado" role="radiogroup" aria-label="Tema">
          {(['oscuro', 'claro'] as const).map((t) => (
            <button key={t} role="radio" aria-checked={tema === t} className={tema === t ? 'on' : ''} onClick={() => setTema(t)}>
              {t === 'oscuro' ? 'Oscuro' : 'Claro'}
            </button>
          ))}
        </div>
      </section>

      <section className="bloque">
        <h2>Probar permisos</h2>
        <p className="sub">El ayudante no ve notas privadas ni puede exportar o borrar datos de jugadores.</p>
        <div className="segmentado" role="radiogroup" aria-label="Ver la app como">
          {(
            [
              ['yo', 'Yo (principal)'],
              ['ayudante', 'Como ayudante'],
            ] as const
          ).map(([v, n]) => (
            <button key={v} role="radio" aria-checked={verComo === v} className={verComo === v ? 'on' : ''} onClick={() => setVerComo(v)}>
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="bloque">
        <h2>Privacidad</h2>
        <ul className="lista-texto">
          <li>Sin consentimiento de la familia solo se guardan el nombre y el dorsal.</li>
          <li>Desde los 14 años puede firmar el propio jugador (art. 7 LOPDGDD).</li>
          <li>Las familias nunca ven la ficha completa ni comparaciones con compañeros.</li>
          <li>No escribas diagnósticos médicos en estados ni notas.</li>
          {cuenta.aceptaPrivacidadEn && <li>Aceptaste la política de privacidad el {new Date(cuenta.aceptaPrivacidadEn).toLocaleDateString('es-ES')}.</li>}
        </ul>
      </section>


      <button className="btn peligro ancho" onClick={cerrarSesion}>
        <Icon n="salir" /> Cerrar sesión
      </button>
      <EliminarCuenta />
      <p className="nota-pie centrado">FutbolLab Jugadores · {cuenta.role === 'admin' ? 'administrador' : 'entrenador'}</p>
    </>
  )
}

/**
 * Borrar la cuenta (lo exigen Apple y Google). Hay que escribir ELIMINAR para confirmar.
 * Si es el único entrenador principal de un equipo con jugadores, la base de datos lo impide
 * y su mensaje se muestra tal cual.
 */
function EliminarCuenta() {
  const { eliminarCuenta } = useApp()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  if (!abierto) {
    return (
      <button type="button" className="enlace pequeno peligro-txt eliminar-cuenta" onClick={() => setAbierto(true)}>
        Eliminar mi cuenta
      </button>
    )
  }
  return (
    <section className="bloque confirmar" role="alertdialog" aria-label="Eliminar mi cuenta">
      <h2>Eliminar mi cuenta</h2>
      <p>Se borrarán tu cuenta y tus datos de FutbolLab, también en FutbolLab Informes. No se puede deshacer.</p>
      <Campo etiqueta="Escribe ELIMINAR para confirmar">
        <input value={texto} onChange={(e) => { setTexto(e.target.value); setError(null) }} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      </Campo>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="botones">
        <button type="button" className="btn" onClick={() => { setAbierto(false); setTexto(''); setError(null) }}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn peligro"
          disabled={texto.trim() !== 'ELIMINAR' || borrando}
          onClick={async () => {
            setBorrando(true)
            try {
              await eliminarCuenta()
            } catch (e) {
              setError((e as Error).message)
              setBorrando(false)
            }
          }}
        >
          {borrando ? 'Eliminando…' : 'Eliminar mi cuenta'}
        </button>
      </div>
    </section>
  )
}

function CambiarPassword() {
  const { cambiarPassword } = useApp()
  const [abierto, setAbierto] = useState(false)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  if (!abierto) {
    return (
      <button type="button" className="btn" onClick={() => setAbierto(true)}>
        Cambiar contraseña
      </button>
    )
  }
  return (
    <fieldset className="grupo">
      <legend>Cambiar contraseña</legend>
      <Campo etiqueta="Contraseña actual">
        <input type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
      </Campo>
      <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres, con letras y números">
        <input type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
      </Campo>
      {msg && (
        <p className={msg.ok ? 'ok' : 'error'} role="status">
          {msg.t}
        </p>
      )}
      <div className="botones">
        <button type="button" className="btn" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn primario"
          onClick={async () => {
            if (nueva.length < 8 || !/[a-zA-Z]/.test(nueva) || !/\d/.test(nueva)) return setMsg({ ok: false, t: 'La nueva necesita 8 caracteres con letras y números.' })
            try {
              await cambiarPassword(actual, nueva)
            } catch (e) {
              return setMsg({ ok: false, t: (e as Error).message })
            }
            setActual('')
            setNueva('')
            setMsg({ ok: true, t: 'Contraseña cambiada.' })
          }}
        >
          Guardar
        </button>
      </div>
    </fieldset>
  )
}
