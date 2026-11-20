import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { href } from '../state/router'
import { Cabecera } from '../ui/components'
import { Icon } from '../ui/Icon'
import { Campo, CamposEquipo } from './Acceso'
import { categoria } from '../data/categorias'
import {
  comprobarPassword,
  crearCredencial,
  formatearTelefono,
  normalizarEmail,
  normalizarTelefono,
  normalizarUsuario,
  prepararFoto,
  validarPerfil,
  type DatosRegistro,
  type Errores,
} from '../auth/auth'
import * as DB from '../db/db'
import { iniciales } from '../logic/format'
import type { Cuenta } from '../model/types'

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
  const { cuenta, guardarPerfil, cerrarSesion, tema, setTema, verComo, setVerComo, restablecer, esAdmin } = useApp()
  const [d, setD] = useState<Editable>(() => editable(cuenta))
  const [err, setErr] = useState<Errores>({})
  const [estado, setEstado] = useState<'' | 'guardando' | 'guardado'>('')
  const [errFoto, setErrFoto] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)
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
      if (!v.usuario && (await DB.existe('usuario', usuario, cuenta.id))) v.usuario = 'Ese usuario ya existe.'
      if (!v.email && (await DB.existe('email', email, cuenta.id))) v.email = 'Ya hay una cuenta con ese email.'
      setErr(v)
      if (Object.values(v).some(Boolean)) return setEstado('')
      setEstado('guardando')
      await guardarPerfil({ ...cuenta, ...d, usuario, email, telefono: normalizarTelefono(d.telefono), nombre: d.nombre.trim(), entidad: d.entidad.trim(), equipo: d.equipo.trim() })
      setEstado('guardado')
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
        sub={estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Cambios guardados' : 'Los cambios se guardan solos'}
      />

      <section className="perfil-cab">
        <div className="perfil-foto">
          {cuenta.foto ? <img src={cuenta.foto} alt="Tu foto de perfil" /> : <span className="perfil-ini">{iniciales(cuenta.nombre, cuenta.nombre.split(' ')[1] ?? '')}</span>}
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
          <span className="sub">@{cuenta.usuario}</span>
          <span className="perfil-equipo">
            {categoria(cuenta.categoria).nombre} {cuenta.equipo} · {cuenta.entidad}
          </span>
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
          <Campo etiqueta="Usuario" error={err.usuario}>
            <input value={d.usuario} onChange={(e) => set('usuario', e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} />
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

      {esAdmin && (
        <section className="bloque">
          <h2>Administración</h2>
          <p className="sub">Eres administrador: das de alta jugadores, controlas su estado y consentimiento, y gestionas los permisos del cuerpo técnico.</p>
          <div className="botones">
            <a className="btn primario" href={href({ nombre: 'admin' })}>
              <Icon n="escudo" size={18} /> Abrir el panel de admin
            </a>
          </div>
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
          <li>Aceptaste la política de privacidad el {new Date(cuenta.aceptaPrivacidadEn).toLocaleDateString('es-ES')}.</li>
        </ul>
      </section>

      <section className="bloque">
        <h2>Datos de ejemplo</h2>
        <p className="sub">Plantilla ficticia para probar la app, guardada solo en este dispositivo.</p>
        <div className="botones">
          <button
            className="btn"
            onClick={async () => {
              await restablecer()
              setHecho(true)
            }}
          >
            {hecho ? 'Datos restablecidos' : 'Restablecer datos de ejemplo'}
          </button>
        </div>
      </section>

      <button className="btn peligro ancho" onClick={cerrarSesion}>
        <Icon n="salir" /> Cerrar sesión
      </button>
      <p className="nota-pie centrado">FutbolLab Jugadores · prototipo</p>
    </>
  )
}

function CambiarPassword() {
  const { cuenta, guardarPerfil } = useApp()
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
            if (!(await comprobarPassword(cuenta.credencial, actual))) return setMsg({ ok: false, t: 'La contraseña actual no es correcta.' })
            if (nueva.length < 8 || !/[a-zA-Z]/.test(nueva) || !/\d/.test(nueva)) return setMsg({ ok: false, t: 'La nueva necesita 8 caracteres con letras y números.' })
            await guardarPerfil({ ...cuenta, credencial: await crearCredencial(nueva) })
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
