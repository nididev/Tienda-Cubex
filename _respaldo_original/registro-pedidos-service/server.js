
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const pool = require('./config/database');
const pedidosRoutes = require('./routes/pedidos.routes');

// Configuración
app.use(cors({
    origin: [
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ]
}));

app.use(express.json());

// Rutas de pedidos
app.use('/api/Pedidos', pedidosRoutes);

// Verificar funcionamiento
app.get('/api/salud', (req, res) => {
    res.json({
        exitoso: true,
        mensaje: 'Microservicio de pedidos CUBEX funcionando'
    });
});

// Verificar conexión con MySQL
app.get('/api/conexion', async (req, res) => {
    try {
        const [resultado] = await pool.query(
            'SELECT DATABASE() AS base'
        );

        res.json({
            exitoso: true,
            mensaje: 'Conexión a MySQL correcta',
            base: resultado[0].base
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            exitoso: false,
            mensaje: 'Error al conectar con MySQL'
        });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3011;

app.listen(PORT, () => {
    console.log(`🚀 Pedidos CUBEX ejecutándose en http://localhost:${PORT}`);
});
