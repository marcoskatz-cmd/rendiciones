/**
 * Lectura de comprobantes con Claude.
 *
 * Agustín saca la foto; acá se la mandamos a Claude y vuelve un JSON con
 * tipo, monto, fecha, comercio/destinatario y concepto. Él solo confirma o corrige.
 * La clave vive en Script Properties (ANTHROPIC_API_KEY) y nunca viaja al celular.
 */

var ESQUEMA_COMPROBANTE = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ['ticket', 'factura', 'recibo', 'transferencia', 'otro', 'ilegible'] },
    monto: { type: 'number', description: 'Importe total en pesos. 0 si no se lee.' },
    fecha: { type: 'string', description: 'yyyy-MM-dd o vacío si no se lee.' },
    comercio: { type: 'string', description: 'Nombre del comercio o, en una transferencia, el destinatario.' },
    concepto: { type: 'string', description: 'Qué se compró o pagó, en pocas palabras, en español.' },
    cuit: { type: 'string', description: 'CUIT del comercio si aparece, si no vacío.' },
    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
    observacion: { type: 'string', description: 'Algo que Agustín deba revisar (monto borroso, fecha dudosa, etc.). Vacío si nada.' }
  },
  required: ['tipo', 'monto', 'fecha', 'comercio', 'concepto', 'cuit', 'confianza', 'observacion'],
  additionalProperties: false
};

var PROMPT_COMPROBANTE =
  'Sos el asistente de rendición de gastos de una constructora en Tucumán, Argentina. ' +
  'Te mando la foto de un comprobante: puede ser un ticket de compra, una factura, un recibo o la captura ' +
  'de pantalla de una transferencia bancaria o de billetera virtual (Mercado Pago, Ualá, home banking). ' +
  'Extraé los datos. Reglas: el monto es el TOTAL final en pesos argentinos, sin símbolo; los decimales ' +
  'en Argentina se escriben con coma (1.234,50 = 1234.50). La fecha va en formato yyyy-MM-dd; si solo hay ' +
  'día y mes, asumí el año ' + new Date().getFullYear() + '. En una transferencia, "comercio" es el destinatario ' +
  '(nombre de la persona o empresa que recibió la plata). Si no podés leer algo, dejalo vacío o en 0 y ' +
  'bajá la confianza; nunca inventes. Respondé en español.';

/**
 * @param {string} dataUrl  imagen base64
 * @return {object} según ESQUEMA_COMPROBANTE
 */
function leerComprobante_(dataUrl) {
  var apiKey = prop_('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Falta configurar la clave de Claude. Cargá los datos a mano por ahora.');

  var m = String(dataUrl || '').match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) throw new Error('La imagen llegó en un formato que no se puede leer.');

  var body = {
    model: CFG.CLAUDE_MODELO,
    max_tokens: CFG.CLAUDE_MAX_TOKENS,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: ESQUEMA_COMPROBANTE }
    },
    system: [{ type: 'text', text: PROMPT_COMPROBANTE, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
        { type: 'text', text: 'Leé este comprobante y devolvé los datos.' }
      ]
    }]
  };

  var r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(body)
  });
  var texto = r.getContentText();
  if (r.getResponseCode() !== 200) {
    console.warn('Claude API ' + r.getResponseCode() + ': ' + texto.slice(0, 500));
    throw new Error('Claude no pudo leer el comprobante ahora. Cargá los datos a mano o probá de nuevo.');
  }
  var json = JSON.parse(texto);
  if (json.stop_reason === 'refusal') {
    throw new Error('Claude no quiso leer esta imagen. Cargá los datos a mano.');
  }
  var salida = (json.content || []).filter(function (c) { return c.type === 'text'; })
    .map(function (c) { return c.text; }).join('').trim();
  var datos;
  try {
    datos = JSON.parse(salida);
  } catch (e) {
    throw new Error('Claude respondió algo que no se pudo interpretar. Cargá los datos a mano.');
  }
  var us = json.usage || {};
  datos.tokens = (us.input_tokens || 0) + (us.output_tokens || 0) + (us.cache_read_input_tokens || 0) + (us.cache_creation_input_tokens || 0);
  return datos;
}
