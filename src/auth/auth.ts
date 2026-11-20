/**
 * Acceso del prototipo: cuentas guardadas solo en este dispositivo.
 *
 * ⚠ No es autenticación segura: quien tenga el dispositivo puede leer IndexedDB.
 * Sirve para diseñar el flujo. En la fase 2 se sustituye por Supabase Auth
 * (email + contraseña o enlace mágico, verificación de email y teléfono por SMS),
 * y la contraseña nunca se guarda en el cliente.
 */
import type { Cuenta, Genero } from '../model/types'
import { CATEGORIAS } from '../data/categorias'

const ITERACIONES = 600_000 // recomendación OWASP para PBKDF2-SHA256

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const desdeB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function derivar(password: string, sal: Uint8Array, iteraciones = ITERACIONES) {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteraciones }, clave, 256)
  return b64(bits)
}

export async function crearCredencial(password: string, iteraciones = ITERACIONES) {
  const sal = crypto.getRandomValues(new Uint8Array(16))
  return { hash: await derivar(password, sal, iteraciones), sal: b64(sal), iteraciones }
}

export async function comprobarPassword(c: Cuenta['credencial'], password: string) {
  const h = await derivar(password, desdeB64(c.sal), c.iteraciones)
  // comparación de longitud fija
  let d = h.length ^ c.hash.length
  for (let i = 0; i < Math.min(h.length, c.hash.length); i++) d |= h.charCodeAt(i) ^ c.hash.charCodeAt(i)
  return d === 0
}

// ───────────── Validación ─────────────

export interface DatosRegistro {
  nombre: string
  usuario: string
  email: string
  telefono: string
  password: string
  entidad: string
  categoria: string
  equipo: string
  genero: Genero
  aceptaPrivacidad: boolean
}

export type Errores = Partial<Record<keyof DatosRegistro, string>>

export const normalizarUsuario = (u: string) => u.trim().toLowerCase()
export const normalizarEmail = (e: string) => e.trim().toLowerCase()
/** Deja solo dígitos y el + inicial. Añade +34 si es un número español de 9 cifras. */
export function normalizarTelefono(t: string) {
  const limpio = t.trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
  if (/^[6789]\d{8}$/.test(limpio)) return `+34${limpio}`
  if (/^0034\d{9}$/.test(limpio)) return `+${limpio.slice(2)}`
  return limpio
}
export function formatearTelefono(t: string) {
  const m = /^\+34(\d{3})(\d{3})(\d{3})$/.exec(t)
  return m ? `+34 ${m[1]} ${m[2]} ${m[3]}` : t
}

export function validarPerfil(d: Omit<DatosRegistro, 'password' | 'aceptaPrivacidad'>): Errores {
  const e: Errores = {}
  if (d.nombre.trim().length < 2) e.nombre = 'Escribe tu nombre.'
  if (!/^[a-z0-9._]{3,20}$/.test(normalizarUsuario(d.usuario))) e.usuario = 'De 3 a 20 caracteres: letras, números, punto o guion bajo.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizarEmail(d.email))) e.email = 'Revisa el email.'
  if (!/^\+\d{9,15}$/.test(normalizarTelefono(d.telefono))) e.telefono = 'Revisa el teléfono (9 cifras o con prefijo internacional).'
  if (d.entidad.trim().length < 2) e.entidad = 'Escribe el nombre del club o la escuela.'
  if (!CATEGORIAS.some((c) => c.id === d.categoria)) e.categoria = 'Elige una categoría.'
  if (!d.equipo.trim()) e.equipo = 'Indica el equipo (A, B, Blanco…).'
  return e
}

export function validarRegistro(d: DatosRegistro): Errores {
  const e = validarPerfil(d)
  if (d.password.length < 8) e.password = 'Mínimo 8 caracteres.'
  else if (!/[a-zA-Z]/.test(d.password) || !/\d/.test(d.password)) e.password = 'Combina letras y números.'
  if (!d.aceptaPrivacidad) e.aceptaPrivacidad = 'Necesitamos que aceptes la política de privacidad.'
  return e
}

/** Reduce una imagen a un cuadrado de 256 px en JPEG (menos peso y sin metadatos EXIF como la ubicación). */
export async function prepararFoto(file: File, lado = 256): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.')
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen pesa demasiado (máximo 15 MB).')
  const bmp = await createImageBitmap(file)
  const s = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = c.height = lado
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, lado, lado)
  return c.toDataURL('image/jpeg', 0.85)
}
