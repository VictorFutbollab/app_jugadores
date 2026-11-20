# FutbolLab Jugadores · Fase 1 (prototipo) · v2

App 3 del ecosistema FutbolLab. Prototipo navegable con una plantilla de ejemplo (Infantil A, F11, 18 jugadores ficticios) guardada sin conexión en IndexedDB.

## Cómo ejecutarlo

Requisitos: Node 20 o superior.

```bash
npm install
npm run dev            # http://localhost:5173 (ábrelo también desde el móvil con --host)
npm test               # pruebas de lógica, privacidad y borrado completo
npm run build          # PWA instalable en dist/ (service worker y manifest)
npm run preview        # sirve dist/ para probar la instalación y el modo sin conexión
npm run build:preview  # un solo HTML autocontenido en dist-preview/
```

## Novedades de la v2

- **Acceso y registro:** nombre, usuario, email, teléfono, contraseña y dónde entrenas (entidad, categoría RFEF, equipo y género). Validación en cada campo, usuario y email únicos, y aceptación de la política de privacidad con fecha.
- **Perfil editable:** foto (se recorta a 256 px y se eliminan los metadatos EXIF, como la ubicación), datos, equipo y contraseña. Los cambios se guardan solos. También se puede cerrar sesión.
- **Diseño propio de FutbolLab:** barra superior con la marca, fondo con franjas de césped y líneas de campo, fichas tipo cromo, títulos de sección en versalitas e iconos SVG en lugar de emojis.
- **Logo:** `src/ui/Logo.tsx` es el único sitio que hay que cambiar. Ahora mismo lleva uno **provisional** hasta tener el oficial.
- **Fuentes alojadas con la app** (@fontsource), sin llamadas a Google Fonts. Así no se envía la IP del usuario a Google (sentencia de Múnich de 2022 sobre el RGPD) y la app funciona sin conexión.

> ⚠ En el prototipo, las cuentas se guardan solo en el dispositivo, con la contraseña derivada con PBKDF2-SHA256 (600.000 iteraciones). No es un acceso seguro de verdad: en la fase 2 se sustituye por Supabase Auth, con verificación de email y de teléfono.

## Qué incluye

| Pantalla | Qué se puede hacer |
|---|---|
| Inicio | Disponibles, media del equipo, asistencia, avisos (consentimiento, lesiones, sanciones), quién mejora, quién baja, carga alta y jugadores sin evaluar en 3 semanas |
| Plantilla | Cuadrícula con iniciales, dorsal, posición, estado y media con flecha y número. Buscar, filtrar y ordenar por dorsal, posición, media, minutos o asistencia |
| Perfil del jugador | Radar de 4 áreas frente a la media del equipo, barras por área, minutos, asistencia, goles, asistencias y carga (simulados como si llegaran de Sesiones y Temporada), última evaluación, notas y privacidad |
| Evaluación rápida (+) | Eliges contexto, de 1 a 4 ítems y jugadores (vienen marcados los disponibles con consentimiento). Pantalla completa, botones 1–5 grandes, guardado en cada toque, paso automático al siguiente jugador y deslizamiento lateral |
| Evolución | Línea por área y media general, y cambio desde la primera evaluación |
| Perfil (cuenta) | Modo oscuro o claro, "ver la app como" entrenador principal o ayudante, y restablecer los datos de ejemplo |

## Comprobaciones hechas

- **Evaluación de 14 jugadores × 3 ítems:** 43 toques en total (1 para empezar y 42 notas, sin toques para pasar de jugador). Automatizado tarda 6 s; con una persona, a unos 2 s por nota, son menos de 1,5 min.
- **Permisos:** el ayudante ve 1 de las 2 notas de Lucas (la apta para familia) y no puede exportar ni borrar.
- **Borrado completo:** elimina el jugador y todos sus estados, evaluaciones, pruebas, notas, asistencias, minutos y cargas en una sola transacción (prueba automática).
- **Sin consentimiento:** el dorsal 18 solo tiene nombre y dorsal. No aparece en la evaluación rápida y la ficha pide el consentimiento.
- **Importar 20 jugadores en menos de 1 minuto:** pendiente para la fase 2, cuando entra la importación desde Excel.

## Estructura

```
src/
  auth/auth.ts        Validación, contraseña (PBKDF2) y preparación de la foto
  data/categorias.ts  Categorías RFEF con edades y modalidad
  ui/Logo.tsx         Logo (provisional)
  model/types.ts      Modelo de datos común (Usuario, Equipo, Jugador, Evento) y propio de Jugadores
  data/items.ts       29 ítems por defecto con edad mínima y ámbito (campo o portero)
  data/seed.ts        Plantilla de ejemplo determinista y relativa a la fecha de hoy
  db/db.ts            IndexedDB: carga, guardado, exportar y borrar un jugador
  logic/stats.ts      Ítems por edad y posición, medias, tendencia a 30 días, evolución y datos externos
  logic/privacy.ts    Consentimiento, minimización y permisos por rol
  state/              Estado global y enrutado por hash
  screens/            Pantallas
  ui/components.tsx   Avatar, tendencia, radar y otros componentes
```

## Decisiones de diseño y RGPD

- **Tendencias** con flecha (▲ ▼ ▶) y número con signo. El color solo refuerza.
- **Media general:** se usa la última nota de cada ítem. Lo no observado no cuenta como 0. En iniciación (6–9 años) pesan más actitud y coordinación.
- **Porteros:** los ítems de campo elegidos se cambian por ítems de portero, y en el radar cuentan en Técnica.
- **Consentimiento** con fecha, firmante, tipo de firmante, alcance (ficha, fotos y notas de voz) y versión del texto. Desde los 14 años puede firmar el propio jugador (art. 7 LOPDGDD).
- **Sin diagnósticos** en estados ni notas, porque son datos de salud (art. 9 RGPD). Basta con el tipo de estado y la fecha de vuelta.
- **Datos de ejemplo** ficticios y sin fotos.
- **SheetJS** se instalará en la fase 2 desde el CDN oficial (`https://cdn.sheetjs.com`). La versión 0.18.5 de npm está abandonada y tiene vulnerabilidades conocidas.

## Pendiente para la fase 2 (MVP)

Alta de jugador e importación desde Excel; esquema de Supabase con políticas por fila que repliquen `logic/privacy.ts`; sincronización sin conexión; cifrado de campos sensibles en IndexedDB; firma del consentimiento por enlace; notas de texto y voz; papelera de 30 días, historial de cambios y el resto de acciones comunes.
