/**
 * Acceso a la planilla: creación, lectura/escritura tipada y auto-diagnóstico.
 * Nadie más toca getRange/getValues directamente: todo pasa por acá.
 */

// ---------- setup ----------

/** Crea planilla, carpeta de Drive y datos semilla. Idempotente. */
function setupCompleto_() {
  var creado = { planilla: false, carpeta: false, hojas: [] };

  if (!prop_('SHEET_ID')) {
    var nueva = SpreadsheetApp.create('RENDICIONES — Base de datos');
    setProp_('SHEET_ID', nueva.getId());
    creado.planilla = true;
  }
  if (!prop_('DRIVE_FOLDER_ID')) {
    var f = DriveApp.createFolder('RENDICIONES — Comprobantes y PDF');
    setProp_('DRIVE_FOLDER_ID', f.getId());
    creado.carpeta = true;
  }

  var ss = ss_();
  Object.keys(HOJAS).forEach(function (nombre) {
    var sh = ss.getSheetByName(nombre);
    if (!sh) {
      sh = ss.insertSheet(nombre);
      creado.hojas.push(nombre);
    }
    var enc = HOJAS[nombre];
    if (sh.getLastRow() <= 1) {
      sh.getRange(1, 1, 1, enc.length).setValues([enc]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, enc.length).setFontWeight('bold');
    }
    // Fechas, timestamps y DNI como texto plano para que Sheets no los reinterprete.
    enc.forEach(function (col, i) {
      if (col.indexOf('fecha') === 0 || col === 'ts' || col.indexOf('ts_') === 0 || col.indexOf('dni') !== -1) {
        sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
      }
    });
    if (SEED[nombre] && sh.getLastRow() === 1) {
      sh.getRange(2, 1, SEED[nombre].length, SEED[nombre][0].length).setValues(SEED[nombre]);
    }
  });

  var sobrante = ss.getSheets().filter(function (s) { return !HOJAS[s.getName()]; });
  if (sobrante.length && ss.getSheets().length > sobrante.length) {
    sobrante.forEach(function (s) { if (s.getLastRow() === 0) ss.deleteSheet(s); });
  }

  log_('bootstrap', 'SETUP', JSON.stringify(creado), '');

  return {
    creado: creado,
    sheetId: prop_('SHEET_ID'),
    sheetUrl: ss.getUrl(),
    folderId: prop_('DRIVE_FOLDER_ID'),
    claude_configurado: !!prop_('ANTHROPIC_API_KEY'),
    diagnostico: diagnosticar_()
  };
}

// ---------- auto-diagnóstico ----------

function diagnosticar_() {
  var ss = ss_();
  var problemas = [];
  Object.keys(HOJAS).forEach(function (nombre) {
    var sh = ss.getSheetByName(nombre);
    if (!sh) {
      problemas.push({ hoja: nombre, tipo: 'FALTA_HOJA', detalle: 'La hoja no existe' });
      return;
    }
    var esperado = HOJAS[nombre];
    var real = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), esperado.length))
      .getValues()[0].map(function (v) { return String(v || '').trim(); });
    esperado.forEach(function (col, i) {
      if (real[i] !== col) {
        problemas.push({
          hoja: nombre, tipo: 'COLUMNA',
          detalle: 'Se esperaba "' + col + '" en la columna ' + (i + 1) + ' y hay "' + (real[i] || '(vacía)') + '"'
        });
      }
    });
  });
  if (!prop_('ANTHROPIC_API_KEY')) {
    problemas.push({ hoja: '-', tipo: 'CLAVE', detalle: 'Falta la clave de Claude (ANTHROPIC_API_KEY). La lectura automática de comprobantes no va a funcionar.' });
  }
  return problemas;
}

// ---------- lectura / escritura ----------

function hoja_(nombre) {
  var sh = ss_().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja ' + nombre + ' en la planilla.');
  return sh;
}

function normalizarFecha_(col, v) {
  if (!(v instanceof Date)) return v;
  var esTs = col === 'ts' || col.indexOf('ts_') === 0;
  return Utilities.formatDate(v, CFG.TZ, esTs ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
}

// Memo por request: un mismo pedido lee la misma hoja varias veces (estado_
// lee RENDICIONES, RECIBOS y GASTOS más de una vez). Se descarta al escribir.
var MEMO_HOJAS_ = {};

/** Todas las filas como objetos {columna: valor}, más _fila (1-based). */
function leer_(nombre) {
  var cols = HOJAS[nombre];
  var datos = MEMO_HOJAS_[nombre];
  if (!datos) {
    var sh = hoja_(nombre);
    var ultima = sh.getLastRow();
    datos = ultima < 2 ? [] : sh.getRange(2, 1, ultima - 1, cols.length).getValues();
    MEMO_HOJAS_[nombre] = datos;
  }
  if (!datos.length) return [];
  return datos.map(function (fila, i) {
    var o = { _fila: i + 2 };
    cols.forEach(function (c, j) { o[c] = normalizarFecha_(c, fila[j]); });
    return o;
  });
}

function agregar_(nombre, obj) {
  var sh = hoja_(nombre);
  var fila = HOJAS[nombre].map(function (c) {
    return obj[c] === undefined || obj[c] === null ? '' : obj[c];
  });
  sh.appendRow(fila);
  delete MEMO_HOJAS_[nombre];
  return fila;
}

function actualizar_(nombre, numeroFila, cambios) {
  var sh = hoja_(nombre);
  var cols = HOJAS[nombre];
  var idxs = Object.keys(cambios).map(function (k) {
    var idx = cols.indexOf(k);
    if (idx === -1) throw new Error('Columna desconocida "' + k + '" en ' + nombre);
    return idx;
  });
  delete MEMO_HOJAS_[nombre];
  if (!idxs.length) return;
  // Una sola escritura para el tramo de columnas tocado (antes, un setValue por
  // campo). Las celdas del medio se reescriben igual; si tienen fórmula, se respeta.
  var desde = Math.min.apply(null, idxs), hasta = Math.max.apply(null, idxs);
  var rango = sh.getRange(numeroFila, desde + 1, 1, hasta - desde + 1);
  var valores = rango.getValues()[0];
  var formulas = rango.getFormulas()[0];
  var fila = valores.map(function (v, j) { return formulas[j] ? formulas[j] : v; });
  Object.keys(cambios).forEach(function (k) { fila[cols.indexOf(k) - desde] = cambios[k]; });
  rango.setValues([fila]);
}

function buscarPorId_(nombre, id) {
  var filas = leer_(nombre);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].id) === String(id)) return filas[i];
  }
  return null;
}

function buscarPorOpId_(nombre, opId) {
  if (!opId) return null;
  var filas = leer_(nombre);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i].op_id) === String(opId)) return filas[i];
  }
  return null;
}

function activos_(nombre) {
  return leer_(nombre).filter(function (r) { return String(r.activo).toUpperCase() === 'SI'; });
}

// ---------- log ----------

function log_(usuario, accion, detalle, motivo) {
  agregar_('LOG', {
    ts: tsStr_(),
    usuario: usuario || '',
    accion: accion || '',
    detalle: typeof detalle === 'string' ? detalle : JSON.stringify(detalle || ''),
    motivo: motivo || ''
  });
}
