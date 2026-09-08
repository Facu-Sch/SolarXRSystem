import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * WebXR exige un contexto seguro (HTTPS o localhost).
 * El Quest 3 accede por IP de la LAN, por lo que "localhost" NO sirve:
 * hace falta HTTPS real. Usamos un certificado autofirmado en desarrollo
 * (el navegador del Quest mostrará un aviso que hay que aceptar una vez).
 */
// NO_HTTPS=1 desactiva el certificado autofirmado (sólo para pruebas locales
// en http://localhost, donde WebXR también se considera contexto seguro).
const useHttps = !process.env.NO_HTTPS;

export default defineConfig({
  base: './',
  plugins: useHttps ? [basicSsl()] : [],
  server: {
    host: true,   // escucha en 0.0.0.0 para que el Quest pueda conectarse
    port: 5173,
    https: useHttps,
    strictPort: false
  },
  preview: {
    host: true,
    port: 4173,
    https: useHttps
  },
  build: {
    target: 'es2020',
    sourcemap: false
  }
});
