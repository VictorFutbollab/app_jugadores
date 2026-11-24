/**
 * Cuenta FutbolLab compartida con Informes (mismo proyecto de Supabase).
 *
 * Al entrar, igual que Informes:
 *  1. perfil en `profiles` (lo crea el servidor al registrarse; si faltara, se crea aquí);
 *  2. tipo de cuenta en `inf_perfiles` ('manager' o 'familia'), solo si aún no existe;
 *  3. si el registro traía código de equipo, `inf_unirse(codigo)`;
 *  4. equipos: `miembros` (entrenadores) y `inf_miembros` (delegados y familias).
 *
 * Los permisos dentro de cada equipo los decide el servidor (inf_rol / RLS), nunca
 * el tipo de cuenta. Esta capa no cambia la estructura de la base de datos.
 */
import { supabase } from './supabase'
import type { Cuenta } from '../model/types'

export type TipoCuenta = 'admin' | 'manager' | 'familia'
export type RolPrincipal = 'entrenador' | 'anotador'

/** Metadatos que se guardan al registrarse (los mismos que usa Informes). */
export interface MetadatosRegistro {
  nombre: string
  rolPrincipal: RolPrincipal
  telefono?: string
  /** Código de equipo pendiente de usar en el primer inicio de sesión. */
  codigo_equipo?: string | null
}

/** Normaliza un código de equipo: mayúsculas, solo letras y números. */
export const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const codigoValido = (c: string) => /^[A-Z0-9]{6,8}$/.test(normalizarCodigo(c))

/**
 * Nombre de usuario interno a partir del email: parte antes de la @, en minúsculas,
 * solo [a-z0-9._], máximo 14 caracteres, más un número aleatorio (cumple ^[a-z0-9._]{3,20}$).
 */
export function generarUsuario(email: string, aleatorio = () => Math.floor(1000 + Math.random() * 9000)) {
  let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 14)
  if (base.length < 2) base = `fl${base}`
  return `${base}${aleatorio()}`
}

/** El servidor pone "u" + 12 hex cuando no recibe un usuario válido: se sustituye por uno legible. */
const USUARIO_AUTOMATICO = /^u[0-9a-f]{12}$/

export interface ResultadoCuenta {
  tipo: TipoCuenta | null
  /** Mensaje para el usuario (p. ej. error del código de equipo, que ya viene en español). */
  aviso?: string
}

/** Pasos del primer inicio de sesión. Cada uno es idempotente: se puede repetir en cada entrada. */
export async function completarCuenta(c: Cuenta): Promise<ResultadoCuenta> {
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return { tipo: null }
  const meta = (user.user_metadata ?? {}) as Partial<MetadatosRegistro>
  let aviso: string | undefined

  // 1. Usuario legible (si el servidor tuvo que inventarse uno).
  if (USUARIO_AUTOMATICO.test(c.usuario) && user.email) {
    for (let i = 0; i < 4; i++) {
      const r = await supabase.from('profiles').update({ usuario: generarUsuario(user.email) }).eq('id', c.id)
      if (!r.error) break
    }
  }

  // 2. Tipo de cuenta, solo la primera vez (después solo lo cambia un admin).
  const tipoFila = await supabase.from('inf_perfiles').select('tipo').eq('usuario_id', user.id).maybeSingle()
  if (!tipoFila.error && !tipoFila.data) {
    // Las cuentas creadas en Jugadores antes de este cambio eran de entrenadores.
    const tipo = meta.rolPrincipal === 'anotador' ? 'familia' : 'manager'
    await supabase.from('inf_perfiles').insert({ usuario_id: user.id, tipo })
  }

  // 3. Código de equipo pendiente.
  const codigo = meta.codigo_equipo ? normalizarCodigo(meta.codigo_equipo) : ''
  if (codigo) {
    const r = await supabase.rpc('inf_unirse', { codigo })
    if (r.error) aviso = r.error.message
    // Se usa una sola vez, haya ido bien o no (si falla, el aviso lo explica).
    await supabase.auth.updateUser({ data: { codigo_equipo: null } })
  }

  const t = await supabase.rpc('inf_tipo_cuenta')
  const tipo = (t.error ? (c.role === 'admin' ? 'admin' : null) : t.data) as TipoCuenta | null
  return { tipo, aviso }
}

/** Jugador tal como lo puede ver una familia o un delegado: dorsal e iniciales. */
export interface JugadorBasico {
  id: string
  dorsal: number
  iniciales: string
  posiciones: string[]
}

export interface EquipoFamilia {
  equipoId: string
  rol: 'anotador' | 'familia'
  nombre: string | null
  jugadores: JugadorBasico[]
}

/**
 * Equipos en los que el usuario es delegado o familia, con su plantilla reducida.
 * Nunca se lee la tabla `jugadores` con estos roles: solo inf_plantilla_anotador.
 */
export async function equiposFamilia(usuarioId: string): Promise<EquipoFamilia[]> {
  const r = await supabase.from('inf_miembros').select('equipo_id, rol').eq('usuario_id', usuarioId)
  if (r.error) throw r.error
  const filas = (r.data ?? []) as { equipo_id: string; rol: 'anotador' | 'familia' }[]
  return Promise.all(
    filas.map(async (f) => {
      const [p, e] = await Promise.all([
        supabase.rpc('inf_plantilla_anotador', { eq: f.equipo_id }),
        supabase.from('equipos').select('data').eq('id', f.equipo_id).maybeSingle(),
      ])
      const jugadores = ((p.data ?? []) as { id: string; dorsal: number; iniciales: string; posiciones: string[] | null }[])
        .map((j) => ({ id: j.id, dorsal: j.dorsal, iniciales: j.iniciales, posiciones: j.posiciones ?? [] }))
        .sort((a, b) => a.dorsal - b.dorsal)
      const nombre = ((e.data as { data?: { nombre?: string } } | null)?.data?.nombre ?? null) || null
      return { equipoId: f.equipo_id, rol: f.rol, nombre, jugadores }
    }),
  )
}
