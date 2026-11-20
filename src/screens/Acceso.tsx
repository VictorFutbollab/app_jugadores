import { useState, type ReactNode } from 'react'
import { Logo } from '../ui/Logo'
import { Icon } from '../ui/Icon'
import { CATEGORIAS } from '../data/categorias'
import {
  comprobarPassword,
  crearCredencial,
  normalizarEmail,
  normalizarTelefono,
  normalizarUsuario,
  validarRegistro,
  type DatosRegistro,
  type Errores,
} from '../auth/auth'
import * as DB from '../db/db'
import { uid } from '../logic/format'
import type { Cuenta, Genero } from '../model/types'

type Modo = 'entrar' | 'registro'

export function Acceso({ onEntrar }: { onEntrar: (c: Cuenta) => Promise<void> }) {
  const [modo, setModo] = useState<Modo>('entrar')
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
        {modo === 'entrar' ? <Entrar onEntrar={onEntrar} irRegistro={() => setModo('registro')} /> : <Registro onEntrar={onEntrar} />}
      </div>
      <p className="acceso-pie">Prototipo · las cuentas se guardan solo en este dispositivo</p>
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

function Entrar({ onEntrar, irRegistro }: { onEntrar: (c: Cuenta) => Promise<void>; irRegistro: () => void }) {
  const [id, setId] = useState('')
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
          const c = await DB.cuentaPorUsuarioOEmail(id)
          // mismo mensaje si no existe o si la contraseña no coincide (no revela qué cuentas existen)
          if (!c || !(await comprobarPassword(c.credencial, pw))) return setError('Usuario o contraseña incorrectos.')
          await onEntrar(c)
        } finally {
          setCargando(false)
        }
      }}
    >
      <Campo etiqueta="Usuario o email">
        <input autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} required autoCapitalize="none" />
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

function Registro({ onEntrar }: { onEntrar: (c: Cuenta) => Promise<void> }) {
  const [d, setD] = useState<DatosRegistro>(VACIO)
  const [err, setErr] = useState<Errores>({})
  const [cargando, setCargando] = useState(false)
  const [verPw, setVerPw] = useState(false)
  const set = <K extends keyof DatosRegistro>(k: K, v: DatosRegistro[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    if (err[k]) setErr((e) => ({ ...e, [k]: undefined }))
  }

  return (
    <form
      className="form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        const v = validarRegistro(d)
        const usuario = normalizarUsuario(d.usuario)
        const email = normalizarEmail(d.email)
        if (!v.usuario && (await DB.existe('usuario', usuario))) v.usuario = 'Ese usuario ya existe.'
        if (!v.email && (await DB.existe('email', email))) v.email = 'Ya hay una cuenta con ese email.'
        setErr(v)
        if (Object.values(v).some(Boolean)) {
          document.querySelector('.con-error input, .con-error select')?.scrollIntoView({ block: 'center' })
          return
        }
        setCargando(true)
        const ahora = new Date().toISOString()
        const c: Cuenta = {
          id: `u-${uid()}`,
          nombre: d.nombre.trim(),
          usuario,
          email,
          telefono: normalizarTelefono(d.telefono),
          foto: null,
          entidad: d.entidad.trim(),
          categoria: d.categoria,
          equipo: d.equipo.trim(),
          genero: d.genero,
          aceptaPrivacidadEn: ahora,
          creadoEn: ahora,
          actualizadoEn: ahora,
          credencial: await crearCredencial(d.password),
        }
        await DB.guardarCuenta(c)
        await onEntrar(c)
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
