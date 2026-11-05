
@echo off
title CUBEX - Iniciar servicios uno por uno

echo =====================================
echo       INICIANDO SERVICIOS CUBEX
echo =====================================
echo.



REM ==========================================
REM LOGIN - Puerto 3020
REM ==========================================

start "CUBEX - Login" cmd /k "cd /d "%~dp0microservicio-login" && npm run dev"
REM Iniciar microservicio de verificacion de bots
start "CUBEX - Verificacion Bot" cmd /k "cd /d "%~dp0verificacion-bot" && node server.js"

REM Comentarios y resenas - Puerto 3007
start "CUBEX - Comentarios y Resenas" cmd /k "cd /d ""%~dp0comentarios-resenas-service"" && node src/server.js"

REM Microservicio de domicilios (puerto 3019)
start "CUBEX - Microservicio Domicilios" cmd /k "cd /d ""%~dp0microservicio-domicilios"" && npm run dev"


REM ==========================================
REM MICROSERVICIO DE INVENTARIO - PUERTO 3005
REM ==========================================

start "CUBEX - Inventario" cmd /k "cd /d ""%~dp0inventario-service-main"" && npm run dev"




REM ==========================================
REM REGISTRO DE PEDIDOS - Puerto 3011
REM ==========================================

start "CUBEX - Registro de pedidos" cmd /k "cd /d "%~dp0registro-pedidos-service" && npm run dev"

REM ==========================================
REM SERVICIO DE PROVEEDORES - Puerto 3009
REM ==========================================

start "CUBEX - Proveedores" cmd /k "cd /d ""%~dp0servicio_proveedores"" && call venv\Scripts\activate.bat && python app.py"

REM ==========================================
REM SERVICIO DE REPORTES DE COMPRAS - Puerto 3021
REM ==========================================

start "CUBEX - Reportes de Compras" cmd /k "cd /d ""%~dp0servicio-reporte-compras"" && npm run dev"

REM ==========================================
REM SERVICIO DE ROLES - Puerto 3023
REM ==========================================
start "CUBEX - Roles" cmd /k "cd /d ""%~dp0servicio-roles"" && npm run dev"

REM ==========================================
REM SERVICIO DE VERIFICACION DE TARJETAS - Puerto 3024
REM ==========================================

start "CUBEX - Verificacion de Tarjetas" cmd /k "cd /d "%~dp0servicio-verificacion-tarjeta" && npm run dev"

REM ==========================================
REM SERVICIO DE PAGOS - Puerto 3012
REM ==========================================

start "CUBEX - Pagos" cmd /k "cd /d "%~dp0serviciopago" && python -m uvicorn app:app --reload --port 3012"

REM ==========================================
REM SERVICIO DE RECUPERACION DE CONTRASENA - Puerto 3002
REM ==========================================

start "CUBEX - Recuperacion de Contrasena" cmd /k "cd /d "%~dp0soa-servicio-reset-password-main\api" && npm run dev"

REM Iniciar servidor de reportes de inventario
start "CUBEX - Reportes de Inventario" cmd /k "cd /d "%~dp0Inventario" && npm run dev"


REM Iniciar servidor web
start "CUBEX - Pagina Web" cmd /k "cd /d "%~dp0" && py -m http.server 5500 --bind 127.0.0.1"

REM Esperar a que los servicios arranquen


REM Abrir CUBEX
start "" "http://127.0.0.1:5500/index.html"

REM ==========================================
REM SERVICIO DE TICKETS PDF - Puerto 3025
REM ==========================================

start "CUBEX - Tickets PDF" cmd /k "cd /d ""%~dp0ticket_service"" && call venv\Scripts\activate.bat && python -m uvicorn app.main:app --reload --port 3025"


echo.
echo CUBEX se esta iniciando.
echo =================================
pause