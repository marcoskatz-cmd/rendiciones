/**
 * Lógica de negocio.
 *
 * Dos momentos bien separados:
 *   ATENDER   → con la persona adelante: nombre, monto, firma. Segundos. Crea un RECIBO
 *               (tipo ticket). Opcionalmente ya se le saca la foto a sus tickets.
 *   DETALLAR  → después: foto(s) de los tickets del recibo → Claude propone líneas →
 *               Agustín confirma que suman el total firmado y asigna área. Crea GASTOS.
 *   TRANSFERIR → captura + datos + área en un solo paso (recibo tipo transferencia,
 *               ya detallado).
 *   CERRAR    → exige que todos los recibos estén detallados. Genera el PDF.
 *
 * Hay a lo sumo UNA rendición abierta; se abre sola con el primer recibo.
 */

// ---------- rendición ----------

function rendicionAbierta_() {
  var todas = leer_('RENDICIONES');
  for (var i = todas.length - 1; i >= 0; i--) if (todas[i].estado === 'abierta') return todas[i];
  return null;
}

function proximoNumero_() {
  var max = 0;
  leer_('RENDICIONES').forEach(function (r) { max = Math.max(max, Number(r.numero) || 0); });
  return max + 1;
}

function abrirRendicionSiHaceFalta_() {
  var r = rendicionAbierta_();
  if (r) return r;
  var nueva = {
    id: uuid_(), numero: proximoNumero_(), estado: 'abierta', fecha_apertura: hoyStr_(),
    fecha_cierre: '', cantidad_recibos: 0, total: 0, pdf_url: '', pdf_id: '', op_id: ''
  };
  agregar_('RENDICIONES', nueva);
  log_(CFG.RESPONSABLE, 'ABRIR_RENDICION', 'N° ' + nueva.numero, '');
  return buscarPorId_('RENDICIONES', nueva.id);
}

function recibosDe_(rendicionId) {
  return leer_('RECIBOS').filter(function (x) {
    return String(x.rendicion_id) === String(rendicionId) && String(x.anulado).toUpperCase() !== 'SI';
  }).sort(function (a, b) { return Number(a.numero) - Number(b.numero); });
}

function lineasDe_(reciboId) {
  return leer_('GASTOS').filter(function (g) { return String(g.recibo_id) === String(reciboId); });
}

function lineasDeRendicion_(rendicionId) {
  return leer_('GASTOS').filter(function (g) { return String(g.rendicion_id) === String(rendicionId); });
}

function esSi_(v) { return String(v || '').toUpperCase() === 'SI'; }

function reciboPublico_(x, lineas) {
  return {
    id: x.id, numero: Number(x.numero), tipo: x.tipo, fecha: x.fecha,
    persona: x.persona, persona_dni: String(x.persona_dni || ''),
    total: Number(x.total) || 0,
    tiene_firma: !!x.firma,
    fotos: String(x.fotos || '').split(' | ').filter(Boolean).length,
    detallado: esSi_(x.detallado),
    ts: x.ts,
    lineas: (lineas || []).map(function (g) {
      return { id: g.id, fecha: g.fecha, monto: Number(g.monto) || 0, comercio: g.comercio, concepto: g.concepto, area: g.area };
    })
  };
}

function resumenRendicion_(r) {
  if (!r) return null;
  var recibos = recibosDe_(r.id);
  var lineas = lineasDeRendicion_(r.id);
  var porRecibo = {};
  lineas.forEach(function (g) { (porRecibo[g.recibo_id] = porRecibo[g.recibo_id] || []).push(g); });
  var total = 0, porArea = {}, sinDetallar = 0;
  recibos.forEach(function (x) {
    total += Number(x.total) || 0;
    if (!esSi_(x.detallado)) sinDetallar++;
  });
  lineas.forEach(function (g) { porArea[g.area] = (porArea[g.area] || 0) + (Number(g.monto) || 0); });
  return {
    id: r.id, numero: Number(r.numero), estado: r.estado,
    fecha_apertura: r.fecha_apertura, fecha_cierre: r.fecha_cierre,
    total: total, cantidad: recibos.length, sin_detallar: sinDetallar,
    por_area: porArea, pdf_url: r.pdf_url,
    recibos: recibos.map(function (x) { return reciboPublico_(x, porRecibo[x.id]); })
  };
}

/** Pantalla principal: rendición abierta + listas para los selectores. */
function estado_(p) {
  var r = rendicionAbierta_();
  var cerradas = leer_('RENDICIONES').filter(function (x) { return x.estado === 'cerrada'; })
    .sort(function (a, b) { return Number(b.numero) - Number(a.numero); }).slice(0, 10)
    .map(function (x) {
      return { numero: Number(x.numero), fecha_cierre: x.fecha_cierre, total: Number(x.total) || 0,
               cantidad: Number(x.cantidad_recibos) || 0, pdf_url: x.pdf_url };
    });
  return {
    hoy: hoyStr_(),
    responsable: CFG.RESPONSABLE,
    abierta: resumenRendicion_(r),
    proximo_numero: r ? Number(r.numero) : proximoNumero_(),
    areas: activos_('AREAS').map(function (a) { return a.area; }),
    personas: activos_('PERSONAS').map(function (x) { return { nombre: x.nombre, dni: String(x.dni || '') }; }),
    cerradas: cerradas,
    claude: !!prop_('ANTHROPIC_API_KEY'),
    diagnostico: diagnosticar_()
  };
}

function leer_comprobante_(p) { return leerComprobante_(p.imagen); }

// ---------- personas ----------

function recordarPersona_(nombre, dni) {
  nombre = String(nombre || '').trim();
  if (!nombre) return;
  var existentes = leer_('PERSONAS');
  for (var i = 0; i < existentes.length; i++) {
    if (String(existentes[i].nombre).toLowerCase() === nombre.toLowerCase()) {
      if (dni && !existentes[i].dni) actualizar_('PERSONAS', existentes[i]._fila, { dni: "'" + String(dni) });
      return;
    }
  }
  agregar_('PERSONAS', { nombre: nombre, dni: dni ? "'" + String(dni) : '', activo: 'SI' });
}

// ---------- ATENDER: recibo rápido ----------

function actualizarTotales_(r) {
  var recibos = recibosDe_(r.id);
  var total = 0;
  recibos.forEach(function (x) { total += Number(x.total) || 0; });
  actualizar_('RENDICIONES', r._fila, { cantidad_recibos: recibos.length, total: total });
}

function proximoNumeroRecibo_(r) {
  var max = 0;
  leer_('RECIBOS').forEach(function (x) {
    if (String(x.rendicion_id) === String(r.id)) max = Math.max(max, Number(x.numero) || 0);
  });
  return max + 1;
}

/**
 * POST {action:'atender', op_id, persona, persona_dni, total, firma, imagenes?: []}
 * Crea el recibo firmado. Las fotos son opcionales acá: se pueden sacar después.
 */
function atender_(p) {
  var repetido = buscarPorOpId_('RECIBOS', p.op_id);
  if (repetido) return { recibo: reciboPublico_(repetido, []), rendicion: resumenRendicion_(rendicionAbierta_()), repetido: true };

  var persona = String(p.persona || '').trim();
  var dni = String(p.persona_dni || '').replace(/\D/g, '');
  var total = Number(p.total);
  if (persona.length < 3) throw new Error('Falta el nombre de quien cobra.');
  if (!(total > 0)) throw new Error('El monto tiene que ser mayor a cero.');
  if (!p.firma) throw new Error('Falta la firma.');

  var r = abrirRendicionSiHaceFalta_();
  var numero = proximoNumeroRecibo_(r);
  var base = 'R' + numeroStr_(r.numero) + '-' + numeroStr_(numero);
  var firma = guardarImagen_(p.firma, r.numero, base + '-firma').url;
  var fotos = (Array.isArray(p.imagenes) ? p.imagenes : []).filter(Boolean).map(function (img, i) {
    return guardarImagen_(img, r.numero, base + '-tickets-' + (i + 1)).url;
  });
  var x = {
    id: uuid_(), rendicion_id: r.id, numero: numero, tipo: 'ticket', fecha: hoyStr_(),
    persona: persona, persona_dni: dni ? "'" + dni : '', total: total,
    firma: firma, fotos: fotos.join(' | '), detallado: '', ts: tsStr_(), anulado: '', op_id: p.op_id || ''
  };
  agregar_('RECIBOS', x);
  recordarPersona_(persona, dni);
  actualizarTotales_(r);
  log_(CFG.RESPONSABLE, 'ATENDER', base + ' ' + persona + ' $' + total + (fotos.length ? ' +' + fotos.length + ' foto' : ''), '');
  return { recibo: reciboPublico_(x, []), rendicion: resumenRendicion_(rendicionAbierta_()), repetido: false };
}

// ---------- DETALLAR ----------

function reciboAbierto_(id) {
  var x = buscarPorId_('RECIBOS', id);
  if (!x || esSi_(x.anulado)) throw new Error('No se encontró el recibo.');
  var r = buscarPorId_('RENDICIONES', x.rendicion_id);
  if (!r || r.estado !== 'abierta') throw new Error('La rendición ya está cerrada: no se puede cambiar.');
  return { recibo: x, rendicion: r };
}

/** POST {action:'agregar_fotos', id, imagenes:[]} → suma fotos de tickets a un recibo. */
function agregar_fotos_(p) {
  var c = reciboAbierto_(p.id);
  var imgs = (Array.isArray(p.imagenes) ? p.imagenes : []).filter(Boolean);
  if (!imgs.length) throw new Error('No llegó ninguna foto.');
  var previas = String(c.recibo.fotos || '').split(' | ').filter(Boolean);
  var base = 'R' + numeroStr_(c.rendicion.numero) + '-' + numeroStr_(c.recibo.numero);
  imgs.forEach(function (img) {
    previas.push(guardarImagen_(img, c.rendicion.numero, base + '-tickets-' + (previas.length + 1)).url);
  });
  actualizar_('RECIBOS', c.recibo._fila, { fotos: previas.join(' | ') });
  return { fotos: previas.length };
}

/** POST {action:'leer_fotos_recibo', id} → Claude lee las fotos que ya están en Drive (sacadas al atender). */
function leer_fotos_recibo_(p) {
  var c = reciboAbierto_(p.id);
  var fotos = String(c.recibo.fotos || '').split(' | ').filter(Boolean);
  if (!fotos.length) throw new Error('Este recibo no tiene fotos todavía.');
  var salida = { comprobantes: [], observacion_general: '' };
  fotos.forEach(function (url) {
    var img = imagenComoDataUrl_(url);
    if (!img) { salida.observacion_general = 'Una foto no se pudo leer de Drive.'; return; }
    var d = leerComprobante_(img);
    salida.comprobantes = salida.comprobantes.concat(d.comprobantes || []);
    if (d.observacion_general) salida.observacion_general = d.observacion_general;
  });
  return salida;
}

/**
 * POST {action:'detallar', id, lineas:[{fecha,monto,comercio,concepto,area}], forzar?}
 * Reemplaza las líneas del recibo. La suma tiene que coincidir con el total firmado;
 * si no coincide y forzar=true se acepta igual (queda en el LOG).
 */
function detallar_(p) {
  var c = reciboAbierto_(p.id);
  var x = c.recibo;
  var lineas = Array.isArray(p.lineas) ? p.lineas : [];
  if (!lineas.length) throw new Error('Cargá al menos un gasto.');
  var suma = 0;
  lineas.forEach(function (l, i) {
    var n = 'Gasto ' + (i + 1) + ': ';
    if (!(Number(l.monto) > 0)) throw new Error(n + 'el monto tiene que ser mayor a cero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.fecha || ''))) throw new Error(n + 'falta la fecha.');
    if (!String(l.area || '').trim()) throw new Error(n + 'falta el área.');
    if (!String(l.comercio || '').trim()) throw new Error(n + 'falta el comercio.');
    suma += Number(l.monto);
  });
  var total = Number(x.total) || 0;
  var dif = Math.round((suma - total) * 100) / 100;
  if (Math.abs(dif) >= 0.01 && !p.forzar) {
    throw new Error('Los gastos suman $' + montoLindo_(suma) + ' y el recibo firmado es por $' + montoLindo_(total) +
      ' (diferencia $' + montoLindo_(dif) + '). Corregí los montos o confirmá la diferencia.');
  }
  var sh = hoja_('GASTOS');
  lineasDe_(x.id).map(function (g) { return g._fila; }).sort(function (a, b) { return b - a; })
    .forEach(function (f) { sh.deleteRow(f); });
  lineas.forEach(function (l) {
    agregar_('GASTOS', {
      id: uuid_(), recibo_id: x.id, rendicion_id: x.rendicion_id,
      fecha: String(l.fecha), monto: Number(l.monto),
      comercio: String(l.comercio).trim(), concepto: String(l.concepto || '').trim(),
      area: String(l.area).trim(), ts: tsStr_()
    });
  });
  actualizar_('RECIBOS', x._fila, { detallado: 'SI' });
  log_(CFG.RESPONSABLE, 'DETALLAR', 'recibo ' + x.numero + ' ' + x.persona + ' ' + lineas.length + ' líneas $' + suma,
       Math.abs(dif) >= 0.01 ? 'diferencia forzada $' + dif : '');
  return { rendicion: resumenRendicion_(rendicionAbierta_()) };
}

// ---------- TRANSFERENCIA (un solo paso) ----------

/** POST {action:'transferencia', op_id, imagenes:[], lineas:[{fecha,monto,comercio,concepto,area}]} */
function transferencia_(p) {
  var repetido = buscarPorOpId_('RECIBOS', p.op_id);
  if (repetido) return { recibo: reciboPublico_(repetido, lineasDe_(repetido.id)), rendicion: resumenRendicion_(rendicionAbierta_()), repetido: true };
  var imgs = (Array.isArray(p.imagenes) ? p.imagenes : []).filter(Boolean);
  if (!imgs.length) throw new Error('Falta la captura de la transferencia.');
  var lineas = Array.isArray(p.lineas) ? p.lineas : [];
  if (!lineas.length) throw new Error('Falta el detalle de la transferencia.');
  var total = 0;
  lineas.forEach(function (l, i) {
    var n = lineas.length > 1 ? 'Transferencia ' + (i + 1) + ': ' : '';
    if (!(Number(l.monto) > 0)) throw new Error(n + 'el monto tiene que ser mayor a cero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.fecha || ''))) throw new Error(n + 'falta la fecha.');
    if (!String(l.area || '').trim()) throw new Error(n + 'falta el área.');
    if (!String(l.comercio || '').trim()) throw new Error(n + 'falta a quién se transfirió.');
    total += Number(l.monto);
  });

  var r = abrirRendicionSiHaceFalta_();
  var numero = proximoNumeroRecibo_(r);
  var base = 'R' + numeroStr_(r.numero) + '-' + numeroStr_(numero);
  var fotos = imgs.map(function (img, i) { return guardarImagen_(img, r.numero, base + '-transferencia-' + (i + 1)).url; });
  var x = {
    id: uuid_(), rendicion_id: r.id, numero: numero, tipo: 'transferencia', fecha: hoyStr_(),
    persona: '', persona_dni: '', total: total, firma: '', fotos: fotos.join(' | '),
    detallado: 'SI', ts: tsStr_(), anulado: '', op_id: p.op_id || ''
  };
  agregar_('RECIBOS', x);
  lineas.forEach(function (l) {
    agregar_('GASTOS', {
      id: uuid_(), recibo_id: x.id, rendicion_id: r.id, fecha: String(l.fecha), monto: Number(l.monto),
      comercio: String(l.comercio).trim(), concepto: String(l.concepto || '').trim(), area: String(l.area).trim(), ts: tsStr_()
    });
  });
  actualizarTotales_(r);
  log_(CFG.RESPONSABLE, 'TRANSFERENCIA', base + ' $' + total, '');
  return { recibo: reciboPublico_(x, lineasDe_(x.id)), rendicion: resumenRendicion_(rendicionAbierta_()), repetido: false };
}

// ---------- correcciones ----------

function anular_recibo_(p) {
  var c = reciboAbierto_(p.id);
  actualizar_('RECIBOS', c.recibo._fila, { anulado: 'SI' });
  actualizarTotales_(c.rendicion);
  log_(CFG.RESPONSABLE, 'ANULAR_RECIBO', c.recibo.numero + ' ' + c.recibo.persona + ' $' + c.recibo.total, p.motivo || '');
  return { rendicion: resumenRendicion_(rendicionAbierta_()) };
}

/** Cambiar área/concepto/comercio/fecha de una línea ya detallada (no el monto). */
function editar_linea_(p) {
  var g = buscarPorId_('GASTOS', p.id);
  if (!g) throw new Error('No se encontró el gasto.');
  reciboAbierto_(g.recibo_id);
  var cambios = {};
  ['area', 'concepto', 'comercio'].forEach(function (k) { if (p[k] !== undefined) cambios[k] = String(p[k]).trim(); });
  if (p.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha))) throw new Error('La fecha no es válida.');
    cambios.fecha = String(p.fecha);
  }
  if (Object.keys(cambios).length) actualizar_('GASTOS', g._fila, cambios);
  return { rendicion: resumenRendicion_(rendicionAbierta_()) };
}

// ---------- cierre ----------

function cerrar_rendicion_(p) {
  var r = rendicionAbierta_();
  if (!r) throw new Error('No hay una rendición abierta.');
  if (p.op_id && r.op_id && String(r.op_id) === String(p.op_id)) {
    return { rendicion: resumenRendicion_(buscarPorId_('RENDICIONES', r.id)), repetido: true };
  }
  var recibos = recibosDe_(r.id);
  if (!recibos.length) throw new Error('La rendición no tiene nada cargado.');
  var sinDetallar = recibos.filter(function (x) { return !esSi_(x.detallado); });
  if (sinDetallar.length) {
    throw new Error('Faltan detallar ' + sinDetallar.length + ' recibo(s): ' +
      sinDetallar.slice(0, 5).map(function (x) { return x.persona; }).join(', ') + (sinDetallar.length > 5 ? '…' : '') + '.');
  }
  var lineas = lineasDeRendicion_(r.id);
  var pdf = generarPdfRendicion_(r, recibos, lineas);
  actualizar_('RENDICIONES', r._fila, { estado: 'cerrada', fecha_cierre: hoyStr_(), pdf_url: pdf.url, pdf_id: pdf.id, op_id: p.op_id || '' });
  log_(CFG.RESPONSABLE, 'CERRAR_RENDICION', 'N° ' + r.numero + ' ' + recibos.length + ' recibos $' + r.total, '');
  try {
    notificarAppIngeco_(CFG.MODULO_APP_INGECO, {
      destinatarios: [{ sector: 'Contabilidad' }, { admin: true }],
      tipo: 'aviso_general', prioridad: 'normal',
      titulo: 'Rendición N° ' + r.numero + ' cerrada',
      cuerpo: recibos.length + ' recibos por $' + montoLindo_(r.total) + '. PDF listo para imprimir.',
      url_destino: pdf.url, clave_unica: 'rendicion-' + r.numero, dias_unica: 30
    });
  } catch (e) { /* el aviso nunca frena el cierre */ }
  return { rendicion: resumenRendicion_(buscarPorId_('RENDICIONES', r.id)), pdf_url: pdf.url, repetido: false };
}

function rendicionPorNumero_(numero) {
  var r = leer_('RENDICIONES').filter(function (x) { return Number(x.numero) === Number(numero); })[0];
  if (!r) throw new Error('No existe la rendición N° ' + numero);
  return r;
}

function regenerar_pdf_(p) {
  var r = rendicionPorNumero_(p.numero);
  var pdf = generarPdfRendicion_(r, recibosDe_(r.id), lineasDeRendicion_(r.id));
  actualizar_('RENDICIONES', r._fila, { pdf_url: pdf.url, pdf_id: pdf.id });
  return { pdf_url: pdf.url };
}

function ver_rendicion_(p) { return resumenRendicion_(rendicionPorNumero_(p.numero)); }
