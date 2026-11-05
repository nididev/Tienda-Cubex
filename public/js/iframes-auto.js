/* =====================================================================
   CUBEX - ALTURA AUTOMÁTICA DE LOS MÓDULOS EN IFRAME

   Los paneles de administrador y empleado muestran cada módulo
   (productos, inventario, envíos, etc.) dentro de un iframe. Este
   script ajusta la altura del iframe a su contenido, para que no
   aparezca una segunda barra de desplazamiento: toda la página baja
   con el scroll normal.
   ===================================================================== */

(function () {
    "use strict";

    // Altura real del contenido de la página interna.
    // Se encoge el iframe un instante (en la misma operación, sin que se
    // vea) para que los elementos con altura de "pantalla completa"
    // (100vh, 100%) no inflen la medida, y luego se lee el alto real.
    function medir(iframe, documento) {
        const raiz = documento.documentElement;
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const anterior = iframe.style.getPropertyValue("height");

        // La página principal conserva su alto mientras se mide, para que
        // el navegador no mueva el desplazamiento.
        const principal = document.documentElement;
        const minimoAnterior = principal.style.minHeight;
        principal.style.minHeight = `${principal.scrollHeight}px`;

        iframe.style.setProperty("height", "150px", "important");
        const altura = Math.max(
            raiz.scrollHeight,
            documento.body ? documento.body.scrollHeight : 0
        );
        iframe.style.setProperty("height", anterior || "150px", "important");
        principal.style.minHeight = minimoAnterior;

        // Evita saltos en la posición de la página principal.
        if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
            window.scrollTo(scrollX, scrollY);
        }

        return altura;
    }

    function ajustar(iframe) {
        let documento;

        try {
            documento = iframe.contentDocument;
        } catch {
            return; // Otro origen: no se puede medir.
        }

        // Si el iframe está oculto (otra sección del menú), se ajusta al mostrarse.
        if (!documento || !documento.body || iframe.offsetParent === null) return;

        const altura = medir(iframe, documento) + 4;
        if (altura < 160) return;

        if (Math.abs((parseFloat(iframe.style.height) || 0) - altura) > 2) {
            iframe.style.setProperty("height", `${altura}px`, "important");
        }
    }

    // Las ventanas emergentes de cada módulo usan position: fixed y se
    // centran en el iframe completo; como ahora el iframe es tan alto como
    // su contenido, se ajustan a la parte que se ve en pantalla.
    function ajustarVentanas(iframe) {
        let documento;

        try {
            documento = iframe.contentDocument;
        } catch {
            return;
        }

        if (!documento || !documento.body || iframe.offsetParent === null) return;

        const caja = iframe.getBoundingClientRect();
        const arriba = Math.max(0, -caja.top);
        const alto = Math.max(200, Math.min(caja.bottom, window.innerHeight) - Math.max(caja.top, 0));
        const ventanaInterna = documento.defaultView;

        documento.querySelectorAll('[class*="modal"], [id*="modal"], [id*="Modal"]').forEach(elemento => {
            const estilo = ventanaInterna.getComputedStyle(elemento);
            if (estilo.position !== "fixed" || estilo.display === "none") return;

            elemento.style.setProperty("top", `${arriba}px`, "important");
            elemento.style.setProperty("bottom", "auto", "important");
            elemento.style.setProperty("height", `${alto}px`, "important");
            elemento.style.setProperty("max-height", `${alto}px`, "important");
        });
    }

    function preparar(iframe) {
        if (iframe.dataset.alturaAuto) return;
        iframe.dataset.alturaAuto = "1";

        iframe.setAttribute("scrolling", "no");
        iframe.style.setProperty("min-height", "0", "important");
        iframe.style.setProperty("overflow", "hidden", "important");

        const alCargar = () => {
            let documento;
            try {
                documento = iframe.contentDocument;
            } catch {
                return;
            }
            if (!documento || !documento.documentElement) return;

            // La página interna ya no necesita su propia barra.
            documento.documentElement.style.overflowY = "hidden";
            if (documento.body) documento.body.style.overflowY = "hidden";

            const ventanaInterna = documento.defaultView;

            if (ventanaInterna && "ResizeObserver" in ventanaInterna && documento.body) {
                new ventanaInterna.ResizeObserver(() => ajustar(iframe)).observe(documento.body);
            }

            if (ventanaInterna && "MutationObserver" in ventanaInterna && documento.body) {
                new ventanaInterna.MutationObserver(() => {
                    ajustar(iframe);
                    ajustarVentanas(iframe);
                })
                    .observe(documento.body, { childList: true, subtree: true, attributes: true });
            }

            ajustar(iframe);
        };

        iframe.addEventListener("load", alCargar);

        if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
            alCargar();
        }
    }

    function revisarTodos() {
        document.querySelectorAll("iframe").forEach(iframe => {
            preparar(iframe);
            ajustar(iframe);
            ajustarVentanas(iframe);
        });
    }

    window.addEventListener("scroll", () => {
        document.querySelectorAll("iframe").forEach(ajustarVentanas);
    }, { passive: true });

    document.addEventListener("DOMContentLoaded", revisarTodos);
    window.addEventListener("load", revisarTodos);
    window.addEventListener("resize", revisarTodos);
    window.addEventListener("hashchange", () => setTimeout(revisarTodos, 50));
    document.addEventListener("click", () => setTimeout(revisarTodos, 80));

    // Respaldo: cubre cambios que no disparan eventos (secciones que se muestran, imágenes, etc.).
    setInterval(revisarTodos, 1000);
})();
