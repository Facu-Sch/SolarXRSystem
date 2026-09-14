# Registro de cambios

## 2.4.1

### Corrección: la música no sonaba en el casco

- La música pasa de un `<audio>` del DOM a **Web Audio**: se decodifica en memoria y suena en
  bucle por un nodo de ganancia. Un elemento multimedia depende de gestos sobre la página
  y el navegador lo puede pausar dentro de la sesión inmersiva, donde ya no hay gestos del
  DOM para reactivarlo. El `AudioContext` se activa una vez con el clic de entrada y sigue
  funcionando en la sesión.
- Música y choques comparten un único `AudioContext` a 24 kHz, la frecuencia del archivo:
  la música decodificada ocupa 66,7 MB en lugar del doble.
- Si el navegador suspende el contexto, se reintenta cada segundo y la música vuelve sola.
- Verificado en la PC: 24 kHz, 728,5 s mono decodificados, volumen 100 % → ganancia 1,
  25 % → 0,125, silencio → 0, recuperación tras suspender el contexto y choques por el
  mismo contexto. Dentro del Quest no se pudo verificar desde aquí.

## 2.4.0

### Corrección: fichas equivocadas o superpuestas

- **Causa real** de que los planetas mostraran la ficha del Sol «con varias más encima»,
  mientras las lunas funcionaban. La detección estaba bien: fallaba el dibujo. La ficha
  cambiaba la altura de su lienzo según el astro, y Three.js reserva la textura en la GPU
  con el tamaño de la primera subida y no la redimensiona. Si la primera ficha abierta era
  la del Sol (752 px), las más altas —Mercurio 791 px, Tierra y Saturno 865 px— no se
  actualizaban y seguía viéndose la del Sol con restos de otras. Las lunas tienen fichas
  más cortas (750 px) y sí entraban.
- Es el mismo fallo que antes se había atribuido a la selección («todos dicen Sol», luego
  «todos dicen Luna»): siempre se veía la primera ficha abierta.
- Medido comparando píxel a píxel lo que dibuja la GPU con el lienzo: antes, 16,8 % de
  píxeles distintos en la Tierra y 15,6 % en Mercurio; después, entre 3,5 % y 4,7 % en
  todas las fichas y en cualquier orden, que es lo que da el suavizado del texto.
- Solución: el lienzo tiene siempre la altura máxima y la altura de cada ficha se ajusta
  recortando la textura y el plano 3D.

### Anillo de pinza

- Anillo en el punto de pinza de cada mano, de cara al usuario, que se achica al cerrar
  los dedos. Colores: blanco sin contacto, amarillo con el nombre del astro que toca, cian
  con el astro agarrado y rojo «sin contacto» al pellizcar sin tocar nada.
- El rojo hace visible un pellizco que no toca nada: con el collider exacto, pellizcar un
  planeta con las yemas apenas por fuera de su superficie no lo agarra.
- Registro de los últimos 20 pellizcos con los astros candidatos y su puntaje, en
  `__solarApp.interaction.pinchLog`, para depurar desde la consola remota del Quest.

## 2.3.0

### Detección por el collider del astro

- **Un solo collider por astro, del tamaño exacto del astro**, sin radio mínimo ni
  holgura. Se quitó el collider de agarre ampliado (mínimo 2,5 cm más 8 mm): con la Luna a
  7,8 cm de la Tierra, las zonas ampliadas de cuerpos vecinos casi se tocaban.
- La mano tiene su propio collider: las yemas del pulgar y del índice, con el radio real
  de las articulaciones, y el punto medio de la pinza. La ficha se abre cuando, al cerrar
  la pinza, ese collider está en contacto con el del astro.
- Tocar para congelar la rotación también usa el collider exacto, sin los 18 mm de
  holgura anteriores.
- «Ver colliders» muestra ahora una sola esfera por astro, que coincide con el astro.

### Fichas

- La ficha aparece **arriba de su planeta**, sobre el nombre, así queda claro a qué astro
  corresponde. El botón «Lado» pasa a llamarse **Mover** y la lleva de arriba a la
  derecha, a la izquierda y otra vez arriba.

## 2.2.0

### Lanzamiento

- Se probó una vuelta en «mini órbita» (un bucle tipo bumerán alrededor de su lugar en la
  órbita) y **se descartó** tras probarla en el visor. El lanzamiento vuelve a funcionar
  como en la 2.1: sale con la velocidad de la mano, se frena solo y vuelve a su órbita.

### Música de fondo

- **Volumen desde el menú de la mano**: silencio, 25 %, 50 %, 75 % y 100 %. Reemplaza al
  botón «Sonido».
- **Corrección:** en el Quest, con la demo servida desde la PC, la música no se oía. Ahora
  el archivo se descarga con `fetch` y se reproduce desde un blob en memoria, sin rangos
  ni certificado de por medio. Si el navegador bloquea o pausa la música, se reintenta
  cada 1,5 s.
- El estado de la música («sonando», «esperando un toque», «error»…) se ve en el panel de
  inicio y en el título de su fila del menú.

## 2.1.0

### Lanzar planetas

- Soltar un cuerpo **con la mano en movimiento** (más de 0,55 m/s) lo lanza. Vuela con esa
  velocidad, se frena solo, choca con lo que encuentre y al detenerse vuelve a su órbita.
  Se puede atrapar en el aire con otra pinza.
- Al soltar se usa el **pico reciente** de velocidad de la mano, no la instantánea: al abrir
  los dedos la mano ya se está frenando.
- La velocidad se mide en el mundo. Medida respecto del planeta, una luna heredaría la
  velocidad orbital de este (3,8 m/s para la Tierra a 100×) y saldría disparada aunque se la
  soltara quieta.
- «Soltar planetas» y «Reiniciar» nunca lanzan, y devuelven también lo que esté volando.
- **Corrección:** si una mano perdía el tracking mientras sujetaba un cuerpo, este quedaba
  clavado en el aire hasta que la mano reapareciera, porque sólo se revisaban las manos
  activas. Ahora se suelta en ese momento y, si la mano iba rápido, sale lanzado. Importa
  porque en un lanzamiento enérgico el visor pierde la mano con frecuencia.

### Choques con velocidad

- Impulso a lo largo de la normal con restitución 0,55 y masa visual. La mano cuenta como
  masa infinita. Un cuerpo en reposo sale despedido si recibe más de 0,25 m/s; si no, se
  aparta como en la 2.0.
- **Barrido** del recorrido de los cuerpos en vuelo, para que a 2 m/s no atraviesen cuerpos
  pequeños entre dos frames.

### Sonido de los choques

- Sintetizado con Web Audio (sin archivos) y espacializado en el punto del contacto. El
  volumen depende de la velocidad del impacto y la afinación del tamaño de los cuerpos.
- Suena una vez por contacto nuevo. Se silencia desde el menú, independiente de la música.

### Fecha simulada

- Rótulo sobre el Sol con la fecha (J2000 + días simulados) y la velocidad, o «en pausa».

### Comparar tamaños

- Botón **Comparar tamaños** en el menú (tecla `C` en la PC). Con el modo activo, la pinza
  elige cuerpos en vez de abrir la ficha, y los dos últimos se muestran delante del usuario
  con su proporción real, con diámetros y cocientes de diámetro y volumen.

### Menú

- La fila **Física** pasa a llamarse **Física y comparación**, con cuatro botones:
  Colisiones, Ver colliders, Sonido choques y Comparar tamaños.

## 2.0.0

### Colliders y nuevo modelo de interacción

- **Colliders esféricos en todos los cuerpos**, con dos radios concéntricos: el visual,
  para los choques entre planetas, y uno de agarre algo mayor (mínimo 2,5 cm más 8 mm de
  holgura), para que los cuerpos pequeños se puedan pellizcar sin precisión milimétrica.
- **La ficha se abre sólo con colisión + pinza a la vez.** Tocar un planeta ya no abre
  nada: congela su rotación y nada más. Para abrir la ficha hay que cerrar la pinza con su
  punto (entre pulgar e índice) dentro del collider de agarre.
- **La pinza se evalúa una sola vez, en el frame en que se cierra.** Si se cierra en el
  vacío queda gastada: arrastrarla después hacia un planeta, o a través de uno, no agarra
  nada. La única tolerancia es espacial (el collider de agarre), nunca temporal.
  Se probó una ventana de gracia de 150 ms y se descartó: una pinza cerrada en el hueco
  entre la Tierra y la Luna que atravesaba la Luna a 0,58 m/s la capturaba a los 42 ms,
  que es justo el tipo de selección equivocada que la 2.0 venía a eliminar.
- **Realce graduado**: tocado (tenue), pinza en posición (medio: indica qué cuerpo se va a
  agarrar antes de pellizcar) y agarrado (pleno).
- El agarre "a mano llena" se mantiene, pero sólo mueve el cuerpo: la ficha es exclusiva
  del gesto de pinza.

### Choques entre planetas

- Los cuerpos **colisionan entre sí** y se empujan, sin romper la mecánica kepleriana: la
  órbita sigue siendo determinista y el choque sólo suma un desplazamiento transitorio que
  se relaja solo en ~0,3 s. Al soltar, todo vuelve a su órbita con error nulo.
- Un cuerpo agarrado tiene autoridad y empuja a los demás. Entre cuerpos libres se aparta
  más el de menor "masa" visual (radio al cubo).
- **Sólo chocan los cuerpos en interacción**: agarrados, volviendo a su órbita, o ya
  desplazados por otro choque (lo que permite las cadenas). Dos cuerpos que simplemente
  siguen su órbita se atraviesan. Motivo: por la compresión de escala la órbita de la Luna
  invade los carriles de Venus y Marte, y sin esta regla chocaban solos durante la
  simulación normal (medido: Luna-Venus con 24 mm de penetración). No tiene arreglo
  geométrico: para no tocar a Venus, la Luna tendría que orbitar dentro de la Tierra.
- Resolución de tipo Jacobi en 3 iteraciones por frame, independiente del orden y estable
  en choques en cadena.

### Menú

- Nueva fila **Física**: activar o desactivar las colisiones entre planetas, y mostrar los
  colliders (verde libre, amarillo pinza en posición, rojo choque, cian agarrado).

### Otros

- Sello de versión en el panel de estado: `versión 2.0.0 · fecha de compilación`.

## 1.x

- Sistema Solar kepleriano con elementos J2000 del JPL, 27 lunas, escalas independientes
  de tamaño y separación orbital, ficha lateral redimensionable con opción de fijar el
  cuerpo, menú por gesto de palma, logos institucionales en el suelo, música ambiental,
  PWA instalable en el visor y despliegue automático en GitHub Pages.
