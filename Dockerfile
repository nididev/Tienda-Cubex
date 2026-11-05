# =====================================================================
# CUBEX - Contenedor único para Railway (tienda + panel + microservicios)
# Railway construye esta imagen automáticamente desde GitHub.
# =====================================================================
FROM node:22-bookworm-slim

# Python (servicios Flask/FastAPI), OpenSSL (Prisma) y librerías para PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv python3-dev build-essential pkg-config \
        libcairo2-dev openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Dependencias de Python en un entorno virtual común
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r nube/requirements-nube.txt
ENV PATH="/opt/venv/bin:$PATH" PYTHON_BIN=/opt/venv/bin/python

# Dependencias de cada microservicio Node
RUN set -e; for d in microservicio-login servicio-roles verificacion-bot \
        soa-servicio-reset-password-main/api inventario-service-main \
        comentarios-resenas-service Inventario registro-pedidos-service \
        microservicio-domicilios servicio-reporte-compras; do \
        echo "== npm install $d"; \
        (cd "$d" && npm install --omit=dev --no-audit --no-fund); \
    done; \
    cd servicio-verificacion-tarjeta && npm install --no-audit --no-fund && npx prisma generate

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "nube/iniciar-servicios.js"]
