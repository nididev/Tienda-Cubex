
/* =====================================================
   CUBEX - CARRITO DE COMPRAS INDEPENDIENTE POR USUARIO
===================================================== */

const CLAVE_TOKEN = "cubex_token";
const CLAVE_USUARIO = "cubex_usuario";

let carrito = [];
let usuarioActual = null;
let claveCarritoActual = null;
let observadorCarrito = null;


/* =====================================================
   IDENTIFICAR AL USUARIO
===================================================== */

function obtenerUsuarioActual() {

    const token = sessionStorage.getItem(CLAVE_TOKEN);
    const usuarioGuardado = sessionStorage.getItem(CLAVE_USUARIO);

    if (!token) return null;

    let usuario = {};

    try {
        usuario = usuarioGuardado
            ? JSON.parse(usuarioGuardado)
            : {};
    } catch (error) {
        console.error("Error al leer el usuario:", error);
    }

    let idUsuario =
        usuario.id ??
        usuario.id_usuario ??
        usuario.idUsuario ??
        usuario.usuarioId ??
        usuario.usuario?.id ??
        usuario.datos?.id;

    // Obtener el ID desde el JWT si no está guardado.
    if (!idUsuario) {
        try {
            const parteToken = token.split(".")[1];

            if (!parteToken) return null;

            const base64 = parteToken
                .replace(/-/g, "+")
                .replace(/_/g, "/");

            const base64Completo = base64.padEnd(
                Math.ceil(base64.length / 4) * 4,
                "="
            );

            const payload = JSON.parse(
                decodeURIComponent(
                    Array.prototype.map.call(
                        atob(base64Completo),
                        c => "%" +
                            ("00" + c.charCodeAt(0).toString(16)).slice(-2)
                    ).join("")
                )
            );

            idUsuario = payload.sub;

        } catch (error) {
            console.error("No se pudo leer el token:", error);
        }
    }

    if (
        idUsuario === undefined ||
        idUsuario === null ||
        idUsuario === ""
    ) {
        console.error("No se encontró el ID del usuario.");
        return null;
    }

    return {
        ...usuario,
        id: String(idUsuario)
    };
}


/* =====================================================
   CLAVE INDIVIDUAL DEL CARRITO
===================================================== */

function obtenerClaveCarrito() {

    usuarioActual = obtenerUsuarioActual();

    if (!usuarioActual) return null;

    return `cubex_carrito_${usuarioActual.id}`;
}


/* =====================================================
   VERIFICAR SESIÓN
===================================================== */

function tieneSesion() {

    // Actualizar siempre la identidad para evitar mezclar cuentas.
    const nuevaClave = obtenerClaveCarrito();

    if (!nuevaClave) {
        claveCarritoActual = null;
        usuarioActual = null;
        carrito = [];
        return false;
    }

    if (nuevaClave !== claveCarritoActual) {
        claveCarritoActual = nuevaClave;
        cargarCarrito();
    }

    return Boolean(
        sessionStorage.getItem(CLAVE_TOKEN) &&
        usuarioActual &&
        claveCarritoActual
    );
}


/* =====================================================
   CARGAR CARRITO
===================================================== */

function cargarCarrito() {

    const nuevaClave = obtenerClaveCarrito();

    if (!nuevaClave) {
        claveCarritoActual = null;
        carrito = [];
        actualizarCarrito();
        return;
    }

    claveCarritoActual = nuevaClave;

    try {
        const guardado = sessionStorage.getItem(claveCarritoActual);

        carrito = guardado ? JSON.parse(guardado) : [];

        if (!Array.isArray(carrito)) {
            carrito = [];
        }

    } catch (error) {
        console.error("Error al cargar el carrito:", error);
        carrito = [];
    }

    actualizarCarrito();
}


/* =====================================================
   GUARDAR CARRITO
===================================================== */

function guardarCarrito() {

    const nuevaClave = obtenerClaveCarrito();

    if (!nuevaClave) return false;

    claveCarritoActual = nuevaClave;

    try {
        sessionStorage.setItem(
            claveCarritoActual,
            JSON.stringify(carrito)
        );

        return true;

    } catch (error) {
        console.error("Error al guardar el carrito:", error);
        return false;
    }
}


/* =====================================================
   NORMALIZAR DATOS DEL PRODUCTO
===================================================== */

function normalizarProducto(producto) {

    return {
        id:
            producto.id ??
            producto.id_producto ??
            producto.producto_id,

        nombre:
            producto.nombre ??
            producto.nombre_producto ??
            producto.nombreProducto ??
            "Producto CUBEX",

        precio: Number(
            producto.precio ??
            producto.precio_venta ??
            producto.precioVenta ??
            0
        ),

        imagen:
            producto.imagen ??
            producto.foto ??
            producto.url_imagen ??
            producto.imagen_url ??
            "",

        cantidad: 1
    };
}


/* =====================================================
   AGREGAR PRODUCTO
===================================================== */

function agregarAlCarrito(producto) {

    if (!tieneSesion()) {
        mostrarMensajeCarrito(
            "Inicia sesión para agregar productos al carrito."
        );
        return;
    }

    if (!producto) {
        console.error("No se recibió un producto.");
        return;
    }

    const nuevoProducto = normalizarProducto(producto);

    if (
        nuevoProducto.id === undefined ||
        nuevoProducto.id === null
    ) {
        console.error(
            "El producto no tiene un identificador:",
            producto
        );

        mostrarMensajeCarrito(
            "No se pudo identificar el producto."
        );

        return;
    }

    if (
        !Number.isFinite(nuevoProducto.precio) ||
        nuevoProducto.precio < 0
    ) {
        mostrarMensajeCarrito(
            "El precio del producto no es válido."
        );
        return;
    }

    const existente = carrito.find(
        item => String(item.id) === String(nuevoProducto.id)
    );

    if (existente) {
        existente.cantidad++;
    } else {
        carrito.push(nuevoProducto);
    }

    guardarCarrito();
    actualizarCarrito();

    mostrarMensajeCarrito("Producto agregado al carrito.");

    abrirCarrito();
}


/* =====================================================
   AUMENTAR CANTIDAD
===================================================== */

function aumentarCantidad(id) {

    if (!tieneSesion()) return;

    const producto = carrito.find(
        item => String(item.id) === String(id)
    );

    if (!producto) return;

    producto.cantidad++;

    guardarCarrito();
    actualizarCarrito();
}


/* =====================================================
   DISMINUIR CANTIDAD
===================================================== */

function disminuirCantidad(id) {

    if (!tieneSesion()) return;

    const producto = carrito.find(
        item => String(item.id) === String(id)
    );

    if (!producto) return;

    if (producto.cantidad > 1) {
        producto.cantidad--;
    } else {
        eliminarProducto(id);
        return;
    }

    guardarCarrito();
    actualizarCarrito();
}


/* =====================================================
   ELIMINAR PRODUCTO
===================================================== */

function eliminarProducto(id) {

    if (!tieneSesion()) return;

    carrito = carrito.filter(
        item => String(item.id) !== String(id)
    );

    guardarCarrito();
    actualizarCarrito();

    mostrarMensajeCarrito("Producto eliminado del carrito.");
}


/* =====================================================
   FORMATO DE PRECIO
===================================================== */

function formatearPrecio(precio) {

    return Number(precio || 0).toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN"
    });
}


/* =====================================================
   ACTUALIZAR CONTADOR
===================================================== */

function actualizarContadorCarrito() {

    const contador = document.getElementById("contadorCarrito");

    if (!contador) return;

    const cantidadTotal = carrito.reduce(
        (total, producto) =>
            total + Number(producto.cantidad || 0),
        0
    );

    contador.textContent = cantidadTotal;
    contador.style.display = "inline-flex";
}


/* =====================================================
   ESCAPAR HTML
===================================================== */

function escaparHTML(valor) {

    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caracter]);
}


/* =====================================================
   ACTUALIZAR CONTENIDO DEL CARRITO
===================================================== */

function actualizarCarrito() {

    actualizarContadorCarrito();

    const contenedor =
        document.getElementById("carritoContenido") ||
        document.querySelector(".carrito-contenido");

    const totalElemento =
        document.getElementById("totalCarrito") ||
        document.querySelector(".carrito-total strong");

    // Si el panel todavía no existe, no modificar nada.
    if (!contenedor || !totalElemento) return;

    if (!tieneSesion()) {

        contenedor.innerHTML = `
            <div class="carrito-vacio">
                <p>Inicia sesión para utilizar tu carrito.</p>
            </div>
        `;

        totalElemento.textContent = formatearPrecio(0);
        return;
    }

    if (carrito.length === 0) {

        contenedor.innerHTML = `
            <div class="carrito-vacio">
                <p>Tu carrito está vacío.</p>
                <p>¡Agrega productos para comenzar tu compra!</p>
            </div>
        `;

        totalElemento.textContent = formatearPrecio(0);
        return;
    }

    let total = 0;

    contenedor.innerHTML = carrito.map(producto => {

        const precio = Number(producto.precio) || 0;
        const cantidad = Number(producto.cantidad) || 1;
        const subtotal = precio * cantidad;

        total += subtotal;

        const id = escaparHTML(String(producto.id));
        const nombre = escaparHTML(producto.nombre);
        const imagen = escaparHTML(producto.imagen);

        return `
            <article class="carrito-item">

                ${
                    imagen
                        ? `
                            <img
                                src="${imagen}"
                                alt="${nombre}"
                                class="carrito-item-imagen"
                                onerror="this.style.display='none'"
                            >
                        `
                        : ""
                }

                <div class="carrito-item-info">

                    <h3>${nombre}</h3>

                    <p class="carrito-item-precio">
                        ${formatearPrecio(precio)}
                    </p>

                    <div class="carrito-cantidad">

                        <button
                            type="button"
                            data-accion="disminuir"
                            data-id="${id}">
                            −
                        </button>

                        <span>${cantidad}</span>

                        <button
                            type="button"
                            data-accion="aumentar"
                            data-id="${id}">
                            +
                        </button>

                        <button
                            type="button"
                            class="btn-eliminar-producto"
                            data-accion="eliminar"
                            data-id="${id}">
                            ✕
                        </button>

                    </div>

                </div>

            </article>
        `;

    }).join("");

    totalElemento.textContent = formatearPrecio(total);
}


/* =====================================================
   MENSAJES DEL CARRITO
===================================================== */

function mostrarMensajeCarrito(texto) {

    const elemento = document.getElementById("mensajeCarrito");

    if (!elemento) return;

    elemento.textContent = texto;
    elemento.classList.add("visible");

    clearTimeout(elemento._temporizador);

    elemento._temporizador = setTimeout(() => {
        elemento.classList.remove("visible");
    }, 2500);
}


/* =====================================================
   ABRIR CARRITO
===================================================== */

function abrirCarrito() {

    if (!tieneSesion()) {
        mostrarMensajeCarrito("Inicia sesión para utilizar tu carrito.");
        return;
    }

    actualizarCarrito();

    const panel =
        document.getElementById("panelCarrito") ||
        document.querySelector(".panel-carrito");

    const overlay =
        document.getElementById("carritoOverlay") ||
        document.querySelector(".carrito-overlay");

    if (!panel) {
        console.warn("No se encontró el panel del carrito.");
        return;
    }

    panel.classList.add("abierto");

    if (overlay) {
        overlay.classList.add("activo");
    }

    document.body.style.overflow = "hidden";
}


/* =====================================================
   CERRAR CARRITO
===================================================== */

function cerrarCarrito() {

    const panel =
        document.getElementById("panelCarrito") ||
        document.querySelector(".panel-carrito");

    const overlay =
        document.getElementById("carritoOverlay") ||
        document.querySelector(".carrito-overlay");

    if (panel) {
        panel.classList.remove("abierto");
    }

    if (overlay) {
        overlay.classList.remove("activo");
    }

    document.body.style.overflow = "";
}


/* =====================================================
   CONTINUAR COMPRA
===================================================== */

function continuarCompra() {

    if (!tieneSesion()) {
        mostrarMensajeCarrito(
            "Inicia sesión para continuar con tu compra."
        );
        return;
    }

    if (carrito.length === 0) {
        mostrarMensajeCarrito("Tu carrito está vacío.");
        return;
    }

    guardarCarrito();

    window.location.href = "pages/domicilio.html";
}


/* =====================================================
   EVENTOS DEL CARRITO
===================================================== */

// Delegación de eventos para botones dinámicos.
document.addEventListener("click", event => {

    const botonAccion = event.target.closest("[data-accion]");

    if (botonAccion) {

        const id = botonAccion.dataset.id;
        const accion = botonAccion.dataset.accion;

        if (accion === "aumentar") {
            aumentarCantidad(id);
        }

        if (accion === "disminuir") {
            disminuirCantidad(id);
        }

        if (accion === "eliminar") {
            eliminarProducto(id);
        }

        return;
    }

    // Abrir carrito.
    if (event.target.closest("#abrirCarrito")) {
        abrirCarrito();
        return;
    }

    // Cerrar carrito.
    if (
        event.target.closest("#cerrarCarrito") ||
        event.target.closest(".btn-cerrar-carrito")
    ) {
        cerrarCarrito();
        return;
    }

    // Continuar compra.
    if (event.target.closest("#btnContinuarCompra")) {
        continuarCompra();
        return;
    }

    // Clic en el fondo del carrito.
    const overlay =
        document.getElementById("carritoOverlay") ||
        document.querySelector(".carrito-overlay");

    if (overlay && event.target === overlay) {
        cerrarCarrito();
    }

});


/* =====================================================
   INICIALIZAR BOTONES Y PANEL
===================================================== */

function inicializarCarrito() {

    const botonAbrir = document.getElementById("abrirCarrito");

    if (botonAbrir) {
        botonAbrir.style.cursor = "pointer";
    }

    const botonCerrar =
        document.getElementById("cerrarCarrito") ||
        document.querySelector(".btn-cerrar-carrito");

    if (botonCerrar) {
        botonCerrar.style.cursor = "pointer";
    }

    actualizarContadorCarrito();
    actualizarCarrito();
}


/* =====================================================
   DETECTAR CONTENIDO CARGADO DINÁMICAMENTE
===================================================== */

function iniciarCarrito() {

    claveCarritoActual = obtenerClaveCarrito();

    if (claveCarritoActual) {

        try {
            const guardado = sessionStorage.getItem(claveCarritoActual);

            carrito = guardado ? JSON.parse(guardado) : [];

            if (!Array.isArray(carrito)) {
                carrito = [];
            }

        } catch (error) {
            console.error("Error al cargar el carrito:", error);
            carrito = [];
        }

    } else {
        carrito = [];
    }

    inicializarCarrito();

    // Evitar crear varios observadores.
    if (observadorCarrito) {
        observadorCarrito.disconnect();
        observadorCarrito = null;
    }

    const contenidoYaExiste =
        document.getElementById("carritoContenido") ||
        document.querySelector(".carrito-contenido");

    // Si el panel todavía no existe, esperar a que main.js lo inserte.
    if (!contenidoYaExiste) {

        observadorCarrito = new MutationObserver(() => {

            const contenidoCarrito =
                document.getElementById("carritoContenido") ||
                document.querySelector(".carrito-contenido");

            if (!contenidoCarrito) return;

            // Desconectar antes de actualizar el contenido.
            observadorCarrito.disconnect();
            observadorCarrito = null;

            inicializarCarrito();

        });

        observadorCarrito.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Abrir automáticamente al regresar desde domicilios.
    const parametros = new URLSearchParams(window.location.search);

    if (parametros.get("abrirCarrito") === "1") {

        abrirCarrito();

        parametros.delete("abrirCarrito");

        const nuevaURL =
            window.location.pathname +
            (parametros.toString() ? "?" + parametros.toString() : "") +
            window.location.hash;

        history.replaceState({}, "", nuevaURL);
    }
}


/* =====================================================
   FUNCIONES GLOBALES
===================================================== */

window.agregarAlCarrito = agregarAlCarrito;
window.aumentarCantidad = aumentarCantidad;
window.disminuirCantidad = disminuirCantidad;
window.eliminarProducto = eliminarProducto;
window.abrirCarrito = abrirCarrito;
window.cerrarCarrito = cerrarCarrito;
window.actualizarCarrito = actualizarCarrito;
window.continuarCompra = continuarCompra;
window.cargarCarrito = cargarCarrito;


/* =====================================================
   ARRANQUE
===================================================== */

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        iniciarCarrito,
        { once: true }
    );

} else {

    iniciarCarrito();

}
