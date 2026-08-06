---
name: research
description: Investigación profunda que produce un reporte y un artículo publicable. Usar cuando el operador pida "investiga", "haz un reporte", "research", "investigación", "artículo sobre", "escribe un artículo", "reporte sobre", o quiera un documento con tags y un link compartible. Combina búsqueda web, síntesis, redacción y publicación.
---

# Research

Convierte un tema en un reporte estructurado y un artículo listo para compartir.

## Cuándo ejecutar

- Si esta skill está **activa en el system prompt** (porque el chat está marcado como research), **EJECUTA este flujo para CADA mensaje del usuario** sin preguntar si quiere investigar.
- Si no está activa, actívala cuando el operador pida investigar, reporte o artículo.

## Flujo (ejecutar paso a paso)

### 1. Aclarar el alcance (solo si es ambiguo)
Si el tema es vago, pregunta brevemente: enfoque, profundidad (resumen vs. detallado), idioma y audiencia. Si es claro, avanza sin preguntar.

### 2. Investigar en profundidad
- Lanza **entre 6 y 12 consultas** con `web_search` cubriendo sinónimos, ángulos distintos, fuentes primarias, noticias recientes, análisis de terceros y resultados en el idioma del usuario.
- Refina la estrategia de búsqueda: si los primeros resultados son superficiales, reformula las consultas con términos más específicos, operadores de búsqueda, nombres propios o años.
- Usa `web_fetch` en **al menos 5 fuentes relevantes** para leer contenido completo en lugar de confiar en los resúmenes del buscador.
- Reúne datos, cifras, fechas, nombres, citas textuales y URLs. No inventes nada.
- Si un resultado prometedor tiene enlaces internos a secciones relevantes, sigue al menos 2-3 de ellos con `web_fetch`.

### 3. Construir el reporte
Escribe un reporte exhaustivo en Markdown:
- **Título** y fecha.
- **Resumen ejecutivo** (3-5 líneas).
- **Secciones** con subtítulos claros.
- **Datos y evidencia** con citas a las fuentes.
- **Conclusión** y, si aplica, recomendaciones.
- **Fuentes** al final (lista de URLs).

Guárdalo con `write_file` en `research/<slug>/reporte.md`.

### 4. Construir el artículo
A partir del reporte, escribe un **artículo extenso y completo** (no el reporte crudo):
- Título atractivo, introducción que enganche, cuerpo fluido y detallado, cierre.
- El artículo debe tener **al menos 5 secciones principales**, con subtítulos claros y transiciones naturales.
- Incluye ejemplos, cifras, fechas, nombres propios y contexto histórico o de fondo extraídos de las fuentes.
- Cita las fuentes con enlaces directos en línea o pie de página.
- **Tags**: 3-8 etiquetas relevantes al final (formato `#tag` o lista).
- Tono acorde a la audiencia.

Guárdalo con `write_file` en `research/<slug>/articulo.md`.

### 5. Confirmar al operador
Cuando termines, responde brevemente en el chat:
- Título de la investigación.
- Ruta de los archivos (`research/<slug>/reporte.md` y `articulo.md`).
- Tags.
- Pregunta si quiere compartirlo con sharemd.

### 6. Compartir con sharemd (solo con consentimiento)
Antes de publicar, **pide confirmación explícita**. Muestra el artículo y pregunta si quiere compartirlo.

Una vez confirmado:
1. Si `sharemd` no está instalado, instálalo: `npm install -g sharemd` (requiere Node 18+).
2. Publica el artículo:
   ```bash
   sharemd research/<slug>/articulo.md
   ```
3. Guarda el link en `research/<slug>/sharemd.json`:
   ```json
   {"url": "https://sharemd.sh/<id>"}
   ```
4. Entrega el link al operador.

> El archivo `.sharemd` (token de edición) se crea junto al artículo. No lo subas a git ni lo compartas.

## Reglas
- **Si la skill está activa, investiga sin pedir permiso adicional.** El usuario ya entró a la sección de Investigación.
- Cita fuentes reales; no inventes datos ni URLs.
- El reporte y el artículo son documentos distintos: el reporte es exhaustivo, el artículo es legible.
- Si la búsqueda no arroja resultados, dilo y pregunta cómo proceder.
