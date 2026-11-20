import type { Modalidad } from '../model/types'

/** Categorías habituales de la RFEF (las edades pueden variar ligeramente por federación territorial). */
export interface Categoria {
  id: string
  nombre: string
  edadMin: number
  edadMax: number
  modalidad: Modalidad
  grupo: 'Fútbol base' | 'Adultos'
}

export const CATEGORIAS: Categoria[] = [
  { id: 'prebenjamin', nombre: 'Prebenjamín', edadMin: 6, edadMax: 7, modalidad: 'F7', grupo: 'Fútbol base' },
  { id: 'benjamin', nombre: 'Benjamín', edadMin: 8, edadMax: 9, modalidad: 'F7', grupo: 'Fútbol base' },
  { id: 'alevin', nombre: 'Alevín', edadMin: 10, edadMax: 11, modalidad: 'F7', grupo: 'Fútbol base' },
  { id: 'infantil', nombre: 'Infantil', edadMin: 12, edadMax: 13, modalidad: 'F11', grupo: 'Fútbol base' },
  { id: 'cadete', nombre: 'Cadete', edadMin: 14, edadMax: 15, modalidad: 'F11', grupo: 'Fútbol base' },
  { id: 'juvenil', nombre: 'Juvenil', edadMin: 16, edadMax: 18, modalidad: 'F11', grupo: 'Fútbol base' },
  { id: 'senior', nombre: 'Senior / Aficionado', edadMin: 19, edadMax: 34, modalidad: 'F11', grupo: 'Adultos' },
  { id: 'veteranos', nombre: 'Veteranos', edadMin: 35, edadMax: 99, modalidad: 'F11', grupo: 'Adultos' },
]

export const categoria = (id: string) => CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[3]
