import { AppProvider, useApp } from './state/store'
import { Logo } from './ui/Logo'
import { Icon, type NombreIcono } from './ui/Icon'
import { href, useRuta, type Ruta } from './state/router'
import { Inicio } from './screens/Inicio'
import { Plantilla } from './screens/Plantilla'
import { Jugador } from './screens/Jugador'
import { EvaluacionRapida } from './screens/EvaluacionRapida'
import { Evolucion } from './screens/Evolucion'
import { Perfil } from './screens/Perfil'

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
function BarraSuperior() {
  const { cuenta, ds, verComo } = useApp()
  const eq = ds.equipos[0]
  return (
    <header className="appbar">
      <a href={href({ nombre: 'inicio' })} className="appbar-marca" aria-label="Inicio">
        <Logo alto={24} app="Jugadores" />
      </a>
      <a href={href({ nombre: 'perfil' })} className="appbar-usuario">
        <span className="appbar-equipo">
          <strong>{eq.nombre}</strong>
          <span>{verComo === 'ayudante' ? 'Viendo como ayudante' : eq.entidad}</span>
        </span>
        {cuenta.foto ? <img src={cuenta.foto} alt="" className="appbar-foto" /> : <span className="appbar-foto ini">{cuenta.nombre.slice(0, 1).toUpperCase()}</span>}
      </a>
    </header>
  )
}

function Shell() {
  const r = useRuta()
  const pantallaCompleta = r.nombre === 'evaluar'
  const tab = (t: (typeof TABS)[number]) => (
    <a key={t.nombre} href={href(t.r)} className={`tab ${t.activo(r) ? 'on' : ''}`} aria-current={t.activo(r) ? 'page' : undefined}>
      <Icon n={t.icono} size={22} />
      <span>{t.nombre}</span>
    </a>
  )
  return (
    <div className={`app ${pantallaCompleta ? 'completa' : ''}`}>
      {!pantallaCompleta && <BarraSuperior />}
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
