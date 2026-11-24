import { useState } from 'react'
import { useApp } from '../state/store'
import { Camiseta } from '../ui/components'
import { Icon } from '../ui/Icon'
import { Campo } from './Acceso'
import { normalizarCodigo, codigoValido } from '../db/cuenta'

/**
 * Vista de familias y delegados (cuentas "familia" de FutbolLab, compartidas con Informes).
 *
 * Privacidad de menores: solo dorsal e iniciales, sacados de inf_plantilla_anotador
 * (nunca se lee la tabla de jugadores con estos roles). Sin evaluaciones, notas,
 * contactos ni fechas de nacimiento. Todo en modo lectura.
 */
export function PanelFamilia() {
  const { cuenta, equiposInf } = useApp()
  return (
    <>
      <header className="cabecera">
        <div className="cabecera-txt">
          <h1>Hola, {cuenta.nombre.split(' ')[0]}</h1>
          <p className="sub">{equiposInf.length === 1 ? 'Tu equipo' : `Tus ${equiposInf.length} equipos`} · solo lectura</p>
        </div>
      </header>

      {equiposInf.map((eq) => (
        <section key={eq.equipoId} className="bloque">
          <div className="familia-cab">
            <h2>{eq.nombre ?? 'Equipo'}</h2>
            <span className="chip">{eq.rol === 'anotador' ? 'Delegado' : 'Familia'}</span>
          </div>
          {eq.rol === 'anotador' && <p className="sub">Como delegado puedes apuntar los partidos en FutbolLab Informes, con esta misma cuenta.</p>}
          {eq.jugadores.length === 0 ? (
            <p className="sub">Todavía no hay jugadores en la plantilla.</p>
          ) : (
            <ul className="familia-plantilla" aria-label="Plantilla">
              {eq.jugadores.map((j) => (
                <li key={j.id}>
                  <Camiseta dorsal={j.dorsal} size={46} />
                  <strong aria-label={`Dorsal ${j.dorsal}, iniciales ${j.iniciales}`}>{j.iniciales || '—'}</strong>
                  {j.posiciones[0] && <span className="sub">{j.posiciones.join(' · ')}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="aviso-permiso con-icono">
            <Icon n="candado" size={16} /> Esto solo lo puede cambiar el entrenador.
          </p>
        </section>
      ))}

      <section className="bloque">
        <h2>¿Otro equipo?</h2>
        <UnirseConCodigo />
      </section>
    </>
  )
}

/** Unirse a un equipo con el código que da el entrenador. El servidor decide el rol. */
export function UnirseConCodigo() {
  const { unirseConCodigo } = useApp()
  const [codigo, setCodigo] = useState('')
  const [estado, setEstado] = useState<'' | 'enviando' | 'hecho'>('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="form unirse"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        if (!codigoValido(codigo)) return setError('El código tiene de 6 a 8 letras o números. Pídeselo al entrenador.')
        setEstado('enviando')
        try {
          await unirseConCodigo(codigo)
          setEstado('hecho')
          setCodigo('')
        } catch (err) {
          setEstado('')
          setError((err as Error).message)
        }
      }}
    >
      <Campo etiqueta="Código del equipo" error={error ?? undefined} ayuda={estado === 'hecho' ? 'Listo: ya estás en el equipo.' : 'De 6 a 8 letras o números. Te lo da el entrenador.'}>
        <input className="codigo-equipo" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={10} value={codigo} onChange={(e) => setCodigo(normalizarCodigo(e.target.value))} />
      </Campo>
      <button className="btn primario" type="submit" disabled={estado === 'enviando'}>
        {estado === 'enviando' ? 'Comprobando…' : 'Unirme al equipo'}
      </button>
    </form>
  )
}
