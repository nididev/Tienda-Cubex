/* =====================================================================
   CUBEX EN LA NUBE - SERVIDOR DE ENTRADA (sin dependencias)

   Una sola dirección pública para todo CUBEX:
     /                     -> redirige a /pages/index.html
     /pages, /css, /js     -> archivos de la carpeta public/
     /svc/<puerto>/<ruta>  -> microservicio interno http://127.0.0.1:<puerto>/<ruta>

   El frontend (public/js/config.js) usa /svc/<puerto> automáticamente
   cuando no se abre desde localhost.
   ===================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = Number(process.env.PORT || 8080);
const CARPETA_PUBLICA = path.resolve(__dirname, '..', 'public');

// Solo se permite reenviar a los puertos de CUBEX.
const PUERTOS_PERMITIDOS = new Set([
    3000, 3001, 3002, 3005, 3007, 3008, 3009, 3011, 3012,
    3019, 3020, 3021, 3024, 3025, 3032
]);

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

function servirArchivo(req, res, ruta) {
    let relativa;

    try {
        relativa = decodeURIComponent(ruta.split('?')[0]);
    } catch {
        res.writeHead(400);
        return res.end('Ruta no válida');
    }

    if (relativa === '/' || relativa === '') {
        res.writeHead(302, { Location: '/pages/index.html' });
        return res.end();
    }

    const archivo = path.resolve(CARPETA_PUBLICA, '.' + relativa);

    // Impide salir de la carpeta public (../).
    if (!archivo.startsWith(CARPETA_PUBLICA + path.sep)) {
        res.writeHead(403);
        return res.end('Acceso denegado');
    }

    fs.stat(archivo, (error, info) => {
        if (error || !info.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('No encontrado');
        }

        res.writeHead(200, {
            'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
            'Content-Length': info.size,
            'Cache-Control': 'no-cache'
        });

        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(archivo).pipe(res);
    });
}

function reenviar(req, res, puerto, resto) {
    const cabeceras = { ...req.headers, host: `127.0.0.1:${puerto}` };

    // Es el mismo origen: los servicios no necesitan validar CORS.
    delete cabeceras.origin;
    cabeceras['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    cabeceras['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'https';

    const salida = http.request({
        host: '127.0.0.1',
        port: puerto,
        method: req.method,
        path: resto || '/',
        headers: cabeceras
    }, respuesta => {
        res.writeHead(respuesta.statusCode, respuesta.headers);
        respuesta.pipe(res);
    });

    salida.setTimeout(60000, () => salida.destroy(new Error('tiempo agotado')));

    salida.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        res.end(JSON.stringify({
            exitoso: false,
            success: false,
            mensaje: `El servicio del puerto ${puerto} no está disponible en este momento.`,
            message: `El servicio del puerto ${puerto} no está disponible en este momento.`
        }));
    });

    req.pipe(salida);
}

const servidor = http.createServer((req, res) => {
    const coincidencia = /^\/svc\/(\d{4})(\/.*)?$/.exec(req.url);

    if (coincidencia) {
        const puerto = Number(coincidencia[1]);

        if (!PUERTOS_PERMITIDOS.has(puerto)) {
            res.writeHead(404);
            return res.end('Servicio no encontrado');
        }

        return reenviar(req, res, puerto, coincidencia[2]);
    }

    if (req.url === '/salud') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('{"ok":true}');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        return res.end('Método no permitido');
    }

    return servirArchivo(req, res, req.url);
});

servidor.listen(PUERTO, '0.0.0.0', () => {
    console.log(`[entrada] CUBEX disponible en el puerto ${PUERTO}`);
});

module.exports = servidor;
