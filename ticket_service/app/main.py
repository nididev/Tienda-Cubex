
import io
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings
from app.correo import ErrorCorreo, correo_configurado, enviar_ticket
from app.database import obtener_pedido_completo
from app.pdf_ticket import generar_pdf
from app.seguridad import ROLES_PERSONAL, ErrorSeguridad, extraer_token, verificar_token


app = FastAPI(
    title="CUBEX - Servicio de tickets",
    version="2.1.0",
    description="Genera tickets PDF de pedidos confirmados de CUBEX."
)


# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)


# Configuración de plantillas
BASE_DIR = Path(__file__).resolve().parent

env = Environment(
    loader=FileSystemLoader(BASE_DIR / "templates"),
    autoescape=select_autoescape(["html", "xml"])
)


@app.get("/api/salud")
def salud():
    return {
        "exitoso": True,
        "mensaje": "Servicio de tickets CUBEX funcionando",
        "puerto": settings.APP_PORT
    }


def preparar_ticket(id_pedido: int, authorization: str | None):
    """Valida al usuario y el pedido, y genera el PDF del ticket."""

    # Solo el dueño del pedido o el personal pueden obtener el ticket
    # (contiene nombre y correo del cliente).
    try:
        usuario = verificar_token(extraer_token(authorization))
    except ErrorSeguridad as error:
        raise HTTPException(status_code=error.status, detail=error.mensaje)

    # Validar ID
    if id_pedido <= 0:
        raise HTTPException(
            status_code=400,
            detail="El ID del pedido no es válido."
        )

    # Consultar pedido y productos
    try:
        pedido, detalles = obtener_pedido_completo(id_pedido)

    except Exception as error:
        import traceback

        print("\n========== ERROR AL CONSULTAR PEDIDO ==========")
        print(f"Pedido solicitado: {id_pedido}")
        print(f"Error: {error}")
        traceback.print_exc()
        print("================================================\n")

        raise HTTPException(
            status_code=500,
            detail=f"Error al consultar el pedido: {str(error)}"
        )

    # Validar existencia
    if not pedido:
        raise HTTPException(
            status_code=404,
            detail="El pedido no existe."
        )

    # Validar propiedad (se responde 404 para no revelar pedidos ajenos)
    if usuario["rol"] not in ROLES_PERSONAL and int(pedido.get("id_usuario") or 0) != usuario["id"]:
        raise HTTPException(status_code=404, detail="El pedido no existe.")

    # Validar estado
    estado = str(pedido.get("estado") or "").strip().lower()

    if estado != "confirmado":
        raise HTTPException(
            status_code=409,
            detail="No se puede generar el ticket porque el pedido no está confirmado."
        )

    # Validar productos
    if not detalles:
        raise HTTPException(
            status_code=409,
            detail="El pedido no tiene productos registrados."
        )

    # Generar folio
    folio = (
        f"CUBEX-{datetime.now().strftime('%Y%m%d')}-"
        f"{id_pedido:05d}-{uuid.uuid4().hex[:4].upper()}"
    )

    # Formatear fecha
    fecha = pedido.get("fecha")

    if hasattr(fecha, "strftime"):
        fecha_texto = fecha.strftime("%d/%m/%Y %H:%M")
    else:
        fecha_texto = str(fecha or "No disponible")

    # Obtener cliente
    cliente_nombre = (
        pedido.get("cliente_nombre")
        or f"Cliente #{pedido.get('id_cliente')}"
    )

    cliente_correo = pedido.get("cliente_correo") or ""

    # Preparar productos y calcular total
    items = []
    total = Decimal("0.00")

    for item in detalles:
        cantidad = int(item["cantidad"])
        precio = Decimal(str(item["precio_unitario"] or 0))

        importe = precio * cantidad
        total += importe

        items.append({
            "cantidad": cantidad,
            "producto": str(item["producto"]),
            "precio_unitario": float(precio),
            "importe": float(importe)
        })

    datos = {
        "folio": folio,
        "fecha": fecha_texto,
        "pedido_id": id_pedido,
        "cliente_nombre": cliente_nombre,
        "cliente_correo": cliente_correo or "No disponible",
        "items": items,
        "total": float(total)
    }

    # Preparar la plantilla (si falla, se usa el diseño de respaldo)
    try:
        html = env.get_template("ticket_template.html").render(**datos)
    except Exception as error:
        print(f"Error preparando plantilla: {error}")
        html = ""

    # Generar PDF
    try:
        pdf = generar_pdf(html, datos)
    except Exception:
        import traceback

        print("[tickets] Error generando el PDF:")
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="No se pudo generar el PDF del ticket."
        )

    return pdf, cliente_nombre, cliente_correo


@app.get("/api/tickets/{id_pedido}")
def generar_ticket(id_pedido: int, authorization: str | None = Header(default=None)):
    pdf, _, _ = preparar_ticket(id_pedido, authorization)

    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'attachment; filename="ticket-CUBEX-{id_pedido}.pdf"'
        }
    )


@app.post("/api/tickets/{id_pedido}/enviar")
def enviar_ticket_por_correo(id_pedido: int, authorization: str | None = Header(default=None)):
    """Envía el ticket PDF al correo registrado del cliente del pedido."""

    if not correo_configurado():
        raise HTTPException(
            status_code=503,
            detail="El envío de correos no está configurado en el servidor."
        )

    pdf, cliente_nombre, cliente_correo = preparar_ticket(id_pedido, authorization)

    if not cliente_correo:
        raise HTTPException(
            status_code=409,
            detail="El cliente no tiene un correo electrónico registrado."
        )

    try:
        enviar_ticket(cliente_correo, cliente_nombre, id_pedido, pdf)
    except ErrorCorreo as error:
        print(f"[tickets] Error enviando el correo del pedido {id_pedido}: {error}", flush=True)
        raise HTTPException(
            status_code=502,
            detail="No fue posible enviar el ticket por correo."
        )

    return {
        "exitoso": True,
        "mensaje": "Ticket enviado por correo.",
        "pedido": id_pedido,
        "correo": cliente_correo
    }
