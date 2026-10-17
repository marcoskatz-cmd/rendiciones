# Rendición de gastos — INGECO

App para Agustín: carga tickets (con recibo firmado en el celular) y transferencias
(con captura), Claude lee cada comprobante, él asigna el área, y al cerrar la semana
se genera el PDF que imprime y entrega a Contabilidad junto con los tickets físicos.

## Estructura

- `apps-script/` — backend (Google Apps Script): API JSON, planilla, Drive, Claude, PDF.
- `docs/` — PWA de Agustín, publicada por GitHub Pages.

## Flujo

1. **Nuevo gasto → Tickets**: una o más fotos (varios tickets por foto) → Claude devuelve
   una línea por comprobante → Agustín corrige/saca/agrega → área por línea → nombre de
   quien cobra + firma en canvas de UN recibo por el total → una fila de GASTOS por línea,
   todas con el mismo `recibo_id`. Los tickets físicos no se numeran: van abrochados al PDF.
2. **Nuevo gasto → Transferencia**: captura → Claude → área → se guarda. Sin recibo.
3. **Cerrar rendición**: PDF en Drive (carátula con total por área, detalle, Anexo A recibos
   firmados, Anexo B capturas) + aviso a Contabilidad por app-ingeco.

Hay una sola rendición abierta a la vez; la siguiente se abre sola con el primer gasto.

## Datos

Planilla `RENDICIONES — Base de datos`: hojas `RENDICIONES`, `GASTOS`, `AREAS`, `PERSONAS`, `LOG`.
Carpeta Drive `RENDICIONES — Comprobantes y PDF`, una subcarpeta por rendición.
Áreas y personas se editan en la planilla (columna `activo` = SI). Las personas se aprenden
solas de los recibos.

## Claude

`Claude.gs` llama a `https://api.anthropic.com/v1/messages` con `claude-opus-5-5`, salida JSON
estricta (`output_config.format`, lista `comprobantes[]`) y `effort: low`. La clave vive en Script Properties
(`ANTHROPIC_API_KEY`), nunca en el front.

## Instalación por única vez

1. `cd apps-script && clasp push && clasp create-deployment --description "v1"`.
2. Abrir `<URL>?action=setup` con la cuenta dueña del script → devuelve `bootstrap_key`.
3. `<URL>?action=set_claude_key&key=<bootstrap_key>&key_claude=<sk-ant-...>`.
4. (Opcional, avisos) `<URL>?action=set_clave_avisos&key=<bootstrap_key>&clave=<CLAVE_RENDICIONES>`.
5. Poner el deploymentId en `docs/index.html` (`RENDICIONES_API_URL`) y `git push`.
6. Dar de alta el módulo `RENDICIONES` en app-ingeco (guard.js no bloquea si no existe).

## Deploy

Backend: `clasp push` + `clasp update-deployment -d "vN" <deploymentId>` (nunca crear uno nuevo).
Front: `git push` (Pages sirve `docs/`). Subir `?v=N` en `index.html` y `sw.js` al cambiar assets.

## Mantenimiento

- `<URL>?action=regenerar_pdf&key=<bootstrap_key>&numero=7` vuelve a armar el PDF de una cerrada.
- `<URL>?action=diagnostico&key=<bootstrap_key>` lista desvíos de columnas / clave faltante.
