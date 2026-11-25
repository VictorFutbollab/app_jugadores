/**
 * MODO LOCAL (solo `npm run dev`).
 *
 * Imita la parte de Supabase que usa la app, pero guardándolo todo en este
 * navegador (localStorage). Sirve para trabajar en localhost sin servidor y sin
 * confirmar el email. No hay contraseñas cifradas ni permisos RLS: NO es seguro y
 * nunca llega a la web publicada (supabase.ts solo lo usa con import.meta.env.DEV).
 */

type Fila = Record<string, unknown>
interface UsuarioLocal {
  id: string
  email: string
  password: string
  /** Metadatos del registro (nombre, rolPrincipal, telefono, codigo_equipo…). */
  meta?: Record<string, unknown>
}
interface Almacen {
  usuarios: UsuarioLocal[]
  sesion: string | null
  tablas: Record<string, Fila[]>
}

const CLAVE = 'modo-local:datos'
const vacio = (): Almacen => ({ usuarios: [], sesion: null, tablas: {} })

function leer(): Almacen {
  try {
    const raw = localStorage.getItem(CLAVE)
    return raw ? { ...vacio(), ...(JSON.parse(raw) as Almacen) } : vacio()
  } catch {
    return vacio()
  }
}
function escribir(a: Almacen) {
  localStorage.setItem(CLAVE, JSON.stringify(a))
}
const tabla = (a: Almacen, t: string) => (a.tablas[t] ??= [])
const ahora = () => new Date().toISOString()
const err = (message: string, code?: string) => ({ message, code, name: 'ErrorLocal' })

// ───────────── Auth ─────────────

type Evento = 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED'
const oyentes = new Set<(e: Evento, s: unknown) => void>()
const avisar = (e: Evento, s: unknown) => setTimeout(() => oyentes.forEach((f) => f(e, s)), 0)

const sesionDe = (u: UsuarioLocal) => ({ access_token: 'local', user: { id: u.id, email: u.email, user_metadata: u.meta ?? {} } })
function usuarioConSesion(a = leer()) {
  return a.usuarios.find((u) => u.id === a.sesion) ?? null
}

const auth = {
  async getSession() {
    const u = usuarioConSesion()
    return { data: { session: u ? sesionDe(u) : null }, error: null }
  },
  async getUser() {
    const u = usuarioConSesion()
    return u ? { data: { user: sesionDe(u).user }, error: null } : { data: { user: null }, error: err('Auth session missing!') }
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const a = leer()
    const u = a.usuarios.find((x) => x.email === email.toLowerCase() && x.password === password)
    if (!u) return { data: { session: null, user: null }, error: err('Invalid login credentials') }
    a.sesion = u.id
    escribir(a)
    avisar('SIGNED_IN', sesionDe(u))
    return { data: { session: sesionDe(u), user: sesionDe(u).user }, error: null }
  },
  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const a = leer()
    email = email.toLowerCase()
    if (a.usuarios.some((x) => x.email === email)) return { data: { session: null, user: null }, error: err('User already registered') }
    const m = options?.data ?? {}
    const u: UsuarioLocal = { id: crypto.randomUUID(), email, password, meta: { ...m } }
    const perfiles = tabla(a, 'profiles')
    let usuario = String(m.usuario ?? '').toLowerCase()
    if (!/^[a-z0-9._]{3,20}$/.test(usuario) || perfiles.some((p) => p.usuario === usuario)) usuario = 'u' + u.id.replace(/-/g, '').slice(0, 12)
    perfiles.push({
      id: u.id,
      nombre: String(m.nombre ?? ''),
      usuario,
      email,
      telefono: String(m.telefono ?? ''),
      foto: null,
      entidad: String(m.entidad ?? ''),
      categoria: String(m.categoria ?? ''),
      equipo: String(m.equipo ?? ''),
      genero: ['masculino', 'femenino', 'mixto'].includes(String(m.genero)) ? m.genero : 'masculino',
      acepta_privacidad_en: m.acepta_privacidad ? ahora() : null,
      // En local la primera cuenta es administradora, para poder probarlo todo.
      role: perfiles.length === 0 ? 'admin' : 'player',
      creado_en: ahora(),
      actualizado_en: ahora(),
    })
    a.usuarios.push(u)
    a.sesion = u.id
    escribir(a)
    avisar('SIGNED_IN', sesionDe(u))
    return { data: { session: sesionDe(u), user: sesionDe(u).user }, error: null }
  },
  async signOut() {
    const a = leer()
    a.sesion = null
    escribir(a)
    avisar('SIGNED_OUT', null)
    return { error: null }
  },
  async resetPasswordForEmail() {
    return { data: null, error: err('En el modo local no se envían correos. Crea otra cuenta o borra los datos del navegador.') }
  },
  async updateUser(c: { email?: string; password?: string; data?: Record<string, unknown> }) {
    const a = leer()
    const u = usuarioConSesion(a)
    if (!u) return { data: { user: null }, error: err('Auth session missing!') }
    if (c.email) {
      const email = c.email.toLowerCase()
      if (a.usuarios.some((x) => x.email === email && x.id !== u.id)) return { data: { user: null }, error: err('Email already registered') }
      u.email = email
      const p = tabla(a, 'profiles').find((x) => x.id === u.id)
      if (p) p.email = email
    }
    if (c.password) u.password = c.password
    if (c.data) u.meta = { ...(u.meta ?? {}), ...c.data }
    escribir(a)
    avisar('USER_UPDATED', sesionDe(u))
    return { data: { user: sesionDe(u).user }, error: null }
  },
  onAuthStateChange(f: (e: Evento, s: unknown) => void) {
    oyentes.add(f)
    return { data: { subscription: { unsubscribe: () => oyentes.delete(f) } } }
  },
}

// ───────────── Tablas (lo justo de PostgREST que usa remote.ts) ─────────────

type Filtro = (f: Fila) => boolean
const comoLike = (patron: string) => new RegExp('^' + patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$')

/**
 * Lo mínimo de las políticas RLS de Supabase para que el modo local se comporte igual:
 * los datos de un equipo solo los ve quien es del cuerpo técnico (`miembros`) o un admin.
 * Familias y delegados no ven esas tablas: usan inf_plantilla_anotador.
 */
const TABLAS_DE_EQUIPO = new Set(['equipos', 'miembros', 'jugadores', 'eventos', 'estados', 'evaluaciones', 'pruebas', 'notas', 'asistencias', 'participaciones', 'cargas'])
function visible(a: Almacen, t: string, f: Fila) {
  if (!TABLAS_DE_EQUIPO.has(t)) return true
  if (tabla(a, 'profiles').find((p) => p.id === a.sesion)?.role === 'admin') return true
  const mios = new Set(tabla(a, 'miembros').filter((m) => m.usuario_id === a.sesion).map((m) => m.equipo_id))
  return mios.has(t === 'equipos' ? f.id : f.equipo_id)
}

/** Admin, o entrenador principal de ese equipo. */
function puedeGestionar(a: Almacen, eq: string) {
  if (tabla(a, 'profiles').find((p) => p.id === a.sesion)?.role === 'admin') return true
  return tabla(a, 'miembros').some((m) => m.equipo_id === eq && m.usuario_id === a.sesion && m.rol === 'entrenador_principal')
}

/** Las filas de un jugador heredan su equipo (lo que en el servidor hace un trigger). */
function conEquipo(a: Almacen, t: string, f: Fila): Fila {
  if (!('jugador_id' in f) || t === 'jugadores') return f
  const j = tabla(a, 'jugadores').find((x) => x.id === f.jugador_id)
  return { ...f, equipo_id: j?.equipo_id ?? f.equipo_id }
}

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filtros: Filtro[] = []
  private payload: Fila | Fila[] | null = null
  private conflicto = ['id']
  private devolver = false
  private desde = 0
  private hasta = Infinity
  private ordenar: { col: string; asc: boolean } | null = null
  private maximo = Infinity
  private una = false

  private t: string
  constructor(t: string) {
    this.t = t
  }

  select() {
    if (this.op === 'select') return this
    this.devolver = true
    return this
  }
  insert(filas: Fila | Fila[]) {
    this.op = 'insert'
    this.payload = filas
    return this
  }
  upsert(filas: Fila | Fila[], o?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = filas
    if (o?.onConflict) this.conflicto = o.onConflict.split(',').map((s) => s.trim())
    return this
  }
  update(valores: Fila) {
    this.op = 'update'
    this.payload = valores
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(col: string, v: unknown) {
    this.filtros.push((f) => f[col] === v)
    return this
  }
  like(col: string, patron: string) {
    const re = comoLike(patron)
    this.filtros.push((f) => re.test(String(f[col] ?? '')))
    return this
  }
  range(a: number, b: number) {
    this.desde = a
    this.hasta = b
    return this
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.ordenar = { col, asc: o?.ascending !== false }
    return this
  }
  limit(n: number) {
    this.maximo = n
    return this
  }
  maybeSingle() {
    this.una = true
    return this
  }

  private ejecutar(): { data: unknown; error: unknown } {
    const a = leer()
    const filas = tabla(a, this.t)
    const pasa = (f: Fila) => this.filtros.every((p) => p(f))
    switch (this.op) {
      case 'select': {
        let r = filas.filter(pasa).filter((f) => visible(a, this.t, f))
        if (this.ordenar) {
          const { col, asc } = this.ordenar
          r = [...r].sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : String(x[col]) > String(y[col]) ? 1 : 0) * (asc ? 1 : -1))
        }
        r = r.slice(this.desde, Math.min(this.hasta + 1, this.desde + this.maximo))
        return { data: this.una ? (r[0] ?? null) : r, error: null }
      }
      case 'insert': {
        const nuevas = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((f) => ({ creado_en: ahora(), ...conEquipo(a, this.t, f) }))
        filas.push(...nuevas)
        escribir(a)
        return { data: this.devolver ? nuevas : null, error: null }
      }
      case 'upsert': {
        const nuevas = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((f) => conEquipo(a, this.t, f))
        for (const n of nuevas) {
          const i = filas.findIndex((f) => this.conflicto.every((c) => f[c] === n[c]))
          if (i >= 0) filas[i] = { ...filas[i], ...n, actualizado_en: ahora() }
          else filas.push({ creado_en: ahora(), ...n })
        }
        escribir(a)
        return { data: this.devolver ? nuevas : null, error: null }
      }
      case 'update': {
        const r = filas.filter(pasa)
        for (const f of r) Object.assign(f, this.payload, { actualizado_en: ahora() })
        escribir(a)
        return { data: this.devolver ? r : null, error: null }
      }
      case 'delete': {
        const fuera = filas.filter(pasa)
        a.tablas[this.t] = filas.filter((f) => !pasa(f))
        // Borrado en cascada, como en la base de datos real.
        const ids = new Set(fuera.map((f) => f.id))
        if (this.t === 'jugadores') for (const t of Object.keys(a.tablas)) a.tablas[t] = a.tablas[t].filter((f) => !ids.has(f.jugador_id))
        if (this.t === 'equipos') for (const t of Object.keys(a.tablas)) if (t !== 'equipos') a.tablas[t] = a.tablas[t].filter((f) => !ids.has(f.equipo_id))
        escribir(a)
        return { data: this.devolver ? fuera : null, error: null }
      }
      default:
        return { data: null, error: err('Operación no soportada en modo local') }
    }
  }

  then<A = { data: unknown; error: unknown }, B = never>(ok?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    let r: { data: unknown; error: unknown }
    try {
      r = this.ejecutar()
    } catch (e) {
      r = { data: null, error: err(e instanceof Error ? e.message : String(e)) }
    }
    return Promise.resolve(r).then(ok, ko)
  }
}

// ───────────── Funciones de servidor ─────────────

/** SHA-256 en hexadecimal (los códigos de equipo se guardan así, igual que en Supabase). */
async function sha256(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Solo para pruebas en local: crea un código de equipo (en Supabase los crea Informes). */
export async function crearCodigoLocal(equipoId: string, codigo: string, rol: 'familia' | 'anotador' = 'familia') {
  const a = leer()
  tabla(a, 'inf_invitaciones').push({ codigo_hash: await sha256(codigo.toUpperCase()), equipo_id: equipoId, rol, usos: 0, usos_max: 50, revocada: false, creado_en: ahora() })
  escribir(a)
}

async function rpc(nombre: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: unknown }> {
  const a = leer()
  const jugador = () => tabla(a, 'jugadores').find((f) => f.id === args.jid)
  switch (nombre) {
    case 'usuario_disponible':
      return { data: !tabla(a, 'profiles').some((p) => p.usuario === String(args.u).toLowerCase()), error: null }
    case 'jugadores_basicos':
      return { data: [], error: null } // en local se ven todas las fichas completas
    case 'jugador_set_favorito': {
      const j = jugador()
      if (j) j.data = { ...(j.data as Fila), favorito: args.valor }
      escribir(a)
      return { data: null, error: null }
    }
    case 'jugador_registrar_consentimiento': {
      const j = jugador()
      if (j) j.data = { ...(j.data as Fila), consentimiento: args.c, fechaNacimiento: args.fecha_nacimiento || null }
      escribir(a)
      return { data: null, error: null }
    }
    // ── Funciones de Informes (mismo comportamiento que en Supabase, en pequeño) ──
    case 'inf_tipo_cuenta': {
      const yo = tabla(a, 'profiles').find((p) => p.id === a.sesion)
      if (yo?.role === 'admin') return { data: 'admin', error: null }
      return { data: tabla(a, 'tipos_cuenta').find((p) => p.usuario_id === a.sesion)?.tipo ?? 'familia', error: null }
    }
    case 'inf_rol': {
      const eq = String(args.eq)
      const m = tabla(a, 'miembros').find((x) => x.equipo_id === eq && x.usuario_id === a.sesion && ['entrenador_principal', 'ayudante'].includes(String(x.rol)))
      if (m) return { data: 'entrenador', error: null }
      return { data: tabla(a, 'inf_miembros').find((x) => x.equipo_id === eq && x.usuario_id === a.sesion)?.rol ?? null, error: null }
    }
    case 'inf_unirse': {
      const codigo = String(args.codigo ?? '').toUpperCase()
      const hash = await sha256(codigo)
      const inv = tabla(a, 'inf_invitaciones').find((i) => i.codigo_hash === hash && !i.revocada && (!i.expira_en || String(i.expira_en) > ahora()))
      if (!inv || (inv.usos_max != null && Number(inv.usos ?? 0) >= Number(inv.usos_max))) return { data: null, error: err('Código no válido o caducado. Pídele uno nuevo al entrenador.') }
      const miembros = tabla(a, 'inf_miembros')
      if (!miembros.some((x) => x.equipo_id === inv.equipo_id && x.usuario_id === a.sesion)) miembros.push({ equipo_id: inv.equipo_id, usuario_id: a.sesion, rol: inv.rol ?? 'familia', creado_en: ahora() })
      inv.usos = Number(inv.usos ?? 0) + 1
      escribir(a)
      return { data: inv.equipo_id, error: null }
    }
    case 'inf_plantilla_anotador': {
      const eq = String(args.eq)
      const puede = tabla(a, 'inf_miembros').some((x) => x.equipo_id === eq && x.usuario_id === a.sesion) || tabla(a, 'miembros').some((x) => x.equipo_id === eq && x.usuario_id === a.sesion)
      if (!puede) return { data: [], error: null }
      const filas = tabla(a, 'jugadores')
        .filter((j) => j.equipo_id === eq)
        .map((j) => {
          const d = (j.data ?? {}) as { dorsal?: number; nombre?: string; apellidos?: string; posiciones?: string[] }
          const iniciales = `${(d.nombre ?? '').trim().charAt(0)}${(d.apellidos ?? '').trim().charAt(0)}`.toUpperCase()
          return { id: j.id, dorsal: d.dorsal ?? 0, iniciales, posiciones: d.posiciones ?? [] }
        })
      return { data: filas, error: null }
    }
    // ── Guardado compartido de equipos y jugadores (como inf_* en Supabase) ──
    // Solo admin o entrenador principal; se fusionan los datos y el consentimiento no se toca
    // (solo jugador_registrar_consentimiento lo escribe).
    case 'inf_crear_equipo': {
      const id = String(args.p_id)
      const equipos = tabla(a, 'equipos')
      if (equipos.some((e) => e.id === id)) return { data: null, error: err('Ese equipo ya existe', '23505') }
      equipos.push({ id, data: args.p_data, creado_en: ahora() })
      tabla(a, 'miembros').push({ equipo_id: id, usuario_id: a.sesion, rol: 'entrenador_principal', permisos: { verFicha: true, evaluar: true, verNotasPrivadas: true }, creado_en: ahora() })
      escribir(a)
      return { data: id, error: null }
    }
    case 'inf_guardar_equipo': {
      const id = String(args.p_id)
      if (!puedeGestionar(a, id)) return { data: null, error: err('Solo el entrenador principal o un administrador pueden cambiar el equipo', '42501') }
      const e = tabla(a, 'equipos').find((x) => x.id === id)
      if (!e) return { data: null, error: err('Equipo no encontrado') }
      e.data = { ...(e.data as Fila), ...(args.p_cambios as Fila) }
      e.actualizado_en = ahora()
      escribir(a)
      return { data: null, error: null }
    }
    case 'inf_guardar_jugadores': {
      const eq = String(args.p_equipo)
      if (!puedeGestionar(a, eq)) return { data: null, error: err('Solo el entrenador principal o un administrador pueden dar de alta y editar jugadores', '42501') }
      const filas = tabla(a, 'jugadores')
      for (const { id, data } of args.p_jugadores as { id: string; data: Fila }[]) {
        const { consentimiento: _fuera, ...cambios } = data
        const f = filas.find((x) => x.id === id)
        if (f && f.equipo_id !== eq) return { data: null, error: err('El jugador es de otro equipo', '42501') }
        if (f) Object.assign(f, { data: { ...(f.data as Fila), ...cambios }, actualizado_en: ahora() })
        else filas.push({ id, equipo_id: eq, data: { ...cambios, consentimiento: null }, creado_en: ahora() })
      }
      escribir(a)
      return { data: null, error: null }
    }
    // ── Cuenta y permisos (como en Supabase, en pequeño) ──
    case 'mis_equipos': {
      // Los equipos de la cuenta: los suyos de miembros (y todos, si es admin).
      const admin = tabla(a, 'profiles').find((p) => p.id === a.sesion)?.role === 'admin'
      const mios = new Set(tabla(a, 'miembros').filter((m) => m.usuario_id === a.sesion).map((m) => m.equipo_id))
      return { data: tabla(a, 'equipos').filter((e) => admin || mios.has(e.id)).map((e) => ({ id: e.id, data: e.data })), error: null }
    }
    case 'puede_editar_equipo':
      return { data: puedeGestionar(a, String(args.eq)), error: null }
    case 'inf_retirar_consentimiento': {
      const j = jugador()
      if (!j) return { data: null, error: err('Jugador no encontrado') }
      if (!puedeGestionar(a, String(j.equipo_id))) return { data: null, error: err('Solo el entrenador o un administrador pueden hacerlo', '42501') }
      const d = j.data as Fila
      const c = d.consentimiento as Fila | null
      if (!c || c.retiradoEn) return { data: null, error: err('No hay una autorización vigente') }
      // Sin autorización no se guardan la ficha ni la foto (como minimizar()).
      j.data = { ...d, consentimiento: { ...c, retiradoEn: ahora() }, foto: null, fechaNacimiento: null, posiciones: [], pierna: null }
      escribir(a)
      return { data: null, error: null }
    }
    case 'eliminar_mi_cuenta': {
      const yo = a.sesion
      // Igual que el servidor: no se puede dejar sin entrenador principal un equipo con jugadores.
      const bloquea = tabla(a, 'miembros').some(
        (m) =>
          m.usuario_id === yo &&
          m.rol === 'entrenador_principal' &&
          !tabla(a, 'miembros').some((o) => o.equipo_id === m.equipo_id && o.usuario_id !== yo && o.rol === 'entrenador_principal') &&
          tabla(a, 'jugadores').some((j) => j.equipo_id === m.equipo_id),
      )
      if (bloquea) return { data: null, error: err('Eres el único entrenador principal de un equipo con jugadores. Nombra a otro entrenador principal o borra el equipo antes de eliminar tu cuenta.', 'P0001') }
      a.tablas.miembros = tabla(a, 'miembros').filter((m) => m.usuario_id !== yo)
      a.tablas.inf_miembros = tabla(a, 'inf_miembros').filter((m) => m.usuario_id !== yo)
      a.tablas.profiles = tabla(a, 'profiles').filter((p) => p.id !== yo)
      a.usuarios = a.usuarios.filter((u) => u.id !== yo)
      a.sesion = null
      escribir(a)
      return { data: null, error: null }
    }
    case 'admin_verificar_pin': {
      // En local el PIN está en .env.local (VITE_ADMIN_PIN_LOCAL); en Supabase lo comprueba la base de datos.
      const bueno = String(import.meta.env.VITE_ADMIN_PIN_LOCAL ?? '').trim()
      if (!/^\d{4,8}$/.test(bueno)) return { data: null, error: err('Falta el PIN de administración en .env.local (VITE_ADMIN_PIN_LOCAL). Reinicia npm run dev después de ponerlo.') }
      const yo = tabla(a, 'profiles').find((p) => p.id === a.sesion)
      return { data: yo?.role === 'admin' && String(args.pin ?? '') === bueno, error: null }
    }
    case 'admin_set_role': {
      const perfiles = tabla(a, 'profiles')
      const p = perfiles.find((x) => x.id === args.objetivo)
      if (!p) return { data: null, error: err('Usuario no encontrado') }
      if (args.nuevo !== 'admin' && p.role === 'admin' && perfiles.filter((x) => x.role === 'admin').length <= 1)
        return { data: null, error: err('Tiene que quedar al menos un administrador', '42501') }
      p.role = args.nuevo
      escribir(a)
      return { data: null, error: null }
    }
    default:
      return { data: null, error: err(`La función ${nombre} no existe en modo local`) }
  }
}

export function crearClienteLocal() {
  return { auth, from: (t: string) => new Consulta(t), rpc }
}

/** Borra todo lo guardado en modo local (cuentas y datos). */
export function borrarModoLocal() {
  localStorage.removeItem(CLAVE)
}
