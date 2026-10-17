/**
 * Lógica de negocio: rendición abierta, gastos, recibos y cierre.
 *
 * Hay a lo sumo UNA rendición abierta. Todo gasto que se carga va a esa.
 * Al cerrar se genera el PDF y se abre la siguiente automáticamente cuando
 * llega el primer gasto nuevo.
 */

// ---------- rendición ----------

function rendicionAbierta_() {
  var todas = leer_('RENDICIONES');
  for (var i = todas.length - 1; i >= 0; i--) {
    if (todas[i].estado === 'abierta') return todas[i];
  }
  return null;
}

function proximoNumero_() {
  var todas = leer_('RENDICIONES');
  var max = 0;
  todas.forEach(function (r) { max = Math.max(max, Number(r.numero) || 0); });
  return max + 1;
}

function abrirRendicionSiHaceFalta_() {
  var r = rendicionAbierta_();
  if (r) return r;
  var nueva = {
    id: uuid_(),
    numero: proximoNumero_(),
    estado: 'abierta',
    fecha_apertura: hoyStr_(),
    fecha_cierre: '',
    cantidad_gastos: 0,
    total: 0,
    pdf_url: '',
    pdf_id: '',
    op_id: ''
  };
  agregar_('RENDICIONES', nueva);
  log_(CFG.RESPONSABLE, 'ABRIR_RENDICION', 'N° ' + nueva.numero, '');
  return buscarPorId_('RENDICIONES', nueva.id);
}

function gastosDe_(rendicionId) {
  return leer_('GASTOS').filter(function (g) {
    return String(g.rendicion_id) === String(rendicionId) && String(g.anulado).toUpperCase() !== 'SI';
  }).sort(function (a, b) { return Number(a.numero) - Number(b.numero); });
}

function gastoPublico_(g) {
  return {
    id: g.id,
    numero: Number(g.numero),
    tipo: g.tipo,
    fecha: g.fecha,
    monto: Number(g.monto) || 0,
    comercio: g.comercio,
    concepto: g.concepto,
    area: g.area,
    persona: g.persona,
    persona_dni: String(g.persona_dni || ''),
    recibo_id: g.recibo_id,
    tiene_foto: !!g.fotos,
    tiene_firma: !!g.firma,
    ts: g.ts
  };
}

function resumenRendicion_(r) {
  if (!r) return null;
  var gastos = gastosDe_(r.id);
  var total = 0;
  var porArea = {};
  gastos.forEach(function (g) {
    var m = Number(g.monto) || 0;
    total += m;
    porArea[g.area] = (porArea[g.area] || 0) + m;
  });
  return {
    id: r.id,
    numero: Number(r.numero),
    estado: r.estado,
    fecha_apertura: r.fecha_apertura,
    fecha_cierre: r.fecha_cierre,
    total: total,
    cantidad: gastos.length,
    por_area: porArea,
    pdf_url: r.pdf_url,
    gastos: gastos.map(gastoPublico_)
  };
}

/** Pantalla principal: rendición abierta + listas para los selectores. */
function estado_(p) {
  var r = rendicionAbierta_();
  var cerradas = leer_('RENDICIONES').filter(function (x) { return x.estado === 'cerrada'; })
    .sort(function (a, b) { return Number(b.numero) - Number(a.numero); }).slice(0, 10)
    .map(function (x) {
      return { numero: Number(x.numero), fecha_cierre: x.fecha_cierre, total: Number(x.total) || 0,
               cantidad: Number(x.cantidad_gastos) || 0, pdf_url: x.pdf_url };
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

// ---------- lectura con Claude ----------

function leer_comprobante_(p) {
  return leerComprobante_(p.imagen);
}

// ---------- gastos ----------

function validarCarga_(p) {
  if (TIPOS_GASTO.indexOf(p.tipo) === -1) throw new Error('Elegí si es un ticket o una transferencia.');
  var lineas = Array.isArray(p.lineas) ? p.lineas : [];
  if (!lineas.length) throw new Error('No hay ningún gasto cargado.');
  lineas.forEach(function (l, i) {
    var n = 'Gasto ' + (i + 1) + ': ';
    if (!(Number(l.monto) > 0)) throw new Error(n + 'el monto tiene que ser mayor a cero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.fecha || ''))) throw new Error(n + 'falta la fecha.');
    if (!String(l.area || '').trim()) throw new Error(n + 'falta el área.');
    if (!String(l.comercio || '').trim()) throw new Error(n + (p.tipo === 'ticket' ? 'falta el comercio.' : 'falta a quién se transfirió.'));
  });
  var imagenes = Array.isArray(p.imagenes) ? p.imagenes.filter(Boolean) : [];
  if (!imagenes.length) throw new Error(p.tipo === 'ticket' ? 'Falta la foto de los tickets.' : 'Falta la captura de la transferencia.');
  if (p.tipo === 'ticket') {
    if (!String(p.persona || '').trim()) throw new Error('Falta el nombre de quien recibe el reintegro.');
    if (!p.firma) throw new Error('Falta la firma de quien recibe el reintegro.');
  }
}

function recordarPersona_(nombre, dni) {
  nombre = String(nombre || '').trim();
  if (!nombre) return;
  var existentes = leer_('PERSONAS');
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].nombre.toLowerCase() === nombre.toLowerCase()) {
      if (dni && !existentes[i].dni) actualizar_('PERSONAS', existentes[i]._fila, { dni: "'" + String(dni) });
      return;
    }
  }
  agregar_('PERSONAS', { nombre: nombre, dni: dni ? "'" + String(dni) : '', activo: 'SI' });
}

/**
 * Guarda una carga: una o más fotos, una o más líneas de gasto y, si es ticket,
 * UNA persona que firma UN recibo por el total. Cada línea es una fila de GASTOS;
 * todas comparten recibo_id y las fotos.
 * op_id evita duplicar si se corta la respuesta y el celular reintenta.
 */
function guardar_gasto_(p) {
  var repetido = buscarPorOpId_('GASTOS', p.op_id);
  if (repetido) return { gastos: [gastoPublico_(repetido)], rendicion: resumenRendicion_(rendicionAbierta_()), repetido: true };

  validarCarga_(p);
  var r = abrirRendicionSiHaceFalta_();
  var existentes = gastosDe_(r.id);
  var numero = existentes.length ? Math.max.apply(null, existentes.map(function (g) { return Number(g.numero) || 0; })) : 0;
  var reciboId = uuid_();
  var base = 'R' + numeroStr_(r.numero) + '-' + reciboId.substring(0, 8);

  var fotos = p.imagenes.map(function (img, i) {
    return guardarImagen_(img, r.numero, base + '-' + (p.tipo === 'ticket' ? 'tickets' : 'transferencia') + '-' + (i + 1)).url;
  });
  var firma = p.tipo === 'ticket' ? guardarImagen_(p.firma, r.numero, base + '-firma').url : '';
  var persona = p.tipo === 'ticket' ? String(p.persona).trim() : '';
  var dni = p.tipo === 'ticket' ? String(p.persona_dni || '').trim() : '';
  // Sheets convierte "30123456" a número aunque la columna sea texto; se guarda con apóstrofe.
  var dniCelda = dni ? "'" + dni : '';

  var creados = [];
  p.lineas.forEach(function (l, i) {
    numero += 1;
    var g = {
      id: uuid_(),
      rendicion_id: r.id,
      numero: numero,
      recibo_id: reciboId,
      tipo: p.tipo,
      fecha: String(l.fecha),
      monto: Number(l.monto),
      comercio: String(l.comercio || '').trim(),
      concepto: String(l.concepto || '').trim(),
      area: String(l.area).trim(),
      persona: persona,
      persona_dni: dniCelda,
      detalle_claude: i === 0 && p.detalle_claude ? JSON.stringify(p.detalle_claude).slice(0, 4000) : '',
      fotos: fotos.join(' | '),
      firma: firma,
      ts: tsStr_(),
      anulado: '',
      op_id: i === 0 ? (p.op_id || '') : ''
    };
    agregar_('GASTOS', g);
    creados.push(gastoPublico_(g));
  });
  if (persona) recordarPersona_(persona, dni);
  actualizarTotales_(r);
  var total = creados.reduce(function (a, g) { return a + g.monto; }, 0);
  log_(CFG.RESPONSABLE, 'CARGA', base + ' ' + p.tipo + ' ' + creados.length + ' líneas $' + total + (persona ? ' → ' + persona : ''), '');

  return { gastos: creados, recibo_id: reciboId, total: total, rendicion: resumenRendicion_(rendicionAbierta_()), repetido: false };
}

function actualizarTotales_(r) {
  var gastos = gastosDe_(r.id);
  var total = 0;
  gastos.forEach(function (g) { total += Number(g.monto) || 0; });
  actualizar_('RENDICIONES', r._fila, { cantidad_gastos: gastos.length, total: total });
}

/** Anular: la fila queda con la marca, sale del PDF y del total. */
function anular_gasto_(p) {
  var g = buscarPorId_('GASTOS', p.id);
  if (!g) throw new Error('No se encontró el gasto.');
  var r = buscarPorId_('RENDICIONES', g.rendicion_id);
  if (!r || r.estado !== 'abierta') throw new Error('La rendición ya está cerrada: no se puede anular.');
  actualizar_('GASTOS', g._fila, { anulado: 'SI' });
  actualizarTotales_(r);
  log_(CFG.RESPONSABLE, 'ANULAR_GASTO', g.numero + ' ' + g.comercio + ' $' + g.monto, p.motivo || '');
  return { rendicion: resumenRendicion_(rendicionAbierta_()) };
}

/** Editar área/concepto/comercio/fecha/monto de un gasto todavía abierto (sin tocar foto ni firma). */
function editar_gasto_(p) {
  var g = buscarPorId_('GASTOS', p.id);
  if (!g) throw new Error('No se encontró el gasto.');
  var r = buscarPorId_('RENDICIONES', g.rendicion_id);
  if (!r || r.estado !== 'abierta') throw new Error('La rendición ya está cerrada: no se puede editar.');
  var cambios = {};
  ['area', 'concepto', 'comercio'].forEach(function (k) {
    if (p[k] !== undefined) cambios[k] = String(p[k]).trim();
  });
  if (p.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha))) throw new Error('La fecha no es válida.');
    cambios.fecha = String(p.fecha);
  }
  if (p.monto !== undefined) {
    if (g.tipo === 'ticket' && g.firma) throw new Error('El recibo ya está firmado por ese monto. Anulalo y cargalo de nuevo.');
    if (!(Number(p.monto) > 0)) throw new Error('El monto tiene que ser mayor a cero.');
    cambios.monto = Number(p.monto);
  }
  if (!Object.keys(cambios).length) return { rendicion: resumenRendicion_(r) };
  actualizar_('GASTOS', g._fila, cambios);
  actualizarTotales_(r);
  log_(CFG.RESPONSABLE, 'EDITAR_GASTO', g.numero + ' ' + JSON.stringify(cambios), '');
  return { rendicion: resumenRendicion_(rendicionAbierta_()) };
}

// ---------- cierre ----------

function cerrar_rendicion_(p) {
  var r = rendicionAbierta_();
  if (!r) throw new Error('No hay una rendición abierta.');
  if (p.op_id && r.op_id && String(r.op_id) === String(p.op_id)) {
    return { rendicion: resumenRendicion_(buscarPorId_('RENDICIONES', r.id)), repetido: true };
  }
  var gastos = gastosDe_(r.id);
  if (!gastos.length) throw new Error('La rendición no tiene gastos cargados.');
  var sinArea = gastos.filter(function (g) { return !String(g.area || '').trim(); });
  if (sinArea.length) throw new Error('Hay ' + sinArea.length + ' gasto(s) sin área. Asignales el área antes de cerrar.');

  var pdf = generarPdfRendicion_(r, gastos);
  actualizar_('RENDICIONES', r._fila, {
    estado: 'cerrada',
    fecha_cierre: hoyStr_(),
    pdf_url: pdf.url,
    pdf_id: pdf.id,
    op_id: p.op_id || ''
  });
  log_(CFG.RESPONSABLE, 'CERRAR_RENDICION', 'N° ' + r.numero + ' ' + gastos.length + ' gastos $' + r.total, '');

  try {
    notificarAppIngeco_(CFG.MODULO_APP_INGECO, {
      destinatarios: [{ sector: 'Contabilidad' }, { admin: true }],
      tipo: 'aviso_general', prioridad: 'normal',
      titulo: 'Rendición N° ' + r.numero + ' cerrada',
      cuerpo: gastos.length + ' gastos por $' + montoLindo_(r.total) + '. PDF listo para imprimir.',
      url_destino: pdf.url,
      clave_unica: 'rendicion-' + r.numero, dias_unica: 30
    });
  } catch (e) { /* el aviso nunca frena el cierre */ }

  var cerrada = buscarPorId_('RENDICIONES', r.id);
  return { rendicion: resumenRendicion_(cerrada), pdf_url: pdf.url, repetido: false };
}

/** Volver a generar el PDF de una rendición ya cerrada (p.ej. si se cambió el diseño). */
function regenerar_pdf_(p) {
  var r = leer_('RENDICIONES').filter(function (x) { return Number(x.numero) === Number(p.numero); })[0];
  if (!r) throw new Error('No existe la rendición N° ' + p.numero);
  var gastos = gastosDe_(r.id);
  var pdf = generarPdfRendicion_(r, gastos);
  actualizar_('RENDICIONES', r._fila, { pdf_url: pdf.url, pdf_id: pdf.id });
  return { pdf_url: pdf.url };
}

/** Detalle de una rendición cerrada (para verla desde el historial). */
function ver_rendicion_(p) {
  var r = leer_('RENDICIONES').filter(function (x) { return Number(x.numero) === Number(p.numero); })[0];
  if (!r) throw new Error('No existe la rendición N° ' + p.numero);
  return resumenRendicion_(r);
}
