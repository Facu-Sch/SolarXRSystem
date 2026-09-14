/**
 * ============================================================================
 *  CONFIGURACIÓN CENTRAL — ESCALAS Y AJUSTES DE LA DEMO
 * ============================================================================
 *
 *  ESCALAS (muy importante, ver README §Escalas)
 *  --------------------------------------------------------------------------
 *  El Sistema Solar real es imposible de representar literalmente: si el Sol
 *  midiera 25 cm, Neptuno estaría a ~1,6 km y la Tierra sería un grano de
 *  0,2 mm. Por eso se usan DOS escalas INDEPENDIENTES, ambas NO lineales
 *  (compresión por potencia), que preservan el ORDEN y las RELACIONES
 *  relativas pero comprimen el rango dinámico:
 *
 *    1) ESCALA DE DISTANCIAS   r_escena[m] = DISTANCE.K * (r_real[UA]) ^ DISTANCE.EXP
 *    2) ESCALA DE CUERPOS      R_escena[m] = BODY.K * (R_real / R_Tierra) ^ BODY.EXP
 *
 *  Con los valores por defecto:
 *    Mercurio ~0,31 m   Tierra ~0,44 m   Júpiter ~0,90 m
 *    Saturno  ~1,18 m   Urano  ~1,68 m   Neptuno ~2,02 m   Plutón ~2,00 m
 *    (radios) Tierra 2,3 cm · Júpiter 6,0 cm · Sol 15,0 cm · Mercurio 1,6 cm
 *
 *  => Todo el sistema cabe en una esfera de ~2 m alrededor del usuario:
 *     todos los cuerpos son visibles a la vez y todos están al alcance de la
 *     mano. Las escalas NO afectan a los parámetros astronómicos internos
 *     (masa, diámetro real, período orbital…), que se conservan intactos en
 *     `src/data/planetData.js` y se usan tal cual para la mecánica orbital y
 *     para las fichas informativas.
 *
 *  Las dos escalas son AJUSTABLES POR SEPARADO desde el menú (§5): "Tamaño de
 *  los cuerpos" y "Separación de las órbitas". Agrandar los cuerpos sube
 *  automáticamente la separación mínima de las órbitas para que los planetas
 *  no se solapen entre sí.
 *
 *  ESCALA DE TIEMPO
 *  --------------------------------------------------------------------------
 *  A velocidad 1x transcurren TIME.BASE_DAYS_PER_SECOND días simulados por
 *  segundo real. Con 5 días/s: la Tierra completa una órbita en ~73 s y una
 *  rotación en ~4,8 s (movimiento claramente perceptible sin acelerar).
 * ============================================================================
 */

export const CONFIG = {
  /** Escala de DISTANCIAS orbitales: metros de escena por UA comprimida. */
  DISTANCE: {
    K: 0.437,   // radio de escena (m) a 1 UA
    EXP: 0.45   // exponente de compresión (1 = lineal, <1 = comprime el rango)
  },

  /** Escala VISUAL de los cuerpos (radios). */
  BODY: {
    K: 0.023,          // radio de escena (m) para 1 radio terrestre
    EXP: 0.40,         // exponente de compresión
    MIN_RADIUS: 0.013, // radio mínimo (m) para que todo sea agarrable con la mano

    /**
     * Factor EXTRA aplicado sólo al Sol, además de la ley de potencia general.
     *
     * Con 1.0 el Sol sigue exactamente el mismo criterio que los planetas y
     * queda en 30 cm de diámetro: es la opción coherente, y la que está
     * activa. Deja 9 cm de holgura con Mercurio en su perihelio, así que no
     * invade ninguna órbita.
     *
     * Bajarlo (0,55 daba 17 cm) lo encoge para que no domine tanto el centro
     * de la escena, a costa de romper la relación con el resto de cuerpos.
     *
     * Ojo: NINGÚN cuerpo está a escala lineal — el Sol real mide 109 radios
     * terrestres, así que a proporción verdadera tendría 5 m de diámetro con
     * la Tierra en 4,6 cm. Ver la nota de compresión más arriba.
     */
    SUN_FACTOR: 1.0
  },

  /**
   * NOTA SOBRE LA RELACIÓN DISTANCE.K / BODY.K
   * ---------------------------------------------------------------------
   * El par crítico es Venus-Tierra: son casi del mismo tamaño y sus órbitas
   * están muy juntas. Para que no se solapen a escala 1x hace falta
   *
   *     DISTANCE.K / BODY.K  >=  1,98 / 0,132  =  15,0
   *
   * (numerador = suma de radios relativos, denominador = separación relativa
   * de las dos órbitas tras la compresión). Con 0,437 / 0,023 = 19,0 queda un
   * 27 % de holgura y ningún par de planetas se toca nunca a escala 1x.
   */

  /**
   * SATÉLITES: el radio de la órbita de una luna se define en función del
   * RADIO VISUAL DE SU PLANETA, no de la escala general de distancias:
   *
   *     r_luna = R_planeta_escena * (BASE + K * (a_km / R_planeta_km)^EXP)
   *
   * Así una luna nunca queda dentro de su planeta, por grande que se ponga
   * éste, y el orden y la separación relativa de las lunas se conservan.
   * A escala real la Luna estaría a 0,1 mm de la Tierra en esta maqueta.
   */
  SATELLITE: {
    BASE: 1.55,   // separación mínima, en radios del planeta
    K: 0.36,
    EXP: 0.40,
    MIN_RADIUS: 0.006   // radio visual mínimo de una luna (m)
  },

  /** Posición por defecto del centro del sistema (se recoloca al entrar en XR). */
  SYSTEM_ORIGIN: [0, 1.15, -0.30],

  TIME: {
    BASE_DAYS_PER_SECOND: 5,                   // días simulados por segundo real a 1x
    SPEEDS: [0.1, 0.5, 1, 5, 10, 100],
    DEFAULT_SPEED_INDEX: 2                     // -> 1x
  },

  /** Escala visual de los CUERPOS (radios). Independiente de la de órbitas. */
  VISUAL_SCALE_STEPS: [0.5, 1, 1.5, 2.5],
  DEFAULT_VISUAL_SCALE_INDEX: 1,

  /**
   * Escala de las ÓRBITAS (distancias al Sol), independiente de la anterior
   * tal y como pide el requisito §5. Sirve para separar los planetas cuando
   * se agranda su tamaño visual y empiezan a solaparse entre ellos.
   */
  ORBIT_SCALE_STEPS: [1, 1.5, 2, 2.5],
  DEFAULT_ORBIT_SCALE_INDEX: 0,

  INTERACTION: {
    // Sin holgura (v2.3): la mano toca el astro cuando su collider, del tamaño
    // exacto del astro, se superpone con las yemas o la palma.
    TOUCH_MARGIN: 0,
    PINCH_ON: 0.028,          // distancia pulgar-índice (m) para iniciar pinza
    PINCH_OFF: 0.048,         // histéresis de salida de pinza
    GRAB_TAU: 0.045,          // constante de tiempo del suavizado al seguir la mano (s)
    RETURN_TAU: 0.22,         // constante de tiempo del retorno a la órbita (s)
    RETURN_MIN_SPEED: 0.12,   // m/s mínimos durante el retorno (para que sea perceptible)
    RETURN_MAX_TIME: 3.0,     // s máximos antes de forzar el final del retorno
    RETURN_SNAP: 0.006,       // distancia (m) a la que se considera terminado el retorno
    ROTATION_BLEND_TAU: 0.25, // suavizado del arranque/parada de la rotación (s)
    GRAB_SCALE_MIN: 0.35,     // límites de la escala manual (multiplicador sobre la base)
    GRAB_SCALE_MAX: 4.0,
    // Agarre "a mano llena" (envolver el planeta) como alternativa al pellizco
    FULL_GRAB_FINGERS: 3,           // yemas que deben quedar dentro del cuerpo
    FULL_GRAB_MAX_OPENNESS: 0.80    // la mano debe estar cerrándose, no abierta
  },

  /**
   * COLLIDERS. Ver src/physics/CollisionSystem.js.
   *
   * Cada astro tiene UN collider esférico del tamaño exacto del astro (v2.3):
   * sin radio mínimo ni holgura. La ficha se abre cuando, en el instante de
   * pellizcar, la mano (yemas del pulgar e índice y el punto entre ambas) está
   * en contacto con ese collider.
   */
  COLLIDERS: {
    OFFSET_TAU: 0.30,       // s que tarda en relajarse el desplazamiento de un choque
    MAX_OFFSET: 0.60,       // m máximos que un choque puede apartar un cuerpo
    ITERATIONS: 3           // pasadas de resolución por frame (choques en cadena)
  },

  /**
   * LANZAR CUERPOS (v2.1). Al soltar un cuerpo con la mano en movimiento sale
   * despedido con esa velocidad, se frena solo, choca con lo que encuentre y
   * al detenerse vuelve a su órbita.
   */
  THROW: {
    MIN_SPEED: 0.55,        // m/s de la mano al soltar para que cuente como lanzamiento
    MAX_SPEED: 2.0,         // m/s máximos (evita que atraviese cuerpos pequeños entre frames)
    VELOCITY_TAU: 0.035,    // suavizado de la velocidad medida de la mano (s)
    PEAK_TAU: 0.10,         // cuánto "recuerda" el pico de velocidad al abrir la pinza (s)
    DRAG_TAU: 0.75,         // frenado: a los 0,75 s conserva el 37 % de la velocidad
    STOP_SPEED: 0.07,       // por debajo de esto deja de volar y vuelve a su órbita
    MAX_TIME: 3.0,          // s máximos de vuelo
    MAX_DISTANCE: 2.5,      // m máximos que se aleja de su órbita

    RESTITUTION: 0.55,      // 0 = choque plástico, 1 = rebote perfecto
    KICK_MIN_SPEED: 0.25,   // m/s que debe recibir un cuerpo quieto para salir despedido
    IMPACT_MIN_SPEED: 0.04  // velocidad de aproximación mínima para intercambiar impulso
  },

  /**
   * Música de fondo: niveles del menú. El volumen real del elemento de audio
   * es nivel^1,5 (el oído percibe el volumen de forma logarítmica): 50 %
   * equivale a 0,35, el valor fijo que tenía antes de la v2.2.
   */
  MUSIC: {
    STEPS: [0, 0.25, 0.5, 0.75, 1],
    DEFAULT_INDEX: 2
  },

  /** Sonido de los choques, sintetizado con Web Audio (sin archivos). */
  IMPACT_AUDIO: {
    VOLUME: 0.9,
    MAX_VOICES: 8,          // choques sonando a la vez
    PAIR_REARM: 0.15        // s que un par debe estar separado para volver a sonar
  },

  /** Modo comparación de tamaños a proporción real (v2.1). */
  COMPARE: {
    BIG_RADIUS: 0.10,       // radio (m) con que se dibuja el mayor de los dos
    MIN_RADIUS: 0.0008,     // radio mínimo dibujado, aunque el real sea menor
    DISTANCE: 0.60,         // m por delante del usuario
    HEIGHT: -0.04,          // m respecto de los ojos
    GAP: 0.05               // separación entre las dos esferas (m)
  },

  /** Ficha informativa: anchos disponibles (m) y lado por defecto. */
  INFO_PANEL: {
    WIDTHS: [0.26, 0.34, 0.44, 0.56],
    DEFAULT_WIDTH_INDEX: 1,
    SIDE_GAP: 0.05,        // separación (m) entre el borde del cuerpo y la ficha (a un lado)
    ABOVE_GAP: 0.02        // separación (m) sobre el nombre del cuerpo (ficha arriba)
  },

  MENU: {
    PALM_UP_DOT: 0.70,   // producto escalar mínimo entre normal de la palma y "arriba"
    OPENNESS_MIN: 0.55,  // la mano debe estar razonablemente abierta
    HOLD_TIME: 0.30,     // s manteniendo el gesto para abrir
    AUTO_HIDE: 8.0,      // s sin gesto ni interacción antes de cerrarse solo
    OFFSET: [0.0, 0.19, 0.0],   // el menú creció una fila (v2.2): sube para no tapar la mano
    FORWARD_OFFSET: 0.10   // m que el menú se separa del usuario al abrirse
  },

  RENDER: {
    STAR_COUNT: 1200,
    STAR_RADIUS: 9,
    SPHERE_SEGMENTS: 32,
    SPHERE_SEGMENTS_LOW: 16,
    SPHERE_SEGMENTS_HI: 48,
    FOVEATION: 1.0
  }
};

export const BODY_STATE = {
  NORMAL: 'NORMAL',
  TOUCHED: 'TOUCHED',
  GRABBED: 'GRABBED',
  THROWN: 'THROWN',        // lanzado: vuela con inercia antes de volver (v2.1)
  RETURNING: 'RETURNING'
};
