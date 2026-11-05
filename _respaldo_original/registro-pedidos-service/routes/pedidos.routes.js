
const express = require('express');
const router = express.Router();

const pedidosController = require('../controllers/pedidos.controller');

// Consultar todos los pedidos
router.get('/', pedidosController.obtenerPedidos);

// Consultar los pedidos de un usuario específico
// IMPORTANTE: Esta ruta debe ir antes de /:id
router.get(
    '/usuario/:id_usuario',
    pedidosController.obtenerPedidosPorUsuario
);

// Consultar un pedido por ID
router.get('/:id', pedidosController.obtenerPedido);

// Registrar un pedido pendiente
router.post('/', pedidosController.registrarPedido);

// Confirmar pedido después de autorizar el pago
router.patch('/:id/confirmar-pago', pedidosController.confirmarPago);

// Actualizar estado administrativo de un pedido
router.patch('/:id/estado', pedidosController.actualizarEstado);

module.exports = router;
