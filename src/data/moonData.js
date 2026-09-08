/**
 * ============================================================================
 *  SATÉLITES NATURALES
 * ============================================================================
 *  Lunas principales de cada planeta, con valores reales (NASA/JPL Solar
 *  System Dynamics). No se incluyen las 300 y pico lunas conocidas: la
 *  inmensa mayoría son irregulares de pocos kilómetros, invisibles a esta
 *  escala y sin valor educativo. Están todas las de interés: las 2 de Marte,
 *  las 4 galileanas, las 7 grandes de Saturno, las 5 de Urano, las 3 de
 *  Neptuno y las 5 de Plutón, además de la Luna.
 *
 *  distanceKm  semieje mayor de la órbita alrededor de SU PLANETA
 *  periodDays  período orbital sidéreo (negativo = retrógrado)
 *  inclination inclinación respecto del ecuador del planeta (grados)
 *
 *  Casi todas están en rotación síncrona (siempre muestran la misma cara al
 *  planeta), por eso rotationHours = periodDays * 24 salvo donde se indica.
 * ============================================================================
 */

const sync = (periodDays) => Math.abs(periodDays) * 24;

export const MOONS = [
  // --- Tierra --------------------------------------------------------------
  {
    id: 'luna', name: 'Luna', parentId: 'tierra', primary: true,
    type: 'Satélite natural de la Tierra',
    radiusKm: 1737.4, massKg: 7.342e22, gravity: 1.62,
    distanceKm: 384400, periodDays: 27.322, inclination: 5.145,
    rotationHours: 655.73,
    temperature: 'De -173 °C (noche) a 127 °C (día)',
    composition: 'Roca silicatada, sin atmósfera apreciable. Mares de basalto oscuro y tierras altas claras cubiertas de cráteres.',
    moons: '—',
    facts: 'Siempre muestra la misma cara a la Tierra (rotación síncrona) y estabiliza el eje terrestre.',
    texture: 'moon'
  },

  // --- Marte ---------------------------------------------------------------
  {
    id: 'fobos', name: 'Fobos', parentId: 'marte',
    type: 'Satélite natural de Marte',
    radiusKm: 11.267, massKg: 1.0659e16, gravity: 0.0057,
    distanceKm: 9376, periodDays: 0.31891, inclination: 1.093,
    rotationHours: sync(0.31891),
    temperature: 'Aprox. -40 °C',
    composition: 'Cuerpo irregular de roca carbonácea muy porosa, dominado por el cráter Stickney.',
    moons: '—',
    facts: 'Orbita más rápido de lo que Marte rota: sale por el oeste. Se acerca al planeta y acabará fragmentándose.',
    texture: 'rockmoon'
  },
  {
    id: 'deimos', name: 'Deimos', parentId: 'marte',
    type: 'Satélite natural de Marte',
    radiusKm: 6.2, massKg: 1.4762e15, gravity: 0.003,
    distanceKm: 23463, periodDays: 1.26244, inclination: 0.93,
    rotationHours: sync(1.26244),
    temperature: 'Aprox. -40 °C',
    composition: 'Cuerpo irregular de roca carbonácea, con una superficie más lisa que la de Fobos por su regolito.',
    moons: '—',
    facts: 'Es la luna más pequeña del Sistema Solar entre las de los planetas.',
    texture: 'rockmoon'
  },

  // --- Júpiter (galileanas) ------------------------------------------------
  {
    id: 'io', name: 'Ío', parentId: 'jupiter',
    type: 'Satélite galileano de Júpiter',
    radiusKm: 1821.6, massKg: 8.932e22, gravity: 1.796,
    distanceKm: 421700, periodDays: 1.769, inclination: 0.05,
    rotationHours: sync(1.769),
    temperature: 'Aprox. -143 °C (hasta 1.600 °C en los volcanes)',
    composition: 'Roca silicatada y azufre. Sin apenas cráteres: su superficie se renueva constantemente.',
    moons: '—',
    facts: 'El cuerpo más volcánicamente activo del Sistema Solar, calentado por las mareas de Júpiter.',
    texture: 'iomoon'
  },
  {
    id: 'europa', name: 'Europa', parentId: 'jupiter',
    type: 'Satélite galileano de Júpiter',
    radiusKm: 1560.8, massKg: 4.800e22, gravity: 1.314,
    distanceKm: 671034, periodDays: 3.551, inclination: 0.47,
    rotationHours: sync(3.551),
    temperature: 'Aprox. -160 °C',
    composition: 'Corteza de hielo de agua surcada de grietas, sobre un océano salado global de unos 100 km de profundidad.',
    moons: '—',
    facts: 'Es uno de los lugares más prometedores del Sistema Solar para buscar vida.',
    texture: 'icymoon'
  },
  {
    id: 'ganimedes', name: 'Ganímedes', parentId: 'jupiter',
    type: 'Satélite galileano de Júpiter',
    radiusKm: 2634.1, massKg: 1.4819e23, gravity: 1.428,
    distanceKm: 1070412, periodDays: 7.155, inclination: 0.20,
    rotationHours: sync(7.155),
    temperature: 'Aprox. -163 °C',
    composition: 'Hielo y roca, con un océano interno. Terreno oscuro antiguo y terreno claro surcado por acanaladuras.',
    moons: '—',
    facts: 'La luna más grande del Sistema Solar: supera en tamaño a Mercurio y es la única con campo magnético propio.',
    texture: 'moon'
  },
  {
    id: 'calisto', name: 'Calisto', parentId: 'jupiter',
    type: 'Satélite galileano de Júpiter',
    radiusKm: 2410.3, massKg: 1.0759e23, gravity: 1.235,
    distanceKm: 1882709, periodDays: 16.689, inclination: 0.19,
    rotationHours: sync(16.689),
    temperature: 'Aprox. -139 °C',
    composition: 'Mezcla casi homogénea de hielo y roca; la superficie más craterizada del Sistema Solar.',
    moons: '—',
    facts: 'Está fuera del cinturón de radiación de Júpiter, lo que la convierte en la galileana más apta para una base.',
    texture: 'rockmoon'
  },

  // --- Saturno -------------------------------------------------------------
  {
    id: 'mimas', name: 'Mimas', parentId: 'saturno',
    type: 'Satélite natural de Saturno',
    radiusKm: 198.2, massKg: 3.749e19, gravity: 0.064,
    distanceKm: 185539, periodDays: 0.942, inclination: 1.57,
    rotationHours: sync(0.942),
    temperature: 'Aprox. -200 °C',
    composition: 'Casi enteramente hielo de agua. Domina su aspecto el enorme cráter Herschel, de 130 km.',
    moons: '—',
    facts: 'Ese cráter gigante le da un parecido notable con la Estrella de la Muerte.',
    texture: 'icymoon'
  },
  {
    id: 'encelado', name: 'Encélado', parentId: 'saturno',
    type: 'Satélite natural de Saturno',
    radiusKm: 252.1, massKg: 1.080e20, gravity: 0.113,
    distanceKm: 237948, periodDays: 1.370, inclination: 0.009,
    rotationHours: sync(1.370),
    temperature: 'Aprox. -198 °C',
    composition: 'Hielo de agua purísimo sobre un océano salado global; géiseres activos en el polo sur.',
    moons: '—',
    facts: 'Sus géiseres alimentan el anillo E de Saturno y contienen moléculas orgánicas.',
    texture: 'icymoon'
  },
  {
    id: 'tetis', name: 'Tetis', parentId: 'saturno',
    type: 'Satélite natural de Saturno',
    radiusKm: 531.1, massKg: 6.174e20, gravity: 0.146,
    distanceKm: 294619, periodDays: 1.888, inclination: 1.12,
    rotationHours: sync(1.888),
    temperature: 'Aprox. -187 °C',
    composition: 'Hielo de agua casi puro. La recorre Ithaca Chasma, un cañón de 2.000 km.',
    moons: '—',
    facts: 'Su densidad es tan baja (0,98 g/cm³) que flotaría en el agua.',
    texture: 'icymoon'
  },
  {
    id: 'dione', name: 'Dione', parentId: 'saturno',
    type: 'Satélite natural de Saturno',
    radiusKm: 561.4, massKg: 1.0954e21, gravity: 0.232,
    distanceKm: 377396, periodDays: 2.737, inclination: 0.019,
    rotationHours: sync(2.737),
    temperature: 'Aprox. -186 °C',
    composition: 'Hielo de agua con un núcleo rocoso; acantilados de hielo brillantes en el hemisferio posterior.',
    moons: '—',
    facts: 'Podría albergar un océano interno, como Encélado.',
    texture: 'icymoon'
  },
  {
    id: 'rea', name: 'Rea', parentId: 'saturno',
    type: 'Satélite natural de Saturno',
    radiusKm: 763.8, massKg: 2.306e21, gravity: 0.264,
    distanceKm: 527108, periodDays: 4.518, inclination: 0.345,
    rotationHours: sync(4.518),
    temperature: 'Aprox. -174 °C',
    composition: 'Tres cuartas partes de hielo y una de roca; superficie intensamente craterizada.',
    moons: '—',
    facts: 'Es la segunda luna más grande de Saturno y tiene una tenue atmósfera de oxígeno y CO₂.',
    texture: 'icymoon'
  },
  {
    id: 'titan', name: 'Titán', parentId: 'saturno',
    type: 'Satélite natural de Saturno',
    radiusKm: 2574.7, massKg: 1.3452e23, gravity: 1.352,
    distanceKm: 1221870, periodDays: 15.945, inclination: 0.35,
    rotationHours: sync(15.945),
    temperature: 'Aprox. -179 °C',
    composition: 'Atmósfera densa de nitrógeno con metano; lagos y ríos de metano y etano líquidos sobre hielo de agua.',
    moons: '—',
    facts: 'El único satélite con una atmósfera densa y el único mundo, además de la Tierra, con líquido estable en superficie.',
    texture: 'titanmoon'
  },
  {
    id: 'japeto', name: 'Jápeto', parentId: 'saturno',
    type: 'Satélite natural de Saturno',
    radiusKm: 734.5, massKg: 1.805e21, gravity: 0.223,
    distanceKm: 3560820, periodDays: 79.322, inclination: 15.47,
    rotationHours: sync(79.322),
    temperature: 'Aprox. -143 °C',
    composition: 'Hielo y roca. Un hemisferio es casi tan oscuro como el carbón y el otro tan brillante como la nieve.',
    moons: '—',
    facts: 'Tiene una cordillera ecuatorial de 13 km de altura que le da forma de nuez.',
    texture: 'rockmoon'
  },

  // --- Urano ---------------------------------------------------------------
  {
    id: 'miranda', name: 'Miranda', parentId: 'urano',
    type: 'Satélite natural de Urano',
    radiusKm: 235.8, massKg: 6.59e19, gravity: 0.079,
    distanceKm: 129900, periodDays: 1.413, inclination: 4.23,
    rotationHours: sync(1.413),
    temperature: 'Aprox. -187 °C',
    composition: 'Hielo de agua y silicatos, con un relieve caótico de terrazas y fallas.',
    moons: '—',
    facts: 'Verona Rupes, su acantilado de hasta 20 km, es el más alto conocido del Sistema Solar.',
    texture: 'icymoon'
  },
  {
    id: 'ariel', name: 'Ariel', parentId: 'urano',
    type: 'Satélite natural de Urano',
    radiusKm: 578.9, massKg: 1.353e21, gravity: 0.269,
    distanceKm: 190900, periodDays: 2.520, inclination: 0.26,
    rotationHours: sync(2.520),
    temperature: 'Aprox. -213 °C',
    composition: 'Hielo de agua y roca; la superficie más joven y brillante del sistema de Urano.',
    moons: '—',
    facts: 'Sus valles sugieren actividad geológica reciente en términos planetarios.',
    texture: 'icymoon'
  },
  {
    id: 'umbriel', name: 'Umbriel', parentId: 'urano',
    type: 'Satélite natural de Urano',
    radiusKm: 584.7, massKg: 1.172e21, gravity: 0.20,
    distanceKm: 266000, periodDays: 4.144, inclination: 0.13,
    rotationHours: sync(4.144),
    temperature: 'Aprox. -198 °C',
    composition: 'Hielo y roca con una superficie antigua y muy oscura.',
    moons: '—',
    facts: 'Destaca en ella el "Anillo Fluorescente", un aro brillante de 140 km en el fondo de un cráter.',
    texture: 'rockmoon'
  },
  {
    id: 'titania', name: 'Titania', parentId: 'urano',
    type: 'Satélite natural de Urano',
    radiusKm: 788.4, massKg: 3.527e21, gravity: 0.379,
    distanceKm: 436300, periodDays: 8.706, inclination: 0.34,
    rotationHours: sync(8.706),
    temperature: 'Aprox. -203 °C',
    composition: 'Partes iguales de hielo y roca, con enormes cañones de fallas.',
    moons: '—',
    facts: 'Es la mayor luna de Urano y la octava del Sistema Solar.',
    texture: 'icymoon'
  },
  {
    id: 'oberon', name: 'Oberón', parentId: 'urano',
    type: 'Satélite natural de Urano',
    radiusKm: 761.4, massKg: 3.014e21, gravity: 0.347,
    distanceKm: 583500, periodDays: 13.463, inclination: 0.058,
    rotationHours: sync(13.463),
    temperature: 'Aprox. -203 °C',
    composition: 'Hielo y roca; superficie antigua saturada de cráteres con fondos oscuros.',
    moons: '—',
    facts: 'Es la luna más exterior de las grandes de Urano y la segunda en tamaño.',
    texture: 'rockmoon'
  },

  // --- Neptuno -------------------------------------------------------------
  {
    id: 'proteo', name: 'Proteo', parentId: 'neptuno',
    type: 'Satélite natural de Neptuno',
    radiusKm: 210, massKg: 4.4e19, gravity: 0.07,
    distanceKm: 117647, periodDays: 1.122, inclination: 0.52,
    rotationHours: sync(1.122),
    temperature: 'Aprox. -220 °C',
    composition: 'Cuerpo irregular y muy oscuro de hielo y roca, casi en el límite de tamaño para ser esférico.',
    moons: '—',
    facts: 'Es tan oscuro que no se descubrió hasta el paso de la Voyager 2 en 1989.',
    texture: 'rockmoon'
  },
  {
    id: 'triton', name: 'Tritón', parentId: 'neptuno',
    type: 'Satélite natural de Neptuno',
    radiusKm: 1353.4, massKg: 2.139e22, gravity: 0.779,
    distanceKm: 354759, periodDays: -5.877, inclination: 156.87,
    rotationHours: sync(5.877),
    temperature: 'Aprox. -235 °C',
    composition: 'Hielos de nitrógeno, metano y CO₂ sobre un manto de agua helada; géiseres de nitrógeno activos.',
    moons: '—',
    facts: 'Orbita en sentido RETRÓGRADO: es un objeto del cinturón de Kuiper capturado por Neptuno. Su superficie es de las más frías medidas.',
    texture: 'icymoon'
  },
  {
    id: 'nereida', name: 'Nereida', parentId: 'neptuno',
    type: 'Satélite natural de Neptuno',
    radiusKm: 170, massKg: 3.1e19, gravity: 0.071,
    distanceKm: 5513400, periodDays: 360.13, inclination: 7.23,
    rotationHours: 11.52,
    temperature: 'Aprox. -223 °C',
    composition: 'Hielo y roca; forma irregular y rotación no sincronizada.',
    moons: '—',
    facts: 'Tiene la órbita más excéntrica conocida de un satélite (e = 0,75): va de 1,4 a 9,6 millones de km.',
    texture: 'rockmoon'
  },

  // --- Plutón --------------------------------------------------------------
  {
    id: 'caronte', name: 'Caronte', parentId: 'pluton',
    type: 'Satélite natural de Plutón',
    radiusKm: 606, massKg: 1.586e21, gravity: 0.288,
    distanceKm: 19591, periodDays: 6.387, inclination: 0.08,
    rotationHours: sync(6.387),
    temperature: 'Aprox. -220 °C',
    composition: 'Hielo de agua y amoníaco sobre un núcleo rocoso; casquete polar rojizo de tolinas.',
    moons: '—',
    facts: 'Es tan grande respecto de Plutón (la mitad de su diámetro) que ambos giran en torno a un centro de masas situado FUERA de Plutón: forman un sistema binario.',
    texture: 'icymoon'
  },
  {
    id: 'estigia', name: 'Estigia', parentId: 'pluton',
    type: 'Satélite natural de Plutón',
    radiusKm: 6, massKg: 7.5e15, gravity: 0.001,
    distanceKm: 42656, periodDays: 20.16, inclination: 0.81,
    rotationHours: 8.0,
    temperature: 'Aprox. -230 °C',
    composition: 'Fragmento irregular de hielo de agua.',
    moons: '—',
    facts: 'La más pequeña y la última descubierta de las lunas de Plutón (2012).',
    texture: 'rockmoon'
  },
  {
    id: 'nix', name: 'Nix', parentId: 'pluton',
    type: 'Satélite natural de Plutón',
    radiusKm: 23, massKg: 4.5e16, gravity: 0.003,
    distanceKm: 48694, periodDays: 24.85, inclination: 0.13,
    rotationHours: 43.9,
    temperature: 'Aprox. -230 °C',
    composition: 'Hielo de agua, con una zona rojiza posiblemente producida por un impacto.',
    moons: '—',
    facts: 'Rota de forma caótica: su eje bascula de manera impredecible.',
    texture: 'icymoon'
  },
  {
    id: 'cerbero', name: 'Cerbero', parentId: 'pluton',
    type: 'Satélite natural de Plutón',
    radiusKm: 9, massKg: 1.65e16, gravity: 0.002,
    distanceKm: 57783, periodDays: 32.17, inclination: 0.39,
    rotationHours: 133.0,
    temperature: 'Aprox. -230 °C',
    composition: 'Hielo de agua muy reflectante; forma de doble lóbulo, como dos cuerpos fusionados.',
    moons: '—',
    facts: 'Es mucho más brillante de lo que se esperaba antes del sobrevuelo de New Horizons.',
    texture: 'icymoon'
  },
  {
    id: 'hidra', name: 'Hidra', parentId: 'pluton',
    type: 'Satélite natural de Plutón',
    radiusKm: 26.5, massKg: 4.8e16, gravity: 0.003,
    distanceKm: 64738, periodDays: 38.20, inclination: 0.24,
    rotationHours: 10.3,
    temperature: 'Aprox. -230 °C',
    composition: 'Hielo de agua prácticamente puro, de ahí su alta reflectividad.',
    moons: '—',
    facts: 'Es la luna más exterior de Plutón y también rota caóticamente.',
    texture: 'icymoon'
  }
];

/** Sólo la Luna: configuración por defecto (requisito original). */
export const PRIMARY_MOONS = MOONS.filter((m) => m.primary);

/** Índice parentId -> lunas. */
export function moonsOf(parentId, all = true) {
  const src = all ? MOONS : PRIMARY_MOONS;
  return src.filter((m) => m.parentId === parentId);
}
