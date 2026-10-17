/**
 * PDF de la rendición: lo que Agustín imprime y entrega a Contabilidad.
 *
 *   1. Carátula: número, período, total y total por área.
 *   2. Detalle: una fila por gasto (ticket o transferencia).
 *   3. Anexo A: un recibo firmado por persona, con sus tickets detallados y el total.
 *      Reemplaza al recibo de papel; los tickets físicos van abrochados.
 *   4. Anexo B: una captura por transferencia.
 *
 * HtmlService → PDF. Las imágenes van embebidas como data URL porque el
 * conversor no puede ir a buscar archivos a Drive.
 */

function generarPdfRendicion_(r, recibos, lineas) {
  var html = htmlRendicion_(r, recibos, lineas);
  var blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf');
  var nombre = 'Rendicion-' + numeroStr_(r.numero) + '-' + hoyStr_() + '.pdf';
  blob.setName(nombre);
  var carpeta = carpetaRendicion_(r.numero);
  var previos = carpeta.getFilesByName(nombre);
  while (previos.hasNext()) previos.next().setTrashed(true);
  var archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: archivo.getId(), url: archivo.getUrl() };
}

var CSS_PDF =
  'body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;color:#111;margin:0}' +
  '.pag{page-break-after:always;padding:18mm 16mm}.pag:last-child{page-break-after:auto}' +
  'h1{font-size:20pt;margin:0 0 2mm}h2{font-size:14pt;margin:0 0 4mm;border-bottom:2px solid #0f766e;padding-bottom:1mm}' +
  '.sub{color:#555;margin-bottom:8mm}' +
  'table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:1.6mm 2mm;text-align:left;vertical-align:top;font-size:9.5pt}' +
  'th{background:#e6f2f0}td.num,th.num{text-align:right;white-space:nowrap}.tot{font-weight:bold;background:#f3f3f3}' +
  '.firmas{display:table;width:100%;margin-top:22mm}.firmas div{display:table-cell;width:50%;text-align:center;padding:0 8mm}' +
  '.firmas .linea{border-top:1px solid #333;padding-top:2mm;margin-top:18mm}' +
  '.recibo{border:1px solid #333;padding:7mm;margin:0 0 7mm}.recibo h3{margin:0 0 3mm;font-size:13pt}' +
  '.recibo .monto{font-size:15pt;font-weight:bold}.recibo p{margin:1.5mm 0}.recibo table{margin:3mm 0}' +
  '.recibo .firma img{height:26mm;display:block;margin:3mm 0 1mm}' +
  '.recibo .firma{display:table;width:100%;margin-top:4mm}.recibo .firma div{display:table-cell;width:50%;vertical-align:bottom}' +
  '.cap img{max-width:100%;max-height:190mm;display:block;border:1px solid #bbb;margin-bottom:3mm}' +
  '.chip{display:inline-block;background:#e6f2f0;color:#0f766e;padding:0.5mm 2mm;border-radius:2mm;font-size:9pt}';

function htmlRendicion_(r, recibos, lineas) {
  var porRecibo = {};
  lineas.forEach(function (g) { (porRecibo[g.recibo_id] = porRecibo[g.recibo_id] || []).push(g); });
  var total = 0, porArea = {}, nPorArea = {};
  recibos.forEach(function (x) { total += Number(x.total) || 0; });
  lineas.forEach(function (g) {
    porArea[g.area] = (porArea[g.area] || 0) + (Number(g.monto) || 0);
    nPorArea[g.area] = (nPorArea[g.area] || 0) + 1;
  });
  var tickets = recibos.filter(function (x) { return x.tipo === 'ticket'; });
  var transf = recibos.filter(function (x) { return x.tipo === 'transferencia'; });

  var h = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + CSS_PDF + '</style></head><body>';

  // ---- 1. carátula ----
  h += '<div class="pag"><h1>Rendición de gastos N° ' + numeroStr_(r.numero) + '</h1>';
  h += '<div class="sub">' + esc_(CFG.EMPRESA) + ' · Responsable: ' + esc_(CFG.RESPONSABLE) +
       ' · Período: ' + fechaLinda_(r.fecha_apertura) + ' al ' + fechaLinda_(hoyStr_()) + '</div>';
  h += '<h2>Resumen por área</h2><table><tr><th>Área</th><th class="num">Gastos</th><th class="num">Importe</th></tr>';
  Object.keys(porArea).sort().forEach(function (a) {
    h += '<tr><td>' + esc_(a) + '</td><td class="num">' + nPorArea[a] + '</td><td class="num">$ ' + montoLindo_(porArea[a]) + '</td></tr>';
  });
  h += '<tr class="tot"><td>TOTAL</td><td class="num">' + lineas.length + '</td><td class="num">$ ' + montoLindo_(total) + '</td></tr></table>';
  h += '<p style="margin-top:6mm"><span class="chip">' + tickets.length + ' recibo' + (tickets.length === 1 ? '' : 's') + ' de reintegro firmado' + (tickets.length === 1 ? '' : 's') + ' (Anexo A)</span> &nbsp; ' +
       '<span class="chip">' + transf.length + ' transferencia' + (transf.length === 1 ? '' : 's') + ' con captura (Anexo B)</span></p>';
  h += '<p style="color:#555;font-size:9.5pt">Los tickets físicos de los reintegros se adjuntan a esta rendición. ' +
       'Cada recibo de reintegro fue firmado digitalmente en el celular por la persona que cobró y reemplaza al recibo en papel.</p>';
  h += '<div class="firmas"><div><div class="linea">' + esc_(CFG.RESPONSABLE) + '<br><small>Entregó</small></div></div>' +
       '<div><div class="linea">Contabilidad<br><small>Recibió · Fecha: ____/____/______</small></div></div></div></div>';

  // ---- 2. detalle ----
  h += '<div class="pag"><h2>Detalle de gastos</h2><table>' +
       '<tr><th>Fecha</th><th>Tipo</th><th>Comercio / Destinatario</th><th>Concepto</th><th>Área</th><th>Reintegrado a</th><th class="num">Importe</th></tr>';
  recibos.forEach(function (x) {
    (porRecibo[x.id] || []).forEach(function (g) {
      h += '<tr><td>' + fechaLinda_(g.fecha) + '</td><td>' + (x.tipo === 'ticket' ? 'Ticket' : 'Transf.') + '</td>' +
           '<td>' + esc_(g.comercio) + '</td><td>' + esc_(g.concepto) + '</td><td>' + esc_(g.area) + '</td>' +
           '<td>' + esc_(x.persona) + '</td><td class="num">$ ' + montoLindo_(g.monto) + '</td></tr>';
    });
  });
  h += '<tr class="tot"><td colspan="6">TOTAL</td><td class="num">$ ' + montoLindo_(total) + '</td></tr></table></div>';

  // ---- 3. anexo A: recibos ----
  if (tickets.length) {
    var pendientes = tickets.slice(), primero = true;
    while (pendientes.length) {
      h += '<div class="pag">';
      if (primero) { h += '<h2>Anexo A · Recibos de reintegro firmados</h2>'; primero = false; }
      var x = pendientes.shift();
      h += htmlRecibo_(r, x, porRecibo[x.id] || []);
      if ((porRecibo[x.id] || []).length <= 2 && pendientes.length && (porRecibo[pendientes[0].id] || []).length <= 2) {
        var y = pendientes.shift();
        h += htmlRecibo_(r, y, porRecibo[y.id] || []);
      }
      h += '</div>';
    }
  }

  // ---- 4. anexo B: capturas ----
  transf.forEach(function (x, i) {
    h += '<div class="pag">';
    if (i === 0) h += '<h2>Anexo B · Capturas de transferencias</h2>';
    (porRecibo[x.id] || []).forEach(function (g) {
      h += '<p>' + fechaLinda_(g.fecha) + ' · <b>' + esc_(g.comercio) + '</b> · ' + esc_(g.concepto) +
           ' · <span class="chip">' + esc_(g.area) + '</span> · <b>$ ' + montoLindo_(g.monto) + '</b></p>';
    });
    String(x.fotos || '').split(' | ').filter(Boolean).forEach(function (f) {
      var img = imagenComoDataUrl_(f);
      h += img ? '<div class="cap"><img src="' + img + '"></div>' : '<p><i>(La captura no se pudo leer de Drive)</i></p>';
    });
    h += '</div>';
  });

  h += '</body></html>';
  return h;
}

function htmlRecibo_(r, x, lineas) {
  var firma = imagenComoDataUrl_(x.firma);
  var h = '<div class="recibo"><h3>Recibo de reintegro · Rendición N° ' + numeroStr_(r.numero) + '</h3>';
  h += '<p>Recibí de <b>' + esc_(CFG.EMPRESA) + '</b> (' + esc_(CFG.RESPONSABLE) + ') la suma de ' +
       '<span class="monto">$ ' + montoLindo_(x.total) + '</span> en concepto de reintegro de ' +
       (lineas.length === 1 ? 'el siguiente gasto' : 'los siguientes ' + lineas.length + ' gastos') + ', cuyos tickets entregué:</p>';
  h += '<table><tr><th>Fecha</th><th>Comercio</th><th>Concepto</th><th>Área</th><th class="num">Importe</th></tr>';
  lineas.forEach(function (g) {
    h += '<tr><td>' + fechaLinda_(g.fecha) + '</td><td>' + esc_(g.comercio) + '</td><td>' + esc_(g.concepto) + '</td><td>' + esc_(g.area) + '</td><td class="num">$ ' + montoLindo_(g.monto) + '</td></tr>';
  });
  if (lineas.length > 1) h += '<tr class="tot"><td colspan="4">TOTAL</td><td class="num">$ ' + montoLindo_(x.total) + '</td></tr>';
  h += '</table>';
  h += '<div class="firma"><div>' + (firma ? '<img src="' + firma + '">' : '<p><i>(firma no disponible)</i></p>') +
       '<b>' + esc_(x.persona) + '</b>' + (x.persona_dni ? '<br>DNI ' + esc_(x.persona_dni) : '') +
       '<br><small>Firmado en el celular el ' + esc_(x.ts) + '</small></div>' +
       '<div style="text-align:right;color:#555"><small>Tucumán, ' + fechaLinda_(x.fecha) + '</small></div></div></div>';
  return h;
}
