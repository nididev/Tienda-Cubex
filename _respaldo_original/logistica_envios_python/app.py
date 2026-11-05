
import os
from datetime import datetime

import mysql.connector
from flask import Flask, jsonify, request
from flask_cors import CORS
from mysql.connector import Error, IntegrityError


app = Flask(__name__)
CORS(app)

# =====================================================
# CONFIGURACIÓN MYSQL
# =====================================================

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "cubex"),
    "port": int(os.getenv("DB_PORT", "3306")),
}

ALLOWED_STATES = (
    "pendiente",
    "preparando",
    "enviado",
    "en_transito",
    "entregado",
    "cancelado",
)

CREATE_STATES = (
    "pendiente",
    "preparando",
    "enviado",
    "en_transito",
)


# =====================================================
# CONEXIÓN Y UTILIDADES
# =====================================================

def get_connection():
    return mysql.connector.connect(**DB_CONFIG)


def close_connection(conn=None, cursor=None):
    if cursor:
        try:
            cursor.close()
        except Error:
            pass

    if conn:
        try:
            if conn.is_connected():
                conn.close()
        except Error:
            pass


def error_response(message, status=400):
    return jsonify({
        "exitoso": False,
        "mensaje": message
    }), status


def parse_id(value, nombre):
    try:
        numero = int(value)
        if numero <= 0:
            raise ValueError()
        return numero
    except (TypeError, ValueError):
        raise ValueError(f"{nombre} debe ser un número entero positivo.")


def parse_datetime(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value

    value = str(value).strip()

    formatos = (
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    )

    for formato in formatos:
        try:
            return datetime.strptime(value, formato)
        except ValueError:
            continue

    raise ValueError("Formato de fecha u hora no válido.")


def envio_a_json(envio):
    """Convierte las fechas de MySQL a texto para JSON."""
    resultado = dict(envio)

    for campo, valor in resultado.items():
        if isinstance(valor, datetime):
            resultado[campo] = valor.strftime("%Y-%m-%d %H:%M:%S")

    return resultado


# =====================================================
# RUTA DE PRUEBA
# =====================================================

@app.route("/", methods=["GET"])
def inicio():
    return jsonify({
        "exitoso": True,
        "mensaje": "Microservicio de logística CUBEX activo.",
        "puerto": 3032
    })


# =====================================================
# LISTAR TODOS LOS ENVÍOS
# =====================================================

@app.route("/api/envios", methods=["GET"])
def listar_envios():

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                e.id,
                e.id_venta,
                v.id_pedido,
                e.id_direccion,
                e.paqueteria,
                e.num_guia,
                e.estado,
                e.fecha_envio,
                e.fecha_estimada_entrega,

                d.calle_numero,
                d.colonia,
                d.ciudad,
                d.codigo_postal,
                d.referencias,

                ve.fecha_entrega_real,
                ve.firma_evidencia

            FROM ENVIOS e

            LEFT JOIN VENTAS v
                ON v.id = e.id_venta

            LEFT JOIN DIRECCIONES d
                ON d.id = e.id_direccion

            LEFT JOIN VALIDACION_ENTREGA ve
                ON ve.id_envio = e.id

            ORDER BY e.id DESC
        """)

        envios = cursor.fetchall()

        return jsonify({
            "exitoso": True,
            "total": len(envios),
            "datos": [envio_a_json(e) for e in envios]
        })

    except Error:
        app.logger.exception("Error al consultar envíos")
        return error_response(
            "No fue posible consultar los envíos.",
            500
        )

    finally:
        close_connection(conn, cursor)


# =====================================================
# REGISTRAR UN ENVÍO
# =====================================================

@app.route("/api/envios", methods=["POST"])
def registrar_envio():

    datos = request.get_json(silent=True) or {}

    conn = None
    cursor = None

    try:
        id_venta = parse_id(datos.get("id_venta"), "ID de venta")
        id_direccion = parse_id(
            datos.get("id_direccion"),
            "ID de dirección"
        )

        paqueteria = str(
            datos.get("paqueteria") or ""
        ).strip()

        num_guia = str(
            datos.get("num_guia") or ""
        ).strip()

        estado = str(
            datos.get("estado") or "pendiente"
        ).strip()

        fecha_envio = parse_datetime(
            datos.get("fecha_envio")
        )

        fecha_estimada = parse_datetime(
            datos.get("fecha_estimada_entrega")
        )

        if not paqueteria:
            return error_response("La paquetería es obligatoria.")

        if len(paqueteria) > 100:
            return error_response("La paquetería no puede superar 100 caracteres.")

        if not num_guia:
            return error_response("El número de guía es obligatorio.")

        if len(num_guia) > 100:
            return error_response("El número de guía no puede superar 100 caracteres.")

        if estado not in CREATE_STATES:
            return error_response("El estado inicial del envío no es válido.")

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Verificar que exista la venta.
        cursor.execute(
            "SELECT id FROM VENTAS WHERE id = %s",
            (id_venta,)
        )

        if cursor.fetchone() is None:
            return error_response("La venta indicada no existe.", 404)

        # Verificar que exista la dirección.
        cursor.execute(
            "SELECT id FROM DIRECCIONES WHERE id = %s",
            (id_direccion,)
        )

        if cursor.fetchone() is None:
            return error_response("La dirección indicada no existe.", 404)

        # Evitar guías duplicadas.
        cursor.execute(
            "SELECT id FROM ENVIOS WHERE num_guia = %s",
            (num_guia,)
        )

        if cursor.fetchone():
            return error_response(
                "Ya existe un envío con ese número de guía.",
                409
            )

        cursor.execute("""
            INSERT INTO ENVIOS (
                id_venta,
                id_direccion,
                paqueteria,
                num_guia,
                estado,
                fecha_envio,
                fecha_estimada_entrega
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            id_venta,
            id_direccion,
            paqueteria,
            num_guia,
            estado,
            fecha_envio,
            fecha_estimada
        ))

        nuevo_id = cursor.lastrowid
        conn.commit()

        return jsonify({
            "exitoso": True,
            "mensaje": "Envío registrado correctamente.",
            "id": nuevo_id
        }), 201

    except ValueError as error:
        return error_response(str(error))

    except IntegrityError:
        if conn:
            conn.rollback()

        return error_response(
            "No se pudo registrar el envío. Verifica los datos y que la guía no esté duplicada.",
            409
        )

    except Error:
        if conn:
            conn.rollback()

        app.logger.exception("Error al registrar envío")
        return error_response("Ocurrió un error al registrar el envío.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# ACTUALIZAR UN ENVÍO
# =====================================================

@app.route("/api/envios/<int:id>", methods=["PATCH"])
def actualizar_envio(id):

    datos = request.get_json(silent=True) or {}

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        conn.start_transaction()

        cursor.execute("""
            SELECT *
            FROM ENVIOS
            WHERE id = %s
            FOR UPDATE
        """, (id,))

        envio = cursor.fetchone()

        if not envio:
            conn.rollback()
            return error_response("El envío no existe.", 404)

        estado_actual = envio["estado"]

        nuevo_estado = str(
            datos.get("estado", estado_actual)
        ).strip()

        if nuevo_estado not in ALLOWED_STATES:
            conn.rollback()
            return error_response("El estado seleccionado no es válido.")

        if estado_actual == "entregado" and nuevo_estado != "entregado":
            conn.rollback()
            return error_response(
                "Un envío entregado no puede regresar a un estado anterior.",
                409
            )

        if estado_actual == "cancelado" and nuevo_estado != "cancelado":
            conn.rollback()
            return error_response(
                "Un envío cancelado no puede reactivarse.",
                409
            )

        paqueteria = str(
            datos.get("paqueteria", envio["paqueteria"] or "")
        ).strip()

        num_guia = str(
            datos.get("num_guia", envio["num_guia"] or "")
        ).strip()

        fecha_envio = (
            parse_datetime(datos["fecha_envio"])
            if "fecha_envio" in datos
            else envio["fecha_envio"]
        )

        fecha_estimada = (
            parse_datetime(datos["fecha_estimada_entrega"])
            if "fecha_estimada_entrega" in datos
            else envio["fecha_estimada_entrega"]
        )

        if not paqueteria or not num_guia:
            conn.rollback()
            return error_response(
                "La paquetería y el número de guía son obligatorios."
            )

        if len(paqueteria) > 100 or len(num_guia) > 100:
            conn.rollback()
            return error_response("La paquetería o la guía exceden el límite permitido.")

        # Comprobar que la guía no pertenezca a otro envío.
        cursor.execute("""
            SELECT id
            FROM ENVIOS
            WHERE num_guia = %s AND id <> %s
        """, (num_guia, id))

        if cursor.fetchone():
            conn.rollback()
            return error_response(
                "Ese número de guía ya está registrado.",
                409
            )

        cursor.execute("""
            UPDATE ENVIOS
            SET
                paqueteria = %s,
                num_guia = %s,
                estado = %s,
                fecha_envio = %s,
                fecha_estimada_entrega = %s
            WHERE id = %s
        """, (
            paqueteria,
            num_guia,
            nuevo_estado,
            fecha_envio,
            fecha_estimada,
            id
        ))

        conn.commit()

        return jsonify({
            "exitoso": True,
            "mensaje": "Envío actualizado correctamente."
        })

    except ValueError as error:
        if conn:
            conn.rollback()
        return error_response(str(error))

    except Error:
        if conn:
            conn.rollback()

        app.logger.exception("Error al actualizar envío")
        return error_response("No fue posible actualizar el envío.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# BUSCAR POR NÚMERO DE GUÍA
# =====================================================

@app.route("/api/envios/buscar", methods=["GET"])
def buscar_envio():

    guia = request.args.get("guia", "").strip()

    if not guia:
        return error_response("Escribe un número de guía para buscar.")

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                e.id,
                e.id_venta,
                v.id_pedido,
                e.id_direccion,
                e.paqueteria,
                e.num_guia,
                e.estado,
                e.fecha_envio,
                e.fecha_estimada_entrega,
                d.calle_numero,
                d.colonia,
                d.ciudad,
                d.codigo_postal,
                d.referencias,
                ve.fecha_entrega_real,
                ve.firma_evidencia

            FROM ENVIOS e

            LEFT JOIN VENTAS v
                ON v.id = e.id_venta

            LEFT JOIN DIRECCIONES d
                ON d.id = e.id_direccion

            LEFT JOIN VALIDACION_ENTREGA ve
                ON ve.id_envio = e.id

            WHERE e.num_guia LIKE %s
            ORDER BY e.id DESC
        """, (f"%{guia}%",))

        resultados = cursor.fetchall()

        return jsonify({
            "exitoso": True,
            "total": len(resultados),
            "datos": [envio_a_json(e) for e in resultados]
        })

    except Error:
        app.logger.exception("Error al buscar envío")
        return error_response("No fue posible realizar la búsqueda.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# VALIDAR ENTREGA
# =====================================================

@app.route("/api/envios/<int:id>/entregar", methods=["POST"])
def validar_entrega(id):

    datos = request.get_json(silent=True) or {}

    firma = str(
        datos.get("firma_evidencia") or ""
    ).strip() or None

    if firma and len(firma) > 255:
        return error_response(
            "La evidencia no puede superar 255 caracteres."
        )

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Bloquea el envío durante la validación para evitar
        # que dos solicitudes registren la entrega simultáneamente.
        conn.start_transaction()

        cursor.execute("""
            SELECT id, estado
            FROM ENVIOS
            WHERE id = %s
            FOR UPDATE
        """, (id,))

        envio = cursor.fetchone()

        if not envio:
            conn.rollback()
            return error_response("El envío no existe.", 404)

        if envio["estado"] == "entregado":
            conn.rollback()
            return error_response(
                "Este envío ya fue validado como entregado.",
                409
            )

        if envio["estado"] == "cancelado":
            conn.rollback()
            return error_response(
                "Un envío cancelado no puede marcarse como entregado.",
                409
            )

        # Comprobar que no exista una validación previa.
        cursor.execute("""
            SELECT id
            FROM VALIDACION_ENTREGA
            WHERE id_envio = %s
            LIMIT 1
        """, (id,))

        if cursor.fetchone():
            conn.rollback()
            return error_response(
                "Este envío ya cuenta con una validación de entrega.",
                409
            )

        fecha_real = datetime.now()

        cursor.execute("""
            INSERT INTO VALIDACION_ENTREGA (
                id_envio,
                fecha_entrega_real,
                firma_evidencia,
                estado
            )
            VALUES (%s, %s, %s, %s)
        """, (
            id,
            fecha_real,
            firma,
            "entregado"
        ))

        cursor.execute("""
            UPDATE ENVIOS
            SET estado = 'entregado'
            WHERE id = %s
        """, (id,))

        conn.commit()

        return jsonify({
            "exitoso": True,
            "mensaje": "Entrega validada correctamente.",
            "fecha_entrega_real": fecha_real.strftime(
                "%Y-%m-%d %H:%M:%S"
            )
        })

    except Error:
        if conn:
            conn.rollback()

        app.logger.exception("Error al validar entrega")
        return error_response("No fue posible validar la entrega.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# INICIAR SERVIDOR
# =====================================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "3032")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1"
    )
