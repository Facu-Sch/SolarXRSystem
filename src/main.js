/**
 * Punto de entrada. Toda la lógica vive en los módulos de `src/`.
 */
import { App } from './core/App.js';
import { setupPWA } from './pwa.js';

setupPWA();

const app = new App();

app.init().catch((err) => {
  console.error('[SistemaSolarMR] Error de inicialización:', err);
  const loader = document.getElementById('loader');
  if (loader) {
    loader.textContent = `Error al iniciar: ${err.message || err}`;
    loader.style.color = '#ff6b6b';
    loader.classList.remove('hidden');
  }
});

// Útil para depurar desde la consola remota del Quest (chrome://inspect)
window.__solarApp = app;
