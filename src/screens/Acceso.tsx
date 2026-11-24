import { useState, type ReactNode } from 'react'
import { Logo } from '../ui/Logo'
import { Icon } from '../ui/Icon'
import { CATEGORIAS } from '../data/categorias'
import { normalizarEmail, normalizarTelefono, normalizarUsuario, validarRegistro, type DatosRegistro, type Errores } from '../auth/auth'
import * as R from '../db/remote'
import { errorLegible, MODO_LOCAL, supabase } from '../db/supabase'
import type { Genero } from '../model/types'
import { apuntarFallo, borrarFallos, minutosBloqueo } from '../auth/pinAdmin'

type Modo = 'entrar' | 'registro' | 'admin'

/**
 * Solo en localhost (npm run dev): el servidor de desarrollo crea o confirma la cuenta
 * sin correo (ver dev/registro-local.ts). En la web publicada esto no existe y se
 * sigue exigiendo confirmar el email. Devuelve null si no está disponible.
 */
async function sinCorreoEnLocal(ruta: 'registro' | 'confirmar', cuerpo: object): Promise<{ ok: boolean; error?: string } | null> {
  if (!import.meta.env.DEV || MODO_LOCAL) return null // en modo local ya no hay correo que confirmar
  try {
    const r = await fetch(`/__local/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (r.status === 501) return null // falta la clave en .env.local: se usa el registro normal
    return { ok: r.ok && !!j.ok, error: j.error }
  } catch {
    return null
  }
}

/** Panel al que se entra: el de entrenador (normal) o el de administración (con PIN). */
export type Panel = 'usuario' | 'admin'

export function Acceso({ onEntrar, error }: { onEntrar: (panel: Panel) => Promise<void>; error?: string | null }) {
  const [modo, setModo] = useState<Modo>('entrar')
  if (modo === 'admin') {
    return (
      <div className="acceso">
        <div className="acceso-campo" aria-hidden />
        <div className="acceso-caja">
          <div className="acceso-marca">
            <Logo alto={34} />
            <p className="acceso-app">Administración</p>
            <p className="acceso-lema">Acceso solo para administradores del club.</p>
          </div>
          <EntrarAdmin onEntrar={() => onEntrar('admin')} volver={() => setModo('entrar')} />
        </div>
      </div>
    )
  }
  return (
    <div className="acceso">
      <div className="acceso-campo" aria-hidden />
      <div className="acceso-caja">
        <div className="acceso-marca">
          <Logo alto={34} />
          <p className="acceso-app">Jugadores</p>
          <p className="acceso-lema">Conoce a cada jugador. Mide su evolución. Decide con datos.</p>
        </div>
        <div className="segmentado" role="tablist">
          <button role="tab" aria-selected={modo === 'entrar'} className={modo === 'entrar' ? 'on' : ''} onClick={() => setModo('entrar')}>
            Entrar
          </button>
          <button role="tab" aria-selected={modo === 'registro'} className={modo === 'registro' ? 'on' : ''} onClick={() => setModo('registro')}>
            Crear cuenta
          </button>
        </div>
        {error && (
          <p className="error" role="alert" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
        {modo === 'entrar' ? (
          <Entrar onEntrar={() => onEntrar('usuario')} irRegistro={() => setModo('registro')} irAdmin={() => setModo('admin')} />
        ) : (
          <Registro onEntrar={() => onEntrar('usuario')} />
        )}
      </div>
      <p className="acceso-pie">
        {MODO_LOCAL
          ? 'Modo local (solo en este ordenador): las cuentas y los datos se guardan en este navegador y no hace falta confirmar el email.'
          : 'Acceso seguro con FutbolLab · tus datos se guardan cifrados en el servidor'}
      </p>
    </div>
  )
}

export function Campo({ etiqueta, error, children, ayuda }: { etiqueta: string; error?: string; children: ReactNode; ayuda?: string }) {
  return (
    <div className={`campo ${error ? 'con-error' : ''}`}>
      <label className="campo">
        <span className="campo-et">{etiqueta}</span>
        {children}
      </label>
      {error ? (
        <span className="campo-error" role="alert">
          {error}
        </span>
      ) : (
        ayuda && <span className="campo-ayuda">{ayuda}</span>
      )}
    </div>
  )
}

/**
 * Acceso al panel de administración: email, contraseña y PIN.
 * Los tres tienen que ser correctos y la cuenta tiene que ser admin según el servidor.
 * Ante cualquier fallo el mensaje es el mismo (no revela qué dato falló) y, tras
 * 5 fallos seguidos, se bloquea 5 minutos.
 */
function EntrarAdmin({ onEntrar, volver }: { onEntrar: () => Promise<void>; volver: () => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const fallo = async (msg = 'Email, contraseña o PIN incorrectos, o la cuenta no es de administrador.') => {
    apuntarFallo()
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    const min = minutosBloqueo()
    setError(min ? `Demasiados intentos. Espera ${min} min y vuelve a probar.` : msg)
  }
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        const min = minutosBloqueo()
        if (min) return setError(`Demasiados intentos. Espera ${min} min y vuelve a probar.`)
        setCargando(true)
        try {
          const r = await supabase.auth.signInWithPassword({ email: normalizarEmail(email), password: pw })
          if (r.error) return await fallo()
          // El rol se lee del servidor, y el PIN lo comprueba el servidor: si es bueno,
          // solo ESTA sesión tiene poderes de admin.
          const perfil = await R.perfilActual()
          if (perfil?.role !== 'admin' || !(await R.verificarPinAdmin(pin))) return await fallo()
          borrarFallos()
          await onEntrar()
        } catch (e) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
          setError(errorLegible(e).message)
        } finally {
          setCargando(false)
        }
      }}
    >
      <Campo etiqueta="Email">
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoCapitalize="none" />
      </Campo>
      <Campo etiqueta="Contraseña">
        <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </Campo>
      <Campo etiqueta="PIN de administración">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          required
        />
      </Campo>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn primario grande" type="submit" disabled={cargando}>
        {cargando ? 'Comprobando…' : 'Entrar al panel de admin'}
      </button>
      <p className="acceso-alt">
        ¿Eres entrenador?{' '}
        <button type="button" className="enlace" onClick={volver}>
          Vuelve al acceso normal
        </button>
      </p>
    </form>
  )
}

function Entrar({ onEntrar, irRegistro, irAdmin }: { onEntrar: () => Promise<void>; irRegistro: () => void; irAdmin: () => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setCargando(true)
        try {
          let r = await supabase.auth.signInWithPassword({ email: normalizarEmail(email), password: pw })
          // En localhost: una cuenta que se quedó sin confirmar se confirma sola y se vuelve a intentar.
          if (r.error && /not confirmed/i.test(r.error.message)) {
            const local = await sinCorreoEnLocal('confirmar', { email: normalizarEmail(email) })
            if (local?.ok) r = await supabase.auth.signInWithPassword({ email: normalizarEmail(email), password: pw })
          }
          if (r.error) {
            // mismo mensaje si no existe o si la contraseña no coincide (no revela qué cuentas existen)
            if (/not confirmed/i.test(r.error.message)) return setError('Confirma tu email: te enviamos un enlace al registrarte.')
            if (/invalid login|invalid credentials/i.test(r.error.message)) return setError('Email o contraseña incorrectos.')
            return setError(errorLegible(r.error).message)
          }
          await onEntrar()
        } finally {
          setCargando(false)
        }
      }}
    >
      <Campo etiqueta="Email">
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoCapitalize="none" />
      </Campo>
      <Campo etiqueta="Contraseña">
        <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </Campo>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn primario grande" type="submit" disabled={cargando}>
        {cargando ? 'Comprobando…' : 'Entrar'}
      </button>
      <p className="acceso-alt">
        ¿Primera vez?{' '}
        <button type="button" className="enlace" onClick={irRegistro}>
          Crea tu cuenta
        </button>
      </p>
      <p className="acceso-alt">
        ¿Administras el club?{' '}
        <button type="button" className="enlace" onClick={irAdmin}>
          Entra al panel de admin
        </button>
      </p>
    </form>
  )
}

const VACIO: DatosRegistro = {
  nombre: '',
  usuario: '',
  email: '',
  telefono: '',
  password: '',
  entidad: '',
  categoria: '',
  equipo: '',
  genero: 'masculino',
  aceptaPrivacidad: false,
}

function Registro({ onEntrar }: { onEntrar: () => Promise<void> }) {
  const [d, setD] = useState<DatosRegistro>(VACIO)
  const [err, setErr] = useState<Errores>({})
  const [cargando, setCargando] = useState(false)
  const [verPw, setVerPw] = useState(false)
  const [general, setGeneral] = useState<string | null>(null)
  const [revisarEmail, setRevisarEmail] = useState(false)
  const set = <K extends keyof DatosRegistro>(k: K, v: DatosRegistro[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    if (err[k]) setErr((e) => ({ ...e, [k]: undefined }))
  }

  if (revisarEmail) {
    return (
      <div className="bloque" role="status" style={{ marginTop: 16 }}>
        <h2>Revisa tu email</h2>
        <p>
          Te hemos enviado un enlace a <strong>{normalizarEmail(d.email)}</strong> para confirmar la cuenta. Después podrás entrar.
        </p>
        <p className="sub">Si ya tenías una cuenta con ese email, entra con ella o recupera la contraseña.</p>
      </div>
    )
  }

  return (
    <form
      className="form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setGeneral(null)
        const v = validarRegistro(d)
        const usuario = normalizarUsuario(d.usuario)
        const email = normalizarEmail(d.email)
        setCargando(true)
        try {
          if (!v.usuario && !(await R.usuarioDisponible(usuario))) v.usuario = 'Ese usuario ya existe.'
          setErr(v)
          if (Object.values(v).some(Boolean)) {
            document.querySelector('.con-error input, .con-error select')?.scrollIntoView({ block: 'center' })
            return
          }
          // El rol NO se envía: el servidor asigna siempre 'player' a las cuentas nuevas.
          const datos = {
            nombre: d.nombre.trim(),
            usuario,
            telefono: normalizarTelefono(d.telefono),
            entidad: d.entidad.trim(),
            categoria: d.categoria,
            equipo: d.equipo.trim(),
            genero: d.genero,
            acepta_privacidad: d.aceptaPrivacidad,
          }
          // En localhost: la cuenta se crea ya confirmada (no llega el correo) y se entra directamente.
          const local = await sinCorreoEnLocal('registro', { email, password: d.password, data: datos })
          if (local) {
            if (!local.ok) return /email/i.test(local.error ?? '') ? setErr({ email: local.error }) : setGeneral(local.error ?? 'No se ha podido crear la cuenta.')
            const e2 = await supabase.auth.signInWithPassword({ email, password: d.password })
            if (e2.error) return setGeneral(errorLegible(e2.error).message)
            return await onEntrar()
          }
          const r = await supabase.auth.signUp({ email, password: d.password, options: { emailRedirectTo: location.origin, data: datos } })
          if (r.error) {
            if (/already registered|already exists/i.test(r.error.message)) return setErr({ email: 'Ya hay una cuenta con ese email.' })
            if (/password/i.test(r.error.message)) return setErr({ password: 'La contraseña no cumple los requisitos de seguridad.' })
            return setGeneral(errorLegible(r.error).message)
          }
          // Modo local: la primera cuenta (admin) arranca con la plantilla de ejemplo para tener algo que ver.
          if (MODO_LOCAL && r.data.session && (await supabase.from('equipos').select('id')).data?.length === 0) await R.cargarEjemplo()
          if (r.data.session) await onEntrar()
          else setRevisarEmail(true) // confirmación de email activada en Supabase
        } finally {
          setCargando(false)
        }
      }}
    >
      <fieldset className="grupo">
        <legend>Tus datos</legend>
        <Campo etiqueta="Nombre y apellidos" error={err.nombre}>
          <input autoComplete="name" value={d.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </Campo>
        <Campo etiqueta="Usuario" error={err.usuario} ayuda="Con él entrarás a las 4 apps de FutbolLab">
          <input autoComplete="username" autoCapitalize="none" spellCheck={false} value={d.usuario} onChange={(e) => set('usuario', e.target.value.toLowerCase())} />
        </Campo>
        <Campo etiqueta="Email" error={err.email}>
          <input type="email" autoComplete="email" autoCapitalize="none" value={d.email} onChange={(e) => set('email', e.target.value)} />
        </Campo>
        <Campo etiqueta="Teléfono" error={err.telefono}>
          <input type="tel" autoComplete="tel" inputMode="tel" placeholder="600 123 456" value={d.telefono} onChange={(e) => set('telefono', e.target.value)} />
        </Campo>
        <Campo etiqueta="Contraseña" error={err.password} ayuda="Mínimo 8 caracteres, con letras y números">
          <span className="con-boton">
            <input type={verPw ? 'text' : 'password'} autoComplete="new-password" value={d.password} onChange={(e) => set('password', e.target.value)} />
            <button type="button" className="icon-btn plano" aria-label={verPw ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVerPw((x) => !x)}>
              <Icon n="ojo" />
            </button>
          </span>
        </Campo>
      </fieldset>

      <CamposEquipo d={d} err={err} set={set} />

      <label className={`check ${err.aceptaPrivacidad ? 'con-error' : ''}`}>
        <input type="checkbox" checked={d.aceptaPrivacidad} onChange={(e) => set('aceptaPrivacidad', e.target.checked)} />
        <span>
          He leído y acepto la política de privacidad. Usaremos tu email y teléfono solo para gestionar tu cuenta y avisarte de tu equipo.
        </span>
      </label>
      {err.aceptaPrivacidad && (
        <p className="error" role="alert">
          {err.aceptaPrivacidad}
        </p>
      )}
      {general && (
        <p className="error" role="alert">
          {general}
        </p>
      )}
      <button className="btn primario grande" type="submit" disabled={cargando}>
        {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
    </form>
  )
}

type SetFn = <K extends keyof DatosRegistro>(k: K, v: DatosRegistro[K]) => void

/** Bloque "Dónde entrenas", compartido entre registro y perfil. */
export function CamposEquipo({ d, err, set }: { d: Pick<DatosRegistro, 'entidad' | 'categoria' | 'equipo' | 'genero'>; err: Errores; set: SetFn }) {
  return (
    <fieldset className="grupo">
      <legend>Dónde entrenas</legend>
      <Campo etiqueta="Entidad (club o escuela)" error={err.entidad}>
        <input autoComplete="organization" placeholder="CD Ejemplo" value={d.entidad} onChange={(e) => set('entidad', e.target.value)} />
      </Campo>
      <div className="fila-campos">
        <Campo etiqueta="Categoría" error={err.categoria}>
          <select value={d.categoria} onChange={(e) => set('categoria', e.target.value)}>
            <option value="" disabled>
              Elige…
            </option>
            {(['Fútbol base', 'Adultos'] as const).map((g) => (
              <optgroup key={g} label={g}>
                {CATEGORIAS.filter((c) => c.grupo === g).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.grupo === 'Fútbol base' ? `(${c.edadMin}–${c.edadMax})` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Equipo" error={err.equipo}>
          <input placeholder="A" value={d.equipo} onChange={(e) => set('equipo', e.target.value)} />
        </Campo>
      </div>
      <div className="segmentado pequeno" role="radiogroup" aria-label="Género del equipo">
        {(
          [
            ['masculino', 'Masculino'],
            ['femenino', 'Femenino'],
            ['mixto', 'Mixto'],
          ] as [Genero, string][]
        ).map(([g, n]) => (
          <button type="button" key={g} role="radio" aria-checked={d.genero === g} className={d.genero === g ? 'on' : ''} onClick={() => set('genero', g)}>
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
