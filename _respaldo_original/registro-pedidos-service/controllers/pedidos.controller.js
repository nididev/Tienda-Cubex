
const pedidosService = require('../services/pedidos.service');

// Obtener todos los pedidos
const obtenerPedidos = async (req, res) => {
    try {
        const pedidos = await pedidosService.obtenerPedidos();

        return res.status(200).json({
            exitoso: true,
            total: pedidos.length,
            datos: pedidos
        });

    } catch (error) {
        console.error('Error al consultar pedidos:', error);

        return res.status(500).json({
            exitoso: false,
            mensaje: 'Error al consultar los pedidos'
        });
    }
};

// Obtener los pedidos de un usuario específico
const obtenerPedidosPorUsuario = async (req, res) => {
    try {
        const id_usuario = Number(req.params.id_usuario);

        if (!Number.isInteger(id_usuario) || id_usuario <= 0) {
            return res.status(400).json({
                exitoso: false,
                mensaje: 'ID de usuario no válido'
            });
        }

        const pedidos = await pedidosService.obtenerPedidosPorUsuario(id_usuario);

        return res.status(200).json({
            exitoso: true,
            total: pedidos.length,
            datos: pedidos
        });

    } catch (error) {
        console.error('Error al consultar compras del usuario:', error);

        return res.status(500).json({
            exitoso: false,
            mensaje: 'Error al consultar las compras del usuario'
        });
    }
};

// Obtener un pedido por ID
const obtenerPedido = async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                exitoso: false,
                mensaje: 'ID de pedido no válido'
            });
        }

        const pedido = await pedidosService.obtenerPedido(id);

        if (!pedido) {
            return res.status(404).json({
                exitoso: false,
                mensaje: 'Pedido no encontrado'
            });
        }

        return res.status(200).json({
            exitoso: true,
            datos: pedido
        });

    } catch (error) {
        console.error('Error al consultar pedido:', error);

        return res.status(500).json({
            exitoso: false,
            mensaje: 'Error al consultar el pedido'
        });
    }
};

// Registrar un pedido pendiente
const registrarPedido = async (req, res) => {
    try {
        const { id_usuario, id_direccion, productos } = req.body;

        const usuarioId = Number(id_usuario);
        const direccionId = Number(id_direccion);

        if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
            return res.status(400).json({
                exitoso: false,
                mensaje: 'El usuario no es válido'
            });
        }

        if (!Number.isInteger(direccionId) || direccionId <= 0) {
            return res.status(400).json({
                exitoso: false,
                mensaje: 'Selecciona un domicilio válido'
            });
        }

        if (!Array.isArray(productos) || productos.length === 0) {
            return res.status(400).json({
                exitoso: false,
                mensaje: 'El carrito está vacío'
            });
        }

        const nuevoPedido = await pedidosService.registrarPedido({
            id_usuario: usuarioId,
            id_direccion: direccionId,
            productos
        });

        return res.status(201).json({
            exitoso: true,
            mensaje: 'Pedido pendiente registrado correctamente',
            datos: nuevoPedido
        });

    } catch (error) {
        console.error('Error al registrar pedido:', error);

        return res.status(error.status || 500).json({
            exitoso: false,
            mensaje: error.message || 'Error al registrar el pedido'
        });
    }
};

// Confirmar un pedido cuando el pago fue autorizado
const confirmarPago = async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                exitoso: false,
                mensaje: 'ID de pedido no válido'
            });
        }

        const pedido = await pedidosService.confirmarPago(id);

        if (!pedido) {
            return res.status(404).json({
                exitoso: false,
                mensaje: 'Pedido no encontrado'
            });
        }

        return res.status(200).json({
            exitoso: true,
            mensaje: 'Pago autorizado y pedido confirmado correctamente',
            datos: pedido
        });

    } catch (error) {
        console.error('Error al confirmar pago:', error);

        return res.status(error.status || 500).json({
            exitoso: false,
            mensaje: error.message || 'Error al confirmar el pedido'
        });
    }
};

// Actualizar estado administrativo de un pedido
const actualizarEstado = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const estado = String(req.body.estado || '')
            .trim()
            .toLowerCase();

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                exitoso: false,
                mensaje: 'ID de pedido no válido'
            });
        }

        const estadosPermitidos = [
            'pendiente',
            'confirmado',
            'cancelado'
        ];

        if (!estadosPermitidos.includes(estado)) {
            return res.status(400).json({
                exitoso: false,
                mensaje: 'Estado no válido'
            });
        }

        const pedido = await pedidosService.actualizarEstado(id, estado);

        if (!pedido) {
            return res.status(404).json({
                exitoso: false,
                mensaje: 'Pedido no encontrado'
            });
        }

        return res.status(200).json({
            exitoso: true,
            mensaje: 'Estado del pedido actualizado correctamente',
            datos: pedido
        });

    } catch (error) {
        console.error('Error al actualizar estado:', error);

        return res.status(error.status || 500).json({
            exitoso: false,
            mensaje: error.message ||
                'Error al actualizar el estado del pedido'
        });
    }
};

module.exports = {
    obtenerPedidos,
    obtenerPedidosPorUsuario,
    obtenerPedido,
    registrarPedido,
    confirmarPago,
    actualizarEstado
};
