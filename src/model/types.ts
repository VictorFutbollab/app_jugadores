/**
 * Modelo de datos FutbolLab.
 *
 * - Bloque "Común": entidades compartidas por las 4 apps (Usuario, Equipo, Jugador,
 *   Evento). Jugador se define aquí y lo leen Sesiones, Temporada e Informes.
 * - Bloque "Jugadores": entidades propias de esta app.
 * - Bloque "Externos": vistas de solo lectura que llegan de las otras apps.
 *
 * Fechas en ISO 8601 (YYYY-MM-DD o fecha-hora completa). Ids en texto (UUID en producción).
 */

// ───────────────────────── Metadatos comunes ─────────────────────────

/** Campos que llevan todos los elementos para las acciones comunes. */
export interface Meta {
  id: string
  creadoEn: string
  actualizadoEn: string
  creadoPor: string // id de Usuario
  favorito?: boolean
  archivado?: boolean
  /** Si tiene valor, está en la papelera; se borra definitivamente a los 30 días. */
  eliminadoEn?: string | null
}

// ───────────────────────── Común (las 4 apps) ─────────────────────────

export type Rol = 'entrenador_principal' | 'ayudante' | 'preparador_fisico' | 'coordinador'

export interface Usuario {
  id: string
  nombre: string
  email: string
  usuario?: string // nombre de usuario único para entrar
  telefono?: string
  foto?: string | null // data URL reducida a 256 px
}

export type Genero = 'masculino' | 'femenino' | 'mixto'

/**
 * Rol de la aplicación, guardado en public.profiles.role (Supabase).
 * - player: usuario normal (entrenador). Todo registro nuevo lo recibe en el servidor.
 * - admin: administrador del club. Solo lo asigna otro admin o un proceso de servidor.
 * En el cliente es solo informativo: la autorización real la hacen las políticas RLS.
 */
export type RolApp = 'player' | 'admin'

/**
 * Perfil de la cuenta del entrenador (tabla public.profiles).
 * La contraseña la gestiona Supabase Auth: nunca pasa por la app ni por esta tabla.
 */
export interface Cuenta extends Usuario {
  usuario: string
  telefono: string
  /** Dónde entrena: entidad (club), categoría y equipo. */
  entidad: string
  categoria: string // valor de CATEGORIAS
  equipo: string // "A", "B", "Blanco"…
  genero: Genero
  aceptaPrivacidadEn: string | null
  creadoEn: string
  actualizadoEn: string
  role: RolApp
}

/** Pertenencia de un usuario a un equipo con un rol. Base de las políticas por fila. */
export interface MiembroEquipo {
  equipoId: string
  usuarioId: string
  rol: Rol
  /** Permisos que el entrenador principal concede de forma explícita. */
  permisos: {
    verFicha: boolean
    verNotasPrivadas: boolean
    evaluar: boolean
  }
}

export type Modalidad = 'F7' | 'F8' | 'F11'

export interface Equipo extends Meta {
  clubId: string
  entidad: string // nombre del club o escuela
  genero?: Genero
  nombre: string
  categoria: string // "Infantil A"
  temporada: string // "2026-27"
  modalidad: Modalidad
  edadMin: number
  edadMax: number
  /**
   * Ítems de evaluación que el entrenador añade en "Qué vas a observar". Se guardan en el
   * propio equipo (inf_guardar_equipo) y se usan igual que los de FutbolLab. Uno quitado
   * queda con activo: false para que las notas antiguas sigan teniendo nombre.
   */
  itemsPropios?: ItemEvaluacion[]
}

export type Posicion = 'POR' | 'LD' | 'LI' | 'DFC' | 'MCD' | 'MC' | 'MCO' | 'ED' | 'EI' | 'DC'
export type Pierna = 'derecha' | 'izquierda' | 'ambas'

/** Base de legitimación del consentimiento (art. 8 RGPD y art. 7 LOPDGDD). */
export type FirmanteTipo = 'madre' | 'padre' | 'tutor_legal' | 'jugador_mayor_14'

export interface Consentimiento {
  fecha: string
  firmante: string // nombre de quien firma
  firmanteTipo: FirmanteTipo
  /** Alcances concretos; se pueden retirar por separado. */
  alcance: {
    ficha: boolean // datos completos y evaluaciones
    fotos: boolean
    notasVoz: boolean
  }
  version: string // versión del texto legal aceptado
  retiradoEn?: string | null
}

export interface ContactoFamilia {
  nombre: string
  relacion: string
  telefono?: string
  email?: string
}

export interface Jugador extends Meta {
  equipoId: string
  nombre: string
  apellidos: string
  dorsal: number
  /** Los campos siguientes solo se guardan si hay consentimiento de ficha. */
  foto?: string | null // URL o data URL; en el prototipo, null (avatar con iniciales)
  fechaNacimiento?: string | null
  posiciones?: Posicion[] // la primera es la principal
  pierna?: Pierna | null
  contactos?: ContactoFamilia[]
  consentimiento?: Consentimiento | null
}

export type TipoEvento = 'entrenamiento' | 'partido'

/** Evento del calendario compartido (lo crean Sesiones y Temporada). */
export interface Evento {
  id: string
  equipoId: string
  tipo: TipoEvento
  fecha: string
  titulo: string
  rival?: string
}

// ───────────────────────── Jugadores (propias) ─────────────────────────

export type TipoEstado = 'disponible' | 'lesionado' | 'enfermo' | 'sancionado'

export interface Estado extends Meta {
  jugadorId: string
  tipo: TipoEstado
  desde: string
  vueltaPrevista?: string | null
  nota?: string
}

export type Area = 'tecnica' | 'tactica' | 'fisica' | 'mental'
export type AmbitoItem = 'todos' | 'campo' | 'portero'

export interface ItemEvaluacion extends Meta {
  /** null = ítem por defecto de FutbolLab; con valor, personalizado del equipo o club (Pro). */
  equipoId: string | null
  area: Area
  /** Subgrupo para mostrar ("Portero"); los de portero cuentan en Técnica en el radar. */
  grupo?: string
  nombre: string
  descripcion: string
  edadMin: number
  edadMax: number
  ambito: AmbitoItem
  activo: boolean
}

export type ContextoEvaluacion = 'partido' | 'entrenamiento' | 'trimestral'

export interface Puntuacion {
  itemId: string
  /** Con escala 10: de 0 a 10. Sin escala (notas antiguas): de 1 a 5, se leen ×2 (ver nota10). */
  valor: number
  /** 10 = nota de la barrita 0–10. Las notas antiguas no la llevan. */
  escala?: 10
}

export interface Evaluacion extends Meta {
  jugadorId: string
  fecha: string
  evaluadorId: string
  contexto: ContextoEvaluacion
  eventoId?: string | null
  /** Solo lo observado: los ítems no observados no aparecen (no cuentan como 0). */
  puntuaciones: Puntuacion[]
  comentario?: string
}

export type TipoPrueba = 'sprint_30m' | 'salto_vertical' | 'ida_vuelta'

export interface PruebaFisica extends Meta {
  jugadorId: string
  tipo: TipoPrueba
  fecha: string
  resultado: number
  unidad: 's' | 'cm' | 'nivel'
}

export type EstadoObjetivo = 'pendiente' | 'en_curso' | 'conseguido' | 'no_conseguido'

export interface ObjetivoIndividual extends Meta {
  jugadorId: string
  area: Area
  texto: string
  fechaLimite: string
  ejerciciosRecomendados: string[] // ids de ejercicios de Sesiones
  estado: EstadoObjetivo
  avance: number // 0–100
}

export type Visibilidad = 'privada' | 'apta_familia'

export interface NotaSeguimiento extends Meta {
  jugadorId: string
  texto: string
  /** Audio solo con consentimiento de notas de voz; se transcribe y caduca. */
  audio?: string | null
  autorId: string
  fecha: string
  visibilidad: Visibilidad
}

/** Historial de cambios (acción común). */
export interface CambioHistorial {
  id: string
  entidad: string
  entidadId: string
  usuarioId: string
  fecha: string
  accion: 'crear' | 'editar' | 'archivar' | 'eliminar' | 'restaurar'
  cambios?: Record<string, { antes: unknown; despues: unknown }>
}

// ───────────────────────── Externos (solo lectura) ─────────────────────────

/** Asistencia a un evento. Fuente: Sesiones (entrenos) y Temporada (partidos). */
export interface Asistencia {
  id: string
  eventoId: string
  jugadorId: string
  fecha: string
  tipo: TipoEvento
  presente: boolean
  motivo?: string
}

/** Participación en partido. Fuente: Temporada. */
export interface ParticipacionPartido {
  id: string
  eventoId: string
  jugadorId: string
  fecha: string
  minutos: number
  titular: boolean
  goles: number
  asistencias: number
}

/** Carga de sesión (RPE × minutos, unidades arbitrarias). Fuente: Sesiones. */
export interface CargaSesion {
  id: string
  eventoId: string
  jugadorId: string
  fecha: string
  minutos: number
  rpe: number // 1–10
  carga: number
}
