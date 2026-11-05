const express = require('express');
const router = express.Router();

const stockController = require('../controllers/stock.controller');

// Consultar inventario
router.get('/', stockController.obtenerInventario);

// Registrar o actualizar existencias
router.put('/:id_producto', stockController.guardarStock);

module.exports = router;