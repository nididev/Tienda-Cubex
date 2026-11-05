const express = require('express');
const router = express.Router();

const compraController = require('../controllers/compra.controller');

// Consultar compras
router.get('/', compraController.listarCompras);

// Registrar compra
router.post('/', compraController.crearCompra);

module.exports = router;