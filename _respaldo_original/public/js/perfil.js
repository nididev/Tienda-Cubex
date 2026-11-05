
const API_LOGIN = "http://localhost:3020/api/v1";
const API_PEDIDOS = "http://localhost:3011/api/Pedidos";

// ========================================
// VARIABLES
// ========================================

const token = sessionStorage.getItem("cubex_token");

const mensaje = document.getElementById("mensaje");
const listaCompras = document.getElementById("listaCompras");

let usuarioGuardado = {};
let comprasUsuario = [];
let indiceCompraActual = 0;

// ========================================
// RECUPERAR USUARIO
// ========================================

try {
    usuarioGuardado = JSON.parse(
        sessionStorage.getItem("cubex_usuario") || "{}"
    );
} catch (error) {
    usuarioGuardado = {};
}

// ========================================
// VERIFICAR SESIÓN
// ========================================

if (!token) {
    window.location.replace("login.html");
} else {
    mostrarDatosGuardados();
    cargarPerfil();
}

// ========================================
// MOSTRAR DATOS GUARDADOS
// ========================================

function mostrarDatosGuardados() {

    document.getElementById("nombreUsuario").textContent =
        usuarioGuardado.nombreUsuario || "No disponible";

    document.getElementById("nombreCompleto").textContent =
        usuarioGuardado.nombreCompleto || "No registrado";

    document.getElementById("email").textContent =
        usuarioGuardado.email || "No registrado";

    document.getElementById("rol").textContent =
        usuarioGuardado.rol || "CLIENTE";
}

// ========================================
// CARGAR PERFIL
// ========================================

async function cargarPerfil() {

    try {

        const respuesta = await fetch(
            `${API_LOGIN}/auth/perfil`,
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {

            if (respuesta.status === 401) {

                sessionStorage.removeItem("cubex_token");
                sessionStorage.removeItem("cubex_usuario");

                window.location.replace("login.html");
                return;
            }

            throw new Error(
                resultado.mensaje || "No se pudo cargar el perfil."
            );
        }

        const usuarioAPI = resultado.datos || {};

        const usuario = {
            ...usuarioGuardado,
            ...usuarioAPI
        };

        // Actualizar información en pantalla

        document.getElementById("nombreUsuario").textContent =
            usuario.nombreUsuario || "No disponible";

        document.getElementById("nombreCompleto").textContent =
            usuario.nombreCompleto || "No registrado";

        document.getElementById("email").textContent =
            usuario.email || "No registrado";

        document.getElementById("rol").textContent =
            usuario.rol || "CLIENTE";

        // Guardar información actualizada

        sessionStorage.setItem(
            "cubex_usuario",
            JSON.stringify(usuario)
        );

        usuarioGuardado = usuario;

        if (mensaje) {
            mensaje.textContent = "";
        }

        // Cargar compras del usuario

        await cargarCompras(usuario.idUsuario);

    } catch (error) {

        console.error("Error al cargar el perfil:", error);

        if (mensaje) {
            mensaje.textContent =
                "No se pudo actualizar tu información.";
        }
    }
}

// ========================================
// CARGAR COMPRAS DEL USUARIO
// ========================================

async function cargarCompras(idUsuario) {

    try {

        if (!idUsuario) {
            throw new Error("No se encontró el ID del usuario.");
        }

        listaCompras.innerHTML =
            '<p class="sin-compras">Cargando tus compras...</p>';

        // La ruta termina únicamente con el ID del usuario.
        // Ejemplo: /usuario/11

        const urlCompras =
            `${API_PEDIDOS}/usuario/${encodeURIComponent(idUsuario)}`;

        console.log("Consultando pedidos:", urlCompras);

        const respuesta = await fetch(
            urlCompras,
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok || resultado.exitoso === false) {

            throw new Error(
                resultado.mensaje ||
                "No fue posible consultar tus compras."
            );
        }

        comprasUsuario = Array.isArray(resultado.datos)
            ? resultado.datos
            : [];

        // Si no existen compras

        if (comprasUsuario.length === 0) {

            listaCompras.innerHTML = `
                <p class="sin-compras">
                    Todavía no has realizado compras.
                </p>
            `;

            return;
        }

        // Ordenar del pedido más reciente al más antiguo

        comprasUsuario.sort((a, b) => {
            return new Date(b.fecha) - new Date(a.fecha);
        });

        indiceCompraActual = 0;

        mostrarCompraActual();

    } catch (error) {

        console.error("Error al cargar las compras:", error);

        listaCompras.innerHTML = `
            <p class="sin-compras">
                ${error.message === "Failed to fetch"
                    ? "No se pudo conectar con el servidor de pedidos. Verifica que esté iniciado."
                    : "No fue posible cargar tus compras. " + error.message}
            </p>
        `;
    }
}

// ========================================
// MOSTRAR UN SOLO PEDIDO
// ========================================

function mostrarCompraActual() {

    if (comprasUsuario.length === 0) {
        return;
    }

    const compra = comprasUsuario[indiceCompraActual];

    // Formatear fecha

    const fecha = compra.fecha
        ? new Date(compra.fecha).toLocaleString("es-MX", {
            dateStyle: "medium",
            timeStyle: "short"
        })
        : "No disponible";

    // Formatear estado

    const estado = String(compra.estado || "pendiente")
        .toLowerCase();

    const estadoTexto =
        estado.charAt(0).toUpperCase() + estado.slice(1);

    // Crear tarjeta del pedido

    listaCompras.innerHTML = `

        <article class="compra-item">

            <h3>Pedido #${compra.id}</h3>

            <p>
                <strong>Fecha:</strong>
                ${fecha}
            </p>

            <p>
                <strong>Carrito:</strong>
                #${compra.id_carrito ?? "No disponible"}
            </p>

            <p>
                <strong>Domicilio:</strong>
                #${compra.id_direccion ?? "No disponible"}
            </p>

            <span class="estado-compra estado-${estado}">
                ${estadoTexto}
            </span>

        </article>

        <div class="navegacion-compras">

            <button
                type="button"
                class="btn-pedido"
                id="pedidoAnterior"
                ${indiceCompraActual === 0 ? "disabled" : ""}
                aria-label="Pedido anterior"
            >
                &#10094;
            </button>

            <span class="contador-pedidos">
                Pedido ${indiceCompraActual + 1}
                de
                ${comprasUsuario.length}
            </span>

            <button
                type="button"
                class="btn-pedido"
                id="pedidoSiguiente"
                ${indiceCompraActual === comprasUsuario.length - 1
                    ? "disabled"
                    : ""}
                aria-label="Pedido siguiente"
            >
                &#10095;
            </button>

        </div>
    `;

    // ========================================
    // BOTÓN ANTERIOR
    // ========================================

    document.getElementById("pedidoAnterior")
        .addEventListener("click", () => {

            if (indiceCompraActual > 0) {

                indiceCompraActual--;

                mostrarCompraActual();
            }
        });

    // ========================================
    // BOTÓN SIGUIENTE
    // ========================================

    document.getElementById("pedidoSiguiente")
        .addEventListener("click", () => {

            if (indiceCompraActual < comprasUsuario.length - 1) {

                indiceCompraActual++;

                mostrarCompraActual();
            }
        });
}
