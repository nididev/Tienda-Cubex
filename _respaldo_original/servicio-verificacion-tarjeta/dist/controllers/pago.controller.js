"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pedidosPendientes = pedidosPendientes;
exports.verificarTarjetaPago = verificarTarjetaPago;
const prisma_1 = require("../config/prisma");
const tarjeta_1 = require("../utils/tarjeta");
const pasarelaSimulada_1 = require("../services/pasarelaSimulada");
const limiteIntentos_1 = require("../utils/limiteIntentos");
const cliente_1 = require("../utils/cliente");
const tokenTarjeta_1 = require("../utils/tokenTarjeta");
// Consulta el carrito y sus productos.
async function obtenerCarritoCliente(idCliente) {
    return prisma_1.prisma.carrito.findFirst({
        where: {
            id_cliente: idCliente
        },
        include: {
            detalle_carrito: {
                include: {
                    productos: true
                }
            }
        },
        orderBy: {
            id: "desc"
        }
    });
}
// Calcula el importe directamente desde los productos del carrito.
function calcularTotalCarrito(detalle) {
    const total = detalle.reduce((suma, item) => {
        return suma +
            Number(item.productos.precio.toString()) * item.cantidad;
    }, 0);
    return Math.round(total * 100) / 100;
}
// GET /pagos/pedidos-pendientes
// Devuelve el carrito como compra pendiente.
async function pedidosPendientes(req, res) {
    const cliente = await (0, cliente_1.obtenerClienteDeUsuario)(req.usuario.idUsuario);
    if (!cliente) {
        res.status(403).json({
            error: "El usuario no tiene perfil de cliente"
        });
        return;
    }
    const carrito = await obtenerCarritoCliente(cliente.id);
    if (!carrito || carrito.detalle_carrito.length === 0) {
        res.status(404).json({
            error: "No tienes productos en tu carrito"
        });
        return;
    }
    const articulos = carrito.detalle_carrito.map(item => ({
        idProducto: item.id_producto,
        producto: item.productos.nombre,
        cantidad: item.cantidad,
        precio: Number(item.productos.precio.toString()),
        subtotal: Number(item.productos.precio.toString()) * item.cantidad
    }));
    const monto = calcularTotalCarrito(carrito.detalle_carrito);
    res.status(200).json({
        exito: true,
        mensaje: "Carrito obtenido correctamente",
        pedidos: [
            {
                id: carrito.id,
                idCarrito: carrito.id,
                estado: "pendiente",
                articulos,
                monto
            }
        ],
        carrito: {
            id: carrito.id,
            articulos,
            monto
        }
    });
}
// POST /pagos/verificar-tarjeta
// Autoriza el pago tomando el importe del carrito del cliente.
async function verificarTarjetaPago(req, res) {
    const idUsuario = req.usuario.idUsuario;
    const cliente = await (0, cliente_1.obtenerClienteDeUsuario)(idUsuario);
    if (!cliente) {
        res.status(403).json({
            error: "El usuario no tiene perfil de cliente"
        });
        return;
    }
    const { idTarjeta, cvv } = req.body || {};
    const tarjetaId = Number(idTarjeta);
    if (!Number.isInteger(tarjetaId) || tarjetaId <= 0) {
        res.status(400).json({
            error: "idTarjeta es requerido"
        });
        return;
    }
    // Obtener el carrito del cliente.
    const carrito = await obtenerCarritoCliente(cliente.id);
    if (!carrito || carrito.detalle_carrito.length === 0) {
        res.status(409).json({
            error: "No tienes productos en tu carrito para pagar"
        });
        return;
    }
    // Calcular el monto real desde la base de datos.
    const monto = calcularTotalCarrito(carrito.detalle_carrito);
    if (monto <= 0) {
        res.status(422).json({
            error: "El monto del carrito no es válido"
        });
        return;
    }
    // Buscar la tarjeta perteneciente al cliente.
    const tarjeta = await prisma_1.prisma.tarjetas.findFirst({
        where: {
            id: tarjetaId,
            id_cliente: cliente.id
        }
    });
    if (!tarjeta) {
        res.status(404).json({
            error: "Tarjeta no encontrada"
        });
        return;
    }
    if (!tarjeta.verificada) {
        res.status(422).json({
            aprobado: false,
            codigo: "tarjeta_no_verificada",
            error: "La tarjeta no ha sido verificada"
        });
        return;
    }
    // Leer los datos protegidos de la tarjeta.
    const meta = (0, tokenTarjeta_1.leerTokenTarjeta)(tarjeta.token_pago);
    if (!meta) {
        res.status(422).json({
            aprobado: false,
            codigo: "token_tarjeta_invalido",
            error: "No se pudieron validar los datos protegidos de la tarjeta. Regístrala nuevamente."
        });
        return;
    }
    // Validar vencimiento.
    if (!(0, tarjeta_1.validarExpiracion)(meta.mes, meta.anio).valida) {
        (0, limiteIntentos_1.registrarFallo)(idUsuario);
        res.status(422).json({
            aprobado: false,
            codigo: "tarjeta_vencida",
            error: "La tarjeta está vencida"
        });
        return;
    }
    const marca = meta.marca;
    // Validar CVV.
    if (!(0, tarjeta_1.validarCvv)(cvv, marca)) {
        (0, limiteIntentos_1.registrarFallo)(idUsuario);
        res.status(422).json({
            aprobado: false,
            codigo: "cvv_invalido",
            error: marca === "AMEX"
                ? "El CVV debe tener 4 dígitos"
                : "El CVV debe tener 3 dígitos"
        });
        return;
    }
    // Autorizar el importe del carrito.
    const respuesta = (0, pasarelaSimulada_1.autorizarTarjeta)({
        marca,
        ultimosDigitos: tarjeta.ultimos_digitos || "",
        monto,
        contexto: "pago"
    });
    if (!respuesta.aprobada) {
        (0, limiteIntentos_1.registrarFallo)(idUsuario);
        res.status(402).json({
            aprobado: false,
            codigo: respuesta.codigo,
            error: respuesta.mensaje
        });
        return;
    }
    // Respuesta exitosa.
    res.status(200).json({
        aprobado: true,
        codigo: respuesta.codigo,
        mensaje: respuesta.mensaje,
        codigoAutorizacion: respuesta.codigoAutorizacion,
        tarjeta: {
            id: tarjeta.id,
            marca,
            mascara: (0, tarjeta_1.mascararNumero)(marca, tarjeta.ultimos_digitos || "")
        },
        idCarrito: carrito.id,
        idPedido: null,
        monto,
        articulos: carrito.detalle_carrito.map(item => ({
            producto: item.productos.nombre,
            cantidad: item.cantidad
        }))
    });
}
