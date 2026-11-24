/**
 * Crea o borra la cuenta de prueba claude.pruebas@futbollab.com (admin, ya confirmada).
 * Lo lanza scripts/cuenta-prueba.ps1, que pide la clave secreta de forma oculta.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { existsSync, rmSync, writeFileSync } from 'node:fs'

const EMAIL = 'claude.pruebas@futbollab.com'
const ARCHIVO = '.cuenta-prueba.local'
const modo = process.argv[2]
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

async function buscar() {
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => x.email === EMAIL)
    if (u || data.users.length < 200) return u
  }
}

try {
  const existente = await buscar()
  if (modo === 'borrar') {
    if (existente) await sb.auth.admin.deleteUser(existente.id)
    if (existsSync(ARCHIVO)) rmSync(ARCHIVO)
    console.log(existente ? `Cuenta de prueba ${EMAIL} borrada.` : 'No había cuenta de prueba.')
    process.exit(0)
  }
  const password = `Prueba-${randomBytes(12).toString('base64url')}1`
  let id = existente?.id
  if (existente) {
    const r = await sb.auth.admin.updateUserById(existente.id, { password, email_confirm: true })
    if (r.error) throw r.error
  } else {
    const r = await sb.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { nombre: 'Claude (pruebas)', usuario: 'claude.pruebas', entidad: 'Pruebas', categoria: 'infantil', equipo: 'A', genero: 'mixto', acepta_privacidad: true },
    })
    if (r.error) throw r.error
    id = r.data.user.id
  }
  const p = await sb.rpc('promover_admin', { correo: EMAIL })
  if (p.error) throw p.error
  writeFileSync(ARCHIVO, `EMAIL=${EMAIL}\nPASSWORD=${password}\n`, { mode: 0o600 })
  console.log(`Cuenta de prueba lista: ${EMAIL} (admin, id ${id}).`)
  console.log(`Credenciales guardadas en ${ARCHIVO} (no se sube a GitHub). Avisa a Claude: "cuenta creada".`)
} catch (e) {
  console.log('Error:', JSON.stringify({ mensaje: e?.message ?? String(e), codigo: e?.code, estado: e?.status }))
  process.exit(1)
}
