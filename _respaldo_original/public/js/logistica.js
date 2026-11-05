(() => {
    "use strict";

    const PAGE = document.body.dataset.module;

    const KEYS = {
        envios: "cubex_logistica_envios",
        garantias: "cubex_logistica_garantias",
        devoluciones: "cubex_logistica_devoluciones"
    };

    const $ = id => document.getElementById(id);

    function leer(key) {
        try {
            const datos = JSON.parse(localStorage.getItem(key) || "[]");
            return Array.isArray(datos) ? datos : [];
        } catch {
            return [];
        }
    }

    function guardar(key, datos) {
        localStorage.setItem(key, JSON.stringify(datos));
    }

    function escapar(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[caracter]);
    }

    function fechaBonita(fecha) {
        if (!fecha) return "—";

        const partes = fecha.split("-");

        if (partes.length !== 3) return escapar(fecha);

        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    function nuevoId() {
        return crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function etiquetaEstado(estado) {
        const valor = String(estado || "").toLowerCase();

        let clase = "pending";

        if (
            /entregado|validada|aprobada|resuelta|completada/.test(valor)
        ) {
            clase = "good";
        } else if (
            /tránsito|reparto|revisión/.test(valor)
        ) {
            clase = "progress";
        } else if (
            /rechazada|incidencia|cancelada/.test(valor)
        ) {
            clase = "bad";
        }

        return `
            <span class="log-badge ${clase}">
                ${escapar(estado)}
            </span>
        `;
    }

    // ==========================================
    // ENVÍOS Y RASTREO
    // ==========================================

    function iniciarEnvios() {

        const key = KEYS.envios;

        const formulario = $("formEnvio");
        const tabla = $("tbodyEnvios");
        const busqueda = $("buscar");
        const filtro = $("filtro");

        let envios = leer(key);

        function renderizar() {

            const texto = busqueda.value.trim().toLowerCase();
            const estado = filtro.value;

            const filtrados = envios.filter(envio => {

                const coincideTexto =
                    `${envio.pedido} ${envio.guia} ${envio.paqueteria}`
                    .toLowerCase()
                    .includes(texto);

                const coincideEstado =
                    !estado || envio.estado === estado;

                return coincideTexto && coincideEstado;
            });

            if (filtrados.length === 0) {
                tabla.innerHTML = `
                    <tr>
                        <td colspan="7" class="log-empty">
                            No hay envíos registrados.
                        </td>
                    </tr>
                `;
            } else {

                tabla.innerHTML = filtrados.map(envio => `
                    <tr>
                        <td><strong>${escapar(envio.pedido)}</strong></td>

                        <td>${escapar(envio.paqueteria)}</td>

                        <td>${escapar(envio.guia)}</td>

                        <td>${fechaBonita(envio.fecha)}</td>

                        <td>${fechaBonita(envio.estimado)}</td>

                        <td>${etiquetaEstado(envio.estado)}</td>

                        <td>
                            <button
                                class="log-btn secondary"
                                type="button"
                                data-editar="${escapar(envio.id)}">
                                Editar
                            </button>

                            <button
                                class="log-btn danger"
                                type="button"
                                data-eliminar="${escapar(envio.id)}">
                                Eliminar
                            </button>
                        </td>
                    </tr>
                `).join("");
            }

            $("statTotal").textContent = envios.length;

            $("statTransit").textContent = envios.filter(envio =>
                ["En tránsito", "En reparto"].includes(envio.estado)
            ).length;

            $("statPending").textContent = envios.filter(envio =>
                envio.estado === "Pendiente"
            ).length;

            $("statDelivered").textContent = envios.filter(envio =>
                envio.estado === "Entregado"
            ).length;
        }

        formulario.addEventListener("submit", event => {

            event.preventDefault();

            const datos = Object.fromEntries(
                new FormData(formulario).entries()
            );

            datos.pedido = datos.pedido.trim();
            datos.guia = datos.guia.trim();

            const duplicadoPedido = envios.some(envio =>
                envio.pedido.toLowerCase() === datos.pedido.toLowerCase() &&
                envio.id !== datos.id
            );

            if (duplicadoPedido) {
                alert("Este pedido ya tiene un envío registrado.");
                return;
            }

            const duplicadoGuia = envios.some(envio =>
                envio.guia.toLowerCase() === datos.guia.toLowerCase() &&
                envio.id !== datos.id
            );

            if (duplicadoGuia) {
                alert("Este número de guía ya está registrado.");
                return;
            }

            const anterior = envios.find(envio =>
                envio.id === datos.id
            );

            const nuevoEnvio = {
                ...anterior,
                ...datos,
                id: anterior ? anterior.id : nuevoId(),
                fechaEntrega: datos.estado === "Entregado"
                    ? (anterior?.fechaEntrega || new Date().toISOString().slice(0, 10))
                    : ""
            };

            if (anterior) {
                envios = envios.map(envio =>
                    envio.id === nuevoEnvio.id ? nuevoEnvio : envio
                );
            } else {
                envios.unshift(nuevoEnvio);
            }

            guardar(key, envios);

            formulario.reset();

            $("envioId").value = "";
            $("btnGuardarEnvio").textContent = "Registrar envío";

            $("msg").textContent =
                "El envío se guardó correctamente.";

            renderizar();
        });

        formulario.addEventListener("reset", () => {
            setTimeout(() => {
                $("envioId").value = "";
                $("btnGuardarEnvio").textContent = "Registrar envío";
            }, 0);
        });

        busqueda.addEventListener("input", renderizar);
        filtro.addEventListener("change", renderizar);

        tabla.addEventListener("click", event => {

            const botonEditar = event.target.closest("[data-editar]");
            const botonEliminar = event.target.closest("[data-eliminar]");

            if (botonEditar) {

                const envio = envios.find(item =>
                    item.id === botonEditar.dataset.editar
                );

                if (!envio) return;

                $("envioId").value = envio.id;
                $("envio_pedido").value = envio.pedido;
                $("envio_paqueteria").value = envio.paqueteria;
                $("envio_guia").value = envio.guia;
                $("envio_fecha").value = envio.fecha;
                $("envio_estimado").value = envio.estimado || "";
                $("envio_estado").value = envio.estado;
                $("envio_observaciones").value = envio.observaciones || "";

                $("btnGuardarEnvio").textContent = "Guardar cambios";

                formulario.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }

            if (botonEliminar) {

                const envio = envios.find(item =>
                    item.id === botonEliminar.dataset.eliminar
                );

                if (!envio) return;

                if (!confirm(
                    `¿Deseas eliminar el envío del pedido ${envio.pedido}?`
                )) {
                    return;
                }

                envios = envios.filter(item =>
                    item.id !== envio.id
                );

                guardar(key, envios);
                renderizar();
            }
        });

        renderizar();
    }

    // ==========================================
    // VALIDACIÓN DE ENTREGAS
    // ==========================================

    function iniciarEntregas() {

        const tabla = $("tbodyEntregas");

        function renderizar() {

            const envios = leer(KEYS.envios);

            const entregados = envios.filter(envio =>
                envio.estado === "Entregado"
            );

            $("statDelivered").textContent = entregados.length;

            $("statValidated").textContent = entregados.filter(envio =>
                envio.validacion
            ).length;

            $("statToValidate").textContent = entregados.filter(envio =>
                !envio.validacion
            ).length;

            if (entregados.length === 0) {

                tabla.innerHTML = `
                    <tr>
                        <td colspan="7" class="log-empty">
                            Todavía no hay pedidos marcados como entregados.
                        </td>
                    </tr>
                `;

                return;
            }

            tabla.innerHTML = entregados.map(envio => `
                <tr>
                    <td><strong>${escapar(envio.pedido)}</strong></td>

                    <td>${escapar(envio.paqueteria)}</td>

                    <td>${escapar(envio.guia)}</td>

                    <td>${fechaBonita(envio.fechaEntrega)}</td>

                    <td>${escapar(envio.recibio || "—")}</td>

                    <td>${escapar(envio.observacionesEntrega || "—")}</td>

                    <td>
                        ${
                            envio.validacion
                                ? etiquetaEstado("Validada")
                                : `
                                    <button
                                        type="button"
                                        class="log-btn primary"
                                        data-validar="${escapar(envio.id)}">
                                        Validar
                                    </button>
                                `
                        }
                    </td>
                </tr>
            `).join("");
        }

        tabla.addEventListener("click", event => {

            const boton = event.target.closest("[data-validar]");

            if (!boton) return;

            const envios = leer(KEYS.envios);

            const envio = envios.find(item =>
                item.id === boton.dataset.validar
            );

            if (!envio) return;

            const recibio = prompt(
                `¿Quién recibió el pedido ${envio.pedido}?`
            );

            if (recibio === null) return;

            if (!recibio.trim()) {
                alert("Debes indicar quién recibió el paquete.");
                return;
            }

            const observaciones = prompt(
                "Observaciones de la entrega (opcional):"
            );

            if (observaciones === null) return;

            envio.recibio = recibio.trim();
            envio.observacionesEntrega = observaciones.trim();
            envio.validacion = true;

            if (!envio.fechaEntrega) {
                envio.fechaEntrega =
                    new Date().toISOString().slice(0, 10);
            }

            guardar(KEYS.envios, envios);

            renderizar();

            alert("La entrega fue validada correctamente.");
        });

        window.addEventListener("storage", renderizar);

        renderizar();
    }

    // ==========================================
    // GARANTÍAS Y DEVOLUCIONES
    // ==========================================

    function iniciarSolicitudes(tipo) {

        const key = KEYS[tipo];

        const esGarantia = tipo === "garantias";

        const formulario = $("formCaso");
        const tabla = $("tbodyCasos");
        const busqueda = $("buscar");
        const filtro = $("filtro");

        let solicitudes = leer(key);

        function renderizar() {

            const texto = busqueda.value.trim().toLowerCase();
            const estado = filtro.value;

            const filtradas = solicitudes.filter(solicitud => {

                const coincideTexto =
                    `${solicitud.folio} ${solicitud.pedido} ${solicitud.cliente} ${solicitud.producto}`
                    .toLowerCase()
                    .includes(texto);

                const coincideEstado =
                    !estado || solicitud.estado === estado;

                return coincideTexto && coincideEstado;
            });

            if (filtradas.length === 0) {

                tabla.innerHTML = `
                    <tr>
                        <td colspan="9" class="log-empty">
                            No hay solicitudes registradas.
                        </td>
                    </tr>
                `;

            } else {

                tabla.innerHTML = filtradas.map(solicitud => `
                    <tr>
                        <td><strong>${escapar(solicitud.folio)}</strong></td>

                        <td>${escapar(solicitud.pedido)}</td>

                        <td>${escapar(solicitud.cliente)}</td>

                        <td>${escapar(solicitud.producto)}</td>

                        <td>${fechaBonita(solicitud.fecha)}</td>

                        <td>${escapar(solicitud.motivo)}</td>

                        <td>${etiquetaEstado(solicitud.estado)}</td>

                        <td>${escapar(solicitud.resolucion || "—")}</td>

                        <td>
                            <button
                                type="button"
                                class="log-btn secondary"
                                data-editar="${escapar(solicitud.id)}">
                                Editar
                            </button>

                            <button
                                type="button"
                                class="log-btn danger"
                                data-eliminar="${escapar(solicitud.id)}">
                                Eliminar
                            </button>
                        </td>
                    </tr>
                `).join("");
            }

            $("statTotal").textContent = solicitudes.length;

            $("statPending").textContent = solicitudes.filter(s =>
                s.estado === "Pendiente"
            ).length;

            $("statReview").textContent = solicitudes.filter(s =>
                s.estado === "En revisión"
            ).length;

            $("statClosed").textContent = solicitudes.filter(s =>
                esGarantia
                    ? ["Resuelta", "Rechazada"].includes(s.estado)
                    : ["Completada", "Rechazada"].includes(s.estado)
            ).length;
        }

        formulario.addEventListener("submit", event => {

            event.preventDefault();

            const datos = Object.fromEntries(
                new FormData(formulario).entries()
            );

            datos.pedido = datos.pedido.trim();
            datos.cliente = datos.cliente.trim();
            datos.producto = datos.producto.trim();

            const anterior = solicitudes.find(solicitud =>
                solicitud.id === datos.id
            );

            const folio = anterior
                ? anterior.folio
                : `${esGarantia ? "GAR" : "DEV"}-${String(Date.now()).slice(-7)}`;

            const nuevaSolicitud = {
                ...anterior,
                ...datos,
                id: anterior ? anterior.id : nuevoId(),
                folio
            };

            if (anterior) {

                solicitudes = solicitudes.map(solicitud =>
                    solicitud.id === nuevaSolicitud.id
                        ? nuevaSolicitud
                        : solicitud
                );

            } else {

                solicitudes.unshift(nuevaSolicitud);

            }

            guardar(key, solicitudes);

            formulario.reset();

            $("casoId").value = "";

            $("btnGuardar").textContent = esGarantia
                ? "Registrar garantía"
                : "Registrar devolución";

            $("msg").textContent =
                "La solicitud se guardó correctamente.";

            renderizar();
        });

        formulario.addEventListener("reset", () => {

            setTimeout(() => {

                $("casoId").value = "";

                $("btnGuardar").textContent = esGarantia
                    ? "Registrar garantía"
                    : "Registrar devolución";

            }, 0);

        });

        busqueda.addEventListener("input", renderizar);
        filtro.addEventListener("change", renderizar);

        tabla.addEventListener("click", event => {

            const botonEditar = event.target.closest("[data-editar]");
            const botonEliminar = event.target.closest("[data-eliminar]");

            if (botonEditar) {

                const solicitud = solicitudes.find(item =>
                    item.id === botonEditar.dataset.editar
                );

                if (!solicitud) return;

                $("casoId").value = solicitud.id;

                [
                    "pedido",
                    "cliente",
                    "producto",
                    "fecha",
                    "motivo",
                    "estado",
                    "resolucion",
                    "observaciones"
                ].forEach(campo => {

                    const elemento = $(`caso_${campo}`);

                    if (elemento) {
                        elemento.value = solicitud[campo] || "";
                    }

                });

                $("btnGuardar").textContent = "Guardar cambios";

                formulario.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }

            if (botonEliminar) {

                const solicitud = solicitudes.find(item =>
                    item.id === botonEliminar.dataset.eliminar
                );

                if (!solicitud) return;

                if (!confirm(
                    `¿Eliminar la solicitud ${solicitud.folio}?`
                )) {
                    return;
                }

                solicitudes = solicitudes.filter(item =>
                    item.id !== solicitud.id
                );

                guardar(key, solicitudes);

                renderizar();
            }

        });

        renderizar();
    }

    // ==========================================
    // INICIALIZAR EL MÓDULO CORRESPONDIENTE
    // ==========================================

    document.addEventListener("DOMContentLoaded", () => {

        if (PAGE === "envios") {
            iniciarEnvios();
        }

        if (PAGE === "entregas") {
            iniciarEntregas();
        }

        if (PAGE === "garantias") {
            iniciarSolicitudes("garantias");
        }

        if (PAGE === "devoluciones") {
            iniciarSolicitudes("devoluciones");
        }

    });

})();