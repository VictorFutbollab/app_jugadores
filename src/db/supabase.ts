import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { crearClienteLocal } from './local'

/**
 * Cliente de Supabase. La URL y la clave pública (anon / publishable) van en
 * variables de entorno: .env.local en desarrollo y Environment Variables en Vercel.
 *
 * La clave pública puede estar en el navegador: no da permisos por sí sola.
 * Lo que cada usuario puede hacer lo deciden las políticas RLS de la base de datos.
 * La clave service_role NUNCA debe ir en la app.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Modo local: en `npm run dev` las cuentas y los datos se guardan en este navegador
 * (src/db/local.ts) y no hace falta confirmar el email. Para probar contra Supabase
 * en localhost, pon VITE_MODO_LOCAL=0 en .env.local. En la web publicada
 * (import.meta.env.DEV = false) esto no existe: siempre se usa Supabase.
 */
export const MODO_LOCAL = import.meta.env.DEV && import.meta.env.VITE_MODO_LOCAL !== '0'

export const supabaseConfigurado = MODO_LOCAL || (!!url && !!clave)

export const supabase: SupabaseClient = MODO_LOCAL
  ? (crearClienteLocal() as unknown as SupabaseClient)
  : createClient(url || 'http://localhost:54321', clave || 'sin-configurar', {
      auth: {
        persistSession: true, // guarda los tokens de sesión, nunca el rol
        autoRefreshToken: true,
        detectSessionInUrl: true, // enlaces de confirmación de email
        flowType: 'pkce', // ?code= en la URL: no choca con el enrutado por # de la app
      },
    })

/** Convierte los errores del servidor en mensajes que entiende un entrenador. */
export function errorLegible(e: unknown): Error {
  const err = e as { message?: string; code?: string } | null
  const m = err?.message ?? String(e)
  if (err?.code === '42501' || /row-level security|permission denied/i.test(m)) {
    // Mensajes propios de la base de datos (admin_set_role, consentimiento…): se muestran tal cual.
    if (/^(Solo|No puedes|No tienes|Tiene que quedar)/.test(m)) return new Error(m)
    return new Error('No tienes permiso para hacer esto.')
  }
  if (err?.code === '23505' && /usuario/i.test(m)) return new Error('Ese usuario ya existe.')
  if (/Failed to fetch|NetworkError|network/i.test(m)) return new Error('Sin conexión con el servidor. Revisa internet y vuelve a intentarlo.')
  if (/JWT expired|session.*(missing|not found)|refresh token/i.test(m)) return new Error('Tu sesión ha caducado. Vuelve a entrar.')
  return new Error(m)
}
