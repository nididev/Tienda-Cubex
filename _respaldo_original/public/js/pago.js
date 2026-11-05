/* =========================================================
   CUBEX - PAGO EN LÍNEA
   ========================================================= */

const API_TARJETAS = "http://localhost:3024";
const API_PAGOS = "http://localhost:3012/api/pagos";
const API_PEDIDOS = "http://localhost:3011/api/Pedidos";
const API_TICKETS = "http://localhost:3025";

const obtenerToken = () =>
    localStorage.getItem("cubex_token") ||
    sessionStorage.getItem("cubex_token");

// Elementos HTML
const formulario = document.getElementById("formTarjeta");
const numeroTarjeta = document.getElementById("numeroTarjeta");
const nombreTitular = document.getElementById("nombreTitular");
const mesExpiracion = document.getElementById("mesExpiracion");
const anioExpiracion = document.getElementById("anioExpiracion");
const cvv = document.getElementById("cvv");
const guardarTarjeta = document.getElementById("guardarTarjeta");
const btnPagar = document.getElementById("btnPagar");
const mensajeTarjeta = document.getElementById("mensajeTarjeta");
const contenedorTarjetas = document.getElementById("contenedorTarjetas");
const tarjetaGuardada = document.getElementById("tarjetaGuardada");
const btnNuevaTarjeta = document.getElementById("btnNuevaTarjeta");
const subtotalCompra = document.getElementById("subtotalCompra");
const envioCompra = document.getElementById("envioCompra");
const totalCompra = document.getElementById("totalCompra");
const resultadoPago = document.getElementById("resultadoPago");
const btnDescargarTicket = document.getElementById("btnDescargarTicket");
const folioPedido = document.getElementById("folioPedido");

let tarjetasCliente = [];
let pedidosCliente = [];
let usandoTarjetaGuardada = false;
let pedidoPagadoId = null;

/* =========================================================
   UTILIDADES
   ========================================================= */

function mostrarMensaje(mensaje, tipo = "info") {
    mensajeTarjeta.textContent = mensaje;
    mensajeTarjeta.className = `mensaje ${tipo}`;
}

function limpiarMensaje() {
    mensajeTarjeta.textContent = "";
    mensajeTarjeta.className = "mensaje";
}

function obtenerHeaders() {
    const token = obtenerToken();

    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

async function solicitarNode(ruta, opciones = {}) {
    const respuesta = await fetch(`${API_TARJETAS}${ruta}`, {
        ...opciones,
        headers: {
            ...obtenerHeaders(),
            ...(opciones.headers || {})
        }
    });

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
        throw new Error(
            datos.error ||
            datos.mensaje ||
            datos.detail ||
            `Error del servicio Node (${respuesta.status})`
        );
    }

    return datos;
}

async function solicitarFastAPI(datos) {
    const respuesta = await fetch(API_PAGOS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos)
    });

    const resultado = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
        throw new Error(
            resultado.detail ||
            resultado.error ||
            "Error al procesar el pago."
        );
    }

    return resultado;
}

function normalizarNumero(numero) {
    return numero.replace(/[\s-]/g, "");
}

function formatearMoneda(cantidad) {
    return Number(cantidad).toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN"
    });
}

function obtenerNombreSeparado(nombreCompleto) {
    const partes = nombreCompleto.trim().split(/\s+/);

    return {
        nombre: partes.shift() || "",
        apellidos: partes.join(" ")
    };
}

function obtenerCorreoUsuario() {
    const claves = [
        "cubex_usuario",
        "usuario",
        "user",
        "datosUsuario",
        "cliente"
    ];

    for (const clave of claves) {
        const valor =
            localStorage.getItem(clave) ||
            sessionStorage.getItem(clave);

        if (!valor) continue;

        try {
            const usuario = JSON.parse(valor);

            const correo =
                usuario.correo ||
                usuario.email ||
                usuario.payerEmail;

            if (correo) return correo;

        } catch {
            if (valor.includes("@")) return valor;
        }
    }

    return "";
}

function obtenerCorreo() {
    let correo = obtenerCorreoUsuario();

    if (!correo) {
        correo = prompt("Ingresa tu correo electrónico:");
    }

    return correo ? correo.trim() : "";
}

function obtenerPedidoPendiente() {
    return pedidosCliente.find(
        pedido => String(pedido.estado).toLowerCase() === "pendiente"
    ) || null;
}

function obtenerMontoPedido(pedido) {
    const monto = Number(pedido?.monto);

    if (!Number.isFinite(monto) || monto <= 0) {
        throw new Error("No se pudo obtener el monto del pedido.");
    }

    return monto;
}

/* =========================================================
   CARGAR PEDIDOS
   ========================================================= */

async function cargarPedidosPendientes() {
    const datos = await solicitarNode("/pagos/pedidos-pendientes");

    pedidosCliente = Array.isArray(datos.pedidos)
        ? datos.pedidos
        : [];

    const pedido = obtenerPedidoPendiente();

    if (!pedido) {
        mostrarMensaje(
            "No tienes pedidos pendientes de pago.",
            "error"
        );

        btnPagar.disabled = true;
        return;
    }

    const monto = obtenerMontoPedido(pedido);

    subtotalCompra.textContent = formatearMoneda(monto);
    totalCompra.textContent = formatearMoneda(monto);
    envioCompra.textContent = "Incluido en el pedido";
}

/* =========================================================
   CARGAR TARJETAS
   ========================================================= */

async function cargarTarjetas() {
    const datos = await solicitarNode("/tarjetas");

    tarjetasCliente = Array.isArray(datos.tarjetas)
        ? datos.tarjetas
        : [];

    if (!tarjetasCliente.length) {
        contenedorTarjetas.hidden = true;
        return;
    }

    contenedorTarjetas.hidden = false;

    tarjetaGuardada.innerHTML =
        '<option value="">Selecciona una tarjeta</option>';

    tarjetasCliente.forEach(tarjeta => {
        const opcion = document.createElement("option");

        opcion.value = tarjeta.id;

        opcion.textContent =
            `${tarjeta.marca} ${tarjeta.mascara}` +
            (tarjeta.vencida ? " (VENCIDA)" : "");

        if (!tarjeta.verificada || tarjeta.vencida) {
            opcion.disabled = true;
        }

        tarjetaGuardada.appendChild(opcion);
    });
}

/* =========================================================
   TARJETA NUEVA O GUARDADA
   ========================================================= */

function habilitarNuevaTarjeta() {
    usandoTarjetaGuardada = false;

    formulario.reset();

    nombreTitular.disabled = false;
    numeroTarjeta.disabled = false;
    mesExpiracion.disabled = false;
    anioExpiracion.disabled = false;
    guardarTarjeta.disabled = false;
    cvv.disabled = false;

    tarjetaGuardada.value = "";

    limpiarMensaje();
}

tarjetaGuardada.addEventListener("change", () => {
    usandoTarjetaGuardada = Boolean(tarjetaGuardada.value);

    if (usandoTarjetaGuardada) {
        formulario.reset();

        nombreTitular.disabled = true;
        numeroTarjeta.disabled = true;
        mesExpiracion.disabled = true;
        anioExpiracion.disabled = true;
        guardarTarjeta.disabled = true;

        guardarTarjeta.checked = false;
        cvv.disabled = false;
        cvv.focus();

        mostrarMensaje(
            "Tarjeta seleccionada. Ingresa su CVV.",
            "info"
        );

    } else {
        habilitarNuevaTarjeta();
    }
});

btnNuevaTarjeta.addEventListener("click", habilitarNuevaTarjeta);

/* =========================================================
   FORMATO Y AÑOS
   ========================================================= */

numeroTarjeta.addEventListener("input", () => {
    const numero = normalizarNumero(numeroTarjeta.value)
        .replace(/\D/g, "")
        .slice(0, 19);

    numeroTarjeta.value =
        numero.replace(/(.{4})/g, "$1 ").trim();
});

function cargarAnios() {
    const actual = new Date().getFullYear();

    anioExpiracion.innerHTML =
        '<option value="">Año</option>';

    for (let i = 0; i <= 20; i++) {
        const anio = actual + i;

        const opcion = document.createElement("option");

        opcion.value = String(anio);
        opcion.textContent = String(anio);

        anioExpiracion.appendChild(opcion);
    }
}

/* =========================================================
   VALIDAR Y REGISTRAR TARJETA
   ========================================================= */

async function validarTarjetaNode() {
    const datos = {
        numero: normalizarNumero(numeroTarjeta.value),
        mes: mesExpiracion.value,
        anio: anioExpiracion.value,
        cvv: cvv.value
    };

    const resultado = await solicitarNode("/tarjetas/verificar", {
        method: "POST",
        body: JSON.stringify(datos)
    });

    if (!resultado.valida) {
        throw new Error(
            Array.isArray(resultado.errores)
                ? resultado.errores.join(" ")
                : "Los datos de la tarjeta no son válidos."
        );
    }

    return datos;
}

async function registrarTarjetaNode(datos) {
    return await solicitarNode("/tarjetas", {
        method: "POST",
        body: JSON.stringify(datos)
    });
}

/* =========================================================
   CONFIRMAR PEDIDO PAGADO
   ========================================================= */

// Después de autorizar el pago, se llama al microservicio
// de pedidos (puerto 3011) para cambiar el estado en MySQL.

async function confirmarPedidoPagado(idPedido, pago) {
    const respuesta = await fetch(
        `${API_PEDIDOS}/${idPedido}/confirmar-pago`,
        {
            method: "PATCH",
            headers: obtenerHeaders()
        }
    );

    const resultado = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok || resultado.exitoso === false) {
        throw new Error(
            resultado.mensaje ||
            resultado.error ||
            "El pago fue autorizado, pero no se pudo confirmar el pedido en MySQL."
        );
    }

    const pedidoActualizado =
        resultado.pedido || resultado.data || resultado;

    const estado = String(
        pedidoActualizado.estado || resultado.estado || ""
    ).toLowerCase();

    if (estado && estado !== "confirmado") {
        throw new Error(
            resultado.mensaje ||
            `El pedido respondió con estado "${estado}" en lugar de "confirmado".`
        );
    }

    return resultado;
}

/* =========================================================
   MOSTRAR CONFIRMACIÓN Y TICKET
   ========================================================= */

function mostrarPagoExitoso(idPedido) {
    pedidoPagadoId = idPedido;

    formulario.hidden = true;

    document.getElementById("seccionTarjeta").hidden = true;

    resultadoPago.hidden = false;

    folioPedido.textContent = `Pedido #${idPedido}`;

    btnPagar.disabled = true;
}

/* =========================================================
   DESCARGAR TICKET
   ========================================================= */

async function descargarTicket(idPedido) {
    const respuesta = await fetch(
        `${API_TICKETS}/api/tickets/${idPedido}`,
        {
            headers: obtenerHeaders()
        }
    );

    if (!respuesta.ok) {
        const error = await respuesta.json().catch(() => ({}));

        throw new Error(
            error.detail ||
            "No se pudo generar el ticket. Verifica que el pedido esté confirmado."
        );
    }

    const archivo = await respuesta.blob();

    const url = URL.createObjectURL(archivo);

    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = `CUBEX-ticket-${idPedido}.pdf`;

    document.body.appendChild(enlace);

    enlace.click();
    enlace.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

btnDescargarTicket.addEventListener("click", async () => {
    try {
        btnDescargarTicket.disabled = true;

        btnDescargarTicket.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Generando ticket...';

        await descargarTicket(pedidoPagadoId);

    } catch (error) {
        mostrarMensaje(error.message, "error");

    } finally {
        btnDescargarTicket.disabled = false;

        btnDescargarTicket.innerHTML =
            '<i class="fa-solid fa-download"></i> Descargar ticket PDF';
    }
});

/* =========================================================
   PAGO CON TARJETA NUEVA
   ========================================================= */

async function pagarConTarjetaNueva() {
    mostrarMensaje("Verificando los datos de tu tarjeta...", "info");

    const datosTarjeta = await validarTarjetaNode();

    const pedido = obtenerPedidoPendiente();

    const monto = obtenerMontoPedido(pedido);

    const nombre = obtenerNombreSeparado(nombreTitular.value);

    const correo = obtenerCorreo();

    if (!nombre.nombre || !nombre.apellidos) {
        throw new Error("Ingresa tu nombre y apellidos completos.");
    }

    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        throw new Error("Ingresa un correo electrónico válido.");
    }

    mostrarMensaje("Procesando el pago...", "info");

    const pago = await solicitarFastAPI({
        amount: monto,
        currency: "MXN",
        nombre: nombre.nombre,
        apellidos: nombre.apellidos,
        payerEmail: correo,
        cardNumber: datosTarjeta.numero,
        cvv: datosTarjeta.cvv,

        expiry:
            `${datosTarjeta.mes}/${datosTarjeta.anio.slice(-2)}`,

        description: `Compra CUBEX - Pedido ${pedido.id}`,
        externalReference: String(pedido.id)
    });

    if (pago.status !== "APPROVED") {
        throw new Error(
            pago.message ||
            pago.mensaje ||
            "El pago fue rechazado."
        );
    }

    // Guardar tarjeta solo si el cliente lo solicitó.
    if (guardarTarjeta.checked) {
        try {
            await registrarTarjetaNode(datosTarjeta);

        } catch (error) {
            console.error(
                "No se pudo guardar la tarjeta:",
                error
            );
        }
    }

    // Confirmar el pedido en la tabla pedidos de MySQL.
    await confirmarPedidoPagado(pedido.id, pago);

    mostrarMensaje("¡Pago realizado con éxito!", "success");

    mostrarPagoExitoso(pedido.id);
}

/* =========================================================
   PAGO CON TARJETA GUARDADA
   ========================================================= */

async function pagarConTarjetaGuardada() {
    const idTarjeta = tarjetaGuardada.value;

    const codigo = cvv.value.trim();

    if (!idTarjeta) {
        throw new Error("Selecciona una tarjeta guardada.");
    }

    if (!codigo) {
        throw new Error("Ingresa el CVV de tu tarjeta.");
    }

    const pedido = obtenerPedidoPendiente();

    if (!pedido) {
        throw new Error("No se encontró un pedido pendiente.");
    }

    mostrarMensaje(
        "Verificando y autorizando el pago...",
        "info"
    );

    const resultado = await solicitarNode("/pagos/verificar-tarjeta", {
        method: "POST",

        body: JSON.stringify({
            idTarjeta: Number(idTarjeta),
            cvv: codigo,
            idPedido: pedido.id
        })
    });

    if (!resultado.aprobado) {
        throw new Error(
            resultado.error ||
            "El pago no pudo ser autorizado."
        );
    }

    // El pago fue autorizado; confirmar pedido en el microservicio 3011.
    await confirmarPedidoPagado(pedido.id, resultado);

    mostrarMensaje("¡Pago realizado con éxito!", "success");

    mostrarPagoExitoso(pedido.id);
}

/* =========================================================
   BOTÓN PAGAR
   ========================================================= */

formulario.addEventListener("submit", async event => {
    event.preventDefault();

    if (!obtenerToken()) {
        mostrarMensaje(
            "Debes iniciar sesión para realizar una compra.",
            "error"
        );

        return;
    }

    limpiarMensaje();

    btnPagar.disabled = true;

    btnPagar.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

    try {
        if (usandoTarjetaGuardada) {
            await pagarConTarjetaGuardada();

        } else {
            await pagarConTarjetaNueva();
        }

    } catch (error) {
        console.error("Error al procesar el pago:", error);

        mostrarMensaje(
            error.message ||
            "Ocurrió un error al procesar el pago.",
            "error"
        );

        btnPagar.disabled = false;

        btnPagar.innerHTML =
            '<i class="fa-solid fa-lock"></i> Verificar y pagar';
    }
});

/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

async function inicializarPago() {
    cargarAnios();

    if (!obtenerToken()) {
        mostrarMensaje(
            "Inicia sesión para consultar tus tarjetas y pedidos.",
            "error"
        );

        btnPagar.disabled = true;

        return;
    }

    try {
        await Promise.all([
            cargarPedidosPendientes(),
            cargarTarjetas()
        ]);

    } catch (error) {
        console.error(
            "Error al inicializar el pago:",
            error
        );

        mostrarMensaje(
            error.message ||
            "No se pudieron cargar tus datos. Comprueba que Node esté funcionando.",
            "error"
        );
    }
}

document.addEventListener("DOMContentLoaded", inicializarPago);