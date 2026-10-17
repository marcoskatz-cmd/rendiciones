/**
 * PDF de la rendición: lo que Agustín imprime y entrega a Contabilidad.
 *
 *   1. Carátula: número, período, total y total por área.
 *   2. Detalle: una fila por gasto (comercio, concepto, área, a quién se reintegró, monto).
 *   3. Anexo A: un recibo firmado por cada reintegro (una persona, uno o más tickets,
 *      un total). Reemplaza al recibo de papel; los tickets físicos van abrochados.
 *   4. Anexo B: una captura por cada transferencia.
 *
 * Se genera con HtmlService → PDF. Las imágenes van embebidas como data URL
 * porque el conversor no puede ir a buscar archivos a Drive.
 */

function generarPdfRendicion_(r, gastos) {
  var html = htmlRendicion_(r, gastos);
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

/** Agrupa los gastos por recibo_id manteniendo el orden de aparición. */
function agruparPorRecibo_(gastos) {
  var grupos = [], idx = {};
  gastos.forEach(function (g) {
    var k = g.recibo_id || g.id;
    if (idx[k] === undefined) { idx[k] = grupos.length; grupos.push({ id: k, lineas: [], total: 0 }); }
    grupos[idx[k]].lineas.push(g);
    grupos[idx[k]].total += Number(g.monto) || 0;
  });
  return grupos;
}

function htmlRendicion_(r, gastos) {
  var total = 0;
  var porArea = {};
  gastos.forEach(function (g) {
    var m = Number(g.monto) || 0;
    total += m;
    porArea[g.area] = (porArea[g.area] || 0) + m;
  });
  var recibos = agruparPorRecibo_(gastos.filter(function (g) { return g.tipo === 'ticket'; }));
  var transf = agruparPorRecibo_(gastos.filter(function (g) { return g.tipo === 'transferencia'; }));

  var css =
    'body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;color:#111;margin:0}' +
    '.pag{page-break-after:always;padding:18mm 16mm}' +
    '.pag:last-child{page-break-after:auto}' +
    'h1{font-size:20pt;margin:0 0 2mm}h2{font-size:14pt;margin:0 0 4mm;border-bottom:2px solid #0f766e;padding-bottom:1mm}' +
    '.sub{color:#555;margin-bottom:8mm}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:1.6mm 2mm;text-align:left;vertical-align:top;font-size:9.5pt}' +
    'th{background:#e6f2f0}td.num,th.num{text-align:right;white-space:nowrap}' +
    '.tot{font-weight:bold;background:#f3f3f3}' +
    '.firmas{display:table;width:100%;margin-top:22mm}.firmas div{display:table-cell;width:50%;text-align:center;padding:0 8mm}' +
    '.firmas .linea{border-top:1px solid #333;padding-top:2mm;margin-top:18mm}' +
    '.recibo{border:1px solid #333;padding:7mm;margin:0 0 7mm}' +
    '.recibo h3{margin:0 0 3mm;font-size:13pt}' +
    '.recibo .monto{font-size:15pt;font-weight:bold}' +
    '.recibo p{margin:1.5mm 0}' +
    '.recibo table{margin:3mm 0}' +
    '.recibo .firma img{height:26mm;display:block;margin:3mm 0 1mm}' +
    '.recibo .firma{display:table;width:100%;margin-top:4mm}.recibo .firma div{display:table-cell;width:50%;vertical-align:bottom}' +
    '.cap img{max-width:100%;max-height:190mm;display:block;border:1px solid #bbb;margin-bottom:3mm}' +
    '.chip{display:inline-block;background:#e6f2f0;color:#0f766e;padding:0.5mm 2mm;border-radius:2mm;font-size:9pt}';

  var h = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>';

  // ---- 1. carátula ----
  h += '<div class="pag">';
  h += '<h1>Rendición de gastos N° ' + numeroStr_(r.numero) + '</h1>';
  h += '<div class="sub">' + esc_(CFG.EMPRESA) + ' · Responsable: ' + esc_(CFG.RESPONSABLE) +
       ' · Período: ' + fechaLinda_(r.fecha_apertura) + ' al ' + fechaLinda_(hoyStr_()) + '</div>';
  h += '<h2>Resumen por área</h2><table><tr><th>Área</th><th class="num">Gastos</th><th class="num">Importe</th></tr>';
  Object.keys(porArea).sort().forEach(function (a) {
    var n = gastos.filter(function (g) { return g.area === a; }).length;
    h += '<tr><td>' + esc_(a) + '</td><td class="num">' + n + '</td><td class="num">$ ' + montoLindo_(porArea[a]) + '</td></tr>';
  });
  h += '<tr class="tot"><td>TOTAL</td><td class="num">' + gastos.length + '</td><td class="num">$ ' + montoLindo_(total) + '</td></tr></table>';
  h += '<p style="margin-top:6mm"><span class="chip">' + recibos.length + ' recibo' + (recibos.length === 1 ? '' : 's') + ' de reintegro firmado' + (recibos.length === 1 ? '' : 's') + ' (Anexo A)</span> &nbsp; ' +
       '<span class="chip">' + transf.length + ' transferencia' + (transf.length === 1 ? '' : 's') + ' con captura (Anexo B)</span></p>';
  h += '<p style="color:#555;font-size:9.5pt">Los tickets físicos de los reintegros se adjuntan a esta rendición. ' +
       'Cada recibo de reintegro fue firmado digitalmente en el celular por la persona que cobró y reemplaza al recibo en papel.</p>';
  h += '<div class="firmas"><div><div class="linea">' + esc_(CFG.RESPONSABLE) + '<br><small>Entregó</small></div></div>' +
       '<div><div class="linea">Contabilidad<br><small>Recibió · Fecha: ____/____/______</small></div></div></div>';
  h += '</div>';

  // ---- 2. detalle ----
  h += '<div class="pag"><h2>Detalle de gastos</h2><table>' +
       '<tr><th>Fecha</th><th>Tipo</th><th>Comercio / Destinatario</th><th>Concepto</th><th>Área</th><th>Reintegrado a</th><th class="num">Importe</th></tr>';
  gastos.forEach(function (g) {
    h += '<tr><td>' + fechaLinda_(g.fecha) + '</td><td>' + (g.tipo === 'ticket' ? 'Ticket' : 'Transf.') + '</td>' +
         '<td>' + esc_(g.comercio) + '</td><td>' + esc_(g.concepto) + '</td><td>' + esc_(g.area) + '</td>' +
         '<td>' + esc_(g.persona) + '</td><td class="num">$ ' + montoLindo_(g.monto) + '</td></tr>';
  });
  h += '<tr class="tot"><td colspan="6">TOTAL</td><td class="num">$ ' + montoLindo_(total) + '</td></tr></table></div>';

  // ---- 3. anexo A: recibos (uno por página; si tiene una sola línea, dos por página) ----
  if (recibos.length) {
    var pendientes = recibos.slice();
    var primero = true;
    while (pendientes.length) {
      h += '<div class="pag">';
      if (primero) { h += '<h2>Anexo A · Recibos de reintegro firmados</h2>'; primero = false; }
      var rec = pendientes.shift();
      h += htmlRecibo_(r, rec);
      if (rec.lineas.length === 1 && pendientes.length && pendientes[0].lineas.length === 1) h += htmlRecibo_(r, pendientes.shift());
      h += '</div>';
    }
  }

  // ---- 4. anexo B: capturas ----
  if (transf.length) {
    transf.forEach(function (t, i) {
      h += '<div class="pag">';
      if (i === 0) h += '<h2>Anexo B · Capturas de transferencias</h2>';
      t.lineas.forEach(function (g) {
        h += '<p>' + fechaLinda_(g.fecha) + ' · <b>' + esc_(g.comercio) + '</b> · ' + esc_(g.concepto) +
             ' · <span class="chip">' + esc_(g.area) + '</span> · <b>$ ' + montoLindo_(g.monto) + '</b></p>';
      });
      var fotos = String(t.lineas[0].fotos || '').split(' | ').filter(Boolean);
      fotos.forEach(function (f) {
        var img = imagenComoDataUrl_(f);
        h += img ? '<div class="cap"><img src="' + img + '"></div>' : '<p><i>(La captura no se pudo leer de Drive)</i></p>';
      });
      h += '</div>';
    });
  }

  h += '</body></html>';
  return h;
}

function htmlRecibo_(r, rec) {
  var g0 = rec.lineas[0];
  var firma = imagenComoDataUrl_(g0.firma);
  var h = '<div class="recibo"><h3>Recibo de reintegro · Rendición N° ' + numeroStr_(r.numero) + '</h3>';
  h += '<p>Recibí de <b>' + esc_(CFG.EMPRESA) + '</b> (' + esc_(CFG.RESPONSABLE) + ') la suma de ' +
       '<span class="monto">$ ' + montoLindo_(rec.total) + '</span> en concepto de reintegro de ' +
       (rec.lineas.length === 1 ? 'el siguiente gasto' : 'los siguientes ' + rec.lineas.length + ' gastos') + ', cuyos tickets entregué:</p>';
  h += '<table><tr><th>Fecha</th><th>Comercio</th><th>Concepto</th><th>Área</th><th class="num">Importe</th></tr>';
  rec.lineas.forEach(function (g) {
    h += '<tr><td>' + fechaLinda_(g.fecha) + '</td><td>' + esc_(g.comercio) + '</td><td>' + esc_(g.concepto) + '</td><td>' + esc_(g.area) + '</td><td class="num">$ ' + montoLindo_(g.monto) + '</td></tr>';
  });
  if (rec.lineas.length > 1) h += '<tr class="tot"><td colspan="4">TOTAL</td><td class="num">$ ' + montoLindo_(rec.total) + '</td></tr>';
  h += '</table>';
  h += '<div class="firma"><div>' + (firma ? '<img src="' + firma + '">' : '<p><i>(firma no disponible)</i></p>') +
       '<b>' + esc_(g0.persona) + '</b>' + (g0.persona_dni ? '<br>DNI ' + esc_(g0.persona_dni) : '') +
       '<br><small>Firmado en el celular el ' + esc_(g0.ts) + '</small></div>' +
       '<div style="text-align:right;color:#555"><small>Tucumán</small></div></div>';
  h += '</div>';
  return h;
}
