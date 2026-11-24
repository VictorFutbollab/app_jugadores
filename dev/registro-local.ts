/**
 * SOLO EN DESARROLLO (npm run dev, localhost): cuentas sin confirmar el email.
 *
 * En localhost no llega el correo de confirmación de Supabase, así que el propio
 * servidor de desarrollo (Node, en tu ordenador) crea la cuenta ya confirmada o
 * confirma una que se quedó pendiente. Usa la clave secreta SUPABASE_SERVICE_ROLE_KEY
 * de .env.local, que:
 *   - no lleva el prefijo VITE_, así que Vite NUNCA la mete en la app del navegador;
 *   - solo existe en este ordenador (.env.local no se sube a GitHub);
 *   - no se usa en `npm run build`: este plugin solo existe en `vite dev`.
 *
 * No da permisos: las cuentas se crean como "player" (el servidor lo impone) y sin equipo.
 * En la web publicada se sigue exigiendo confirmar el email.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'

const leerCuerpo = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((ok, ko) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => {
      try {
        ok(s ? JSON.parse(s) : {})
      } catch (e) {
        ko(e)
      }
    })
  })

const responder = (res: ServerResponse, status: number, cuerpo: unknown) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(cuerpo))
}

/** Solo peticiones hechas desde este mismo ordenador. */
const esLocal = (req: IncomingMessage) => {
  const ip = req.socket.remoteAddress ?? ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

export function registroLocal(): Plugin {
  return {
    name: 'futbollab-registro-local',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      // Seguridad: una clave secreta jamás puede ir en una variable VITE_ (llegaría al navegador).
      for (const [k, v] of Object.entries(env)) {
        if (k.startsWith('VITE_') && /^sb_secret_|service_role/.test(v)) {
          throw new Error(`La variable ${k} contiene una clave secreta. Quítala: las variables VITE_ llegan al navegador.`)
        }
      }
      const url = env.VITE_SUPABASE_URL
      const clave = env.SUPABASE_SERVICE_ROLE_KEY
      const admin = (ruta: string, init: RequestInit = {}) =>
        fetch(`${url}/auth/v1/admin${ruta}`, { ...init, headers: { apikey: clave!, authorization: `Bearer ${clave}`, 'content-type': 'application/json', ...(init.headers ?? {}) } })

      async function buscarPorEmail(email: string) {
        for (let pagina = 1; pagina < 50; pagina++) {
          const r = await admin(`/users?page=${pagina}&per_page=200`)
          if (!r.ok) throw new Error(`Supabase respondió ${r.status}`)
          const { users } = (await r.json()) as { users: { id: string; email?: string; email_confirmed_at?: string | null }[] }
          const u = users.find((x) => x.email?.toLowerCase() === email)
          if (u || users.length < 200) return u
        }
      }

      server.middlewares.use('/__local', async (req, res) => {
        if (req.method !== 'POST' || !esLocal(req)) return responder(res, 404, { error: 'No disponible' })
        if (!url || !clave) return responder(res, 501, { error: 'sin-clave' })
        try {
          const cuerpo = await leerCuerpo(req)
          const email = String(cuerpo.email ?? '').trim().toLowerCase()
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return responder(res, 400, { error: 'Revisa el email.' })

          if (req.url === '/registro') {
            const password = String(cuerpo.password ?? '')
            if (password.length < 8) return responder(res, 400, { error: 'La contraseña necesita 8 caracteres.' })
            const r = await admin('/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, user_metadata: cuerpo.data ?? {} }) })
            if (r.ok) return responder(res, 200, { ok: true })
            const e = (await r.json().catch(() => ({}))) as { msg?: string; message?: string; error_code?: string }
            const m = e.msg ?? e.message ?? `Supabase respondió ${r.status}`
            if (/already|exists|registered/i.test(m)) return responder(res, 409, { error: 'Ya hay una cuenta con ese email.' })
            return responder(res, 400, { error: m })
          }

          if (req.url === '/confirmar') {
            // Confirma una cuenta que se quedó pendiente. Después hay que entrar con su contraseña igualmente.
            const u = await buscarPorEmail(email)
            if (!u) return responder(res, 404, { error: 'No hay ninguna cuenta con ese email.' })
            if (!u.email_confirmed_at) {
              const r = await admin(`/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ email_confirm: true }) })
              if (!r.ok) return responder(res, 400, { error: `Supabase respondió ${r.status}` })
            }
            return responder(res, 200, { ok: true })
          }
          return responder(res, 404, { error: 'No disponible' })
        } catch (e) {
          return responder(res, 500, { error: (e as Error).message })
        }
      })
    },
  }
}
