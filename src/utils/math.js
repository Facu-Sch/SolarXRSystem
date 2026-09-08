/**
 * Utilidades matemáticas de suavizado.
 *
 * `dampFactor` devuelve el factor de interpolación de un lerp exponencial
 * INDEPENDIENTE DE LA TASA DE REFRESCO:
 *
 *     x += (objetivo - x) * dampFactor(tau, dt)
 *
 * donde `tau` es la constante de tiempo en segundos (a los `tau` segundos se
 * ha recorrido el 63 % de la distancia). Con esto el movimiento se ve igual a
 * 60, 72, 90 o 120 Hz, que es justo lo que necesita el Quest 3.
 */
export function dampFactor(tau, dt) {
  if (tau <= 0) return 1;
  return 1 - Math.exp(-dt / tau);
}

export function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Formatea un número grande en notación con separador de miles español. */
export function formatNumber(n, decimals = 0) {
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

const SUPERSCRIPTS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };

/** Notación científica legible con exponente en superíndice: 5,97 × 10²⁴ */
export function formatScientific(n, digits = 3) {
  if (n === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const mant = n / Math.pow(10, exp);
  const sup = String(exp).split('').map((c) => SUPERSCRIPTS[c] || c).join('');
  return `${mant.toFixed(digits - 1).replace('.', ',')} × 10${sup}`;
}

/** Convierte un período en días a una cadena legible (días / años). */
export function formatPeriodDays(days) {
  const abs = Math.abs(days);
  if (abs < 1) return `${(abs * 24).toFixed(1).replace('.', ',')} horas`;
  if (abs < 400) return `${formatNumber(abs, abs < 10 ? 2 : 1)} días`;
  const years = abs / 365.256;
  return `${formatNumber(abs, 0)} días (${formatNumber(years, years < 10 ? 2 : 1)} años)`;
}

/** Convierte un período de rotación en horas a texto (indica si es retrógrado). */
export function formatRotationHours(hours) {
  const retro = hours < 0;
  const abs = Math.abs(hours);
  let txt;
  if (abs < 48) txt = `${formatNumber(abs, 2)} horas`;
  else txt = `${formatNumber(abs, 1)} horas (${formatNumber(abs / 24, 2)} días)`;
  return retro ? `${txt} — retrógrada` : txt;
}
