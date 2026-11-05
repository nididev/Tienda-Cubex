
"""
Microservicio simulador de pasarela de pagos CUBEX (FastAPI).

Endpoints:
GET  /                         -> Interfaz web
GET  /health                   -> Verificar funcionamiento
POST /api/pagos                -> Crear un pago
GET  /api/pagos/{id}           -> Consultar pago
POST /api/pagos/{id}/reembolso -> Reembolsar pago

Tarjetas de prueba:
4242 4242 4242 4242 -> Visa aprobada
5555 5555 5555 4444 -> Mastercard aprobada
4000 0000 0000 0002 -> Visa rechazada
"""

from __future__ import annotations

import os
import re
import json
import uuid

from datetime import date
from enum import Enum
from pathlib import Path
from threading import Lock

from urllib.request import Request as URLRequest, urlopen
from urllib.error import HTTPError, URLError

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from pydantic import BaseModel, Field, field_validator


# --------------------------------------------------------------------------
# MODELOS
# --------------------------------------------------------------------------

class Marca(str, Enum):
    VISA = "VISA"
    MASTERCARD = "MASTERCARD"
    DESCONOCIDA = "DESCONOCIDA"


class Estado(str, Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    REFUNDED = "REFUNDED"


class SolicitudPago(BaseModel):

    amount: float = Field(gt=0, description="Monto mayor a 0")

    currency: str = Field(
        pattern=r"^[A-Za-z]{3}$",
        description="Código de moneda de 3 letras"
    )

    nombre: str = Field(min_length=1, description="Nombre del titular")

    apellidos: str = Field(min_length=1, description="Apellidos del titular")

    payerEmail: str = Field(
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    )

    cardNumber: str

    cvv: str = Field(pattern=r"^\d{3}$")

    expiry: str = Field(pattern=r"^(0[1-9]|1[0-2])/\d{2}$")

    description: str | None = None

    # Aquí se recibe el ID real del pedido de CUBEX
    externalReference: str | None = None

    @field_validator("nombre", "apellidos")
    @classmethod
    def no_vacio(cls, v: str) -> str:

        v = v.strip()

        if not v:
            raise ValueError("no puede estar vacío")

        return v

    @field_validator("cardNumber")
    @classmethod
    def dieciseis_digitos(cls, v: str) -> str:

        limpio = re.sub(r"[\s-]", "", v)

        if not re.fullmatch(r"\d{16}", limpio):
            raise ValueError("debe tener exactamente 16 dígitos")

        return limpio

    @field_validator("expiry")
    @classmethod
    def no_vencida(cls, v: str) -> str:

        mes = int(v[:2])
        anio = 2000 + int(v[3:])

        hoy = date.today()

        if (anio, mes) < (hoy.year, hoy.month):
            raise ValueError("la tarjeta está vencida")

        return v


class RespuestaPago(BaseModel):

    providerPaymentId: str
    status: Estado
    motivo: str
    amount: float
    currency: str
    titular: str
    marca: Marca
    ultimos4: str
    externalReference: str | None = None


# --------------------------------------------------------------------------
# REGLAS DE NEGOCIO
# --------------------------------------------------------------------------

_RE_VISA = re.compile(r"4\d{15}")

_RE_MASTERCARD = re.compile(
    r"5[1-5]\d{14}|2(?:22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)\d{12}"
)


def detectar_marca(numero: str) -> Marca:

    if _RE_VISA.fullmatch(numero):
        return Marca.VISA

    if _RE_MASTERCARD.fullmatch(numero):
        return Marca.MASTERCARD

    return Marca.DESCONOCIDA


def es_valido_luhn(numero: str) -> bool:

    suma = 0

    for i, c in enumerate(reversed(numero)):

        d = int(c)

        if i % 2 == 1:
            d = d * 2 - 9 if d > 4 else d * 2

        suma += d

    return suma % 10 == 0


def evaluar(numero: str) -> tuple[Estado, str, Marca]:

    marca = detectar_marca(numero)

    if marca is Marca.DESCONOCIDA:
        return (
            Estado.REJECTED,
            "Marca no soportada (solo Visa y Mastercard)",
            marca
        )

    if not es_valido_luhn(numero):
        return (
            Estado.REJECTED,
            "Número de tarjeta inválido (falla Luhn)",
            marca
        )

    if numero.endswith("0002"):
        return (
            Estado.REJECTED,
            "Fondos insuficientes (simulado)",
            marca
        )

    return (
        Estado.APPROVED,
        "Pago aprobado (simulado)",
        marca
    )


# --------------------------------------------------------------------------
# ALMACÉN EN MEMORIA
# --------------------------------------------------------------------------

_transacciones: dict[str, RespuestaPago] = {}

_lock = Lock()


def _obtener(payment_id: str) -> RespuestaPago:

    with _lock:
        pago = _transacciones.get(payment_id)

    if pago is None:
        raise HTTPException(
            status_code=404,
            detail="Transacción no encontrada"
        )

    return pago


# --------------------------------------------------------------------------
# CONFIGURACIÓN DEL MICROSERVICIO DE PEDIDOS
# --------------------------------------------------------------------------

PEDIDOS_API_URL = os.getenv(
    "PEDIDOS_API_URL",
    "http://localhost:3011/api/Pedidos"
)


def confirmar_pedido(id_pedido: str) -> bool:
    """
    Envía una solicitud PATCH al microservicio de pedidos
    para cambiar el estado a Confirmado.
    """

    url = f"{PEDIDOS_API_URL}/{id_pedido}/estado"

    datos = json.dumps({
        "estado": "Confirmado"
    }).encode("utf-8")

    solicitud = URLRequest(
        url,
        data=datos,
        headers={
            "Content-Type": "application/json"
        },
        method="PATCH"
    )

    try:

        with urlopen(solicitud, timeout=10) as respuesta:

            resultado = respuesta.read().decode("utf-8")

            print(
                f"Pedido {id_pedido} confirmado correctamente."
            )

            print("Respuesta del servicio:", resultado)

            return True

    except HTTPError as error:

        detalle = error.read().decode("utf-8", errors="replace")

        print(
            f"Error HTTP al confirmar el pedido {id_pedido}: "
            f"{error.code} - {detalle}"
        )

        return False

    except (URLError, TimeoutError, OSError) as error:

        print(
            f"No se pudo conectar con el microservicio de pedidos: {error}"
        )

        return False


# --------------------------------------------------------------------------
# APLICACIÓN FASTAPI
# --------------------------------------------------------------------------

app = FastAPI(
    title="Simulador de pasarela de pagos CUBEX",
    version="1.0.0"
)


# --------------------------------------------------------------------------
# CONFIGURACIÓN CORS
# --------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://cubex-tienda.netlify.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


INDEX_HTML = Path(__file__).with_name("index.html")


# --------------------------------------------------------------------------
# ERRORES DE VALIDACIÓN
# --------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def errores_de_formato(
    _: Request,
    exc: RequestValidationError
) -> JSONResponse:

    errores = {
        str(e["loc"][-1]): str(e["msg"]).removeprefix("Value error, ")
        for e in exc.errors()
    }

    resumen = "; ".join(
        f"{campo}: {msg}"
        for campo, msg in errores.items()
    )

    return JSONResponse(
        status_code=422,
        content={
            "detail": resumen,
            "errors": errores
        }
    )


# --------------------------------------------------------------------------
# RUTAS
# --------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
def inicio() -> FileResponse:

    if not INDEX_HTML.exists():
        raise HTTPException(
            status_code=404,
            detail="No se encontró index.html"
        )

    return FileResponse(INDEX_HTML)


@app.get("/health")
def salud():

    return {
        "exitoso": True,
        "mensaje": "Microservicio de pagos CUBEX funcionando"
    }


# --------------------------------------------------------------------------
# CREAR PAGO Y CONFIRMAR PEDIDO AUTOMÁTICAMENTE
# --------------------------------------------------------------------------

@app.post("/api/pagos", response_model=RespuestaPago)
def crear_pago(s: SolicitudPago) -> RespuestaPago:

    estado, motivo, marca = evaluar(s.cardNumber)

    pago = RespuestaPago(
        providerPaymentId=str(uuid.uuid4()),
        status=estado,
        motivo=motivo,
        amount=s.amount,
        currency=s.currency.upper(),
        titular=f"{s.nombre} {s.apellidos}",
        marca=marca,
        ultimos4=s.cardNumber[-4:],
        externalReference=s.externalReference
    )

    # Guardar la transacción
    with _lock:
        _transacciones[pago.providerPaymentId] = pago

    # ------------------------------------------------------
    # SI EL PAGO FUE APROBADO, CONFIRMAR EL PEDIDO EN MYSQL
    # ------------------------------------------------------

    if pago.status is Estado.APPROVED:

        if not pago.externalReference:

            print(
                "ATENCIÓN: Pago aprobado, pero no se recibió "
                "el ID del pedido (externalReference)."
            )

        else:

            actualizado = confirmar_pedido(
                pago.externalReference
            )

            if actualizado:

                print(
                    f"El pedido {pago.externalReference} "
                    "cambió a CONFIRMADO."
                )

            else:

                print(
                    f"ATENCIÓN: El pago fue aprobado, pero el pedido "
                    f"{pago.externalReference} no pudo actualizarse."
                )

    else:

        print(
            f"Pago rechazado. Pedido {pago.externalReference} "
            "sin cambios."
        )

    return pago


# --------------------------------------------------------------------------
# CONSULTAR PAGO
# --------------------------------------------------------------------------

@app.get(
    "/api/pagos/{payment_id}",
    response_model=RespuestaPago
)
def consultar_pago(payment_id: str) -> RespuestaPago:

    return _obtener(payment_id)


# --------------------------------------------------------------------------
# REEMBOLSAR PAGO
# --------------------------------------------------------------------------

@app.post(
    "/api/pagos/{payment_id}/reembolso",
    response_model=RespuestaPago
)
def reembolsar_pago(payment_id: str) -> RespuestaPago:

    with _lock:

        original = _transacciones.get(payment_id)

        if original is None:
            raise HTTPException(
                status_code=404,
                detail="Transacción no encontrada"
            )

        if original.status is not Estado.APPROVED:
            raise HTTPException(
                status_code=400,
                detail="Solo se pueden reembolsar pagos aprobados"
            )

        reembolsado = original.model_copy(
            update={
                "status": Estado.REFUNDED,
                "motivo": "Reembolso simulado exitoso"
            }
        )

        _transacciones[payment_id] = reembolsado

    return reembolsado
