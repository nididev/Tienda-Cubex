const express = require('express');
const router = express.Router();

const ofertasController = require('../controllers/ofertas.controller');

router.get('/activas', ofertasController.obtenerOfertasActivas);

router.post('/evaluar-descuento', ofertasController.evaluarDescuento);
router.post('/:id/aplicar', ofertasController.aplicarOferta);
router.put('/:id/desactivar', ofertasController.desactivarOferta);

module.exports = router;