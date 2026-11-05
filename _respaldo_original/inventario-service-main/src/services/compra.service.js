const pool = require('../config/database');

// Registrar una compra y actualizar el inventario
const registrarCompra = async ({
    id_proveedor,
    id_usuario,
    id_producto,
    cantidad,
    costo_unitario,
    fecha
}) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Verificar que exista el proveedor
        const [proveedores] = await connection.execute(
            'SELECT id FROM proveedores WHERE id = ?',
            [id_proveedor]
        );

        if (proveedores.length === 0) {
            throw new Error('El proveedor no existe');
        }

        // Verificar que exista el producto
        const [productos] = await connection.execute(
            'SELECT id FROM productos WHERE id = ?',
            [id_producto]
        );

        if (productos.length === 0) {
            throw new Error('El producto no existe');
        }

        // Verificar que exista el usuario
        const [usuarios] = await connection.execute(
            'SELECT id FROM usuarios WHERE id = ?',
            [id_usuario]
        );

        if (usuarios.length === 0) {
            throw new Error('El usuario no existe');
        }

        const total = Number(
            (Number(cantidad) * Number(costo_unitario)).toFixed(2)
        );

        // Registrar encabezado de la compra
        let resultadoCompra;

        if (fecha) {
            [resultadoCompra] = await connection.execute(
                `INSERT INTO compras
                (id_proveedor, id_usuario, fecha, total, estado)
                VALUES (?, ?, ?, ?, ?)`,
                [
                    id_proveedor,
                    id_usuario,
                    `${fecha} 00:00:00`,
                    total,
                    'Recibida'
                ]
            );
        } else {
            [resultadoCompra] = await connection.execute(
                `INSERT INTO compras
                (id_proveedor, id_usuario, total, estado)
                VALUES (?, ?, ?, ?)`,
                [
                    id_proveedor,
                    id_usuario,
                    total,
                    'Recibida'
                ]
            );
        }

        const id_compra = resultadoCompra.insertId;

        // Registrar el detalle de la compra
        await connection.execute(
            `INSERT INTO detalle_compras
            (id_compra, id_producto, cantidad, costo_unitario)
            VALUES (?, ?, ?, ?)`,
            [
                id_compra,
                id_producto,
                cantidad,
                costo_unitario
            ]
        );

        // Aumentar las existencias del producto.
        // Si todavía no existe un registro de stock, lo crea.
        await connection.execute(
            `INSERT INTO stock
            (id_producto, stock_actual, stock_minimo, stock_maximo)
            VALUES (?, ?, 0, 0)
            ON DUPLICATE KEY UPDATE
            stock_actual = stock_actual + ?`,
            [
                id_producto,
                cantidad,
                cantidad
            ]
        );

        await connection.commit();

        return {
            id: id_compra,
            id_proveedor,
            id_usuario,
            id_producto,
            cantidad,
            costo_unitario,
            total,
            fecha,
            estado: 'Recibida'
        };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
};


// Consultar las compras registradas
// Consultar las compras registradas con sus detalles
const obtenerCompras = async () => {
    const [compras] = await pool.execute(`
        SELECT
            c.id,
            c.fecha,
            c.total,
            c.estado,
            p.nombre AS proveedor,
            pr.nombre AS producto,
            dc.cantidad,
            dc.costo_unitario,
            c.id_usuario
        FROM compras c
        INNER JOIN proveedores p
            ON c.id_proveedor = p.id
        INNER JOIN usuarios u
            ON c.id_usuario = u.id
        INNER JOIN detalle_compras dc
            ON c.id = dc.id_compra
        INNER JOIN productos pr
            ON dc.id_producto = pr.id
        ORDER BY c.id DESC
    `);

    return compras;
};


module.exports = {
    registrarCompra,
    obtenerCompras
};