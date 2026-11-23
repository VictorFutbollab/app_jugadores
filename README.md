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

> Las cuentas y los datos están en Supabase (ver «Seguridad, roles y Supabase»). Las cuentas y datos locales del prototipo anterior se borran del navegador al actualizar.

## Qué incluye

| Pantalla | Qué se puede hacer |
|---|---|
| Inicio | Disponibles, media del equipo, asistencia, avisos (consentimiento, lesiones, sanciones), quién mejora, quién baja, carga alta y jugadores sin evaluar en 3 semanas |
| Plantilla | Cuadrícula con iniciales, dorsal, posición, estado y media con flecha y número. Buscar, filtrar y ordenar por dorsal, posición, media, minutos o asistencia |
| Perfil del jugador | Radar de 4 áreas frente a la media del equipo, barras por área, minutos, asistencia, goles, asistencias y carga (simulados como si llegaran de Sesiones y Temporada), última evaluación, notas y privacidad |
| Evaluación rápida (+) | Eliges contexto, de 1 a 4 ítems y jugadores (vienen marcados los disponibles con consentimiento). Pantalla completa, botones 1–5 grandes, guardado en cada toque, paso automático al siguiente jugador y deslizamiento lateral |
| Evolución | Línea por área y media general, y cambio desde la primera evaluación |
| Perfil (cuenta) | Modo oscuro o claro, "ver la app como" entrenador principal o ayudante, y restablecer los datos de ejemplo |
| Admin · Jugadores (escudo arriba) | Tabla de control con contadores (activos, sin consentimiento, no disponibles, sin evaluar 21 días), búsqueda sin tildes, filtros, orden por columna y exportación a CSV para Excel |
| Admin · Ficha | Alta y edición: datos básicos, contactos de la familia, consentimiento (registrar, editar alcance o retirar), ficha deportiva, disponibilidad, archivar o recuperar, exportar y borrado completo |
| Admin · Entrenadores | Rol (principal, ayudante, preparador físico, coordinador), permisos (ver ficha, evaluar, notas privadas) y quién es administrador |

## Seguridad, roles y Supabase

Los datos, las cuentas y los permisos viven en **Supabase** (Auth + PostgreSQL). Toda autorización la decide la base de datos con políticas **RLS**; la app solo oculta lo que el servidor ya va a rechazar.

| Rol (`profiles.role`) | Quién | Qué puede hacer |
|---|---|---|
| `player` | Usuario normal: el entrenador. Todo registro nuevo, siempre. | Ver los equipos a los que pertenece, evaluar (con permiso), marcar favoritos, registrar un consentimiento pendiente (si es principal) y editar su propio perfil |
| `admin` | Administrador del club | Todo lo anterior en todos los equipos, más alta, edición y borrado de jugadores, equipos, miembros, permisos y roles, y leer el registro de actividad |

Medidas principales (en `supabase/migrations/20261120120000_roles_y_seguridad.sql`):

- **Rol solo en el servidor:** se lee de `public.profiles`, nunca del token ni de los metadatos editables. El trigger de alta asigna siempre `player`, aunque se mande otro rol.
- **El rol no se puede cambiar desde el cliente:** sin permiso de escritura en la columna `role`, un trigger lo bloquea igualmente y solo `admin_set_role` (que exige ser admin y no deja el club sin admins) o `promover_admin` (solo SQL Editor o service_role) lo cambian.
- **Cada operación se comprueba en la base de datos:** RLS en las 14 tablas, privilegios mínimos (sin `TRUNCATE` ni acceso anónimo) y funciones `SECURITY DEFINER` con `search_path` vacío.
- **Sesión viva:** cada comprobación exige que la sesión siga en `auth.sessions`. Al cerrar sesión, el token deja de valer al instante aunque no haya caducado.
- **Datos de otros equipos:** los datos de un jugador heredan siempre su equipo (no se puede falsear `equipo_id`). Las notas privadas solo las ve su autor o quien tenga el permiso.
- **Registro de actividad** (`registro_actividad`): quién creó, cambió o borró jugadores, estados, equipos, miembros y roles. Solo lo leen los admins y nadie lo puede editar.

### Puesta en marcha

1. Crea un proyecto en [supabase.com](https://supabase.com) y aplica las migraciones **en orden**: en **SQL Editor** pega y ejecuta cada archivo de `supabase/migrations/` (`20261120120000_roles_y_seguridad.sql` y después `20261123120000_privilegios_service_role.sql`), o usa `npx supabase db push`.
2. Copia `.env.example` como `.env.local` y pon la **Project URL** y la clave pública **anon / publishable**. En Vercel, añade las mismas dos variables en Settings → Environment Variables.
3. En **Authentication → Providers → Email**, deja activada la confirmación de email y sube la longitud mínima de contraseña a 8.
4. Regístrate en la app y nombra el **primer administrador** (ver abajo).

### Crear o autorizar administradores

- **El primero** (o para recuperar el acceso): en Supabase → SQL Editor ejecuta
  `select public.promover_admin('email@del-admin.com');`
  Solo funciona desde el SQL Editor o un proceso de servidor con la clave `service_role`. Ningún usuario puede ejecutarla desde la app.
- **Los siguientes:** un admin entra en Admin → Entrenadores y marca «Administrador» en la cuenta. Se puede quitar igual; el servidor no deja quitar al último.
- Nunca pongas la clave `service_role` en la app ni en Vercel. Solo la usan el SQL Editor y `npm run test:seguridad`.

### Pruebas de seguridad

- `npm test` ejecuta la migración en un PostgreSQL real (PGlite) que imita a Supabase y comprueba los 8 escenarios (usuario normal, `/admin`, API, cambio de rol, datos de otros, admin, sin sesión y cierre de sesión), además de otros ataques.
- `npm run test:seguridad` repite los escenarios contra el proyecto real (Auth + API). Necesita `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en el entorno, crea usuarios de prueba y los borra al terminar.

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
