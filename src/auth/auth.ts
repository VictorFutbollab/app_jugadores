/**
 * Validación de los formularios de acceso y perfil.
 *
 * La autenticación la hace Supabase Auth (contraseñas con bcrypt en el servidor,
 * sesiones revocables). Estas validaciones solo mejoran la experiencia: el
 * servidor vuelve a validar (formato de usuario, longitudes) y es quien decide.
 */
import type { Genero } from '../model/types'
import { CATEGORIAS } from '../data/categorias'

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const telefonoOk = (t: string) => /^\+\d{9,15}$/.test(normalizarTelefono(t))

/**
 * Perfil editable. Teléfono, club, categoría y equipo son opcionales (una familia no
 * los tiene); si se rellenan, se validan.
 */
export function validarPerfil(d: Omit<DatosRegistro, 'password' | 'aceptaPrivacidad'>): Errores {
  const e: Errores = {}
  if (d.nombre.trim().length < 2) e.nombre = 'Escribe tu nombre.'
  // El usuario ya no se pide (se identifica por nombre y apellidos); si llega, se valida.
  if (d.usuario && !/^[a-z0-9._]{3,20}$/.test(normalizarUsuario(d.usuario))) e.usuario = 'De 3 a 20 caracteres: letras, números, punto o guion bajo.'
  if (!EMAIL.test(normalizarEmail(d.email))) e.email = 'Revisa el email.'
  if (d.telefono.trim() && !telefonoOk(d.telefono)) e.telefono = 'Revisa el teléfono (9 cifras o con prefijo internacional).'
  if (d.entidad.trim() && d.entidad.trim().length < 2) e.entidad = 'Escribe el nombre del club o la escuela.'
  if (d.categoria && !CATEGORIAS.some((c) => c.id === d.categoria)) e.categoria = 'Elige una categoría.'
  return e
}

// ───────────── Registro (igual que FutbolLab Informes) ─────────────

export type TipoRegistro = 'entrenador' | 'familia'

export interface NuevaCuenta {
  tipo: TipoRegistro
  nombre: string
  apellidos: string
  email: string
  password: string
  /** Opcional, solo entrenador. */
  telefono: string
  /** Solo familiar o ayudante: código del equipo, de 6 a 8 letras o números. */
  codigo: string
  /** "Acepto las condiciones de uso y he leído la política de privacidad. Soy mayor de edad". */
  acepta: boolean
}
export type ErroresCuenta = Partial<Record<keyof NuevaCuenta, string>>

export function validarRegistro(d: NuevaCuenta): ErroresCuenta {
  const e: ErroresCuenta = {}
  if (d.nombre.trim().length < 2) e.nombre = 'Escribe tu nombre.'
  if (d.apellidos.trim().length < 2) e.apellidos = 'Escribe tus apellidos.'
  if (!EMAIL.test(normalizarEmail(d.email))) e.email = 'Revisa el email.'
  if (d.password.length < 8) e.password = 'Mínimo 8 caracteres.'
  else if (!/[a-zA-Z]/.test(d.password) || !/\d/.test(d.password)) e.password = 'Combina letras y números.'
  if (d.tipo === 'entrenador' && d.telefono.trim() && !telefonoOk(d.telefono)) e.telefono = 'Revisa el teléfono (9 cifras o con prefijo internacional).'
  if (d.tipo === 'familia' && !/^[A-Z0-9]{6,8}$/.test(d.codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')))
    e.codigo = 'El código del equipo tiene de 6 a 8 letras o números. Pídeselo al entrenador.'
  if (!d.acepta) e.acepta = 'Tienes que aceptar las condiciones y confirmar que eres mayor de edad.'
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
