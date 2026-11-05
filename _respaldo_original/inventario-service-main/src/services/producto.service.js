
const pool = require('../config/database');

const obtenerTodos = async () => {
    const [productos] = await pool.query(`
        SELECT
            p.*,
            p.precio AS precio_original,
            CASE
                WHEN o.activa = TRUE THEN o.precio_oferta
                ELSE p.precio
            END AS precio_mostrar,
            CASE
                WHEN o.activa = TRUE THEN TRUE
                ELSE FALSE
            END AS oferta_activa,
            CASE
                WHEN o.activa = TRUE THEN o.porcentaje_descuento
                ELSE 0
            END AS porcentaje_descuento
        FROM productos p
        LEFT JOIN ofertas o
            ON p.id = o.id_producto
        ORDER BY p.id DESC
    `);

    return productos;
};
const obtenerPorId = async (id) => {
    const [productos] = await pool.query(
        'SELECT * FROM productos WHERE id = ?',
        [id]
    );

    return productos[0];
};

const crear = async (producto) => {
    const {
        nombre,
        descripcion,
        lote,
        serie,
        caducidad,
        id_proveedor,
        costo,
        precio,
        imagen
    } = producto;

    const [resultado] = await pool.query(
        `INSERT INTO productos
        (nombre, descripcion, lote, serie, caducidad,
         id_proveedor, costo, precio, imagen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            nombre,
            descripcion || null,
            lote || null,
            serie || null,
            caducidad || null,
            id_proveedor || null,
            costo,
            precio,
            imagen || null
        ]
    );

    return obtenerPorId(resultado.insertId);
};

const actualizar = async (id, producto) => {
    const {
        nombre,
        descripcion,
        lote,
        serie,
        caducidad,
        id_proveedor,
        costo,
        precio,
        imagen
    } = producto;

    await pool.query(
        `UPDATE productos
         SET nombre = ?,
             descripcion = ?,
             lote = ?,
             serie = ?,
             caducidad = ?,
             id_proveedor = ?,
             costo = ?,
             precio = ?,
             imagen = COALESCE(?, imagen)
         WHERE id = ?`,
        [
            nombre,
            descripcion || null,
            lote || null,
            serie || null,
            caducidad || null,
            id_proveedor || null,
            costo,
            precio,
            imagen || null,
            id
        ]
    );

    return obtenerPorId(id);
};

const eliminar = async (id) => {
    const [resultado] = await pool.query(
        'DELETE FROM productos WHERE id = ?',
        [id]
    );

    return resultado.affectedRows;
};

const proveedorExiste = async (idProveedor) => {
    const [proveedores] = await pool.query(
        'SELECT id FROM proveedores WHERE id = ?',
        [idProveedor]
    );

    return proveedores.length > 0;
};

module.exports = {
    obtenerTodos,
    obtenerPorId,
    crear,
    actualizar,
    eliminar,
    proveedorExiste
};
