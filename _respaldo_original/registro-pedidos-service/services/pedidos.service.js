
const pool = require('../config/database');

// ========================================
// CONSULTAR TODOS LOS PEDIDOS
// ========================================
const obtenerPedidos = async () => {
    const [pedidos] = await pool.query(`
        SELECT *
        FROM pedidos
        ORDER BY fecha DESC
    `);

    return pedidos;
};

// ========================================
// CONSULTAR LAS COMPRAS DE UN USUARIO
// ========================================
const obtenerPedidosPorUsuario = async (id_usuario) => {
    const [pedidos] = await pool.query(`
        SELECT
            p.*
        FROM pedidos p
        INNER JOIN clientes c
            ON c.id = p.id_cliente
        WHERE c.id_usuario = ?
        ORDER BY p.fecha DESC
    `, [id_usuario]);

    return pedidos;
};

// ========================================
// CONSULTAR UN PEDIDO POR ID
// ========================================
const obtenerPedido = async (id) => {
    const [pedidos] = await pool.query(
        'SELECT * FROM pedidos WHERE id = ?',
        [id]
    );

    return pedidos[0] || null;
};

// ========================================
// REGISTRAR UN PEDIDO PENDIENTE
// ========================================
const registrarPedido = async (datos) => {
    const conexion = await pool.getConnection();

    try {
        await conexion.beginTransaction();

        const { id_usuario, id_direccion, productos } = datos;

        // Validar datos
        if (!id_usuario || !id_direccion) {
            const error = new Error(
                'Falta el usuario o el domicilio del pedido'
            );
            error.status = 400;
            throw error;
        }

        if (!Array.isArray(productos) || productos.length === 0) {
            const error = new Error(
                'El carrito no contiene productos'
            );
            error.status = 400;
            throw error;
        }

        // Buscar cliente
        const [clientes] = await conexion.query(
            `SELECT id
             FROM clientes
             WHERE id_usuario = ?
             LIMIT 1`,
            [id_usuario]
        );

        if (clientes.length === 0) {
            const error = new Error(
                'No existe un cliente asociado a este usuario'
            );
            error.status = 404;
            throw error;
        }

        const id_cliente = clientes[0].id;

        // Verificar domicilio
        const [direcciones] = await conexion.query(
            `SELECT id
             FROM direcciones
             WHERE id = ? AND id_cliente = ?
             LIMIT 1`,
            [id_direccion, id_cliente]
        );

        if (direcciones.length === 0) {
            const error = new Error(
                'El domicilio no existe o no pertenece al cliente'
            );
            error.status = 400;
            throw error;
        }

        // Obtener tipo de pago
        const [tiposPago] = await conexion.query(
            `SELECT id
             FROM tipos_pago
             WHERE nombre = 'Tarjeta'
             LIMIT 1`
        );

        if (tiposPago.length === 0) {
            const error = new Error(
                'No está registrado el tipo de pago Tarjeta'
            );
            error.status = 400;
            throw error;
        }

        const id_tipo_pago = tiposPago[0].id;

        // Validar productos
        const productosValidados = [];

        for (const producto of productos) {
            const id_producto = Number(producto.id);
            const cantidad = Number(producto.cantidad);

            if (
                !Number.isInteger(id_producto) ||
                id_producto <= 0 ||
                !Number.isInteger(cantidad) ||
                cantidad <= 0
            ) {
                const error = new Error(
                    'Hay productos o cantidades no válidas'
                );
                error.status = 400;
                throw error;
            }

            const [existentes] = await conexion.query(
                `SELECT id
                 FROM productos
                 WHERE id = ?
                 LIMIT 1`,
                [id_producto]
            );

            if (existentes.length === 0) {
                const error = new Error(
                    `El producto ${id_producto} no existe`
                );
                error.status = 400;
                throw error;
            }

            productosValidados.push({
                id: id_producto,
                cantidad
            });
        }

        // Crear carrito cerrado
        const [nuevoCarrito] = await conexion.query(
            `INSERT INTO carrito (id_cliente, estado)
             VALUES (?, 'cerrado')`,
            [id_cliente]
        );

        const id_carrito = nuevoCarrito.insertId;

        // Guardar productos
        for (const producto of productosValidados) {
            await conexion.query(
                `INSERT INTO detalle_carrito
                    (id_carrito, id_producto, cantidad)
                 VALUES (?, ?, ?)`,
                [
                    id_carrito,
                    producto.id,
                    producto.cantidad
                ]
            );
        }

        // Crear pedido pendiente
        const [resultadoPedido] = await conexion.query(
            `INSERT INTO pedidos
                (id_carrito, id_cliente, id_direccion,
                 id_tipo_pago, id_tarjeta, fecha, estado)
             VALUES (?, ?, ?, ?, NULL, NOW(), 'pendiente')`,
            [
                id_carrito,
                id_cliente,
                id_direccion,
                id_tipo_pago
            ]
        );

        const id_pedido = resultadoPedido.insertId;

        await conexion.commit();

        return await obtenerPedido(id_pedido);

    } catch (error) {
        await conexion.rollback();
        throw error;

    } finally {
        conexion.release();
    }
};

// ========================================
// CONFIRMAR PEDIDO DESPUÉS DEL PAGO
// ========================================
const confirmarPago = async (id) => {

    const pedidoActual = await obtenerPedido(id);

    if (!pedidoActual) {
        return null;
    }

    if (String(pedidoActual.estado).toLowerCase() === 'confirmado') {
        return pedidoActual;
    }

    if (String(pedidoActual.estado).toLowerCase() === 'cancelado') {
        const error = new Error(
            'No se puede confirmar un pedido cancelado'
        );
        error.status = 409;
        throw error;
    }

    const [resultado] = await pool.query(
        `UPDATE pedidos
         SET estado = 'confirmado'
         WHERE id = ?
         AND LOWER(estado) = 'pendiente'`,
        [id]
    );

    if (resultado.affectedRows === 0) {
        const pedido = await obtenerPedido(id);

        if (
            pedido &&
            String(pedido.estado).toLowerCase() === 'confirmado'
        ) {
            return pedido;
        }

        const error = new Error(
            'No fue posible confirmar el pedido'
        );
        error.status = 409;
        throw error;
    }

    return await obtenerPedido(id);
};

// ========================================
// ACTUALIZAR ESTADO ADMINISTRATIVO
// ========================================
const actualizarEstado = async (id, estado) => {
    const estadosPermitidos = [
        'pendiente',
        'confirmado',
        'cancelado'
    ];

    if (!estadosPermitidos.includes(String(estado).toLowerCase())) {
        const error = new Error(
            'El estado del pedido no es válido'
        );
        error.status = 400;
        throw error;
    }

    const [resultado] = await pool.query(
        `UPDATE pedidos
         SET estado = ?
         WHERE id = ?`,
        [String(estado).toLowerCase(), id]
    );

    if (resultado.affectedRows === 0) {
        return null;
    }

    return await obtenerPedido(id);
};

// ========================================
// EXPORTAR FUNCIONES
// ========================================
module.exports = {
    obtenerPedidos,
    obtenerPedidosPorUsuario,
    obtenerPedido,
    registrarPedido,
    confirmarPago,
    actualizarEstado
};
