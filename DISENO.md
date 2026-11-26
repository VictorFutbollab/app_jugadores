# Sistema de diseño

Hay dos capas, las dos en `src/config.ts`:

1. **Estructura y componentes:** `src/estilo-v2.css`, con `FLAGS.disenoV2`. Incluye el menú lateral en ordenador, las columnas, las camisetas, la escala de notas, el esqueleto de carga y las transiciones. Todas las reglas cuelgan de `html[data-estilo='v2']`.
2. **Capa visual:** `FLAGS.estiloVisual`.
   - **`'cesped'` (la activa):** `src/estilo-cesped.css`. Clara y deportiva: cabeceras de césped a franjas con las líneas del campo (Inicio, ficha y entrada), verde `#1F6F3A` como color principal y amarillo `#F2C230` solo para la acción estrella (Evaluar). Tarjetas blancas muy redondeadas con sombra suave. Barra superior y navegación en verde casi negro `#102018`; en móvil, la navegación es una píldora flotante. Tiene versión de noche si el usuario elige el tema oscuro.
   - **`'vestuario'`:** solo `estilo-v2.css`, oscura con el celeste FutbolLab.

3. **Acabado "Premium":** `src/estilo-premium.css`, con `FLAGS.premium` (activo). Va el último, encima de "Césped", y solo cambia el aspecto. Sus reglas cuelgan de `html[data-pro]`.
   - Referencias: Linear y Stripe (superficies con filo de 1 px y sombra mínima), Whoop y Oura (números protagonistas), Strava y FotMob (identidad deportiva contenida).
   - Lienzo neutro cálido `#F5F6F3`, superficies blancas con filo `rgba(13,26,19,.075)`, radios 18 / 12 / 8 y controles de 44 px.
   - Ordenador: el menú lateral en tinta `#0D1A13` sube hasta arriba con el logo y la barra superior pasa a ser clara, con el equipo en una pastilla.
   - Pestañas y segmentados: pastilla blanca sobre pista gris. El verde queda para la acción principal y el amarillo para Evaluar.
   - Cromos de la plantilla limpios (camiseta verde sobre un campo claro). El césped a franjas queda para las portadas de Inicio y de la ficha.
   - Para quitarlo en un dispositivo: `localStorage.setItem('flags', JSON.stringify({ premium: false }))`.

Para volver al diseño anterior en un dispositivo: `localStorage.setItem('flags', JSON.stringify({ disenoV2: false }))`. Para ver "Vestuario": `{ estiloVisual: 'vestuario' }`.

Lo que sigue describe la base común. Las diferencias de color de "Césped" están en su propio archivo.

## Principios

1. **El dorsal es la identidad.** Sin foto, el jugador es una camiseta con su número (`<Camiseta>`). No se usan iniciales.
2. **Los números mandan.** Van grandes, en Bricolage Grotesque, con cifras tabulares. Las etiquetas son pequeñas y discretas.
3. **Editorial, no plantilla.** Los títulos se escriben en minúscula normal. La jerarquía se marca con tamaño y peso. Dentro de un bloque se separa con líneas finas, no con más cajas.
4. **Un solo acento** (celeste FutbolLab `#64BDD9`). El resto del color es dato: los 4 colores de área y la escala de notas.
5. **Prohibido:** degradados decorativos, cristal, sombras en modo oscuro, emojis, rojo sobre jugadores, color sin número.
6. **El movimiento es corto** (120–200 ms) y respeta "reducir movimiento".

## Referencias

Patrones tomados de Hudl/Wyscout, Sofascore, FotMob, SkillShark, SoccerLAB, 360Player, Spond y TeamSnap:

- **Barras en vez de radar.** Con 4 áreas, el radar exagera las diferencias, así que la vista principal es de barras. El radar sigue disponible en "Ver en radar".
- **Escala de color fija para las notas**, siempre acompañada del número.
- **Estadísticas en fichas sueltas tipo bento:** valor grande, etiqueta pequeña.
- **Evolución:** se marca un punto solo en los días con evaluación. Hay filtro de periodo y se puede resaltar un área.
- **Inicio con recuentos reales.** No compara a unos jugadores con otros.
- **Evaluación rápida:** la nota elegida toma el color de la escala, así se comprueba sin tener que leer.

## Tokens

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--bg` / `--bg-2` | `#0B1722` / `#08121B` | `#F3F6F8` / `#E8EEF2` | Fondo de la página y del menú lateral |
| `--surface` / `-2` / `-3` | `#111F2B` / `#172836` / `#1F3446` | `#FFF` / `#EEF3F6` / `#DDE6EC` | Bloques, fichas internas y pistas |
| `--accent` | `#64BDD9` | `#64BDD9` | Única acción principal y la selección |
| `--n1`…`--n5` | naranja, ámbar, gris azulado, verde, celeste | versiones oscuras | Notas 1 a 5 (sin rojo) |
| Áreas | `--area-tecnica`, `-tactica`, `-fisica`, `-mental` | — | Solo para datos |
| Radios | `--r-sm` 10, `--r-md` 14, `--r-card` 18, `--r-input` 12 | — | — |
| Movimiento | `--anim` 160 ms | — | — |

**Tipografía:**

- **Bricolage Grotesque** (la de futbollab.com): títulos y números. Escala: 1,15 rem para el título de bloque, 2,2 rem para el de pantalla, hasta 4,2 rem para la portada.
- **Inter:** el resto del texto, a 15 px.

## Estructura

- **Móvil:** barra inferior de 4 pestañas.
- **Tablet (≥700 px):** la columna se ensancha hasta 920 px.
- **Ordenador (≥1024 px):** menú lateral fijo, con "Evaluar" destacado arriba. El contenido llega hasta 1120 px y las pantallas pasan a dos columnas: Inicio, Ficha y Evolución.
- **Panel de admin:** conserva su propio menú lateral.

## Componentes

`Camiseta`, `Vacio` (con icono), `claseNota(v)` → `n1`…`n5`, esqueleto de carga (`.esqueleto`) y transición entre pantallas (`.pantalla`).

## Reglas al añadir pantallas

- Usar `.bloque` con `h2` en minúscula normal. No crear cajas nuevas dentro de otras cajas.
- Para las notas, `claseNota()` más el número.
- Para estados vacíos, `<Vacio icono="…">` con una frase que diga qué hacer.
- No inventar indicadores: solo recuentos de datos que ya existen.
