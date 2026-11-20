import { useEffect } from 'react'
import { AppProvider, useApp } from './state/store'
import { Logo } from './ui/Logo'
import { Icon, type NombreIcono } from './ui/Icon'
import { href, ir, useRuta, type Ruta } from './state/router'
import { Inicio } from './screens/Inicio'
import { Plantilla } from './screens/Plantilla'
import { Jugador } from './screens/Jugador'
import { EvaluacionRapida } from './screens/EvaluacionRapida'
import { Evolucion } from './screens/Evolucion'
import { Perfil } from './screens/Perfil'
import { Admin, AdminJugador } from './screens/Admin'

function Pantalla({ r }: { r: Ruta }) {
  switch (r.nombre) {
    case 'plantilla':
      return <Plantilla />
    case 'jugador':
      return <Jugador id={r.id} pestana={r.pestana} />
    case 'evaluar':
      return <EvaluacionRapida />
    case 'evolucion':
      return <Evolucion id={r.id} />
    case 'perfil':
      return <Perfil />
    case 'admin':
      return <Admin seccion={r.seccion} />
    case 'admin-jugador':
      return <AdminJugador id={r.id} />
    default:
      return <Inicio />
  }
}

const TABS: { r: Ruta; nombre: string; icono: NombreIcono; activo: (r: Ruta) => boolean }[] = [
  { r: { nombre: 'inicio' }, nombre: 'Inicio', icono: 'inicio', activo: (r) => r.nombre === 'inicio' },
  { r: { nombre: 'plantilla' }, nombre: 'Plantilla', icono: 'plantilla', activo: (r) => r.nombre === 'plantilla' || r.nombre === 'jugador' },
  { r: { nombre: 'evolucion' }, nombre: 'Evolución', icono: 'evolucion', activo: (r) => r.nombre === 'evolucion' },
  { r: { nombre: 'perfil' }, nombre: 'Perfil', icono: 'perfil', activo: (r) => r.nombre === 'perfil' },
]

/** Barra superior común a las apps FutbolLab: marca a la izquierda, equipo y entrenador a la derecha. */
function BarraSuperior({ enAdmin }: { enAdmin: boolean }) {
  const { cuenta, ds, verComo, esAdmin } = useApp()
  const eq = ds.equipos[0]
  return (
    <header className="appbar">
      <a href={href({ nombre: 'inicio' })} className="appbar-marca" aria-label="Inicio">
        <Logo alto={24} app={enAdmin ? 'Admin' : 'Jugadores'} />
      </a>
      {esAdmin && (
        <a href={href({ nombre: 'admin' })} className={`icon-btn appbar-admin ${enAdmin ? 'on' : ''}`} aria-label="Panel de administración" title="Administración" aria-current={enAdmin ? 'page' : undefined}>
          <Icon n="escudo" />
        </a>
      )}
      <a href={href({ nombre: 'perfil' })} className="appbar-usuario">
        <span className="appbar-equipo">
          <strong>{eq?.nombre ?? cuenta.nombre}</strong>
          <span>{verComo === 'ayudante' ? 'Viendo como ayudante' : (eq?.entidad ?? 'Sin equipo asignado')}</span>
        </span>
        {cuenta.foto ? <img src={cuenta.foto} alt="" className="appbar-foto" /> : <span className="appbar-foto ini">{cuenta.nombre.slice(0, 1).toUpperCase()}</span>}
      </a>
    </header>
  )
}

/** Cuenta recién creada: hasta que un admin la añade a un equipo, el servidor no le da ningún dato. */
function SinEquipo() {
  const { cuenta, esAdmin, cerrarSesion } = useApp()
  return (
    <div className="app">
      <BarraSuperior enAdmin={false} />
      <main>
        <section className="bloque" style={{ marginTop: 24 }}>
          <h2>Hola, {cuenta.nombre.split(' ')[0] || cuenta.usuario}</h2>
          {esAdmin ? (
            <>
              <p>Eres administrador y todavía no hay ningún equipo. Crea el primero o carga la plantilla de ejemplo.</p>
              <div className="botones">
                <a className="btn primario" href={href({ nombre: 'admin' })}>
                  <Icon n="escudo" size={18} /> Ir al panel de admin
                </a>
              </div>
            </>
          ) : (
            <p>
              Tu cuenta está creada. Un administrador de tu club tiene que añadirte a tu equipo; cuando lo haga, verás aquí a tus jugadores. Si tarda, avísale de que te has registrado con <strong>{cuenta.email}</strong>.
            </p>
          )}
        </section>
        <button className="btn peligro ancho" onClick={cerrarSesion}>
          <Icon n="salir" /> Cerrar sesión
        </button>
      </main>
    </div>
  )
}

function Shell() {
  const r = useRuta()
  const { esAdmin, equipos, aviso, cerrarAviso } = useApp()
  const pantallaCompleta = r.nombre === 'evaluar'
  const enAdmin = r.nombre === 'admin' || r.nombre === 'admin-jugador'
  const bloqueado = enAdmin && !esAdmin

  // Rutas de administración: quien no es admin vuelve a su panel. (Es solo comodidad:
  // aunque forzara la pantalla, el servidor rechaza cada operación de admin.)
  useEffect(() => {
    if (bloqueado) ir({ nombre: 'inicio' }, true)
  }, [bloqueado])
  if (bloqueado) return null
  if (equipos.length === 0 && !enAdmin) return <SinEquipo />
  const tab = (t: (typeof TABS)[number]) => (
    <a key={t.nombre} href={href(t.r)} className={`tab ${t.activo(r) ? 'on' : ''}`} aria-current={t.activo(r) ? 'page' : undefined}>
      <Icon n={t.icono} size={22} />
      <span>{t.nombre}</span>
    </a>
  )
  return (
    <div className={`app ${pantallaCompleta ? 'completa' : ''} ${r.nombre === 'admin' ? 'ancha' : ''}`}>
      {!pantallaCompleta && <BarraSuperior enAdmin={enAdmin} />}
      {aviso && (
        <div className="aviso-global" role="alert">
          <span>{aviso}</span>
          <button className="icon-btn plano" onClick={cerrarAviso} aria-label="Cerrar aviso">
            <Icon n="cerrar" size={18} />
          </button>
        </div>
      )}
      <main>
        <Pantalla r={r} />
      </main>
      {!pantallaCompleta && (
        <nav className="tabbar" aria-label="Navegación principal">
          {tab(TABS[0])}
          {tab(TABS[1])}
          <a href={href({ nombre: 'evaluar' })} className="tab-mas" aria-label="Evaluación rápida">
            <Icon n="mas" size={26} />
          </a>
          {tab(TABS[2])}
          {tab(TABS[3])}
        </nav>
      )}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
