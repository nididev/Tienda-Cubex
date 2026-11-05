document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // 1. VALIDAR SESIÓN Y ROL
    // =========================================

    const token = sessionStorage.getItem("cubex_token");
    const usuarioGuardado = sessionStorage.getItem("cubex_usuario");

    const tabla = document.getElementById("tablaPedidos");
    const mensaje = document.getElementById("mensajePedidos");

    if (!token || !usuarioGuardado) {
        mostrarMensaje("Tu sesión no está activa. Inicia sesión nuevamente.", "error");
        return;
    }

    let usuario;

    try {
        usuario = JSON.parse(usuarioGuardado);
    } catch (error) {
        mostrarMensaje("No fue posible validar la sesión. Vuelve a iniciar sesión.", "error");
        return;
    }

    if (!usuario || usuario.rol !== "ADMIN") {
        mostrarMensaje("No tienes permisos para administrar los pedidos.", "error");
        return;
    }

    // =========================================
    // 2. CONFIGURACIÓN
    // =========================================

    const API_PEDIDOS = "http://localhost:3011/api/Pedidos";

    let listaPedidos = [];

    const busqueda = document.getElementById("buscarPedido");
    const filtroEstado = document.getElementById("filtroEstado");

    const modal = document.getElementById("modalPedido");
    const contenidoDetalle = document.getElementById("contenidoDetallePedido");

    // =========================================
    // 3. FUNCIONES AUXILIARES
    // =========================================

    function escaparHTML(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[caracter]);
    }

    function normalizarEstado(estado) {
        return String(estado ?? "").trim().toLowerCase();
    }

    function mostrarMensaje(texto, tipo = "exito") {

        if (!mensaje) return;

        mensaje.textContent = texto;
        mensaje.className = `pedidos-mensaje ${tipo}`;
    }

    function ocultarMensaje() {

        if (!mensaje) return;

        mensaje.textContent = "";
        mensaje.className = "pedidos-mensaje";
    }

    // =========================================
    // 4. ACTUALIZAR ESTADÍSTICAS
    // =========================================

    function actualizarEstadisticas() {

        const total = listaPedidos.length;

        const pendientes = listaPedidos.filter(
            pedido => normalizarEstado(pedido.estado) === "pendiente"
        ).length;

        const confirmados = listaPedidos.filter(
            pedido => normalizarEstado(pedido.estado) === "confirmado"
        ).length;

        const elementoTotal = document.getElementById("totalPedidos");
        const elementoPendientes = document.getElementById("pedidosPendientes");
        const elementoConfirmados = document.getElementById("pedidosConfirmados");

        if (elementoTotal) {
            elementoTotal.textContent = total;
        }

        if (elementoPendientes) {
            elementoPendientes.textContent = pendientes;
        }

        if (elementoConfirmados) {
            elementoConfirmados.textContent = confirmados;
        }
    }

    // =========================================
    // 5. CARGAR PEDIDOS DESDE LA API
    // =========================================

    async function cargarPedidos() {

        if (!tabla) return;

        tabla.innerHTML = `
            <tr>
                <td colspan="5" class="pedidos-vacio">
                    Cargando pedidos...
                </td>
            </tr>
        `;

        ocultarMensaje();

        try {

            const respuesta = await fetch(API_PEDIDOS, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!respuesta.ok) {
                throw new Error(
                    `No se pudieron consultar los pedidos (HTTP ${respuesta.status}).`
                );
            }

            const resultado = await respuesta.json();

            if (resultado?.exitoso === false) {
                throw new Error(
                    resultado.mensaje || "Error al cargar pedidos."
                );
            }

            const datos = Array.isArray(resultado)
                ? resultado
                : resultado?.datos;

            listaPedidos = Array.isArray(datos) ? datos : [];

            actualizarEstadisticas();

            mostrarPedidos();

        } catch (error) {

            console.error("Error al cargar pedidos:", error);

            tabla.innerHTML = `
                <tr>
                    <td colspan="5" class="pedidos-vacio">
                        No fue posible cargar los pedidos.
                    </td>
                </tr>
            `;

            mostrarMensaje(
                `${error.message} Verifica que el microservicio de pedidos esté iniciado.`,
                "error"
            );
        }
    }

    // =========================================
    // 6. MOSTRAR Y FILTRAR PEDIDOS
    // =========================================

    function mostrarPedidos() {

        if (!tabla) return;

        const texto = (busqueda?.value || "")
            .trim()
            .toLowerCase();

        const estadoElegido = filtroEstado?.value || "";

        const filtrados = listaPedidos.filter(pedido => {

            const id = String(pedido.id ?? "");
            const cliente = String(pedido.id_cliente ?? "");

            const coincideTexto =
                id.toLowerCase().includes(texto) ||
                cliente.toLowerCase().includes(texto);

            const coincideEstado =
                !estadoElegido ||
                normalizarEstado(pedido.estado) === normalizarEstado(estadoElegido);

            return coincideTexto && coincideEstado;
        });

        if (filtrados.length === 0) {

            tabla.innerHTML = `
                <tr>
                    <td colspan="5" class="pedidos-vacio">
                        📦<br>
                        <strong>No hay pedidos para mostrar</strong>
                        <br>
                        No se encontraron pedidos con esos criterios.
                    </td>
                </tr>
            `;

            return;
        }

        tabla.innerHTML = filtrados.map(pedido => {

            const estado = String(pedido.estado || "Pendiente");

            const fecha = pedido.fecha
                ? new Date(pedido.fecha).toLocaleDateString("es-MX")
                : "No disponible";

            const id = escaparHTML(pedido.id);
            const cliente = escaparHTML(pedido.id_cliente ?? "N/D");

            const opciones = [
                "Pendiente",
                "Confirmado",
                "Cancelado"
            ].map(opcion => `
                <option
                    value="${opcion}"
                    ${normalizarEstado(estado) === normalizarEstado(opcion) ? "selected" : ""}>
                    ${opcion}
                </option>
            `).join("");

            return `
                <tr>

                    <td>#${id}</td>

                    <td>Cliente #${cliente}</td>

                    <td>${escaparHTML(fecha)}</td>

                    <td>
                        <select
                            class="pedido-estado-select"
                            data-id="${id}"
                            aria-label="Cambiar estado del pedido ${id}">

                            ${opciones}

                        </select>
                    </td>

                    <td>
                        <div class="pedido-acciones">

                            <button
                                type="button"
                                class="pedido-boton boton-ver-pedido"
                                data-id="${id}">

                                Ver detalles

                            </button>

                        </div>
                    </td>

                </tr>
            `;

        }).join("");
    }

    // =========================================
    // 7. CONSULTAR DETALLES DEL PEDIDO
    // =========================================

    async function verDetallePedido(id) {

        try {

            const respuesta = await fetch(
                `${API_PEDIDOS}/${encodeURIComponent(id)}`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );

            if (!respuesta.ok) {
                throw new Error("No se pudo consultar el pedido.");
            }

            const resultado = await respuesta.json();

            const pedido = resultado?.datos || resultado;

            const campos = [
                ["Número de pedido", pedido.id],
                ["Cliente", pedido.id_cliente],
                ["Carrito", pedido.id_carrito],
                ["Dirección", pedido.id_direccion],
                ["Tipo de pago", pedido.id_tipo_pago],
                ["Fecha", pedido.fecha],
                ["Estado", pedido.estado]
            ];

            contenidoDetalle.innerHTML = campos.map(([etiqueta, valor]) => `
                <div class="pedido-detalle">

                    <span>${escaparHTML(etiqueta)}</span>

                    <strong>
                        ${escaparHTML(valor ?? "No disponible")}
                    </strong>

                </div>
            `).join("");

            modal?.classList.add("mostrar");
            modal?.setAttribute("aria-hidden", "false");

        } catch (error) {

            console.error("Error al consultar detalle:", error);

            mostrarMensaje(
                error.message || "No fue posible consultar el detalle.",
                "error"
            );
        }
    }

    // =========================================
    // 8. CAMBIAR ESTADO DEL PEDIDO
    // =========================================

    async function cambiarEstadoPedido(id, nuevoEstado, selector) {

        const estadosPermitidos = [
            "Pendiente",
            "Confirmado",
            "Cancelado"
        ];

        if (!estadosPermitidos.includes(nuevoEstado)) {

            mostrarMensaje(
                "El estado seleccionado no es válido.",
                "error"
            );

            await cargarPedidos();

            return;
        }

        const confirmar = confirm(
            `¿Deseas cambiar el estado del pedido #${id} a "${nuevoEstado}"?`
        );

        if (!confirmar) {

            await cargarPedidos();

            return;
        }

        if (selector) {
            selector.disabled = true;
        }

        try {

            const respuesta = await fetch(
                `${API_PEDIDOS}/${encodeURIComponent(id)}/estado`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },

                    body: JSON.stringify({
                        estado: nuevoEstado
                    })
                }
            );

            let resultado = {};

            try {
                resultado = await respuesta.json();
            } catch (error) {
                resultado = {};
            }

            if (!respuesta.ok || resultado?.exitoso === false) {

                throw new Error(
                    resultado?.mensaje ||
                    `No se pudo actualizar el estado (HTTP ${respuesta.status}).`
                );
            }

            mostrarMensaje(
                "Estado del pedido actualizado correctamente.",
                "exito"
            );

            await cargarPedidos();

        } catch (error) {

            console.error("Error al cambiar estado:", error);

            mostrarMensaje(
                error.message || "Error al actualizar el pedido.",
                "error"
            );

            await cargarPedidos();
        }
    }

    // =========================================
    // 9. CERRAR MODAL DE DETALLES
    // =========================================

    window.cerrarDetallePedido = function () {

        modal?.classList.remove("mostrar");

        modal?.setAttribute("aria-hidden", "true");
    };

    // =========================================
    // 10. EVENTOS DE BÚSQUEDA Y FILTRO
    // =========================================

    busqueda?.addEventListener("input", mostrarPedidos);

    filtroEstado?.addEventListener("change", mostrarPedidos);

    // =========================================
    // 11. EVENTOS DE LA TABLA
    // =========================================

    tabla?.addEventListener("click", evento => {

        const boton = evento.target.closest(".boton-ver-pedido");

        if (boton) {
            verDetallePedido(boton.dataset.id);
        }
    });

    tabla?.addEventListener("change", evento => {

        const selector = evento.target.closest(".pedido-estado-select");

        if (selector) {

            cambiarEstadoPedido(
                selector.dataset.id,
                selector.value,
                selector
            );
        }
    });

    // =========================================
    // 12. EVENTOS DEL MODAL
    // =========================================

    modal?.addEventListener("click", evento => {

        if (evento.target === modal) {
            window.cerrarDetallePedido();
        }
    });

    document.addEventListener("keydown", evento => {

        if (evento.key === "Escape") {
            window.cerrarDetallePedido();
        }
    });

    // =========================================
    // 13. INICIAR CARGA
    // =========================================

    cargarPedidos();

});