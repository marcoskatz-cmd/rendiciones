/**
 * API JSON. La PWA vive en GitHub Pages y habla con esto por HTTP.
 *
 * No usamos HtmlService para servir la app: con más de una cuenta de Google en
 * el celular rutea por /u/N y la PWA instalada se rompe. El front va estático
 * y esto queda como API pura (doPost + ContentService).
 *
 * El POST llega con Content-Type text/plain para evitar el preflight CORS.
 */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') {
      return json_({ ok: true, ts: tsStr_(), instalado: !!prop_('SHEET_ID'), claude: !!prop_('ANTHROPIC_API_KEY') });
    }
    if (p.action === 'setup') {
      exigirBootstrap_(p);
      var res = setupCompleto_();
      res.bootstrap_key = prop_('BOOTSTRAP_KEY');
      return json_({ ok: true, data: res });
    }
    if (p.action === 'set_claude_key') {
      exigirBootstrap_(p);
      if (!p.key_claude) throw new Error('Falta key_claude.');
      setProp_('ANTHROPIC_API_KEY', p.key_claude);
      log_('bootstrap', 'SET_CLAUDE_KEY', '', '');
      return json_({ ok: true });
    }
    if (p.action === 'set_clave_avisos') {
      exigirBootstrap_(p);
      setProp_('CLAVE_' + CFG.MODULO_APP_INGECO, p.clave || '');
      return json_({ ok: true });
    }
    if (p.action === 'regenerar_pdf') {
      exigirBootstrap_(p);
      return json_({ ok: true, data: regenerar_pdf_(p) });
    }
    if (p.action === 'limpiar_pruebas') {
      exigirBootstrap_(p);
      return json_({ ok: true, data: limpiarPruebas_(String(p.aplicar) === 'si') });
    }
    if (p.action === 'diagnostico') {
      exigirBootstrap_(p);
      return json_({ ok: true, data: diagnosticar_() });
    }
    return json_({ ok: false, error: 'Acción desconocida.' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * La primera llamada de instalación genera y devuelve la clave; después hay
 * que presentarla. La ventana se cierra cuando la planilla existe.
 */
function exigirBootstrap_(p) {
  var k = prop_('BOOTSTRAP_KEY');
  if (!prop_('SHEET_ID')) {
    if (!k) setProp_('BOOTSTRAP_KEY', uuid_());
    return;
  }
  if (String(p.key || '') !== k) throw new Error('Clave de instalación inválida.');
}

var RUTAS = {
  estado: estado_,
  leer_comprobante: leer_comprobante_,
  atender: atender_,
  agregar_fotos: agregar_fotos_,
  leer_fotos_recibo: leer_fotos_recibo_,
  detallar: detallar_,
  transferencia: transferencia_,
  editar_linea: editar_linea_,
  anular_recibo: anular_recibo_,
  cerrar_rendicion: cerrar_rendicion_,
  ver_rendicion: ver_rendicion_
};

function doPost(e) {
  var p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'No se pudo leer el pedido.' });
  }
  var fn = RUTAS[p.action];
  if (!fn) return json_({ ok: false, error: 'Acción desconocida: ' + p.action });
  try {
    var data = fn(p);
    // con_all (opcional): después de escribir, devuelve también el estado
    // completo y la app se ahorra el segundo viaje (~3 s). Sin el flag, igual que antes.
    if (p.con_all && p.action !== 'estado') return json_({ ok: true, data: data, all: estado_(p) });
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}
