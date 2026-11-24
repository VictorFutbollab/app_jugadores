import { useState, type ReactNode } from 'react'
import { Logo } from '../ui/Logo'
import { Icon } from '../ui/Icon'
import { CATEGORIAS } from '../data/categorias'
import { normalizarEmail, normalizarTelefono, validarRegistro, type DatosRegistro, type Errores, type ErroresCuenta, type NuevaCuenta } from '../auth/auth'
import * as R from '../db/remote'
import { errorLegible, MODO_LOCAL, supabase } from '../db/supabase'
import { esErrorDeRed } from '../db/offline'
import { generarUsuario, normalizarCodigo, type RolPrincipal } from '../db/cuenta'
import type { Genero } from '../model/types'
import { apuntarFallo, borrarFallos, minutosBloqueo } from '../auth/pinAdmin'

type Modo = 'entrar' | 'registro' | 'admin' | 'olvido'

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
          <button role="tab" aria-selected={modo === 'entrar' || modo === 'olvido'} className={modo === 'entrar' || modo === 'olvido' ? 'on' : ''} onClick={() => setModo('entrar')}>
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
          <Entrar onEntrar={() => onEntrar('usuario')} irRegistro={() => setModo('registro')} irAdmin={() => setModo('admin')} irOlvido={() => setModo('olvido')} />
        ) : modo === 'olvido' ? (
          <Olvido volver={() => setModo('entrar')} />
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

/** Mensajes de error al entrar, en lenguaje sencillo (los mismos que Informes). */
function errorAlEntrar(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? String(e)
  if (/not confirmed/i.test(m)) return 'Confirma tu cuenta desde el correo que te enviamos.'
  if (/invalid login|invalid credentials/i.test(m)) return 'Email o contraseña incorrectos.'
  if (esErrorDeRed(e) || /Failed to fetch|NetworkError|Sin conexión/i.test(m)) return 'Sin cobertura. Inténtalo con conexión.'
  return errorLegible(e).message || 'No se ha podido entrar. Inténtalo de nuevo.'
}

function Entrar({ onEntrar, irRegistro, irAdmin, irOlvido }: { onEntrar: () => Promise<void>; irRegistro: () => void; irAdmin: () => void; irOlvido: () => void }) {
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
          // Solo en localhost con Supabase: una cuenta que se quedó sin confirmar se confirma sola.
          if (r.error && /not confirmed/i.test(r.error.message)) {
            const local = await sinCorreoEnLocal('confirmar', { email: normalizarEmail(email) })
            if (local?.ok) r = await supabase.auth.signInWithPassword({ email: normalizarEmail(email), password: pw })
          }
          // Mismo mensaje si no existe o si la contraseña no coincide (no revela qué cuentas existen).
          if (r.error) return setError(errorAlEntrar(r.error))
          await onEntrar()
        } catch (e) {
          setError(errorAlEntrar(e))
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
      <button type="button" className="enlace pequeno olvido" onClick={irOlvido}>
        ¿Olvidaste la contraseña?
      </button>
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

/** "¿Olvidaste la contraseña?": envía el enlace para poner una nueva (vuelve a esta app). */
function Olvido({ volver }: { volver: () => void }) {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'' | 'enviando' | 'enviado'>('')
  const [error, setError] = useState<string | null>(null)
  if (estado === 'enviado') {
    return (
      <div className="aviso-info" role="status">
        <strong>Revisa tu correo</strong>
        <p>
          Si hay una cuenta con <strong>{normalizarEmail(email)}</strong>, te hemos enviado un enlace para poner una contraseña nueva. Ábrelo en este mismo dispositivo.
        </p>
        <button type="button" className="btn ancho" onClick={volver}>
          Volver a entrar
        </button>
      </div>
    )
  }
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setEstado('enviando')
        try {
          const r = await supabase.auth.resetPasswordForEmail(normalizarEmail(email), { redirectTo: location.origin })
          if (r.error) {
            setEstado('')
            return setError(errorAlEntrar(r.error))
          }
          setEstado('enviado')
        } catch (e) {
          setEstado('')
          setError(errorAlEntrar(e))
        }
      }}
    >
      <p className="sub" style={{ margin: 0 }}>
        Escribe el email de tu cuenta FutbolLab y te enviaremos un enlace para poner una contraseña nueva.
      </p>
      <Campo etiqueta="Email">
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoCapitalize="none" />
      </Campo>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn primario grande" type="submit" disabled={estado === 'enviando'}>
        {estado === 'enviando' ? 'Enviando…' : 'Enviar enlace'}
      </button>
      <p className="acceso-alt">
        <button type="button" className="enlace" onClick={volver}>
          Volver a entrar
        </button>
      </p>
    </form>
  )
}

/** Pantalla a la que se llega desde el enlace del correo: elegir la contraseña nueva. */
export function NuevaContrasena({ onHecho }: { onHecho: () => Promise<void> }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  return (
    <div className="acceso">
      <div className="acceso-campo" aria-hidden />
      <div className="acceso-caja">
        <div className="acceso-marca">
          <Logo alto={34} />
          <p className="acceso-app">Nueva contraseña</p>
          <p className="acceso-lema">Elige la contraseña de tu cuenta FutbolLab. Vale para Jugadores e Informes.</p>
        </div>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            if (pw.length < 8 || !/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return setError('Mínimo 8 caracteres, con letras y números.')
            if (pw !== pw2) return setError('Las dos contraseñas no coinciden.')
            setCargando(true)
            try {
              const r = await supabase.auth.updateUser({ password: pw })
              if (r.error) return setError(errorAlEntrar(r.error))
              await onHecho()
            } catch (e) {
              setError(errorAlEntrar(e))
            } finally {
              setCargando(false)
            }
          }}
        >
          <Campo etiqueta="Contraseña nueva" ayuda="Mínimo 8 caracteres, con letras y números">
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Repite la contraseña">
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          </Campo>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primario grande" type="submit" disabled={cargando}>
            {cargando ? 'Guardando…' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

const VACIO: NuevaCuenta = { tipo: 'entrenador', nombre: '', apellidos: '', email: '', password: '', telefono: '', codigo: '', acepta: false }

/**
 * Crear cuenta, igual que FutbolLab Informes (una sola cuenta para las dos apps):
 * entrenador (manager) o familiar/ayudante (con el código del equipo).
 */
function Registro({ onEntrar }: { onEntrar: () => Promise<void> }) {
  const [d, setD] = useState<NuevaCuenta>(VACIO)
  const [err, setErr] = useState<ErroresCuenta>({})
  const [cargando, setCargando] = useState(false)
  const [verPw, setVerPw] = useState(false)
  const [general, setGeneral] = useState<string | null>(null)
  const [revisarEmail, setRevisarEmail] = useState(false)
  const set = <K extends keyof NuevaCuenta>(k: K, v: NuevaCuenta[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    if (err[k]) setErr((e) => ({ ...e, [k]: undefined }))
  }
  const familia = d.tipo === 'familia'

  if (revisarEmail) {
    return (
      <div className="aviso-info" role="status">
        <strong>Confirma tu cuenta</strong>
        <p>Te hemos enviado un correo para confirmar la cuenta. Ábrelo y después entra con tu email y contraseña.</p>
        <p className="sub">Enviado a {normalizarEmail(d.email)}.</p>
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
        setErr(v)
        if (Object.values(v).some(Boolean)) {
          document.querySelector('.con-error input, .con-error select')?.scrollIntoView({ block: 'center' })
          return
        }
        const email = normalizarEmail(d.email)
        // Los mismos metadatos que Informes. El rol de la app NO se envía: el servidor
        // pone siempre 'player', y el tipo de cuenta se guarda al entrar por primera vez.
        const datos = {
          nombre: `${d.nombre.trim()} ${d.apellidos.trim()}`,
          rolPrincipal: (familia ? 'anotador' : 'entrenador') as RolPrincipal,
          telefono: !familia && d.telefono.trim() ? normalizarTelefono(d.telefono) : '',
          usuario: generarUsuario(email),
          acepta_privacidad: true,
          codigo_equipo: familia ? normalizarCodigo(d.codigo) : null,
        }
        setCargando(true)
        try {
          // Solo en localhost con Supabase: la cuenta se crea ya confirmada.
          const local = await sinCorreoEnLocal('registro', { email, password: d.password, data: datos })
          if (local) {
            if (!local.ok) return /email/i.test(local.error ?? '') ? setErr({ email: local.error }) : setGeneral(local.error ?? 'No se ha podido crear la cuenta.')
            const e2 = await supabase.auth.signInWithPassword({ email, password: d.password })
            if (e2.error) return setGeneral(errorAlEntrar(e2.error))
            return await onEntrar()
          }
          const r = await supabase.auth.signUp({ email, password: d.password, options: { emailRedirectTo: location.origin, data: datos } })
          if (r.error) {
            if (/already registered|already exists/i.test(r.error.message)) return setErr({ email: 'Ya hay una cuenta FutbolLab con ese email. Entra con ella (vale para Jugadores e Informes).' })
            if (/password/i.test(r.error.message)) return setErr({ password: 'La contraseña no cumple los requisitos de seguridad.' })
            return setGeneral(errorLegible(r.error).message)
          }
          // Modo local: la primera cuenta (admin) arranca con la plantilla de ejemplo para tener algo que ver.
          if (MODO_LOCAL && !familia && r.data.session && (await supabase.from('equipos').select('id')).data?.length === 0) await R.cargarEjemplo()
          if (r.data.session) await onEntrar()
          else setRevisarEmail(true) // Supabase pide confirmar el correo
        } catch (e) {
          // Nunca un botón que "no hace nada": cualquier fallo se explica junto al botón.
          setGeneral(errorAlEntrar(e))
        } finally {
          setCargando(false)
        }
      }}
    >
      <div className="segmentado tipo-cuenta" role="radiogroup" aria-label="Tipo de cuenta">
        <button type="button" role="radio" aria-checked={!familia} className={!familia ? 'on' : ''} onClick={() => set('tipo', 'entrenador')}>
          Soy entrenador
        </button>
        <button type="button" role="radio" aria-checked={familia} className={familia ? 'on' : ''} onClick={() => set('tipo', 'familia')}>
          Soy familiar o ayudante
        </button>
      </div>
      <p className="sub" style={{ margin: 0 }}>
        {familia
          ? 'Con el código que te ha dado el entrenador entrarás en su equipo. Solo podrás ver, no cambiar.'
          : 'Crea y gestiona tus equipos. La misma cuenta sirve para FutbolLab Jugadores e Informes.'}
      </p>

      <fieldset className="grupo">
        <legend>Tus datos</legend>
        <div className="fila-campos mitad">
          <Campo etiqueta="Nombre" error={err.nombre}>
            <input autoComplete="given-name" value={d.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </Campo>
          <Campo etiqueta="Apellidos" error={err.apellidos}>
            <input autoComplete="family-name" value={d.apellidos} onChange={(e) => set('apellidos', e.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Email" error={err.email}>
          <input type="email" autoComplete="email" autoCapitalize="none" value={d.email} onChange={(e) => set('email', e.target.value)} />
        </Campo>
        <Campo etiqueta="Contraseña" error={err.password} ayuda="Mínimo 8 caracteres, con letras y números">
          <span className="con-boton">
            <input type={verPw ? 'text' : 'password'} autoComplete="new-password" value={d.password} onChange={(e) => set('password', e.target.value)} />
            <button type="button" className="icon-btn plano" aria-label={verPw ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVerPw((x) => !x)}>
              <Icon n="ojo" />
            </button>
          </span>
        </Campo>
        {familia ? (
          <Campo etiqueta="Código del equipo" error={err.codigo} ayuda="De 6 a 8 letras o números. Te lo da el entrenador.">
            <input
              className="codigo-equipo"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={10}
              value={d.codigo}
              onChange={(e) => set('codigo', normalizarCodigo(e.target.value))}
            />
          </Campo>
        ) : (
          <Campo etiqueta="Teléfono (opcional)" error={err.telefono}>
            <input type="tel" autoComplete="tel" inputMode="tel" placeholder="600 123 456" value={d.telefono} onChange={(e) => set('telefono', e.target.value)} />
          </Campo>
        )}
      </fieldset>

      <label className={`check ${err.acepta ? 'con-error' : ''}`}>
        <input type="checkbox" checked={d.acepta} onChange={(e) => set('acepta', e.target.checked)} />
        <span>Acepto las condiciones de uso y he leído la política de privacidad. Soy mayor de edad.</span>
      </label>
      {err.acepta && (
        <p className="error" role="alert">
          {err.acepta}
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
