import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * WebXR exige un contexto seguro (HTTPS o localhost).
 * El Quest 3 accede por IP de la LAN, por lo que "localhost" NO sirve:
 * hace falta HTTPS real. Por eso el servidor de desarrollo usa un certificado
 * autofirmado (el navegador del Quest muestra un aviso que hay que aceptar una
 * vez).
 *
 * HTTPS se puede desactivar de dos formas, ambas pensadas para pruebas locales
 * en http://localhost —que también cuenta como contexto seguro— y para
 * previsualizadores integrados que rechazan los certificados autofirmados:
 *
 *   npm run dev:http          (modo "http")
 *   NO_HTTPS=1 npm run dev    (variable de entorno)
 *
 * El puerto sale de la variable PORT si está definida, de modo que un
 * lanzador externo pueda asignar uno libre sin tener que tocar este archivo.
 */
export default defineConfig(({ mode }) => {
  const useHttps = mode !== 'http' && !process.env.NO_HTTPS;
  const port = Number(process.env.PORT) || 5173;

  // Sello de compilación visible en la interfaz: sirve para saber de un
  // vistazo si lo que se está probando es la última versión o una copia
  // cacheada / desplegada hace rato.
  const sello = new Date().toISOString().slice(0, 16).replace('T', ' ');

  return {
    base: './',
    define: { __BUILD_ID__: JSON.stringify(sello) },
    plugins: useHttps ? [basicSsl()] : [],
    server: {
      host: true,        // escucha en 0.0.0.0 para que el Quest pueda conectarse
      port,
      https: useHttps,
      strictPort: false  // si el puerto está ocupado, prueba el siguiente
    },
    preview: {
      host: true,
      port: Number(process.env.PORT) || 4173,
      https: useHttps
    },
    build: {
      target: 'es2020',
      sourcemap: false
    }
  };
});
