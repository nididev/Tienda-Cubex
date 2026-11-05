/* =====================================================================
   CUBEX EN LA NUBE - MICROSERVICIOS NODE EN UN SOLO PROCESO

   Cada microservicio sigue escuchando en su propio puerto, pero todos
   comparten un mismo proceso de Node para ahorrar memoria (el plan de
   prueba de Railway permite 1 GB por servicio).

   Lo inicia nube/iniciar-servicios.js; no se ejecuta a mano.
   ===================================================================== */

const path = require('path');
const { pathToFileURL } = require('url');

const RAIZ = path.resolve(__dirname, '..');
const SERVICIOS = JSON.parse(process.env.CUBEX_SERVICIOS_NODE || '[]');

// Un error inesperado en un servicio no debe apagar a los demás.
process.on('uncaughtException', error => {
    console.error('[node] Error no controlado:', error && (error.stack || error.message));
});

process.on('unhandledRejection', error => {
    console.error('[node] Promesa rechazada sin control:', error && (error.stack || error.message || error));
});

(async () => {
    for (const servicio of SERVICIOS) {
        // Cada servicio lee PORT y sus variables al cargarse.
        Object.assign(process.env, servicio.env || {}, { PORT: String(servicio.puerto) });

        try {
            await import(pathToFileURL(path.join(RAIZ, servicio.carpeta, servicio.entrada)).href);
            // Breve espera para que el servicio tome su puerto antes del siguiente.
            await new Promise(resolver => setTimeout(resolver, 300));
            console.log(`[node] ${servicio.nombre} cargado en el puerto ${servicio.puerto}`);
        } catch (error) {
            console.error(`[node] No se pudo cargar ${servicio.nombre}:`, error && (error.stack || error.message));
        }
    }
})();
