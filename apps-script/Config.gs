/**
 * Rendición de gastos — INGECO
 * Configuración central: hojas, encabezados esperados y constantes.
 *
 * Qué es: Agustín reintegra gastos a los obreros (tickets) y hace transferencias.
 * Todos los viernes arma la rendición y la entrega a Contabilidad. Esta app:
 *   - ATENDER (en el mostrador, segundos): nombre + monto + firma → recibo digital.
 *     Opcional: foto de los tickets de esa persona en el momento.
 *   - DETALLAR (después, tranquilo): foto de los tickets → Claude propone una
 *     línea por ticket → Agustín confirma que suma el total y asigna el área.
 *   - CERRAR: PDF (resumen por área + detalle + recibos firmados + capturas).
 *
 * La política editable (áreas, personas) vive en la planilla, no acá.
 */

var PROP = PropertiesService.getScriptProperties();

var CFG = {
  TZ: 'America/Argentina/Buenos_Aires',
  // Claude: lectura de comprobantes. La clave va en Script Properties (ANTHROPIC_API_KEY).
  CLAUDE_MODELO: 'claude-opus-5-5',
  CLAUDE_MAX_TOKENS: 2000,
  // Quién firma el recibo del lado de la empresa.
  RESPONSABLE: 'Agustín',
  EMPRESA: 'INGECO S.A.',
  MODULO_APP_INGECO: 'RENDICIONES'
};

var TIPOS_GASTO = ['ticket', 'transferencia'];
var ESTADOS_RENDICION = ['abierta', 'cerrada'];

/**
 * Estructura esperada de la planilla.
 * El orden de las columnas ES el contrato: si alguien renombra o reordena,
 * diagnosticar_() lo detecta y la app lo muestra en vez de fallar en silencio.
 */
var HOJAS = {
  RENDICIONES: [
    'id', 'numero', 'estado', 'fecha_apertura', 'fecha_cierre',
    'cantidad_recibos', 'total', 'pdf_url', 'pdf_id', 'op_id'
  ],
  // Un recibo = una persona que cobró (firma) o una transferencia. El detalle
  // (qué tickets, qué área) se carga después, en GASTOS, una fila por ticket.
  RECIBOS: [
    'id', 'rendicion_id', 'numero', 'tipo', 'fecha', 'persona', 'persona_dni',
    'total', 'firma', 'fotos', 'detallado', 'ts', 'anulado', 'op_id'
  ],
  GASTOS: [
    'id', 'recibo_id', 'rendicion_id', 'fecha', 'monto', 'comercio',
    'concepto', 'area', 'ts'
  ],
  AREAS: ['area', 'activo'],
  PERSONAS: ['nombre', 'dni', 'activo'],
  LOG: ['ts', 'usuario', 'accion', 'detalle', 'motivo']
};

/** Datos semilla. Todo editable después desde la planilla o la app. */
var SEED = {
  AREAS: [
    ['Obra', 'SI'],
    ['Taller', 'SI'],
    ['Oficina', 'SI'],
    ['Vehículos', 'SI'],
    ['Viáticos', 'SI']
  ]
};

// ---------- helpers de propiedades ----------

function prop_(k) { return PROP.getProperty(k); }
function setProp_(k, v) { PROP.setProperty(k, String(v)); }

function ss_() {
  var id = prop_('SHEET_ID');
  if (!id) throw new Error('La planilla todavía no fue creada. Ejecutá el setup.');
  return SpreadsheetApp.openById(id);
}

function carpeta_() {
  var id = prop_('DRIVE_FOLDER_ID');
  if (!id) throw new Error('La carpeta de Drive todavía no fue creada. Ejecutá el setup.');
  return DriveApp.getFolderById(id);
}

/** Fecha/hora SIEMPRE del servidor, nunca del dispositivo. */
function ahora_() { return new Date(); }
function hoyStr_() { return Utilities.formatDate(ahora_(), CFG.TZ, 'yyyy-MM-dd'); }
function tsStr_() { return Utilities.formatDate(ahora_(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function uuid_() { return Utilities.getUuid(); }

/** yyyy-MM-dd → dd/MM/yyyy para mostrar. */
function fechaLinda_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(s || '');
}

/** 12345.5 → "12.345,50" */
function montoLindo_(n) {
  var v = Number(n) || 0;
  var partes = v.toFixed(2).split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return partes.join(',');
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
