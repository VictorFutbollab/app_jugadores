import { Suspense, lazy, useEffect } from 'react'
import { AppProvider, useApp } from './state/store'
import { Logo } from './ui/Logo'
import { AvatarFutbol } from './ui/components'
import { Icon, type NombreIcono } from './ui/Icon'
import { href, ir, useRuta, type Ruta } from './state/router'
import { Inicio } from './screens/Inicio'
import { Plantilla } from './screens/Plantilla'
import { APP_NAME_CORTO, FLAGS } from './config'
import { PanelFamilia, UnirseConCodigo } from './screens/Familia'

// Carga diferida: estas pantallas (y los gráficos que usan) solo se descargan al abrirlas.
const Jugador = lazy(() => import('./screens/Jugador').then((m) => ({ default: m.Jugador })))
const EvaluacionRapida = lazy(() => import('./screens/EvaluacionRapida').then((m) => ({ default: m.EvaluacionRapida })))
const Evolucion = lazy(() => import('./screens/Evolucion').then((m) => ({ default: m.Evolucion })))
const Perfil = lazy(() => import('./screens/Perfil').then((m) => ({ default: m.Perfil })))
const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })))
const EditarJugador = lazy(() => import('./screens/Admin').then((m) => ({ default: m.EditarJugador })))

function Pantalla({ r }: { r: Ruta }) {
  switch (r.nombre) {
    case 'plantilla':
      return <Plantilla />
    case 'jugador':
      return <Jugador id={r.id} pestana={r.pestana} />
    case 'jugador-editar':
      return <EditarJugador id={r.id} />
    case 'evaluar':
      return <EvaluacionRapida />
    case 'evolucion':
      return <Evolucion id={r.id} />
    case 'perfil':
      return <Perfil />
    case 'admin':
      return <Admin seccion={r.seccion} />
    case 'admin-jugador':
      return <Admin seccion="jugadores" jugadorId={r.id} />
    default:
      return <Inicio />
  }
}

type Tab = { r: Ruta; nombre: string; icono: NombreIcono; activo: (r: Ruta) => boolean; clase?: string }
const TABS: Tab[] = [
  { r: { nombre: 'inicio' }, nombre: 'Inicio', icono: 'inicio', activo: (r) => r.nombre === 'inicio' },
  { r: { nombre: 'plantilla' }, nombre: 'Plantilla', icono: 'plantilla', activo: (r) => r.nombre === 'plantilla' || r.nombre === 'jugador' || r.nombre === 'jugador-editar' },
  { r: { nombre: 'evolucion' }, nombre: 'Evolución', icono: 'evolucion', activo: (r) => r.nombre === 'evolucion' },
  { r: { nombre: 'perfil' }, nombre: 'Perfil', icono: 'perfil', activo: (r) => r.nombre === 'perfil' },
]
/** Navegación simplificada: 4 pestañas. El Perfil se abre desde el avatar de arriba. */
const TABS_4: Tab[] = [TABS[0], TABS[1], { r: { nombre: 'evaluar' }, nombre: 'Evaluar', icono: 'mas', activo: (r) => r.nombre === 'evaluar', clase: 'tab-evaluar' }, TABS[2]]

/** Barra superior común a las apps FutbolLab: marca a la izquierda, equipo y entrenador a la derecha. */
function BarraSuperior({ enAdmin }: { enAdmin: boolean }) {
  const { cuenta, ds, verComo, equiposInf } = useApp()
  const eq = ds.equipos[0]
  const inf = ds.equipos.length === 0 ? equiposInf[0] : undefined
  return (
    <header className="appbar">
      <a href={href({ nombre: enAdmin ? 'admin' : 'inicio' })} className="appbar-marca" aria-label="Inicio">
        <Logo alto={24} app={enAdmin ? 'Admin' : APP_NAME_CORTO} />
      </a>
      <a href={enAdmin ? undefined : href({ nombre: 'perfil' })} className="appbar-usuario">
        <span className="appbar-equipo">
          <strong>{eq?.nombre ?? (inf ? (inf.nombre ?? 'Tu equipo') : cuenta.nombre)}</strong>
          <span>{verComo === 'ayudante' ? 'Viendo como ayudante' : (eq?.entidad ?? (inf ? (inf.rol === 'anotador' ? 'Delegado' : 'Familia') : 'Sin equipo asignado'))}</span>
        </span>
        {cuenta.foto ? <img src={cuenta.foto} alt="" className="appbar-foto" /> : <AvatarFutbol size={34} className="appbar-foto" />}
      </a>
    </header>
  )
}

/**
 * Sin equipo de entrenador. Tres casos:
 *  - delegado o familia de algún equipo → vista de solo lectura (dorsal e iniciales);
 *  - familia sin equipo → puede unirse con el código del entrenador;
 *  - entrenador sin equipo → un admin (o FutbolLab Informes) tiene que darle uno.
 */
function SinEquipo() {
  const r = useRuta()
  const { cuenta, cerrarSesion, equiposInf, tipoCuenta } = useApp()
  let cuerpo
  if (r.nombre === 'perfil') {
    cuerpo = (
      <Suspense fallback={null}>
        <Perfil />
      </Suspense>
    )
  } else if (equiposInf.length > 0) {
    cuerpo = <PanelFamilia />
  } else {
    cuerpo = (
      <>
        <section className="bloque" style={{ marginTop: 24 }}>
          <h2>Hola, {cuenta.nombre.split(' ')[0] || cuenta.usuario}</h2>
          {tipoCuenta === 'familia' ? (
            <p>Tu cuenta FutbolLab está creada. Para ver tu equipo, escribe el código que te ha dado el entrenador.</p>
          ) : (
            <p>
              Tu cuenta FutbolLab está creada. Crea tu equipo en FutbolLab Informes o pide a un administrador del club que te añada; cuando lo haga, verás aquí a tus jugadores. Te registraste con <strong>{cuenta.email}</strong>.
            </p>
          )}
        </section>
        <section className="bloque">
          <h2>{tipoCuenta === 'familia' ? 'Unirme a un equipo' : '¿Tienes un código de equipo?'}</h2>
          <UnirseConCodigo />
        </section>
      </>
    )
  }
  return (
    <div className="app">
      <BarraSuperior enAdmin={false} />
      <main>
        {cuerpo}
        {r.nombre !== 'perfil' && (
          <button className="btn peligro ancho" onClick={cerrarSesion}>
            <Icon n="salir" /> Cerrar sesión
          </button>
        )}
      </main>
    </div>
  )
}

/** Franja discreta: sin cobertura (con la hora de los datos) y notas pendientes de subir. */
function EstadoConexion() {
  const { sinConexion, pendientes } = useApp()
  if (!sinConexion && pendientes === 0) return null
  const cuando = sinConexion ? new Date(sinConexion) : null
  const hoy = cuando && cuando.toDateString() === new Date().toDateString()
  const hora = cuando?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const notas = pendientes === 1 ? '1 nota por subir' : `${pendientes} notas por subir`
  const fecha = hoy ? `de hoy a las ${hora}` : `del ${cuando?.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
  return (
    <div className={`estado-conexion ${sinConexion ? 'sin-red' : ''}`} role="status" aria-live="polite">
      <span className="estado-conexion-punto" aria-hidden />
      {sinConexion ? (
        <span>
          <strong>Sin cobertura.</strong> Datos {fecha}
          {pendientes > 0 && ` · ${notas}`}. Puedes seguir evaluando.
        </span>
      ) : (
        <span>
          <strong>Subiendo…</strong> {notas}. Se suben solas en cuanto hay señal.
        </span>
      )}
    </div>
  )
}

function Shell() {
  const r = useRuta()
  const { panel, equipos, aviso, cerrarAviso } = useApp()
  const rutaAdmin = r.nombre === 'admin' || r.nombre === 'admin-jugador'
  // Dos paneles separados: con la sesión de admin solo existe la administración y,
  // con la normal, ninguna ruta de administración. (Es solo interfaz: la protección
  // real es el servidor, que rechaza cada operación de admin a quien no lo es.)
  const fueraDeSitio = panel === 'admin' ? !rutaAdmin : rutaAdmin
  const enAdmin = panel === 'admin'
  const pantallaCompleta = !enAdmin && r.nombre === 'evaluar'
  useEffect(() => {
    if (fueraDeSitio) ir(panel === 'admin' ? { nombre: 'admin' } : { nombre: 'inicio' }, true)
  }, [fueraDeSitio, panel])
  if (fueraDeSitio) return null
  if (equipos.length === 0 && !enAdmin) return <SinEquipo />
  const tab = (t: Tab) => (
    <a key={t.nombre} href={href(t.r)} className={`tab ${t.clase ?? ''} ${t.activo(r) ? 'on' : ''}`} aria-current={t.activo(r) ? 'page' : undefined}>
      <Icon n={t.icono} size={22} />
      <span>{t.nombre}</span>
    </a>
  )
  return (
    <div className={`app ${pantallaCompleta || enAdmin ? 'completa' : ''} ${enAdmin ? 'ancha app-admin' : ''}`}>
      {!pantallaCompleta && <BarraSuperior enAdmin={enAdmin} />}
      <EstadoConexion />
      {aviso && (
        <div className="aviso-global" role="alert">
          <span>{aviso}</span>
          <button className="icon-btn plano" onClick={cerrarAviso} aria-label="Cerrar aviso">
            <Icon n="cerrar" size={18} />
          </button>
        </div>
      )}
      <main>
        <Suspense
          fallback={
            FLAGS.disenoV2 ? (
              <div className="esqueleto" role="status" aria-label="Cargando">
                <span className="esq esq-titulo" />
                <span className="esq esq-linea" />
                <span className="esq esq-bloque" />
                <span className="esq esq-bloque corto" />
              </div>
            ) : (
              <div className="cargando-pantalla" role="status">
                Cargando…
              </div>
            )
          }
        >
          {/* La clave por pantalla hace que cada cambio de sección entre con una transición suave */}
          <div className="pantalla" key={r.nombre}>
            <Pantalla r={r} />
          </div>
        </Suspense>
      </main>
      {!pantallaCompleta &&
        !enAdmin &&
        (FLAGS.navegacion4 ? (
          <nav className="tabbar tabbar-4" aria-label="Navegación principal">
            {TABS_4.map(tab)}
          </nav>
        ) : (
          <nav className="tabbar" aria-label="Navegación principal">
            {tab(TABS[0])}
            {tab(TABS[1])}
            <a href={href({ nombre: 'evaluar' })} className="tab-mas" aria-label="Evaluación rápida">
              <Icon n="mas" size={26} />
            </a>
            {tab(TABS[2])}
            {tab(TABS[3])}
          </nav>
        ))}
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
