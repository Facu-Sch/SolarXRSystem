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
 *    (radios) Tierra 2,3 cm · Júpiter 6,0 cm · Sol 8,3 cm · Mercurio 1,6 cm
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
    SUN_FACTOR: 0.55   // factor extra para el Sol (si no, ocuparía todo el centro)
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
    TOUCH_MARGIN: 0.018,      // holgura (m) añadida al radio del cuerpo para el contacto
    PINCH_ON: 0.028,          // distancia pulgar-índice (m) para iniciar pinza
    PINCH_OFF: 0.048,         // histéresis de salida de pinza
    SELECT_DWELL: 0.20,       // s de contacto continuo para seleccionar (evita falsos toques)
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

  /** Ficha informativa: anchos disponibles (m) y lado por defecto. */
  INFO_PANEL: {
    WIDTHS: [0.26, 0.34, 0.44, 0.56],
    DEFAULT_WIDTH_INDEX: 1,
    SIDE_GAP: 0.05         // separación (m) entre el borde del cuerpo y la ficha
  },

  MENU: {
    PALM_UP_DOT: 0.70,   // producto escalar mínimo entre normal de la palma y "arriba"
    OPENNESS_MIN: 0.55,  // la mano debe estar razonablemente abierta
    HOLD_TIME: 0.30,     // s manteniendo el gesto para abrir
    AUTO_HIDE: 8.0,      // s sin gesto ni interacción antes de cerrarse solo
    OFFSET: [0.0, 0.16, 0.0]
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
  RETURNING: 'RETURNING'
};
