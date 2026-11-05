/* =====================================================================
   CUBEX EN LA NUBE - ARRANQUE DE TODOS LOS SERVICIOS

   Inicia cada microservicio en su puerto interno de siempre (los mismos
   del INICIAR_CUBEX.bat) y el servidor de entrada en el puerto público
   que asigna Railway. Si un servicio se cae, lo reinicia.

   Variables en Railway (pestaña "Variables" del servicio web):
     MYSQL_URL          = ${{MySQL.MYSQL_URL}}   (referencia a la base)
     DB_NAME            = tienda_db               (opcional, por defecto tienda_db)
     JWT_SECRET         = (opcional; si falta se genera uno al iniciar)
     CUBEX_SERVICE_KEY  = (opcional; si falta se genera una al iniciar)
     GMAIL_USER / GMAIL_APP_PASSWORD, SMTP_*       (opcionales, correos)
     BREVO_API_KEY / MAIL_FROM                     (ticket por correo; Railway bloquea SMTP)
   ===================================================================== */

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PYTHON = process.env.PYTHON_BIN || 'python3';

// ---------------------------------------------------------------
// Datos de la base de datos (Railway entrega MYSQL_URL)
// ---------------------------------------------------------------

function leerBase() {
    const base = {
        host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
        port: process.env.DB_PORT || process.env.MYSQLPORT || '3306',
        user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
        password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
        database: process.env.DB_NAME || 'tienda_db'
    };

    if (process.env.MYSQL_URL && !process.env.DB_HOST) {
        try {
            const url = new URL(process.env.MYSQL_URL);
            base.host = url.hostname;
            base.port = url.port || '3306';
            base.user = decodeURIComponent(url.username);
            base.password = decodeURIComponent(url.password);
        } catch {
            console.error('[arranque] MYSQL_URL no tiene un formato válido.');
        }
    }

    return base;
}

const db = leerBase();
const urlMysql = (esquema) =>
    `${esquema}://${encodeURIComponent(db.user)}:${encodeURIComponent(db.password)}@${db.host}:${db.port}/${db.database}`;

const secreto = (nombre, bytes = 48) => {
    if (!process.env[nombre]) {
        process.env[nombre] = crypto.randomBytes(bytes).toString('hex');
        console.warn(`[arranque] ${nombre} no estaba configurado: se generó uno temporal (las sesiones se cierran al reiniciar).`);
    }
    return process.env[nombre];
};

const comunes = {
    NODE_ENV: 'production',
    DB_HOST: db.host,
    DB_PORT: String(db.port),
    DB_USER: db.user,
    DB_PASSWORD: db.password,
    DB_NAME: db.database,
    JWT_SECRET: secreto('JWT_SECRET'),
    JWT_ISSUER: process.env.JWT_ISSUER || 'microservicio-login',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',
    CUBEX_SERVICE_KEY: secreto('CUBEX_SERVICE_KEY', 32),
    HUMAN_CHECK_SECRET: secreto('HUMAN_CHECK_SECRET', 32),
    INVENTARIO_API_URL: 'http://127.0.0.1:3005/api/inventario',
    PEDIDOS_API_URL: 'http://127.0.0.1:3011/api/Pedidos',
    CORS_ORIGIN: '*',
    FLASK_DEBUG: '0',
    PYTHONUNBUFFERED: '1'
};

const URL_PUBLICA = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : (process.env.URL_PUBLICA || 'http://127.0.0.1:8080');

// ---------------------------------------------------------------
// Servicios (mismos puertos que INICIAR_CUBEX.bat)
// ---------------------------------------------------------------

const SERVICIOS = [
    { nombre: 'login', carpeta: 'microservicio-login', puerto: 3020, cmd: 'node', args: ['src/server.js'] },
    { nombre: 'roles', carpeta: 'servicio-roles', puerto: 3000, cmd: 'node', args: ['src/app.js'] },
    { nombre: 'bot', carpeta: 'verificacion-bot', puerto: 3001, cmd: 'node', args: ['server.js'] },
    { nombre: 'recuperar-password', carpeta: 'soa-servicio-reset-password-main/api', puerto: 3002, cmd: 'node', args: ['dist/server.js'],
        env: { FRONTEND_URL: `${URL_PUBLICA}/pages` } },
    { nombre: 'inventario', carpeta: 'inventario-service-main', puerto: 3005, cmd: 'node', args: ['src/app.js'] },
    { nombre: 'resenas', carpeta: 'comentarios-resenas-service', puerto: 3007, cmd: 'node', args: ['src/server.js'] },
    { nombre: 'reportes-inventario', carpeta: 'Inventario', puerto: 3008, cmd: 'node', args: ['src/server.js'], env: { HOST: '127.0.0.1' } },
    { nombre: 'proveedores', carpeta: 'servicio_proveedores', puerto: 3009, cmd: PYTHON, args: ['app.py'] },
    { nombre: 'pedidos', carpeta: 'registro-pedidos-service', puerto: 3011, cmd: 'node', args: ['server.js'] },
    { nombre: 'pagos', carpeta: 'serviciopago', puerto: 3012, cmd: PYTHON, args: ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', '3012'] },
    { nombre: 'domicilios', carpeta: 'microservicio-domicilios', puerto: 3019, cmd: 'node', args: ['server.js'] },
    { nombre: 'reportes-compras', carpeta: 'servicio-reporte-compras', puerto: 3021, cmd: 'node', args: ['src/server.js'], env: { HOST: '127.0.0.1' } },
    { nombre: 'tarjetas', carpeta: 'servicio-verificacion-tarjeta', puerto: 3024, cmd: 'node', args: ['dist/server.js'],
        env: { DATABASE_URL: urlMysql('mysql') } },
    { nombre: 'tickets', carpeta: 'ticket_service', puerto: 3025, cmd: PYTHON, args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '3025'],
        env: { DATABASE_URL: `${urlMysql('mysql+pymysql')}?charset=utf8mb4`, APP_PORT: '3025' } },
    { nombre: 'logistica', carpeta: 'logistica_envios_python', puerto: 3032, cmd: PYTHON, args: ['app.py'], env: { HOST: '127.0.0.1' } }
];

const SOLO = (process.env.SERVICIOS || '').split(',').map(s => s.trim()).filter(Boolean);
const procesos = new Map();
let cerrando = false;

function iniciar(servicio, intentos = 0) {
    const hijo = spawn(servicio.cmd, servicio.args, {
        cwd: path.join(RAIZ, servicio.carpeta),
        env: { ...process.env, ...comunes, ...(servicio.env || {}), PORT: String(servicio.puerto) },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const prefijo = `[${servicio.nombre}:${servicio.puerto}]`;
    const escribir = flujo => datos => String(datos).split(/\r?\n/).filter(Boolean)
        .forEach(linea => flujo.write(`${prefijo} ${linea}\n`));

    hijo.stdout.on('data', escribir(process.stdout));
    hijo.stderr.on('data', escribir(process.stderr));

    hijo.on('exit', codigo => {
        procesos.delete(servicio.nombre);
        if (cerrando) return;

        const espera = Math.min(30000, 2000 * (intentos + 1));
        console.error(`${prefijo} se detuvo (código ${codigo}). Reintentando en ${espera / 1000} s...`);
        setTimeout(() => iniciar(servicio, Math.min(intentos + 1, 10)), espera);
    });

    hijo.on('error', error => console.error(`${prefijo} no se pudo iniciar: ${error.message}`));
    procesos.set(servicio.nombre, hijo);
}

console.log(`[arranque] Base de datos: ${db.user}@${db.host}:${db.port}/${db.database}`);
console.log(`[arranque] Dirección pública: ${URL_PUBLICA}`);

const elegidos = SERVICIOS.filter(servicio => !SOLO.length || SOLO.includes(servicio.nombre));

// Los servicios Node se cargan juntos en un solo proceso (ahorra memoria);
// los de Python se ejecutan cada uno en su propio proceso.
const serviciosNode = elegidos.filter(servicio => servicio.cmd === 'node');

if (serviciosNode.length) {
    iniciar({
        nombre: 'node',
        carpeta: '.',
        puerto: 0,
        cmd: 'node',
        args: ['nube/servicios-node.js'],
        env: {
            CUBEX_SERVICIOS_NODE: JSON.stringify(serviciosNode.map(servicio => ({
                nombre: servicio.nombre,
                carpeta: servicio.carpeta,
                entrada: servicio.args[0],
                puerto: servicio.puerto,
                env: servicio.env || {}
            })))
        }
    });
}

elegidos
    .filter(servicio => servicio.cmd !== 'node')
    .forEach(servicio => iniciar(servicio));

// Servidor de entrada en el puerto público.
require('./servidor-entrada');

function cerrar() {
    cerrando = true;
    procesos.forEach(hijo => hijo.kill('SIGTERM'));
    setTimeout(() => process.exit(0), 1500);
}

process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
