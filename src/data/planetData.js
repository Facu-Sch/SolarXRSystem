/**
 * ============================================================================
 *  PARÁMETROS ASTRONÓMICOS CENTRALIZADOS
 * ============================================================================
 *  Todos los valores son REALES y no se ven afectados por las escalas visuales
 *  de la demo. Fuentes: NASA Planetary Fact Sheets (NASA/GSFC) y elementos
 *  orbitales keplerianos J2000 del JPL ("Keplerian Elements for Approximate
 *  Positions of the Major Planets", E.M. Standish).
 *
 *  Elementos orbitales (época J2000, marco eclíptico medio):
 *    a       semieje mayor (UA)
 *    e       excentricidad
 *    i       inclinación sobre la eclíptica (grados)
 *    L       longitud media en J2000 (grados)
 *    varpi   longitud del perihelio (grados) [ = Omega + argumento del perihelio ]
 *    Omega   longitud del nodo ascendente (grados)
 *
 *  periodDays     período orbital sidéreo (días)
 *  rotationHours  período de rotación sidéreo (horas; negativo = retrógrado)
 *  axialTilt      oblicuidad del eje (grados)
 * ============================================================================
 */

import { MOONS } from './moonData.js';

export const SUN = {
  id: 'sol',
  name: 'Sol',
  type: 'Estrella (enana amarilla, tipo G2V)',
  radiusKm: 695700,
  massKg: 1.989e30,
  rotationHours: 609.12, // ~25,38 días (ecuador)
  axialTilt: 7.25,
  gravity: 274, // m/s^2 en la superficie
  temperature: 'Superficie (fotosfera) 5.500 °C; núcleo ~15.000.000 °C',
  composition: 'Plasma de hidrógeno (~73 %) y helio (~25 %). Genera energía por fusión nuclear de hidrógeno en helio.',
  moons: '—',
  distanceText: 'Centro del Sistema Solar',
  facts: 'Concentra el 99,86 % de la masa de todo el Sistema Solar.',
  color: 0xffd27f,
  texture: 'sun'
};

/** Cuerpos que orbitan el Sol, ordenados por distancia media. */
export const PLANETS = [
  {
    id: 'mercurio', name: 'Mercurio', type: 'Planeta rocoso (terrestre)',
    orbit: { a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.25032350, varpi: 77.45779628, Omega: 48.33076593 },
    periodDays: 87.969, rotationHours: 1407.6, axialTilt: 0.034,
    radiusKm: 2439.7, massKg: 3.3011e23, gravity: 3.70,
    distanceKm: 57.9e6,
    temperature: 'De -173 °C (noche) a 427 °C (día)',
    composition: 'Núcleo metálico enorme (~85 % del radio) y corteza silicatada cubierta de cráteres. Prácticamente sin atmósfera.',
    moons: '0',
    facts: 'Su día solar dura 176 días terrestres: rota 3 veces cada 2 órbitas (resonancia 3:2).',
    color: 0x9c8a7d, texture: 'mercury'
  },
  {
    id: 'venus', name: 'Venus', type: 'Planeta rocoso (terrestre)',
    orbit: { a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.97909950, varpi: 131.60246718, Omega: 76.67984255 },
    periodDays: 224.701, rotationHours: -5832.5, axialTilt: 177.36,
    radiusKm: 6051.8, massKg: 4.8675e24, gravity: 8.87,
    distanceKm: 108.2e6,
    temperature: '464 °C, casi constante de día y de noche',
    composition: 'Atmósfera densísima de CO₂ (96 %) con nubes de ácido sulfúrico; presión 92 veces la terrestre. Superficie volcánica.',
    moons: '0',
    facts: 'Rota en sentido retrógrado y su día (243 d) es más largo que su año (225 d).',
    color: 0xe8c98a, texture: 'venus'
  },
  {
    id: 'tierra', name: 'Tierra', type: 'Planeta rocoso (terrestre)',
    orbit: { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, varpi: 102.93768193, Omega: 0.0 },
    periodDays: 365.256, rotationHours: 23.934, axialTilt: 23.44,
    radiusKm: 6371.0, massKg: 5.9724e24, gravity: 9.81,
    distanceKm: 149.6e6,
    temperature: 'Media 15 °C (de -89 °C a 57 °C)',
    composition: 'Atmósfera de N₂ (78 %) y O₂ (21 %); 71 % de la superficie cubierta de agua líquida. Único mundo con vida conocida.',
    moons: '1 (la Luna)',
    facts: 'Su campo magnético y su atmósfera la protegen del viento solar.',
    color: 0x3a76c4, texture: 'earth'
  },
  {
    id: 'marte', name: 'Marte', type: 'Planeta rocoso (terrestre)',
    orbit: { a: 1.52371034, e: 0.09339410, i: 1.84969142, L: -4.55343205, varpi: -23.94362959, Omega: 49.55953891 },
    periodDays: 686.980, rotationHours: 24.623, axialTilt: 25.19,
    radiusKm: 3389.5, massKg: 6.4171e23, gravity: 3.71,
    distanceKm: 227.9e6,
    temperature: 'Media -63 °C (de -143 °C a 35 °C)',
    composition: 'Atmósfera tenue de CO₂ (95 %); suelo rico en óxido de hierro. Casquetes polares de hielo de agua y CO₂.',
    moons: '2 (Fobos y Deimos)',
    facts: 'Alberga el Monte Olimpo, el mayor volcán del Sistema Solar (~22 km de altura).',
    color: 0xc1440e, texture: 'mars'
  },
  {
    id: 'jupiter', name: 'Júpiter', type: 'Gigante gaseoso',
    orbit: { a: 5.20288700, e: 0.04838624, i: 1.30439695, L: 34.39644051, varpi: 14.72847983, Omega: 100.47390909 },
    periodDays: 4332.589, rotationHours: 9.925, axialTilt: 3.13,
    radiusKm: 69911, massKg: 1.8982e27, gravity: 24.79,
    distanceKm: 778.5e6,
    temperature: '-108 °C en la cima de las nubes',
    composition: 'Hidrógeno (~90 %) y helio (~10 %); sin superficie sólida. Bandas de nubes de amoníaco y tormentas persistentes.',
    moons: '95 confirmadas (Ío, Europa, Ganimedes, Calisto...)',
    facts: 'La Gran Mancha Roja es una tormenta anticiclónica observada desde hace más de 190 años.',
    color: 0xd8ca9d, texture: 'jupiter'
  },
  {
    id: 'saturno', name: 'Saturno', type: 'Gigante gaseoso',
    orbit: { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, varpi: 92.59887831, Omega: 113.66242448 },
    periodDays: 10759.22, rotationHours: 10.656, axialTilt: 26.73,
    radiusKm: 58232, massKg: 5.6834e26, gravity: 10.44,
    distanceKm: 1434e6,
    temperature: '-139 °C en la cima de las nubes',
    composition: 'Hidrógeno y helio. Sistema de anillos formado por partículas de hielo de agua y roca, de micras a metros.',
    moons: '146 confirmadas (Titán, Encélado, Rea...)',
    facts: 'Su densidad media (0,69 g/cm³) es menor que la del agua.',
    color: 0xe3d1a0, texture: 'saturn', hasRings: true
  },
  {
    id: 'urano', name: 'Urano', type: 'Gigante helado',
    orbit: { a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, varpi: 170.95427630, Omega: 74.01692503 },
    periodDays: 30685.4, rotationHours: -17.24, axialTilt: 97.77,
    radiusKm: 25362, massKg: 8.6810e25, gravity: 8.87,
    distanceKm: 2871e6,
    temperature: '-195 °C (mínimo medido en el Sistema Solar: -224 °C)',
    composition: 'Hidrógeno, helio y hielos (agua, amoníaco, metano). El metano le da el tono azul verdoso.',
    moons: '28 confirmadas (Titania, Oberón, Miranda...)',
    facts: 'Rota tumbado: su eje está inclinado 98°, casi en el plano de su órbita.',
    color: 0x9ad4e0, texture: 'uranus'
  },
  {
    id: 'neptuno', name: 'Neptuno', type: 'Gigante helado',
    orbit: { a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, varpi: 44.96476227, Omega: 131.78422574 },
    periodDays: 60189, rotationHours: 16.11, axialTilt: 28.32,
    radiusKm: 24622, massKg: 1.02413e26, gravity: 11.15,
    distanceKm: 4495e6,
    temperature: '-201 °C en la cima de las nubes',
    composition: 'Hidrógeno, helio y hielos, con metano atmosférico que produce su color azul intenso.',
    moons: '16 confirmadas (Tritón, Nereida...)',
    facts: 'Tiene los vientos más rápidos del Sistema Solar: hasta 2.100 km/h.',
    color: 0x3f66d4, texture: 'neptune'
  },
  {
    id: 'pluton', name: 'Plutón', type: 'PLANETA ENANO (objeto transneptuniano)',
    orbit: { a: 39.48211675, e: 0.24882730, i: 17.14001206, L: 238.92903833, varpi: 224.06891629, Omega: 110.30393684 },
    periodDays: 90560, rotationHours: -153.29, axialTilt: 122.53,
    radiusKm: 1188.3, massKg: 1.303e22, gravity: 0.62,
    distanceKm: 5906e6,
    temperature: '-229 °C',
    composition: 'Roca y hielos de nitrógeno, metano y monóxido de carbono. Atmósfera tenue y estacional.',
    moons: '5 (Caronte, Nix, Hidra, Cerbero y Estigia)',
    facts: 'Planeta enano: la UAI lo reclasificó en 2006 porque no ha despejado su órbita. Su órbita es tan excéntrica (e = 0,249) que entre 1979 y 1999 estuvo más cerca del Sol que Neptuno.',
    isDwarf: true,
    color: 0xc3ab97, texture: 'pluto'
  }
];

/** La Luna vive en moonData.js junto al resto de satélites. */
export const MOON = MOONS.find((m) => m.id === 'luna');

/** Índice id -> datos, usado por las fichas informativas. */
export const BODY_DATA_BY_ID = (() => {
  const map = new Map();
  map.set(SUN.id, SUN);
  for (const p of PLANETS) map.set(p.id, p);
  for (const m of MOONS) map.set(m.id, m);
  return map;
})();

export const EARTH_RADIUS_KM = 6371.0;
export const AU_KM = 149597870.7;
