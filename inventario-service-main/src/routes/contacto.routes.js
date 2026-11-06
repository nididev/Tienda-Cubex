
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// Remitente: la cuenta de Gmail del .env, o la de MAIL_FROM / SMTP_USER
// (las mismas de recuperar contraseña) cuando se publica en la nube.
function remitenteCorreo() {
    const desde = process.env.MAIL_FROM || '';
    const coincidencia = desde.match(/<([^>]+)>/);

    return process.env.GMAIL_USER ||
        (coincidencia ? coincidencia[1].trim() : desde.trim()) ||
        process.env.SMTP_USER ||
        'cubexshop2@gmail.com';
}

// En Railway los puertos SMTP están bloqueados en el plan de prueba;
// si existe BREVO_API_KEY el correo se envía por la API HTTPS de Brevo.
async function enviarCorreo(datos) {
    const claveBrevo = process.env.BREVO_API_KEY;

    if (!claveBrevo) {
        await transporter.sendMail(datos);
        return;
    }

    const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': claveBrevo,
            'content-type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify({
            sender: { name: 'CUBEX', email: remitenteCorreo() },
            to: [{ email: datos.to }],
            replyTo: { email: datos.replyTo },
            subject: datos.subject,
            textContent: datos.text
        })
    });

    if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => '');
        throw new Error(`Brevo rechazó el envío (${respuesta.status}): ${detalle.slice(0, 300)}`);
    }
}

router.post('/', async (req, res) => {
    try {
        const { nombre, correo, asunto, mensaje } = req.body;

        if (!nombre || !correo || !asunto || !mensaje) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son obligatorios.'
            });
        }

        const correoValido =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);

        if (!correoValido) {
            return res.status(400).json({
                success: false,
                message: 'El correo del usuario no es válido.'
            });
        }

        const datosCorreo = {
            from: `"CUBEX" <${remitenteCorreo()}>`,
            to: 'cubexshop2@gmail.com',
            replyTo: correo,
            subject: `Contacto CUBEX: ${asunto}`,
            text: `
Nuevo mensaje recibido desde CUBEX.

Nombre: ${nombre}
Correo del usuario: ${correo}
Asunto: ${asunto}

Mensaje:
${mensaje}
            `
        };

        await enviarCorreo(datosCorreo);

        return res.json({
            success: true,
            message: 'Mensaje enviado correctamente.'
        });

    } catch (error) {
        console.error('Error al enviar correo:', error);

        return res.status(500).json({
            success: false,
            message: 'No fue posible enviar el correo.'
        });
    }
});

module.exports = router;
