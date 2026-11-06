"""
CUBEX - Envío del ticket PDF por correo.

Usa la misma cuenta que el correo de "recuperar contraseña":

1. SMTP (Gmail), con las mismas variables del servicio de contraseña:
       SMTP_HOST = smtp.gmail.com
       SMTP_PORT = 465 (SSL) o 587 (STARTTLS)
       SMTP_USER = tu correo
       SMTP_PASSWORD = contraseña de aplicación
       MAIL_FROM = (opcional) remitente; por defecto SMTP_USER

2. Alternativa si el servidor bloquea SMTP: API HTTPS de Brevo.
       BREVO_API_KEY = clave de API de Brevo (xkeysib-...)
       MAIL_FROM     = correo remitente verificado en Brevo
"""

from __future__ import annotations

import base64
import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.utils import parseaddr
from pathlib import Path


class ErrorCorreo(Exception):
    pass


# Usa la misma cuenta de correo que el servicio de recuperar contraseña.
# Si este servicio no tiene SMTP_* en su .env, se leen del .env de
# soa-servicio-reset-password-main/api (en la nube llegan como variables
# de Railway, compartidas por todos los servicios).
_CORREO_COMPARTIDO: dict[str, str] = {}

try:
    from dotenv import dotenv_values

    _ENV_RESET = (
        Path(__file__).resolve().parents[2]
        / "soa-servicio-reset-password-main" / "api" / ".env"
    )

    if _ENV_RESET.exists():
        _CORREO_COMPARTIDO = {
            clave: str(valor)
            for clave, valor in dotenv_values(_ENV_RESET).items()
            if clave in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM") and valor
        }
except Exception:
    _CORREO_COMPARTIDO = {}


def _var(nombre: str, defecto: str = "") -> str:
    valor = os.getenv(nombre)

    if valor is None or not str(valor).strip():
        valor = _CORREO_COMPARTIDO.get(nombre, defecto)

    return str(valor).replace("\r", "").strip()


def correo_configurado() -> bool:
    return bool(_var("BREVO_API_KEY") or (_var("SMTP_USER") and _var("SMTP_PASSWORD")))


def _texto(nombre: str, id_pedido: int) -> str:
    return (
        f"Hola, {nombre}.\n\n"
        "¡Gracias por comprar en CUBEX!\n\n"
        f"Tu pago del pedido #{id_pedido} fue confirmado.\n"
        "Adjuntamos tu comprobante de compra en PDF.\n"
        "Consérvalo para cualquier aclaración.\n\n"
        "Equipo CUBEX\n"
        "Gira, piensa y conquista."
    )


def _enviar_brevo(destino: str, nombre: str, id_pedido: int, pdf: bytes, archivo: str) -> None:
    remitente = _var("MAIL_FROM") or _var("SMTP_USER")
    if not remitente:
        raise ErrorCorreo("Falta MAIL_FROM (correo remitente verificado en Brevo).")

    # Admite "Nombre <correo>" o solo el correo.
    nombre_remitente, correo_remitente = parseaddr(remitente)

    cuerpo = {
        "sender": {"name": nombre_remitente or "CUBEX", "email": correo_remitente or remitente},
        "to": [{"email": destino, "name": nombre}],
        "subject": f"CUBEX - Comprobante de compra #{id_pedido}",
        "textContent": _texto(nombre, id_pedido),
        "attachment": [{"name": archivo, "content": base64.b64encode(pdf).decode("ascii")}],
    }

    solicitud = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(cuerpo).encode("utf-8"),
        method="POST",
        headers={
            "api-key": _var("BREVO_API_KEY"),
            "content-type": "application/json",
            "accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(solicitud, timeout=30) as respuesta:
            if respuesta.status >= 300:
                raise ErrorCorreo(f"Brevo respondió {respuesta.status}.")
    except urllib.error.HTTPError as error:
        detalle = error.read().decode("utf-8", "replace")[:300]
        raise ErrorCorreo(f"Brevo rechazó el envío ({error.code}): {detalle}") from error
    except urllib.error.URLError as error:
        raise ErrorCorreo(f"No se pudo conectar con Brevo: {error.reason}") from error


def _enviar_smtp(destino: str, nombre: str, id_pedido: int, pdf: bytes, archivo: str) -> None:
    usuario = _var("SMTP_USER")
    remitente = _var("MAIL_FROM") or usuario
    host = _var("SMTP_HOST", "smtp.gmail.com")
    puerto = int(_var("SMTP_PORT", "465") or 465)

    mensaje = EmailMessage()
    mensaje["Subject"] = f"CUBEX - Comprobante de compra #{id_pedido}"
    mensaje["From"] = remitente
    mensaje["To"] = destino
    mensaje.set_content(_texto(nombre, id_pedido))
    mensaje.add_attachment(pdf, maintype="application", subtype="pdf", filename=archivo)

    try:
        if puerto == 465:
            with smtplib.SMTP_SSL(host, puerto, timeout=15, context=ssl.create_default_context()) as servidor:
                servidor.login(usuario, _var("SMTP_PASSWORD"))
                servidor.send_message(mensaje)
        else:
            with smtplib.SMTP(host, puerto, timeout=15) as servidor:
                servidor.starttls(context=ssl.create_default_context())
                servidor.login(usuario, _var("SMTP_PASSWORD"))
                servidor.send_message(mensaje)
    except (OSError, smtplib.SMTPException) as error:
        raise ErrorCorreo(f"No se pudo enviar por SMTP ({host}:{puerto}): {error}") from error


def enviar_ticket(destino: str, nombre: str, id_pedido: int, pdf: bytes) -> None:
    archivo = f"CUBEX-ticket-{id_pedido}.pdf"

    if _var("BREVO_API_KEY"):
        # En la nube (Railway bloquea SMTP): API HTTPS de Brevo.
        _enviar_brevo(destino, nombre, id_pedido, pdf, archivo)
    elif _var("SMTP_USER") and _var("SMTP_PASSWORD"):
        # Misma cuenta y servidor que el correo de recuperar contraseña.
        _enviar_smtp(destino, nombre, id_pedido, pdf, archivo)
    else:
        raise ErrorCorreo("El envío de correos no está configurado.")
