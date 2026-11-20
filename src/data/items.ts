import type { AmbitoItem, Area, ItemEvaluacion } from '../model/types'

type Def = [id: string, area: Area, nombre: string, descripcion: string, edadMin: number, ambito: AmbitoItem, grupo?: string]

const DEFS: Def[] = [
  // Técnica
  ['tec-control', 'tecnica', 'Control orientado', 'Primer toque que deja el balón hacia donde quiere jugar', 6, 'todos'],
  ['tec-pase-corto', 'tecnica', 'Pase corto', 'Precisión y tensión en pases de hasta 15 m', 6, 'todos'],
  ['tec-pase-largo', 'tecnica', 'Pase largo', 'Cambios de orientación y envíos a más de 20 m', 10, 'todos'],
  ['tec-conduccion', 'tecnica', 'Conducción', 'Avanza con balón controlado y cabeza levantada', 6, 'campo'],
  ['tec-regate', 'tecnica', 'Regate', 'Supera al rival en el 1 contra 1', 6, 'campo'],
  ['tec-finalizacion', 'tecnica', 'Finalización', 'Remata con intención y acierto', 6, 'campo'],
  ['tec-cabeza', 'tecnica', 'Juego de cabeza', 'Despeja o remata de cabeza con técnica segura', 11, 'campo'],
  // Portero (cuentan en Técnica)
  ['por-blocaje', 'tecnica', 'Blocaje', 'Atrapa el balón sin rechace', 6, 'portero', 'Portero'],
  ['por-aereo', 'tecnica', 'Juego aéreo', 'Sale a centros y balones colgados', 9, 'portero', 'Portero'],
  ['por-1c1', 'tecnica', 'Uno contra uno', 'Achica y reduce ángulo ante el delantero', 8, 'portero', 'Portero'],
  ['por-pie', 'tecnica', 'Juego con el pie', 'Inicia el juego con pase y saques', 8, 'portero', 'Portero'],
  ['por-colocacion', 'tecnica', 'Colocación', 'Se sitúa bien respecto al balón y la portería', 6, 'portero', 'Portero'],
  // Táctica
  ['tac-posicionamiento', 'tactica', 'Posicionamiento', 'Ocupa su espacio según la fase de juego', 8, 'todos'],
  ['tac-perfilado', 'tactica', 'Perfilado', 'Recibe con el cuerpo abierto al juego', 9, 'campo'],
  ['tac-lectura', 'tactica', 'Lectura del juego', 'Anticipa y toma buenas decisiones', 8, 'todos'],
  ['tac-desmarque', 'tactica', 'Desmarque', 'Se libera de la marca para recibir', 8, 'campo'],
  ['tac-coberturas', 'tactica', 'Coberturas', 'Ayuda al compañero que presiona', 10, 'campo'],
  ['tac-presion', 'tactica', 'Presión tras pérdida', 'Reacciona rápido para recuperar', 10, 'campo'],
  // Física
  ['fis-velocidad', 'fisica', 'Velocidad', 'Aceleración y velocidad máxima', 6, 'todos'],
  ['fis-resistencia', 'fisica', 'Resistencia', 'Mantiene la intensidad todo el partido', 8, 'todos'],
  ['fis-agilidad', 'fisica', 'Agilidad', 'Cambios de dirección rápidos', 6, 'todos'],
  ['fis-fuerza', 'fisica', 'Fuerza en el duelo', 'Gana duelos con el cuerpo', 11, 'todos'],
  ['fis-coordinacion', 'fisica', 'Coordinación', 'Control del cuerpo, ritmo y equilibrio', 6, 'todos'],
  // Actitud y mental
  ['men-compromiso', 'mental', 'Compromiso', 'Esfuerzo y puntualidad', 6, 'todos'],
  ['men-concentracion', 'mental', 'Concentración', 'Atento durante toda la tarea', 6, 'todos'],
  ['men-error', 'mental', 'Reacción al error', 'Se recupera y sigue intentando', 6, 'todos'],
  ['men-liderazgo', 'mental', 'Liderazgo', 'Orienta y anima a sus compañeros', 8, 'todos'],
  ['men-comunicacion', 'mental', 'Comunicación', 'Habla en el campo: avisa y pide', 8, 'todos'],
  ['men-companerismo', 'mental', 'Compañerismo', 'Respeta y ayuda al grupo', 6, 'todos'],
]

const T0 = '2026-08-01T00:00:00.000Z'

export const ITEMS_POR_DEFECTO: ItemEvaluacion[] = DEFS.map(([id, area, nombre, descripcion, edadMin, ambito, grupo]) => ({
  id,
  equipoId: null,
  area,
  grupo,
  nombre,
  descripcion,
  edadMin,
  edadMax: 99,
  ambito,
  activo: true,
  creadoEn: T0,
  actualizadoEn: T0,
  creadoPor: 'futbollab',
}))
