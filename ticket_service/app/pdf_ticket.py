"""
CUBEX - Generación del PDF del ticket.

Primero intenta con la plantilla HTML (xhtml2pdf). Si esa conversión falla
(por ejemplo, por una diferencia de librerías en el servidor), genera el
mismo comprobante directamente con ReportLab, que ya viene instalado como
dependencia de xhtml2pdf. Así el cliente siempre recibe su ticket.
"""

from __future__ import annotations

import io
import traceback


def _pdf_desde_plantilla(html: str) -> bytes:
    from xhtml2pdf import pisa

    buffer = io.BytesIO()
    resultado = pisa.CreatePDF(io.StringIO(html), dest=buffer, encoding="utf-8")

    if resultado.err:
        raise RuntimeError(f"xhtml2pdf reportó {resultado.err} error(es) al convertir la plantilla.")

    contenido = buffer.getvalue()

    if not contenido.startswith(b"%PDF"):
        raise RuntimeError("xhtml2pdf no produjo un PDF válido.")

    return contenido


def _dinero(valor: float) -> str:
    return f"${valor:,.2f}"


def _pdf_con_reportlab(datos: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape

    dorado = colors.HexColor("#d6a900")
    estilos = getSampleStyleSheet()
    normal = ParagraphStyle("normal", parent=estilos["Normal"], fontName="Helvetica", fontSize=10, leading=14)
    marca = ParagraphStyle("marca", parent=normal, fontName="Helvetica-Bold", fontSize=28, leading=32, alignment=TA_CENTER)
    centrado = ParagraphStyle("centrado", parent=normal, alignment=TA_CENTER)
    lema = ParagraphStyle("lema", parent=centrado, textColor=colors.HexColor("#a88300"))
    subtitulo = ParagraphStyle("subtitulo", parent=centrado, fontName="Helvetica-Bold", fontSize=14, leading=18)
    seccion = ParagraphStyle("seccion", parent=normal, fontName="Helvetica-Bold", fontSize=11, spaceBefore=12, spaceAfter=6)
    total = ParagraphStyle("total", parent=normal, fontName="Helvetica-Bold", fontSize=15, leading=20, alignment=TA_RIGHT)
    aprobado = ParagraphStyle("aprobado", parent=centrado, fontName="Helvetica-Bold", textColor=colors.HexColor("#238451"))
    pie = ParagraphStyle("pie", parent=centrado, fontSize=8, textColor=colors.HexColor("#666666"))

    def texto(valor) -> str:
        return escape(str(valor))

    elementos = [
        Paragraph("CUBEX", marca),
        Paragraph("Gira, piensa y conquista", lema),
        Spacer(1, 4 * mm),
        Paragraph("COMPROBANTE DE COMPRA", subtitulo),
        Spacer(1, 3 * mm),
        Paragraph(f"<b>Folio:</b> {texto(datos['folio'])}", centrado),
        Spacer(1, 4 * mm),
        Paragraph("INFORMACIÓN DEL PEDIDO", seccion),
    ]

    info = Table([
        [Paragraph(f"<b>Número de pedido:</b> #{texto(datos['pedido_id'])}", normal),
         Paragraph(f"<b>Fecha:</b> {texto(datos['fecha'])}", normal)],
        [Paragraph("<b>Estado:</b> CONFIRMADO", normal),
         Paragraph(f"<b>Cliente:</b> {texto(datos['cliente_nombre'])}", normal)],
        [Paragraph(f"<b>Correo electrónico:</b> {texto(datos['cliente_correo'] or 'No disponible')}", normal), ""],
    ], colWidths=[85 * mm, 85 * mm])
    info.setStyle(TableStyle([("SPAN", (0, 2), (1, 2)), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elementos += [info, Paragraph("PRODUCTOS", seccion)]

    filas = [["Cant.", "Producto", "Precio unitario", "Importe"]]
    for item in datos["items"]:
        filas.append([
            str(item["cantidad"]),
            Paragraph(texto(item["producto"]), normal),
            _dinero(item["precio_unitario"]),
            _dinero(item["importe"]),
        ])

    productos = Table(filas, colWidths=[18 * mm, 82 * mm, 35 * mm, 35 * mm], repeatRows=1)
    productos.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#222222")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    linea_total = Table([[""]], colWidths=[170 * mm])
    linea_total.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 1.5, dorado)]))

    elementos += [
        productos,
        Spacer(1, 6 * mm),
        linea_total,
        Paragraph(f"TOTAL: {_dinero(datos['total'])}", total),
        Spacer(1, 6 * mm),
        Paragraph("PAGO APROBADO", aprobado),
        Spacer(1, 10 * mm),
        Paragraph("Gracias por comprar en CUBEX.<br/>Conserva este comprobante para cualquier aclaración.", pie),
    ]

    buffer = io.BytesIO()
    documento = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Ticket CUBEX #{datos['pedido_id']}", author="CUBEX"
    )
    documento.build(elementos)
    return buffer.getvalue()


def generar_pdf(html: str, datos: dict) -> bytes:
    try:
        return _pdf_desde_plantilla(html)
    except Exception:
        print("[tickets] La plantilla HTML no se pudo convertir; se usa ReportLab:", flush=True)
        traceback.print_exc()

    return _pdf_con_reportlab(datos)
