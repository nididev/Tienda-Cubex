
const express = require('express');
const router = express.Router();

const productoController = require('../controllers/producto.controller');
const { validarId, validarProducto } = require('../middlewares/validarProducto');
const uploadImagen = require('../middlewares/uploadImagen');

// Consultar todos los productos
router.get('/', productoController.obtenerProductos);

// Consultar producto por ID
router.get('/:id', validarId, productoController.obtenerProductoPorId);

// Registrar producto con fotografía
router.post(
    '/',
    uploadImagen.single('imagen'),
    (req, res, next) => {
        if (req.file) {
            req.body.imagen = `/uploads/${req.file.filename}`;
        }
        next();
    },
    validarProducto,
    productoController.crearProducto
);

// Actualizar producto y, opcionalmente, su fotografía
router.put(
    '/:id',
    validarId,
    uploadImagen.single('imagen'),
    (req, res, next) => {
        if (req.file) {
            req.body.imagen = `/uploads/${req.file.filename}`;
        }
        next();
    },
    validarProducto,
    productoController.actualizarProducto
);

// Eliminar producto
router.delete('/:id', validarId, productoController.eliminarProducto);

module.exports = router;
