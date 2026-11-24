# Auditoría de FutbolLab Jugadores · Fase 0

Fecha: 23 de noviembre de 2026 · Rama auditada: `supabase-admin` (con los cambios de simplificación aún sin commit) · Versión publicada: `main` (local, sin servidor).
Solo lectura: no se ha modificado ningún archivo de la app.

## Resumen (para leer en 1 minuto)

1. La app funciona y la base técnica es sólida, pero **la versión segura (con Supabase) no está publicada**: los usuarios actuales usan la versión antigua, que guarda todo en su navegador.
2. **No existe todavía la migración** de esos datos al servidor. Publicar sin ella dejaría a los usuarios actuales sin sus cuentas ni sus jugadores.
3. **Fortaleza 1:** la seguridad del servidor está bien hecha y probada (35 tests de RLS y 31 comprobaciones contra el proyecto real).
4. **Fortaleza 2:** la evaluación rápida ya cumple los objetivos de tiempo (un jugador en segundos; 18 jugadores en unos 2 minutos).
5. **Fortaleza 3:** el RGPD está pensado desde el principio (consentimiento, minimización, exportación y borrado completo).
6. **Problema grave 1:** el registro de actividad guarda teléfonos, fechas de nacimiento y nombres de menores **para siempre**, incluso después de borrar al jugador.
7. **Problema grave 2:** se guardan **datos de salud** ("lesionado", "enfermo" y una nota libre), justo lo que el proyecto prohíbe.
8. **Problema grave 3:** **sin cobertura no funciona** y una evaluación que no se guarda se pierde. En un campo de fútbol esto es lo normal.
9. La app compara a cada niño con la media del equipo (radar, orden por media), en contra del principio "cada jugador se compara consigo mismo".
10. Rendimiento y accesibilidad están cerca del objetivo (89 y 100 en la pantalla de acceso), pero la app carga 285 KB de JavaScript de golpe.

## Límites de esta auditoría

- **Lighthouse** solo se ha podido pasar en la pantalla de acceso: las de dentro necesitan sesión, y la cuenta de prueba (`scripts/cuenta-prueba.ps1`) aún no está creada.
- **Ajustes de Supabase Auth** (contraseña mínima, contraseñas filtradas, 2FA, correo SMTP) y el **revisor de seguridad de Supabase** no se han podido consultar sin acceso a la consola de Supabase.
- **Medición con entrenadores reales** (tiempos con personas): pendiente; las cifras de tiempo son las del README y las pruebas automáticas.

## Línea base

| Medida | Valor |
|---|---|
| Tests (`npm test`) | 56 de 56 en verde: 35 de seguridad RLS sobre PostgreSQL, 10 de lógica de evaluación y privacidad, 10 del panel de admin y 1 de no pérdida de datos locales |
| Pruebas de seguridad contra el proyecto real | 31 de 31 (8 escenarios) |
| Lighthouse móvil · pantalla de acceso | Rendimiento **89** · Accesibilidad **100** · Buenas prácticas **96** |
| Tiempos (acceso) | FCP 2,4 s · LCP 3,2 s · TBT 100 ms · CLS 0,003 · interactiva a los 3,3 s |
| JavaScript inicial | 1.001 KB sin comprimir · **285 KB gzip** en un único archivo (objetivo: < 200 KB) |
| CSS | 35 KB (8 KB gzip) |
| Vulnerabilidades (`npm audit`) | 0 en producción · 4 moderadas en herramientas de compilación (workbox/glob) |
| PWA | Instalable (manifest y service worker); iconos antiguos en naranja |
| Evaluar 1 jugador (3 ítems) | 1 toque para empezar + 3 notas |
| Evaluar 14 jugadores × 3 ítems | 43 toques; ~1,5 min con una persona (según README) |

## Inventario: lo que no se puede romper

### Pantallas y acciones del entrenador
| Pantalla | Acciones | Quién |
|---|---|---|
| Acceso | Entrar con email, registrarse (siempre como `player`), confirmar email | Cualquiera |
| Inicio | Ver cifras clave, "Para hoy", "Más mejoran", ir a evaluar | Miembro del equipo |
| Plantilla | Buscar, filtrar (5 filtros), ordenar (5 criterios), abrir ficha | Miembro |
| Ficha · Resumen | Radar y barras por área, datos de temporada, última evaluación, ver evolución | Con permiso "ver ficha" |
| Ficha · Notas | Ver notas (privadas solo con permiso o propias) | Según permiso |
| Ficha · Datos y privacidad | Ver datos y consentimiento, **exportar** (principal), **borrar todo** (solo admin) | Principal / admin |
| Ficha sin consentimiento | Registrar consentimiento | Solo principal |
| Favorito | Marcar/desmarcar | Miembro |
| Evaluación rápida | Plantillas de un toque, ítems a mano (máx. 4), elegir jugadores, puntuar 1–5, deslizar, resumen final | Con permiso "evaluar" |
| Evolución | Gráfico por área y media general | Miembro |
| Perfil | Datos, foto, email, contraseña, tema, "ver como ayudante", equipo activo, cerrar sesión | Cualquiera con sesión |
| Sin equipo | Mensaje de espera / acceso al admin | Recién registrados |

### Panel de administración (solo `admin`)
| Sección | Acciones |
|---|---|
| Resumen | Tarjetas, "necesitan atención", acciones rápidas, últimos cambios |
| Jugadores | 4 filtros, búsqueda, orden, exportar CSV, alta, edición en secciones plegables, estado, consentimiento (registrar, editar, retirar), archivar/recuperar, exportar JSON, borrado completo |
| Entrenadores | Aceptar a quien espera equipo, tipo de acceso, puesto, permisos sueltos, nombrar/quitar admin (nunca el último), quitar del equipo, crear equipo, cargar plantilla de ejemplo |
| Actividad | Registro legible por día con 4 filtros |

### Tablas y políticas (Supabase)
| Tabla | Leer | Escribir |
|---|---|---|
| profiles | Propio, compañeros de equipo, admin | Propio (sin `role`, `id`, `email`); rol solo por `admin_set_role` / `promover_admin` |
| equipos, miembros | Miembros del equipo, admin | Admin |
| jugadores | Con "ver ficha", admin (sin permiso: `jugadores_basicos()` con nombre y dorsal) | Admin; favorito y consentimiento pendiente por funciones de servidor |
| evaluaciones, pruebas | Con "ver ficha", admin | Evaluaciones: con "evaluar", firmando como uno mismo y con consentimiento; resto admin |
| notas | Autor, "notas privadas", aptas para familia con "ver ficha", admin | Admin |
| estados, eventos, asistencias, participaciones, cargas, items | Miembros, admin | Admin |
| registro_actividad | Admin | Nadie (solo triggers del servidor) |

## Hallazgos

Gravedad: crítica · alta · media · baja. Esfuerzo: S (horas) · M (1–3 días) · L (más).

| N.º | Área | Hallazgo | Gravedad | Evidencia | Propuesta | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | Datos y estabilidad | Los usuarios actuales usan `main` (datos en su navegador). La versión con servidor no está publicada y **no hay migración**; publicarla tal cual les deja sin cuentas ni datos. | Crítica | `main` → `src/db/db.ts` (IndexedDB v4); rama `supabase-admin` | No publicar hasta tener: copia de seguridad en el dispositivo, importación revisada por el admin y aviso a usuarios. Las contraseñas no se pueden trasladar (PBKDF2 → bcrypt): cada usuario elige una nueva una vez. | L |
| 2 | Privacidad | El registro de actividad guarda **valores** de los cambios: teléfonos de contacto, fecha de nacimiento, nombre y apellidos tras el borrado. Es inmutable, así que choca con el derecho de supresión (art. 17 RGPD). | Crítica | `supabase/migrations/…roles_y_seguridad.sql:299-314` | Guardar solo **qué campos** cambiaron (no los valores) e identificadores; nombre del jugador solo mientras exista. Migración nueva que limpie las entradas ya guardadas. | M |
| 3 | Privacidad | Se guardan datos de salud: estados "lesionado" y "enfermo" con fecha de vuelta y nota libre (art. 9 RGPD). El proyecto prohíbe guardar lesiones. | Alta | `src/model/types.ts:149,156` · tabla `estados` | Sustituir por disponibilidad sin causa ("disponible / no disponible / vuelve el…") y quitar la nota libre. Migración que convierta los estados existentes sin perderlos. | M |
| 4 | Privacidad | No hay **texto de política de privacidad** enlazado en el registro ni texto legal versionado del consentimiento; la "firma" es un nombre tecleado. | Alta | `src/screens/Acceso.tsx:225` · `version: '2026.1'` | Páginas de política y de consentimiento versionadas, enlazadas; registro de quién, cuándo y qué versión. | M |
| 5 | Offline | Con servidor, **sin cobertura la app no carga** y una nota que no se guarda **se deshace** (se pierde). | Alta | `src/state/store.tsx` `guardarEvaluacion` · `cargarTodo` | Caché local de lectura + cola de evaluaciones pendientes que se sincroniza al volver la señal. | L |
| 6 | Seguridad | "Un ayudante no puede exportar" solo se aplica en la interfaz: con "ver ficha" puede leer por la API todo lo que contiene la exportación. | Alta (criterio de aceptación) | `src/screens/Jugador.tsx:199` · `src/db/remote.ts:174` | Exportación como función de servidor que exija principal o admin y quede registrada. | S |
| 7 | Privacidad | La minimización ("sin consentimiento solo nombre, dorsal y contacto") se aplica solo en el navegador; el servidor acepta fecha de nacimiento, posiciones, asistencia, minutos y carga de jugadores sin consentimiento (la plantilla de ejemplo lo hace con el dorsal 18). | Alta | `src/state/store.tsx:326` · `src/data/seed.ts` | Trigger en el servidor que recorte los campos y rechace datos ligados al jugador sin consentimiento. | M |
| 8 | Producto y psicología | Se compara a cada niño con otros: radar y barras contra la media del equipo, orden de la plantilla por media, "Más mejoran" y "Baja su nivel". | Alta | `src/screens/Jugador.tsx` (`comparar={equipo}`), `Plantilla.tsx` (orden por media), `Inicio.tsx` | Comparar con su evaluación anterior (línea discontinua). La media del equipo, si se mantiene, solo en vistas sin nombres. | M |
| 9 | Rendimiento | 285 KB gzip de JavaScript en un único archivo, sin carga diferida (Recharts y el panel de admin se descargan siempre). | Alta | `dist/assets/index-*.js` | Carga diferida por pantalla (admin, evolución, gráficos); radar propio en SVG en lugar de Recharts. | M |
| 10 | Rendimiento (BD) | Las políticas RLS llaman a funciones por cada fila (comprobación de sesión incluida) y al entrar se descargan todos los datos de todos los equipos visibles en 13 peticiones. | Media | `…roles_y_seguridad.sql` (políticas) · `src/db/remote.ts` `cargarTodo` | Cachear la comprobación por consulta (`(select …)`), índices y carga por equipo activo. | M |
| 11 | Seguridad | Sin cabeceras de seguridad en Vercel (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy). | Media | No existe `vercel.json` | Añadir `vercel.json` con cabeceras. | S |
| 12 | Privacidad | Cualquier miembro del cuerpo técnico ve el email y el teléfono de sus compañeros. | Media | Política `perfil_ver` | Exponer a compañeros solo nombre y foto (vista o función). | S |
| 13 | Seguridad | Ajustes de Auth sin verificar: el correo por defecto de Supabase solo envía a tu equipo (registro real bloqueado), contraseña mínima, contraseñas filtradas y 2FA del admin. | Media | Configuración de Supabase | Configurar SMTP propio, mínimo 8, protección de contraseñas filtradas y 2FA obligatorio para admins. | S |
| 14 | Accesibilidad | Contrastes insuficientes: texto terciario en modo claro (2,8:1), colores de las áreas Técnica (2,5:1) y Mental (2,2:1) sobre blanco; textos de 0,66–0,72 rem (Lighthouse: tamaño no legible). | Media | `src/index.css` (`--text-3`), `src/logic/format.ts:19-22` | Ajustar tokens y tamaño mínimo de 12–13 px. | S |
| 15 | Diseño | Rojo sobre jugadores: tendencia a la baja, "lesionado" y "No disponible" en rojo (el sistema de diseño lo prohíbe). | Media | `.tend.baja`, `ESTADO_INFO`, chip `peligro` | Ámbar para bajadas y avisos; nada de rojo asociado a un niño. | S |
| 16 | Diseño | Patrones de la lista de prohibidos: degradados de azules (fondo, botón principal de Inicio, cromo, menú del admin), avisos con borde lateral de color, sombras grandes. | Media | `src/index.css:72, 766, 947, 1810` · `.aviso-permiso`, `.aviso-estado` | Superficies planas, líneas de campo como textura sobria. | S |
| 17 | Diseño | Colores sueltos fuera de los tokens: colores de área, color de la barra del navegador y el menú del admin. | Media | `src/logic/format.ts:19-22`, `src/state/store.tsx`, `src/index.css` (admin) | Pasarlos a variables CSS. | S |
| 18 | Marca | Iconos de la app instalada en naranja (de la primera versión) y logo en PNG de 313×64 px; no existe `APP_NAME`. | Media | `public/icon-192.png`, `public/icon-512.png`, `src/assets/logo-futbollab.png` | Logo SVG, iconos nuevos y `APP_NAME` en un solo archivo. | M |
| 19 | Código | `Admin.tsx` tiene 1.182 líneas; 5 conversiones `as unknown` en la capa de datos. | Media | `src/screens/Admin.tsx`, `src/db/remote.ts` | Dividir por secciones; tipar las filas de Supabase. | M |
| 20 | Estabilidad | La simplificación de los paneles está sin commit y **sin revisar visualmente** por dentro. La ruta `#admin` cambió de destino (antes Jugadores, ahora Resumen). | Media | `git status` | Revisar con la cuenta de prueba, fijar con tests de regresión y hacer commit. | S |
| 21 | Tests | No hay tests de interfaz ni de flujos (Playwright); ninguna pantalla tiene tests de regresión. | Media | Carpeta de tests | Playwright en los flujos clave y tests que fijen el comportamiento antes de cambiar cada pantalla. | M |
| 22 | Producto | "Favorito" se guarda en el jugador: si un entrenador lo marca, lo ven marcado todos. | Baja | `jugador_set_favorito` | Favoritos por usuario. | S |
| 23 | Seguridad | Sin sesión se puede comprobar si un nombre de usuario existe. | Baja | `usuario_disponible` | Aceptable; limitar por frecuencia si preocupa. | S |
| 24 | Dependencias | 4 vulnerabilidades moderadas en herramientas de compilación (no llegan al usuario). | Baja | `npm audit` | Actualizar `vite-plugin-pwa` cuando haya versión compatible. | S |
| 25 | Accesibilidad | Objetivos táctiles de 34–36 px en filtros y chips (objetivo del proyecto: 48 px). | Baja | `.filtro`, `.chip-btn` | Subir a 44–48 px. | S |
| 26 | Crecimiento | Todos los textos están dentro del código (sin i18n); los criterios de evaluación están en código, no como datos; no hay tabla de planes. | Baja (ahora) | `src/screens/*`, `src/data/items.ts` | Extraer textos; criterios por etapa en base de datos; tabla de planes. | L |
| 27 | Redacción | Algunos mensajes suenan a software ("No hay datos de este jugador: se han borrado por completo o no existe", "Sin conexión con el servidor"). | Baja | Varias pantallas | Revisión de microcopia con la guía de tono. | S |

## Estado de las funciones de la Fase 1

| N.º | Función | Estado | Qué hay hoy | Qué faltaría |
|---|---|---|---|---|
| 1 | Correcciones críticas y altas | Falta | — | Hallazgos 1 a 9 |
| 2 | Navegación de 4 pestañas | Parcial | Barra con Inicio, Plantilla, botón +, Evolución y Perfil | Quitar Perfil (al avatar), "Evaluar" como pestaña, feature flag |
| 3 | Inicio rediseñado | Parcial | Botón de evaluación, cifras, "Para hoy" (5 visibles) y "Más mejoran" | Un único botón protagonista con tiempo estimado, máximo 3 alertas con frase, "Más mejoran este mes" sin ranking |
| 4 | Evaluación por etapas | Parcial | 29 ítems con edad mínima y ámbito (portero); las notas de ítems ya alimentan el área; plantillas de un toque | Plantillas por categoría, interruptor "Modo detallado", subindicadores que faltan (pierna débil, transiciones, respeto), criterios como datos |
| 5 | Evaluación rápida mejorada | Parcial | Pantalla completa, botones 1–5 de 58 px, deslizar, guardado al tocar, barra de progreso | "7 de 18", etiquetas (Le cuesta… Destaca), pestañas de área, vibración, deshacer 5 s, cola sin conexión |
| 6 | Partido en vivo | Falta | Tablas de participaciones y eventos (datos "externos") | Convocatoria, campo visual, cronómetro, cambios, minutos, goles y asistencias, planificador |
| 7 | Objetivos | Parcial | Tipo `ObjetivoIndividual` definido en el modelo | Tabla, RLS, interfaz en la ficha, ejercicio sugerido y revisión |
| 8 | Alertas | Parcial | Mejoras y bajadas a 30 días, sin evaluar en 3 semanas, carga alta | Estancamiento (3 sin mejora), −1 en un área, 4 semanas, reparto de minutos; pasar a `src/logic` |
| 9 | Edad relativa | Falta | — | Trimestre en el cromo y aviso de concentración |
| 10 | Informe para familias | Falta | Exportación JSON (derecho de acceso) | Enlace con token caducable, PDF, "carta de temporada" |
| 11 | Consentimiento digital | Parcial | Fecha, firmante, tipo, alcance, versión, firma desde 14 años, retirada | Texto legal versionado y enlazado, registro de evidencia, bloqueo amable en funciones nuevas |
| 12 | Panel de administración | Existe | Resumen, Jugadores, Entrenadores, Actividad (recién simplificado) | Sistema visual nuevo, consentimientos pendientes y cobertura de evaluaciones en el Resumen |
| 13 | Onboarding | Falta | Plantilla de ejemplo (solo admin) | Pregunta de categoría, equipo de demostración, alta pegando una lista, primera evaluación guiada |
| 14 | Planes | Falta | — | Tabla de planes, función en BD comprobada por RLS, candados amables |
| 15 | i18n | Falta | — | Extraer textos a archivos de idioma |

## Decisiones del equipo sobre los conflictos encontrados

- **Registro inmutable frente a derecho de supresión (hallazgo 2).** El auditor de seguridad quiere guardar valores para reconstruir lo ocurrido; la responsable de privacidad no puede aceptar datos de menores que sobrevivan al borrado. Salida: guardar quién, cuándo, qué tabla, qué campos y el identificador, sin valores personales.
  Decide: Responsable de privacidad — porque el RGPD manda sobre la comodidad de la auditoría, y la trazabilidad se conserva igual.
- **Estados de salud (hallazgo 3).** El metodólogo necesita saber quién no puede jugar; privacidad no puede guardar lesiones. Salida: "No disponible" con fecha de vuelta, sin causa ni nota.
  Decide: Responsable de privacidad — porque la planificación solo necesita la disponibilidad, no el motivo.
- **Comparar con el equipo (hallazgo 8).** El analista de rendimiento valora la media del equipo; la psicóloga infantil la ve dañina. Salida: el niño contra sí mismo en la ficha; la media del equipo solo en vistas de equipo sin nombres.
  Decide: Psicóloga deportiva infantil — porque es el principio 3 del producto y la vista de equipo conserva el dato para el análisis.
- **Publicar ya la versión segura o esperar a la migración (hallazgo 1).** Negocio quiere publicar pronto; el líder técnico no acepta que nadie pierda datos. Salida: nada se publica sin copia de seguridad e importación probadas.
  Decide: Líder técnico — porque "ningún usuario actual pierde datos" es un criterio de aceptación de la Fase 1.

## Orden de trabajo recomendado

1. **Hallazgo 20:** revisar con la cuenta de prueba la simplificación ya hecha, fijarla con tests y hacer commit. Es la base sobre la que se trabaja.
2. **Privacidad y seguridad (críticos y altos):** 2 (registro sin datos personales), 3 (sin datos de salud), 7 (minimización en el servidor), 6 (exportación en el servidor), 4 (textos legales), y además 11, 12 y 13.
3. **Offline (5):** caché y cola de evaluaciones. Sin esto la app no sirve en el campo.
4. **Migración de usuarios actuales (1):** copia de seguridad, importación y aviso. Hasta aquí no se publica nada.
5. **Simplicidad:** 8 (comparar consigo mismo), navegación (Fase 1 · 2) e Inicio (Fase 1 · 3).
6. **Rendimiento y accesibilidad:** 9, 10, 14 y 25.
7. **Diseño:** propuesta de 2 direcciones visuales (tokens, cromo, evaluación, carta de temporada) antes de tocar estilos: 15, 16, 17 y 18.
8. **Funciones nuevas de la Fase 1** en el orden del encargo (4 a 15).
