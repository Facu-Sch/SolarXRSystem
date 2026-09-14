# Sistema Solar en Realidad Mixta

**Versión 2.4.1** · [Registro de cambios](CHANGELOG.md)

Una demo de **realidad mixta para Meta Quest 3**: el Sistema Solar aparece flotando en tu
habitación real y lo manipulás **con las manos**, sin mandos. Podés tocar un planeta para
frenar su rotación, agarrarlo y moverlo, agrandarlo separando las dos manos, abrir un menú
poniendo la palma hacia arriba y leer la ficha educativa de cada cuerpo.

Las órbitas no son círculos decorativos: se calculan con **mecánica kepleriana a partir de
los elementos orbitales reales de la época J2000** publicados por el JPL. Los períodos, las
velocidades, las excentricidades y las inclinaciones son los verdaderos, y lo mismo vale
para los diámetros, las masas y los períodos de rotación de las fichas.

Hecho con **Three.js + WebXR + Vite**. Sin backend y sin analítica: es una web estática que
además se puede **instalar en el visor** y usar sin conexión. Las texturas de los planetas
se generan por código; los únicos archivos binarios son los dos logos institucionales y la
música de fondo.

---

## Índice

1. [Qué se puede hacer](#1-qué-se-puede-hacer)
2. [Cómo funciona](#2-cómo-funciona)
3. [Puesta en marcha](#3-puesta-en-marcha)
4. [Llevarlo al visor](#4-llevarlo-al-visor)
5. [Arquitectura del código](#5-arquitectura-del-código)
6. [Limitaciones de WebXR y decisiones tomadas](#6-limitaciones-de-webxr-y-decisiones-tomadas)
7. [Rendimiento](#7-rendimiento)
8. [Datos astronómicos y fuentes](#8-datos-astronómicos-y-fuentes)
9. [Depuración](#9-depuración)

---

## 1. Qué se puede hacer

### En el visor, con las manos

| Acción | Gesto |
|---|---|
| **Frenar su rotación** | Tocarlo y mantener la mano encima |
| **Agarrarlo y ver su ficha** | **Pellizcar** (índice + pulgar) con la pinza sobre él — se ilumina cuando está en posición |
| **Moverlo sin abrir la ficha** | Envolverlo con la mano |
| **Devolverlo a su órbita** | Soltar con la mano quieta: vuelve solo, suavemente |
| **Lanzarlo** | Soltarlo **con la mano en movimiento**: cuanto más rápido, más lejos llega; choca con lo que encuentre y después vuelve |
| **Atraparlo en el aire** | Pellizcarlo mientras vuela |
| **Agrandarlo / achicarlo** | Agarrarlo **con las dos manos** y separarlas o juntarlas |
| **Abrir el menú** | **Palma derecha abierta mirando hacia arriba**, ~0,3 s |
| **Pulsar un botón** | Atravesarlo con la yema del índice |

La ficha de cada cuerpo tiene sus propios botones: **A −** / **A +** para cambiarle el
tamaño, **Mover** para pasarla de arriba del planeta a su derecha o a su izquierda, **Fijar** para que el cuerpo deje de
avanzar por su órbita y se quede quieto mientras lo mirás, y **Cerrar**.

### Desde el menú

- **Play / pausa** y **velocidad**: 0,1× · 0,5× · 1× · 5× · 10× · 100×
- **Reiniciar** todo, o solo **devolver a su órbita** los planetas que moviste
- Mostrar u ocultar **órbitas, nombres, fichas y estrellas**
- **Música de fondo**: silencio · 25 % · 50 % · 75 % · 100 %, con su estado al lado del título
  («sonando», «esperando un toque», «error»…)
- **Lunas**: solo la Luna, o las **27 lunas principales** del Sistema Solar
- **Tamaño de los cuerpos**: 0,5× · 1× · 1,5× · 2,5×
- **Separación de las órbitas**: 1× · 1,5× · 2× · 2,5×
- **Física y comparación**: activar o desactivar los choques entre planetas, mostrar sus
  colliders, silenciar el **sonido de los choques** y entrar en **Comparar tamaños**, que
  muestra dos cuerpos con su proporción real (§2.12)
- **Recentrar** el sistema alrededor de donde estés mirando

### En la computadora, sin visor

Se puede recorrer la escena con el ratón para comprobar la simulación. **Las fichas de los
cuerpos no se abren desde el escritorio**: eso es exclusivo del visor (ver §2.9).

| Tecla / acción | Efecto |
|---|---|
| arrastrar / rueda | orbitar la cámara / zoom |
| `H` o *Ocultar panel* | pliega el panel de estado para despejar la vista |
| `Esc` | oculta el panel |
| `M` | menú espacial |
| `Espacio` | play / pausa |
| `R` | reiniciar |
| `O` / `N` | órbitas / nombres |
| `C` | modo comparación de tamaños (elegir los cuerpos requiere las manos) |

El panel de estado se recupera con la pastilla **ⓘ Estado y opciones** de la esquina
superior derecha, y muestra abajo el **sello de compilación** (`versión AAAA-MM-DD hh:mm`).
Sirve para saber de un vistazo si lo que estás probando es la última versión o una copia
cacheada o desplegada hace rato.

---

## 2. Cómo funciona

### 2.1 Realidad mixta

La aplicación pide a WebXR una sesión `immersive-ar`. En el Quest 3 eso activa el
**passthrough**: las cámaras del visor muestran tu habitación y los planetas se componen
encima. Para que funcione, el renderizador se crea con `alpha: true`, el fondo de la escena
se deja transparente y el color de limpieza tiene alfa 0 — todo lo que no dibujemos deja ver
la habitación.

No se crea ningún entorno virtual cerrado. Las estrellas de fondo son puntos aditivos muy
dispersos, no una esfera opaca, y se pueden apagar.

Al entrar en la sesión el sistema se **recentra** alrededor tuyo: se lee la pose de tu cabeza
y el Sol se coloca ligeramente delante y por debajo, de modo que los planetas te rodean sin
que el Sol te quede en la cara.

Si el dispositivo no soporta `immersive-ar`, se ofrece `immersive-vr` con un fondo espacial
oscuro y se avisa de que es la alternativa.

### 2.2 Las manos

WebXR entrega las **25 articulaciones** de cada mano, y nada más: no existen eventos de
"pellizco" ni de "palma hacia arriba". Todo se deduce a partir de esas poses.

**Pellizco.** Distancia entre la yema del pulgar y la del índice, con **histéresis** para que
no parpadee: se cierra por debajo de 28 mm y no se abre hasta pasar los 48 mm.

**Contacto.** Se comparan seis puntos de la mano (las cinco yemas y la palma) contra la
esfera de cada cuerpo, usando los **radios reales de las articulaciones** que aporta WebXR y
**sin holgura** (v2.3): la esfera de cada astro es su collider, del tamaño exacto del astro. Cuando varios cuerpos están al alcance gana el de **superficie** más
próxima, no el de centro más próximo: comparando centros, una luna diminuta le robaba el
contacto a su planeta aunque la mano estuviera dentro de éste.

No se dibujan las articulaciones: en passthrough el usuario ya ve sus manos, y
superponerles marcadores tapaba los planetas pequeños. Lo único que se dibuja es el
**anillo de pinza** (v2.4), en el punto medio entre las yemas del pulgar y del índice. Se
achica al cerrar los dedos y su color dice qué detecta la aplicación:

| Anillo | Significa |
|---|---|
| blanco | la mano no toca ningún collider |
| amarillo, con un nombre | toca el collider de ese astro: si pellizcás ahora, se agarra ése |
| cian, con un nombre | astro agarrado |
| rojo, «sin contacto» | cerraste la pinza sin tocar ningún astro |

El rojo hace visible un pellizco que no tocó nada. Con el collider exacto, pellizcar un
planeta con las yemas apenas por fuera de su superficie no lo agarra. Medido: con las yemas
justo tocando la superficie se detectan los 9 planetas; un 10 % más afuera, ninguno.

Los últimos 20 pellizcos quedan registrados con los tres astros más cercanos y su puntaje
(distancia / suma de radios; menor que 1 es contacto), para revisarlos desde la consola
remota del Quest: `__solarApp.interaction.pinchLog`.

**Tocar, apuntar y agarrar son tres cosas distintas** (v2.0):

- **Tocar**: una yema o la palma se superpone con el collider del astro. Congela la
  rotación y **no** abre la ficha.
- **Apuntar**: cuando la yema del pulgar, la del índice o el punto entre ambas tocan el
  collider de un astro, éste se ilumina. Es la confirmación de cuál vas a agarrar *antes* de
  pellizcar.
- **Agarrar y abrir la ficha** exige colisión y pinza **en el mismo instante**: la pinza se
  evalúa una sola vez, en el frame en que se cierra. Si se cierra en el vacío queda gastada,
  y arrastrarla después hacia un planeta —o a través de uno— no agarra nada. Ver §2.11.

**Agarre.** Con pellizco, o "a mano llena" envolviendo el cuerpo — para esto último hacen
falta al menos 3 yemas **estrictamente dentro** de la esfera y la mano cerrándose. Es
deliberadamente estricto: si no, apoyar la mano abierta sobre un planeta pequeño lo agarraría
sin querer y ya no se podría simplemente tocarlo para frenar su rotación.

**Palma hacia arriba.** Se calcula la normal de la palma como el producto vectorial de los
vectores muñeca→metacarpo del índice y muñeca→metacarpo del meñique — que en la mano derecha
apunta hacia afuera de la palma. Se exige que apunte hacia arriba (producto escalar ≥ 0,70
con la vertical del mundo), que la mano esté **abierta** y que el gesto se mantenga 0,3 s.
Una mano vertical, de canto o cerrada en puño no abre nada.

### 2.3 El movimiento orbital

Modelo **kepleriano de dos cuerpos**, sin simulación gravitacional de N cuerpos (no hace
falta y sería contraproducente para una demo interactiva). Para cada planeta se parte de sus
elementos orbitales J2000 —semieje mayor, excentricidad, inclinación, longitud del nodo
ascendente, longitud del perihelio y longitud media— y en cada instante se resuelve:

```
M(t) = M₀ + n·t          n = 2π / período real
M    = E − e·sin(E)      ecuación de Kepler, resuelta por Newton-Raphson
r    = a·(1 − e·cos E)   radio vector en el plano orbital
```

Es decir: **períodos, velocidades, distancias e inclinaciones relativas son los reales**, y
las órbitas son elipses inclinadas, no círculos uniformes. La órbita de Plutón (e = 0,249,
i = 17,1°) se nota a simple vista, e incluso se ve que cruza por dentro de la de Neptuno.

Las rotaciones usan los períodos sidéreos verdaderos, incluidas las **retrógradas** (Venus,
Urano, Plutón, Tritón) y las oblicuidades reales — Urano rota tumbado, con su eje a 97,8°.

**Determinismo.** La posición orbital es una *función cerrada* del tiempo simulado acumulado,
y ese tiempo se acumula con el *delta time* real. Dos ejecuciones que lleven el mismo tiempo
simulado dan exactamente las mismas posiciones, sean 60, 72, 90 o 120 Hz. La rotación sí se
integra frame a frame, porque es obligatorio poder congelarla y reanudarla.

**Escala de tiempo.** A velocidad 1× transcurren **5 días simulados por segundo**: la Tierra
completa una órbita en ~73 s y una rotación en ~4,8 s; Júpiter rota en 2 s; la Luna orbita en
5,5 s. Los planetas exteriores necesitan 10× o 100× para verse moverse, que es exactamente lo
que dicen sus períodos reales.

### 2.4 El problema de la escala

El Sistema Solar real no se puede representar literalmente: con el Sol a 25 cm, Neptuno
estaría a 1,6 km y la Tierra sería un grano de 0,2 mm. Se usan **dos escalas independientes**,
ambas con compresión por ley de potencia:

| | Fórmula | Resultado |
|---|---|---|
| **Distancias** | `r = 0,437 · (r_UA)^0,45` m | Mercurio 0,31 m … Neptuno ~2,02 m |
| **Cuerpos** | `R = 0,023 · (R/R_Tierra)^0,40` m | Tierra 2,3 cm · Júpiter 6,0 cm · Sol 15,0 cm |
| **Satélites** | `r = R_planeta · (1,55 + 0,36 · (a/R_planeta)^0,40)` | Luna a 7,8 cm de la Tierra |

Se comprime **el módulo** del vector de posición conservando la dirección, así que se
mantienen la forma de la elipse, la inclinación orbital y el orden de los planetas, pero el
rango 0,39–39,5 UA (×100) se convierte en 0,31–2,02 m (×6,5). Resultado: **todo el sistema
cabe en una esfera de ~2 m a tu alrededor**, todo es visible a la vez y todo está al alcance
de la mano.

#### El Sol y las proporciones

Conviene decirlo claro: **ningún cuerpo está a escala lineal entre sí**. Eso es
precisamente lo que hace el exponente 0,40 — comprimir el rango. El Sol tiene 109 radios
terrestres; a proporción verdadera, con la Tierra en 4,6 cm de diámetro, mediría **5 metros
de diámetro** y se comería la escena entera.

Con la ley de compresión queda en **30 cm de diámetro, 6,5 veces la Tierra** en vez de 109.
Se conserva el orden y el "quién es más grande que quién", no la proporción numérica.

`BODY.SUN_FACTOR` permite encoger el Sol *además* de la compresión. Está en **1,0**, es
decir el Sol sigue exactamente el mismo criterio que los planetas, sin excepciones. Deja
13,4 cm de holgura con Mercurio en su perihelio (verificado en simulación), así que no
invade ninguna órbita. Bajarlo a 0,55 lo dejaría en 17 cm de diámetro, más discreto en el
centro de la escena pero rompiendo la coherencia con el resto.

#### Por qué esa relación exacta entre las dos escalas

El par crítico es **Venus–Tierra**: son casi del mismo tamaño y sus órbitas están muy juntas.
Para que no lleguen a solaparse hace falta

```
DISTANCE.K / BODY.K  ≥  1,98 / 0,132  =  15,0
```

(numerador: suma de radios relativos; denominador: separación relativa de las dos órbitas
tras la compresión). La configuración usa `0,437 / 0,023 = 19,0`, o sea un **27 % de
holgura**. Comprobado por simulación: recorriendo **57 años simulados no hay un solo
contacto** entre cuerpos; el acercamiento más justo es Venus–Tierra, con 1,3 cm.

#### Las dos escalas se ajustan por separado

El menú tiene dos filas independientes. Al subir el **tamaño de los cuerpos**, la
**separación de las órbitas** sube sola lo justo (`tamaño / 1,27`, aprovechando la holgura de
la escala base) para que los planetas no se solapen; después se puede afinar a mano.
Verificado: 0 colisiones a 0,5×, 1×, 1,5× y 2,5×.

Los satélites son un caso aparte: su radio orbital se expresa **en radios visuales de su
planeta**, así que al agrandar un planeta sus lunas se separan con él y nunca quedan dentro.

**Todas estas escalas son sólo visuales.** No tocan ni un parámetro astronómico: los radios,
masas, períodos y elementos orbitales de `src/data/` se usan tal cual para la mecánica y para
las fichas. Lo mismo vale para la escala con las dos manos.

### 2.5 Qué le pasa a un planeta cuando lo tocás

Cada cuerpo tiene una máquina de estados con cuatro situaciones:

```
        toque                pellizco / envolver
NORMAL ────────► TOUCHED ──────────────────────► GRABBED
   ▲                │                                │
   │           deja de tocar                    soltar / se pierde
   │                │                            el tracking
   │                ▼                                ▼
   └───────────── NORMAL ◄────── (llega) ────── RETURNING
```

- **TOUCHED** — se congela la rotación, con una transición suave, no de golpe. Es el "poner
  la mano encima para frenar el planeta".
- **GRABBED** — se detienen órbita y rotación, y el cuerpo sigue a la mano con suavizado
  exponencial (constante de tiempo 45 ms): responde al instante pero no vibra ni salta.
- **RETURNING** — al soltarlo interpola hacia su posición orbital, que mientras tanto sigue
  avanzando, con una constante de tiempo de 220 ms y una **velocidad mínima** de 0,12 m/s
  para que el regreso sea claramente perceptible y siempre más rápido que el movimiento
  orbital normal. Durante el retorno no admite otra interacción, lo que evita estados en
  conflicto.

Medido en la propia demo: un planeta desplazado 28 cm vuelve a su órbita en **~1 s** (le
quedan 12,6 cm a los 0,17 s y 3,2 cm a los 0,5 s) y recupera la rotación al llegar.

Si en vez de soltarlo lo **fijás** desde su ficha, el cuerpo deja de avanzar por su órbita y
se queda donde está; si lo agarrás y lo soltás, vuelve al punto fijado en vez de a la órbita.

### 2.6 Las lunas

Hay **27 satélites** con sus radios, distancias, períodos e inclinaciones reales: la Luna,
Fobos y Deimos, las cuatro galileanas, las siete grandes de Saturno, las cinco de Urano, las
tres de Neptuno y las cinco de Plutón. Tritón aparece con su órbita **retrógrada** real.

Por defecto solo se muestra la Luna; el botón **Lunas** del menú activa todas. No están las
300 y pico lunas catalogadas porque la inmensa mayoría son cuerpos irregulares de pocos
kilómetros, invisibles a esta escala.

Cada luna cuelga del nodo de su planeta, así que **acompaña al planeta si lo movés con la
mano**.

### 2.7 La interfaz espacial

El menú y las fichas son planos de Three.js texturizados con un `<canvas>` 2D. Es lo más
eficiente para el Quest: se dibujan una sola vez —o cuando cambia el contenido—, no hay DOM
en 3D y el texto queda nítido con tipografía grande.

Se pulsan **atravesándolos con la yema del índice**: cada botón es un rectángulo en píxeles
del canvas y el punto del dedo se lleva al espacio local del plano. Hay detección de flanco
por mano y un pequeño rearme, para que un dedo apoyado no dispare el mismo botón muchas
veces.

El **menú** se abre con el gesto y queda **anclado en el mundo**, no siguiendo a la mano: si
siguiera la palma habría que pulsar sus botones con la otra mano mientras se mantiene la
primera perfectamente quieta. Anclado, bajás la mano y pulsás cómodo. Se cierra con su botón
o solo, a los 8 s sin gesto ni manos cerca.

La **ficha** aparece **arriba de su planeta**, justo sobre el nombre, así queda claro a qué
astro corresponde (v2.3). Desde sus propios botones se redimensiona y, con **Mover**, pasa a
la derecha o a la izquierda del planeta.

**El lienzo de la ficha nunca cambia de tamaño** (v2.4). Cada ficha tiene una altura
distinta (la de la Tierra incluye la Luna; la de una luna es corta), pero Three.js reserva
la textura en la GPU con el tamaño de la primera subida y no la redimensiona. Cuando el
lienzo se ajustaba a cada ficha, las más altas que la primera abierta no llegaban a la GPU:
los planetas mostraban la ficha del Sol con restos de otras encima, y las lunas, más cortas,
se veían bien. Ahora el lienzo tiene siempre la altura máxima y la altura de cada ficha se
ajusta recortando la textura y el plano 3D. Verificado comparando píxel a píxel lo que
dibuja la GPU con el lienzo, abriendo las fichas en cualquier orden.

### 2.8 Las texturas

Se **generan proceduralmente con Canvas 2D** al cargar, en lugar de descargar imágenes. La
Tierra se dibuja con continentes, océanos, zonas áridas, casquetes polares y nubes; Júpiter
con bandas turbulentas y Gran Mancha Roja; Saturno con anillos de bandas concéntricas y la
División de Cassini; la Luna y Mercurio con cráteres; Ío con su azufre volcánico; Titán con
su bruma anaranjada.

No es fotorrealismo, pero cada cuerpo es reconocible al instante y el proyecto no arrastra un
solo megabyte de assets binarios, no hace peticiones de red y no tiene problemas de CORS ni
de licencias. Si preferís texturas reales, dejá los ficheros equirectangulares en
`public/textures/` y rellená `OVERRIDE_URLS` en `src/systems/ProceduralTextures.js`.

### 2.9 Por qué en escritorio no se seleccionan cuerpos

La vista de escritorio sirve para **observar** la escena y comprobar la simulación, no para
interactuar: no hay selección con el ratón. Es una decisión, no un olvido, y vale la pena
dejar escrito por qué, porque se intentó de dos maneras distintas y ninguna funcionó.

Con la cámara alejada, un planeta rocoso mide **5-7 píxeles de radio**. Exigir que el rayo
impacte exactamente sobre él hace que casi todos los clics fallen; y como al fallar no
pasaba nada, quedaba en pantalla la ficha del último cuerpo acertado, lo que daba la
impresión de que la aplicación asignaba mal las tarjetas.

El segundo intento fue dar un margen de tolerancia. Peor: el margen hacía que el clic se lo
quedara un cuerpo vecino, o alguno de los que quedaban de paso entre el cursor y el
objetivo. Ninguna de las dos opciones era aceptable, y en escritorio la ficha no aporta
nada que no se pueda leer dentro del visor, que es donde la demo está pensada para usarse.

Lo que sí queda en escritorio: cámara orbital, zoom, el menú espacial con `M` y los demás
atajos de teclado.

### 2.10 Ambientación: logos en el suelo y sonido

Dos **logos institucionales** (GTI FIUNER y Facultad de Ingeniería de la UNER) se apoyan
en el suelo real de la habitación, por delante del usuario. Se colocan al recentrar la
escena, igual que el sistema solar, y viven en `y = 0`, que en el espacio de referencia
`local-floor` de WebXR coincide con el suelo físico.

Los PNG institucionales vienen con **fondo blanco opaco**, que sobre el suelo real se
vería como una hoja de papel pegada. Al cargarlos se convierte ese blanco en
transparencia con un degradado suave (entre el 82 % y el 99 % de luminosidad mínima),
de modo que se conserva el antialias de los bordes y sólo queda el logo.

Los archivos van en `public/logos/` y son **opcionales**: si falta alguno, ese logo
simplemente no aparece y se avisa por consola.

| Archivo | Ancho en escena |
|---|---|
| `public/logos/gti-fiuner.png` | 0,34 m (cuadrado) |
| `public/logos/uner-fi.png` | 0,70 m (apaisado 3:1) |

El recorte del blanco **sólo se aplica si el PNG no trae ya transparencia**: se comprueban
las cuatro esquinas y, si son transparentes, la imagen se usa tal cual. Si no, se borrarían
los blancos legítimos del propio logo — los reflejos de las gafas o los huecos del
engranaje.

El **sonido ambiental** (`public/audio/ambient-neptune.mp3`, 12 minutos, mono 32 kbps,
2,8 MB) suena en bucle continuo, sin espacializar: es un fondo constante y no un sonido
situado en un punto.

**Web Audio (v2.4.1).** El mp3 se descarga, se decodifica en memoria y suena con un
`AudioBufferSourceNode` en bucle, con un `GainNode` para el volumen y los fundidos. Comparte
un único `AudioContext` con el sonido de los choques (`AudioEngine.js`).

Hasta la 2.4 se usaba un `<audio>` del DOM, y en el Quest la música no sonaba dentro de la
sesión inmersiva. Un elemento multimedia depende de gestos sobre la página para arrancar y
el navegador lo puede pausar al pasar la página a segundo plano; dentro de la sesión ya no
hay gestos del DOM para reactivarlo. Un `AudioContext` se activa **una vez**, con el clic en
«Entrar en Realidad Mixta», y sigue funcionando en la sesión: la música arranca sola en
cuanto termina de decodificarse.

El contexto trabaja a **24 kHz**, la frecuencia del archivo, para que la música decodificada
ocupe 66,7 MB (12 min 8 s, mono) y no el doble. Los choques se sintetizan por debajo de
6 kHz, así que no pierden nada.

Los navegadores no dejan activar el audio sin una interacción previa del usuario: el
contexto se activa con el primer clic, tecla o al entrar en la sesión XR, y la música entra
con un fundido de 1,6 s. Si el navegador lo suspende, se reintenta cada segundo, y la música
vuelve sola en cuanto el contexto se reactiva. El estado («cargando», «decodificando»,
«esperando un toque», «sonando», «silenciada» o «error») se muestra en el panel de inicio
y junto al título de la fila **Música de fondo** del menú.

El **volumen** se elige en el menú: silencio, 25 %, 50 %, 75 % o 100 %. El volumen real
es nivel^1,5, porque el oído percibe el volumen de forma logarítmica: 50 % equivale a 0,35,
el valor fijo que tenía antes.

El service worker **no cachea** el audio. Eso significa que el sonido es lo único que necesita conexión; el resto
de la demo funciona sin red.

### 2.11 Colliders y choques entre planetas (v2.0)

Cada astro tiene **un collider esférico del tamaño exacto del astro** (v2.3). Sirve para los
choques entre planetas y para detectar qué astro toca la mano.

**Detección por contacto mano–collider.** El collider de la mano son tres esferas: la yema
del índice y la del pulgar (con el radio real de la articulación que da WebXR) y el punto
medio de la pinza. En el instante en que se cierra la pinza, se agarra el astro cuyo collider
se superpone con alguna de ellas, y se abre su ficha. Si toca dos a la vez, gana el más
«hundido» (menor distancia al centro relativa a la suma de radios).

Hasta la 2.2 había además un collider de agarre mayor que el astro (mínimo 2,5 cm más 8 mm).
Se quitó: con la Luna a 7,8 cm de la Tierra, las zonas ampliadas de cuerpos vecinos casi se
tocaban y la mano podía seleccionar un astro que no estaba tocando. Tampoco hay tolerancia
temporal: se probó una ventana de gracia de 150 ms y se descartó tras medirla, porque una
pinza cerrada que atravesaba la Luna a 0,58 m/s la capturaba a los 42 ms.

**Cómo conviven los choques con Kepler.** No hay integración de velocidades ni fuerzas: la
órbita sigue siendo una función cerrada y determinista del tiempo simulado. Un choque sólo
suma a cada cuerpo un **desplazamiento transitorio** que lo saca del otro, y ese
desplazamiento se relaja solo en ~0,3 s. Así los planetas se empujan de verdad al chocar,
pero en cuanto dejan de tocarse vuelven a su posición orbital exacta — medido: error nulo
tras soltar.

**Quién se mueve.** Un cuerpo agarrado tiene autoridad y empuja a los demás. Entre cuerpos
libres se aparta más el de menor masa visual (radio al cubo), así que una luna que choca
con el Sol sale despedida y el Sol apenas se inmuta, sin necesidad de un caso especial.

**Quién choca.** Sólo los cuerpos **en interacción**: agarrados, volviendo a su órbita, o
ya desplazados por otro choque —esto último es lo que permite las cadenas: la Tierra
agarrada empuja a Marte y Marte, ya desplazado, empuja al siguiente—. Dos cuerpos que
simplemente siguen su órbita se atraviesan, y no es un olvido: por la compresión de escala
la órbita de la Luna invade los carriles de Venus y Marte, y sin esta regla chocaban solos
durante la simulación normal (medido: Luna-Venus con 24 mm de penetración y Luna-Marte con
19 mm en 25.000 días simulados). No tiene arreglo geométrico: para no tocar a Venus, la Luna
tendría que orbitar dentro de la Tierra.

La resolución es de tipo Jacobi, en 3 iteraciones por frame: todas las correcciones de una
pasada se calculan con las mismas posiciones de partida y se aplican juntas, así el
resultado no depende del orden de los cuerpos y los choques en cadena se asienten.

**Verificado con manos simuladas:**

| Escenario | Resultado |
|---|---|
| Tocar sin pellizcar | congela la rotación, no abre ficha |
| Pinza cerrada en el vacío y arrastrada hasta un planeta | no agarra nada |
| Pinza cerrada dentro del collider | agarra y abre la ficha |
| Recorrer el sistema hasta Saturno sin pellizcar | ninguna ficha en el camino |
| Pinza cerrada atravesando la Luna a 0,58 m/s | no la captura |
| Escala con dos manos | 1× → 2,5× |
| Empujar la Tierra contra Marte | 0 mm de penetración, Marte apartado 4,1 cm |
| Soltar | ambos vuelven a su órbita con error nulo |
| Choque en cadena sobre un cuerpo en reposo | lo aparta, 0 mm de penetración residual |
| 20.833 días a 100× sin tocar nada | 0 choques resueltos |

El menú tiene una fila **Física** para desactivar los choques y para **ver los colliders**
(verde libre, amarillo pinza en posición, rojo en choque, cian agarrado), útil tanto para
depurar como para explicar qué está pasando.

### 2.12 Lanzar planetas, sonido de choques, fecha y comparación (v2.1)

**Lanzar.** Mientras un cuerpo está agarrado se mide la velocidad de la mano (suavizada con
τ = 35 ms) y se guarda un **pico** que decae despacio. Hace falta porque abrir los dedos para
soltar lleva unos milisegundos en los que la mano ya se está frenando: sin el pico, un
lanzamiento enérgico saldría flojo. Si al soltar el pico supera **0,55 m/s**, el cuerpo pasa a
un estado nuevo, `THROWN`. Vuela con esa velocidad (máximo 2 m/s) y se frena solo
(τ = 0,75 s). Cuando baja de 0,07 m/s, pasan 3 s o se aleja 2,5 m, vuelve a su órbita como
cualquier cuerpo soltado. Se puede **atrapar en el aire** con otra pinza. «Soltar planetas» y
«Reiniciar» nunca lanzan: devuelven todo, incluido lo que esté volando.

En la 2.2 se probó una vuelta en «mini órbita» (un bucle tipo bumerán alrededor de su lugar
en la órbita) y se descartó tras probarla en el visor.

La velocidad se mide en coordenadas del **mundo** y no respecto del padre por un motivo
concreto. Si se midiera respecto del planeta, una luna agarrada heredaría la velocidad orbital
de este (3,8 m/s para la Tierra a 100×) y saldría disparada aunque se la soltara quieta.

**Choques con velocidad.** Sobre la resolución por desplazamientos de la 2.0 se suma un
**impulso** a lo largo de la normal, con restitución 0,55 y la masa visual (radio al cubo). La
mano cuenta como masa infinita: no retrocede. Un cuerpo en reposo sólo sale despedido si
recibe más de 0,25 m/s; con empujones suaves se sigue apartando como en la 2.0.

A 2 m/s y 72 Hz un cuerpo avanza 2,8 cm por frame, más que el diámetro de muchas lunas. Para
que no atraviese a uno pequeño sin tocarlo, se traza el **segmento recorrido** desde el frame
anterior contra la esfera de cada cuerpo.

**Sonido.** Se sintetiza con Web Audio, sin archivos, en tres capas: un tono con caída de
afinación, un parcial inarmónico y un chasquido de ruido filtrado. Cada golpe se coloca con
HRTF **en el punto del contacto**, así que en el visor suena desde donde ocurre. El volumen
sigue a la velocidad del impacto y la afinación al tamaño: Júpiter retumba, una luna hace
«tic». Suena **una vez por contacto nuevo**, no mientras dos cuerpos siguen apoyados. Se
silencia desde el menú (**Sonido choques**), independiente de la música.

**Fecha simulada.** Flota sobre el Sol y muestra J2000 (1 ene 2000, 12:00) más los días
simulados, junto con la velocidad o «en pausa». Las posiciones corresponden a esa fecha dentro
de la precisión del modelo kepleriano. El rótulo se redibuja como mucho 10 veces por segundo:
a 100× pasan 500 días por segundo y más no se llega a leer.

**Comparar tamaños.** Se activa con el botón **Comparar tamaños** del menú (tecla `C` en la
PC). Mientras está activo, la pinza no abre la ficha: entrega el cuerpo a la comparación. Esta
muestra los **dos últimos cuerpos pellizcados** delante del usuario con su **proporción
verdadera**, el mayor con 20 cm de diámetro, y un panel con los diámetros y los cocientes de
diámetro y de volumen. Es la respuesta visual a por qué la maqueta comprime los tamaños: junto
a un Sol de 20 cm, la Tierra mide 1,8 mm. Si el cuerpo pequeño quedara por debajo de 1,6 mm,
se dibuja con ese mínimo y el panel lo aclara.

**Verificado con manos simuladas** (frames a 72 Hz):

| Escenario | Resultado |
|---|---|
| Lanzar la Tierra a 1,2 m/s hacia Venus | sale a 1,16 m/s, choca a 0,98 m/s, Venus despedida a 0,78 m/s, 0 mm de penetración |
| Después del choque | las dos vuelven a su órbita en 1,3 s, error nulo |
| Soltar moviendo la mano a 0,25 m/s | no lanza: vuelve a su órbita |
| Pellizcar un cuerpo en vuelo | queda agarrado y quieto |
| «Soltar planetas» con un cuerpo en vuelo | vuelve a su órbita |
| Perder el tracking de la mano mientras se mueve a 1 m/s | sale lanzado a 0,98 m/s en vez de quedar clavado |
| Marte a 2 m/s contra la Tierra con un frame de 50 ms (10 cm por paso) | no la atraviesa: se detiene en 4,1 cm, la suma de radios, y la despide |
| 20.833 días a 100× sin tocar nada | 0 choques, 0 sonidos, 0 lanzamientos |
| Comparar el Sol y la Tierra | diámetro 109 ×, volumen 1,30 millones ×, la Tierra de 1,8 mm, sin abrir la ficha |
| Síntesis del sonido de choque | se reproduce sin errores |

---

## 3. Puesta en marcha

```bash
npm install
```

```bash
npm run dev
```

Vite arranca con **HTTPS** (certificado autofirmado) y escuchando en toda la red local:

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.x.x:5173/     <-- ésta es la que se abre en el Quest 3
```

Abrí la URL `Local` en Chrome o Edge para verlo en la computadora. Como el certificado es
autofirmado saldrá un aviso: **Avanzado → Continuar**.

Para producción:

```bash
npm run build
```

Genera `dist/`: el HTML, un único bundle JS (~590 kB, 156 kB comprimido) y los iconos. Nada
más, porque las texturas se generan en el navegador.

> Si necesitás servir por HTTP plano en `localhost` (para depurar sin el aviso del
> certificado), usá `NO_HTTPS=1 npm run dev`. Sólo sirve en `localhost`: WebXR **no**
> funciona por HTTP desde una IP de la red local.

---

## 4. Llevarlo al visor

### 4.1 Probarlo desde el PC (rápido, para desarrollar)

1. PC y Quest 3 **en la misma red Wi-Fi**.
2. `npm run dev` en el PC y anotá la URL `Network`.
3. En el Quest 3, abrí esa URL completa (con `https://`) en el **navegador Meta Horizon**.
4. Aviso de certificado: **Avanzado → Continuar al sitio**.
5. Comprobá que el hand tracking esté activo:
   **Ajustes → Movimiento → Manos y mandos**. Dejá los mandos apoyados.
6. Pulsá **«Entrar en Realidad Mixta»** y aceptá el permiso del sistema.

El panel de inicio muestra un semáforo con el estado real de cada capacidad (HTTPS, WebXR,
`immersive-ar`, `immersive-vr`, hand tracking). Si algo falta, se explica qué es y cómo
solucionarlo: no hay fallos silenciosos.

### 4.2 Publicarlo en GitHub Pages

El repositorio incluye `.github/workflows/deploy.yml`: cada `push` a `main` compila el
proyecto y lo publica solo. No hay que subir `dist/` a mano ni mantener una rama `gh-pages`.

Después del primer push, una sola vez en la web del repositorio:
**Settings → Pages → Source: _GitHub Actions_**.

En 1–2 minutos la demo queda en `https://USUARIO.github.io/REPO/` con certificado HTTPS
válido. `base: './'` ya está configurado, así que funciona servida desde una subcarpeta.

Desde ese momento **el visor no necesita ningún PC**: se abre esa URL directamente.

Cualquier otro hosting estático sirve igual (Netlify, Vercel, Cloudflare Pages). Requisitos:
HTTPS válido y servir `index.html` + `assets/`. No hace falta backend.

### 4.3 Instalarla en el visor (PWA)

El proyecto es una **PWA**: se instala en el Quest 3 y queda en la biblioteca de
aplicaciones, con su icono, como una app más. Una vez instalada **no necesita ni el PC ni
internet** — la demo no hace ninguna petición de red en ejecución, así que el service worker
cachea el HTML, el bundle y los iconos y con eso ya está todo.

**Requisito imprescindible: un certificado HTTPS válido.** Los navegadores no permiten
registrar un service worker en sitios con errores de certificado, así que desde el servidor
de desarrollo la demo funciona pero *no se puede instalar*. Hay que desplegarla primero.

1. Abrí la URL desplegada en el navegador Meta Horizon.
2. Pulsá **«Instalar en el visor»** en el panel de inicio, o usá el menú **⋮** del navegador
   → *Instalar*.
3. La app aparece en la **biblioteca de aplicaciones** y se lanza a pantalla completa.
4. A partir de ahí funciona **con el visor en modo avión**.

Para comprobar que el service worker quedó registrado: abrí la URL en Chrome de escritorio →
F12 → pestaña *Application* → *Service Workers*.

### 4.4 ¿Y un APK?

**No con un APK convencional.** En Quest, WebXR sólo está disponible en el navegador Meta
Horizon; un APK que envuelva la web en un `WebView` de Android **no expone la API WebXR**, así
que la demo se vería en 2D, sin passthrough ni manos. Para un APK nativo de verdad habría que
rehacer el proyecto en Unity, Unreal u OpenXR nativo: es otro desarrollo, no un empaquetado.

La vía soportada para que contenido web quede instalado como aplicación en el visor es la
**PWA** de arriba, que a efectos prácticos da lo mismo: icono propio, biblioteca de
aplicaciones, pantalla completa y funcionamiento sin conexión.

---

## 5. Arquitectura del código

```
public/
├─ manifest.webmanifest          PWA: nombre, iconos, modo de presentación
├─ sw.js                         service worker (instalación y uso sin conexión)
├─ icons/                        iconos 192 / 512 / 512-maskable
├─ logos/                        logos institucionales del suelo (opcionales)
└─ audio/                        música ambiental en bucle

src/
├─ main.js                       punto de entrada
├─ pwa.js                        registro del service worker y botón de instalación
├─ config.js                     TODAS las escalas y constantes de ajuste
├─ core/
│  ├─ App.js                     composición de subsistemas y bucle principal
│  └─ XRSessionManager.js        detección de capacidades y ciclo de la sesión XR
├─ data/
│  ├─ planetData.js              Sol y planetas: parámetros astronómicos reales
│  └─ moonData.js                27 satélites principales, con valores reales
├─ systems/
│  ├─ OrbitalMechanics.js        Kepler + conversión de escalas
│  ├─ CelestialBody.js           un cuerpo + su máquina de estados
│  ├─ SolarSystem.js             ensamblado de la escena
│  ├─ ProceduralTextures.js      generación de texturas en Canvas 2D
│  ├─ FloorLogos.js              logos apoyados en el suelo real
│  ├─ AudioEngine.js             AudioContext compartido por música y choques (v2.4.1)
│  ├─ AmbientAudio.js            música de fondo en bucle (Web Audio)
│  └─ ImpactAudio.js             sonido de los choques, sintetizado (v2.1)
├─ interaction/
│  ├─ HandTracking.js            lectura de las 25 articulaciones por mano
│  ├─ GestureDetector.js         gesto de palma derecha hacia arriba
│  └─ PlanetInteraction.js       máquina de estados manos <-> planetas
├─ physics/
│  └─ CollisionSystem.js         colliders y choques entre cuerpos (v2.0)
├─ ui/
│  ├─ CanvasPanel.js             base de los paneles espaciales
│  ├─ SpatialMenu.js             menú de control
│  ├─ InformationPanel.js        ficha educativa
│  ├─ SpatialUI.js               orquestación de los paneles y las pulsaciones
│  ├─ SizeComparison.js          comparación de tamaños a proporción real (v2.1)
│  ├─ SimDateLabel.js            fecha simulada sobre el Sol (v2.1)
│  ├─ PinchIndicator.js          anillo de pinza con el astro detectado (v2.4)
│  └─ Label.js                   etiquetas con los nombres
├─ sim/
│  └─ SimulationControls.js      reloj de simulación (play/pausa/velocidad)
└─ utils/
   └─ math.js                    suavizados independientes de la tasa de refresco
```

La separación clave: **la lógica orbital no sabe nada de manos** y **las manos no saben nada
de planetas**. `PlanetInteraction` es el único punto donde se cruzan y el único que provoca
transiciones de estado.

Orden de actualización en cada frame:

1. `HandTracking` lee las articulaciones de WebXR
2. `GestureDetector` deduce el gesto de palma arriba
3. `SpatialUI` actualiza menú y fichas, y marca qué manos están usando la interfaz
4. `PlanetInteraction` resuelve contactos, agarres y escalas
5. `SimulationControls` avanza el tiempo simulado
6. `SolarSystem` aplica órbitas, rotaciones y transiciones

Los pasos 1–4 usan **siempre** el delta time real: la velocidad de simulación no altera la
interacción ni la interfaz. Todos los suavizados usan `1 − exp(−dt/τ)`, así que el
comportamiento es idéntico a 60, 72, 90 o 120 Hz.

---

## 6. Limitaciones de WebXR y decisiones tomadas

Cada punto es una limitación **real** encontrada durante el desarrollo, no una suposición.

1. **WebXR no expone gestos de alto nivel.** No hay evento de pellizco ni de palma arriba: la
   API sólo da las poses de las articulaciones. Se derivan en `HandTracking` y
   `GestureDetector`, con histéresis para que no parpadeen.

2. **`hand-tracking` no puede pedirse como característica requerida.** Si el usuario tiene
   las manos desactivadas, fallaría la sesión entera. Va en `optionalFeatures` y después se
   comprueba `session.enabledFeatures`; si no está, se avisa por pantalla y se habilita una
   **alternativa con mandos** (posición del grip + gatillo emulando el pellizco), con la misma
   interfaz interna.

3. **El tracking se pierde cuando la mano sale del campo de las cámaras.** Si se pierde
   mientras sujetás un planeta, se emite un "soltar" sintético y el planeta vuelve a su
   órbita. Nunca queda pegado a una mano inexistente.

4. **No hay retorno háptico ni colisión real.** El contacto es geométrico: distancia de cada
   yema al centro del cuerpo contra su radio visual.

5. **El passthrough no es controlable desde WebXR.** No se puede regular su brillo ni componer
   con él más allá de la transparencia. Se comprueba `environmentBlendMode` y, si sale
   `opaque` (no hay passthrough), se avisa.

6. **HTTPS obligatorio.** Con `http://` desde una IP de la red local, `navigator.xr` ni
   siquiera existe. Por eso el servidor de desarrollo va con HTTPS y se comprueba
   `isSecureContext`.

7. **El sistema te rodea, así que un planeta puede quedar entre tu ojo y la interfaz.** Los
   paneles se dibujan con `depthTest: false` y `renderOrder` alto. Además se orientan con un
   billboard **completo** (giro + inclinación): el menú aparece a la altura de la mano, por
   debajo de los ojos, y con un billboard sólo horizontal se veía escorzado, "en diagonal".

8. **Un panel flotando junto a un planeta compite con la mano que va a tocarlo.** La ficha se
   sitúa **arriba** del cuerpo, por encima de su nombre, y el test de "mano ocupada con la interfaz" usa márgenes muy
   ajustados (2 cm). Este caso se detectó probando y se corrigió.

9. **Al ahuecar la mano derecha bajo un planeta, la palma mira hacia arriba** y el menú se
   abriría solo, encima de los dedos. El gesto se inhibe mientras esa mano sujeta un cuerpo, y
   tras abrirse el menú hay 0,45 s de bloqueo antes de aceptar pulsaciones.

10. **La ficha informativa no cabe en un tamaño fijo.** La de la Tierra incluye los datos de la
    Luna y la de Saturno lista siete satélites, mientras que la de Venus es corta. El panel se
    dibuja en **dos pasadas**: la primera mide dónde termina el texto y la segunda ajusta la
    altura real del lienzo y del plano 3D.

11. **Iluminación.** Con atenuación física real, Neptuno y Plutón quedarían casi negros. Se usa
    una `PointLight` sin decaimiento más un ambiente tenue y un 12 % de emisión con la propia
    textura: se conserva la noción de día/noche sin perder visibilidad.

---

## 7. Rendimiento

Medido en la propia escena, con menú y ficha abiertos:

- **23 llamadas de dibujo**, ~10.900 triángulos, 1.200 puntos (estrellas)
- Con **las 27 lunas activadas**: 91 llamadas y ~14.400 triángulos desde el punto de vista del
  usuario. Las lunas ocultas se saltan por completo en la actualización, en la interacción y
  en el render, así que activarlas es lo único que cuesta.
- Con los dos logos del suelo y el menú abierto: 42 llamadas y ~14.000 triángulos
- Con los colliders de la 2.0 activos (sin mostrarlos): 40 llamadas y ~14.000 triángulos; mostrarlos suma una línea por cuerpo
- 18 texturas, 9 programas de shader
- Esferas de 32×16 (48×24 para Sol, Tierra y Júpiter; 16×8 para las lunas)
- Sin post-procesado, sin sombras y sin motor de física: los choques son propios (§2.11)
- `renderer.xr.setFoveation(1.0)` activado
- Los paneles se redibujan sólo cuando cambia su contenido, nunca por frame

---

## 8. Datos astronómicos y fuentes

Los valores provienen de las **NASA Planetary Fact Sheets** (NASA/GSFC), de los elementos
orbitales keplerianos J2000 del **JPL** (*Keplerian Elements for Approximate Positions of the
Major Planets*, E. M. Standish) y del **JPL Solar System Dynamics** para los satélites.
Ninguno está inventado.

Unidades consistentes: km para diámetros y distancias, kg para masas, días y horas para
períodos, m/s² para gravedad, °C para temperaturas. Plutón aparece explícitamente marcado
como **planeta enano** y la ficha de la Tierra incluye los datos de la Luna.

Los recuentos de lunas son los **confirmados** en esas fuentes (Júpiter 95, Saturno 146, Urano
28, Neptuno 16); son cifras que la UAI actualiza con frecuencia.

---

## 9. Depuración

Para depurar dentro del visor:

1. Activá el **modo desarrollador** en la app Meta Horizon del móvil.
2. Conectá el Quest por USB al PC y aceptá la depuración.
3. En Chrome de escritorio: `chrome://inspect/#devices` → *inspect* sobre la pestaña.
4. La instancia de la aplicación está en `window.__solarApp` — por ejemplo
   `__solarApp.hands.states.right` muestra el estado de la mano derecha en vivo, y
   `__solarApp.system.byId.get('tierra').state` el estado de la Tierra.
