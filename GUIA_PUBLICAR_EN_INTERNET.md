# Publicar CUBEX en internet (GitHub + Railway)

Con esta guía CUBEX queda en una dirección pública, por ejemplo
`https://cubex-production.up.railway.app`, y funciona aunque tu
computadora esté apagada.

- **Costo:** Railway da **5 USD de crédito de prueba** (una sola vez).
  CUBEX completo usa menos de 1 GB de memoria, así que el crédito alcanza
  para varios días. Cuando ya no lo necesites, borra el proyecto en Railway.
- **Cómo funciona:** todo CUBEX (tienda, panel y los 15 microservicios)
  corre en **un solo servidor** con una sola dirección. La base de datos es
  un MySQL de Railway con una copia de tu `tienda_db`.

> **Nunca subas tus archivos `.env` ni el ZIP "LISTO_PARA_USAR" a GitHub.**
> El `.gitignore` ya los excluye. Las contraseñas se escriben en Railway,
> en la pestaña **Variables**.

---

## Paso 1. Copiar los archivos nuevos a tu proyecto

Extrae `actualizacion_nube.zip` **dentro** de tu carpeta `CuboShop` y acepta
**reemplazar** los archivos. Agrega:

- `Dockerfile`, `.dockerignore` y `railway.json`;
- la carpeta `nube/`;
- `public/js/config.js`, `public/reset-password.html`,
  `servicio_proveedores/app.py`, `.gitignore` y esta guía.

En tu computadora todo sigue funcionando igual con `INICIAR_CUBEX.bat`.

## Paso 2. Subir el proyecto a GitHub

1. Entra a <https://github.com> e inicia sesión (o crea una cuenta).
2. En VS Code, abre la carpeta `CuboShop`.
3. Ve al ícono **Source Control** (la tercera rama de la barra izquierda) y
   pulsa **Publish to GitHub** (o **Initialize Repository** y después
   **Publish Branch**).
4. Elige **Publish to GitHub private repository** (privado).
5. Si VS Code pregunta qué archivos incluir, deja los que propone: el
   `.gitignore` ya excluye `.env`, `node_modules` y `venv`.

Comprueba en GitHub que **no** aparezca ningún archivo `.env` en el repositorio.

## Paso 3. Crear la cuenta de Railway

1. Entra a <https://railway.com> y pulsa **Login → Login with GitHub**.
   Usar GitHub verifica la cuenta y permite desplegar código.
2. Acepta el plan **Trial** (no pide tarjeta).

## Paso 4. Crear la base de datos MySQL

1. En Railway: **New Project → Deploy MySQL**. Espera a que aparezca en
   verde.
2. Abre el servicio **MySQL → pestaña Variables** y copia estos valores para
   Workbench: `MYSQLHOST` público y puerto, que aparecen dentro de
   `MYSQL_PUBLIC_URL` (algo como `xxxx.proxy.rlwy.net:12345`), además de
   `MYSQLUSER` (root) y `MYSQLPASSWORD`.

## Paso 5. Copiar tu `tienda_db` a Railway (con MySQL Workbench)

1. **Exporta tu base local**: *Server → Data Export*, marca `tienda_db`,
   elige **Export to Self-Contained File** (por ejemplo
   `tienda_db_nube.sql`), marca **Include Create Schema** y pulsa
   **Start Export**.
2. **Conéctate a Railway**: en la pantalla de inicio de Workbench pulsa
   **+** (nueva conexión):
   - *Hostname*: el host de `MYSQL_PUBLIC_URL` (ej. `xxxx.proxy.rlwy.net`)
   - *Port*: el puerto de `MYSQL_PUBLIC_URL`
   - *Username*: `root`; *Password*: el de `MYSQLPASSWORD`
3. **Importa**: abre esa conexión, *Server → Data Import*, elige
   **Import from Self-Contained File**, selecciona `tienda_db_nube.sql` y
   pulsa **Start Import**.
4. Verifica en esa conexión: `SELECT COUNT(*) FROM tienda_db.productos;`

## Paso 6. Desplegar CUBEX desde GitHub

1. En el mismo proyecto de Railway: **New → GitHub Repo** y elige tu
   repositorio de CUBEX. Railway detecta el `Dockerfile` y empieza a
   construir; la primera vez tarda entre 5 y 10 minutos.
2. Abre el nuevo servicio → pestaña **Variables** → **New Variable** y agrega:

   | Variable | Valor |
   |---|---|
   | `MYSQL_URL` | `${{MySQL.MYSQL_URL}}` (Railway lo autocompleta al escribir `${{`) |
   | `DB_NAME` | `tienda_db` |
   | `JWT_SECRET` | El mismo valor que tienes en `microservicio-login/.env` |
   | `CUBEX_SERVICE_KEY` | El valor de `CUBEX_SERVICE_KEY` de `registro-pedidos-service/.env` |

   Opcionales, solo si quieres que salgan correos:

   | Variable | Para qué sirve |
   |---|---|
   | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Formulario de contacto (copia de `inventario-service-main/.env`) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Recuperar contraseña (copia de `soa-servicio-reset-password-main/api/.env`) |

3. Pestaña **Settings → Networking → Generate Domain**. Si pregunta el
   puerto, escribe **8080**.
4. Abre la dirección que te da Railway. La tienda redirige sola a
   `/pages/index.html`.

## Paso 7. Probar

- Inicia sesión como administrador y como cliente.
- Haz una compra con la tarjeta de prueba `4242 4242 4242 4242` y revisa
  que el stock baje en *Administrador → Inventario*.

## Si algo falla

- En Railway abre el servicio → **Deployments → View Logs**. Cada línea
  empieza con el nombre del servicio, por ejemplo `[logistica:3032]` o
  `[node:0] [node] pedidos…`. Envía una captura de las líneas en rojo.
- **"El servicio del puerto 30xx no está disponible"**: ese servicio se está
  reiniciando o falló; revisa sus líneas en los registros.
- **No inicia sesión**: revisa que `MYSQL_URL` y `DB_NAME` estén bien escritos.

## Notas

- **Imágenes subidas en la nube:** las fotos de productos o evidencias que
  subas desde la versión publicada se guardan en el servidor y se pierden al
  volver a desplegar. Las imágenes que ya están en el proyecto sí se publican.
- **Cambios futuros:** cada vez que subas cambios a GitHub, Railway vuelve a
  desplegar solo.
- **Después de la revisión:** borra el proyecto en Railway
  (*Settings → Danger → Delete Project*) para no consumir más crédito.
