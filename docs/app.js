/**
 * Pantallas de Agustín.
 *
 *  Atender    → con la persona adelante: nombre, monto, firma (y foto de sus tickets
 *               si hay tiempo). Guardar y siguiente. Segundos por persona.
 *  Rendición  → resumen, lista de recibos. Los que faltan detallar están marcados.
 *  Detallar   → después, tranquilo: foto(s) de los tickets de ese recibo → Claude propone
 *               una línea por ticket → tienen que sumar el total firmado → área → listo.
 *  Transferir → captura → Claude → confirmar → área. Un solo paso.
 *  Cerrar     → PDF (solo cuando no queda nada sin detallar).
 */

const ICO = {"pen": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M4 20h4l10-10-4-4L4 16zM13 7l4 4\"/></svg>", "cam": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M4 8h3l2-3h6l2 3h3v11H4z\"/><circle cx=\"12\" cy=\"13\" r=\"3.5\"/></svg>", "gal": "<svg class=\"i\" viewBox=\"0 0 24 24\"><rect x=\"4\" y=\"5\" width=\"16\" height=\"14\" rx=\"2\"/><path d=\"M4 16l5-5 4 4 3-3 4 4\"/><circle cx=\"15.5\" cy=\"9.5\" r=\"1.5\"/></svg>", "ok": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M5 12l5 5 9-10\"/></svg>", "lock": "<svg class=\"i\" viewBox=\"0 0 24 24\"><rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/></svg>", "pdf": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6\"/></svg>", "plus": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M12 5v14M5 12h14\"/></svg>", "save": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6\"/></svg>", "clock": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M7 3h10M7 21h10M8 3c0 5 4 6 4 9s-4 4-4 9M16 3c0 5-4 6-4 9s4 4 4 9\"/></svg>", "recibo": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 12h6M9 16h3\"/></svg>", "transf": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M4 7h13l-3-3M20 17H7l3 3\"/></svg>", "edit": "<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M4 20h4l10-10-4-4L4 16zM13 7l4 4\"/></svg>"};
const $ = (s) => document.querySelector(s);
const app = $('#app');
let estado = null;
let borrador = null;

// ---------- utilidades ----------

function pesos(n) {
  return '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fechaLinda(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || '';
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
let toastTimer;
function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, error ? 6000 : 2500);
}
function barraPasos(n, total) {
  return `<div class="pasos">${Array.from({ length: total }, (_, i) => `<span class="${i < n ? 'hecho' : ''}"></span>`).join('')}</div>`;
}

async function cargarEstado() {
  estado = await API.llamar('estado');
  const a = estado.abierta;
  $('#cab-sub').textContent = a
    ? `N° ${a.numero} · ${a.cantidad} recibo${a.cantidad === 1 ? '' : 's'} · ${pesos(a.total)}${a.sin_detallar ? ` · ${a.sin_detallar} sin detallar` : ''}`
    : `Próxima: N° ${estado.proximo_numero} · nada cargado todavía`;
  const b = $('#badge-detallar');
  if (b) { b.textContent = a && a.sin_detallar ? a.sin_detallar : ''; b.hidden = !(a && a.sin_detallar); }
}

function irA(v) {
  document.querySelectorAll('.barra button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === v));
  window.scrollTo(0, 0);
  if (v === 'atender') verAtender();
  if (v === 'inicio') verInicio();
  if (v === 'transferir') verTransferir();
  if (v === 'historial') verHistorial();
}
document.querySelectorAll('.barra button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));

function avisosDiagnostico() {
  const d = (estado && estado.diagnostico) || [];
  if (!d.length) return '';
  return `<div class="aviso grave">⚠️ Hay un problema en la planilla o la configuración:<br>` +
    d.map((x) => `• ${esc(x.hoja !== '-' ? x.hoja + ': ' : '')}${esc(x.detalle)}`).join('<br>') + '</div>';
}

/** Reescala a 1600 px máx. y JPEG 0.85 para que no pese y Claude la lea rápido. */
function reducirImagen(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600;
      const k = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => rej(new Error('No se pudo leer la imagen.'));
    img.src = url;
  });
}

/** Canvas de firma. Devuelve {firmado(), borrar(), dataUrl()}. */
function armarFirma(canvas, alCambiar) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14212c';
  let firmado = false, dibujando = false;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => { dibujando = true; ctx.beginPath(); ctx.moveTo(...pos(e)); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dibujando) return; ctx.lineTo(...pos(e)); ctx.stroke(); firmado = true; alCambiar(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => canvas.addEventListener(ev, () => { dibujando = false; }));
  return {
    firmado: () => firmado,
    borrar: () => { ctx.clearRect(0, 0, rect.width, rect.height); firmado = false; alCambiar(); },
    dataUrl: () => canvas.toDataURL('image/png')
  };
}

// ---------- ATENDER (mostrador) ----------

function verAtender() {
  const personas = estado.personas || [];
  const fotos = [];
  app.innerHTML = `<div class="tarjeta atender">
    <h2>Atender reintegro</h2>
    <label>¿Quién cobra?</label>
    <input id="at-persona" list="at-lista" placeholder="Nombre y apellido" autocomplete="off" autocapitalize="words">
    <datalist id="at-lista">${personas.map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
    <label>Monto que se le entrega ($)</label>
    <input id="at-total" class="monto" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0,00">
    <div class="recibo-previa" id="at-recibo"></div>
    <label>Firma de quien cobra</label>
    <canvas class="firma" id="at-canvas"></canvas>
    <div class="fila-botones"><button class="secundaria" id="at-borrar">Borrar firma</button>
      <label class="boton-foto" for="at-foto"><svg class="i" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg> Foto tickets <span id="at-nfotos"></span></label>
      <input id="at-foto" type="file" accept="image/*" capture="environment"></div>
    <button class="principal" style="margin-top:.8rem" id="at-guardar" disabled><svg class="i" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg> Guardar y siguiente</button>
    <p class="ayuda" style="margin:.7rem 0 0">La foto de los tickets es opcional acá: si hay cola, la sacás después desde <b>Rendición → Detallar</b>.</p>
  </div>`;
  const inpP = $('#at-persona'), inpT = $('#at-total');
  const firma = armarFirma($('#at-canvas'), revisar);
  function textoRecibo() {
    const n = inpP.value.trim() || '________________';
    const t = Number(inpT.value) || 0;
    $('#at-recibo').innerHTML = `Recibí de <b>INGECO S.A. (${esc(estado.responsable)})</b> la suma de <span class="monto">${pesos(t)}</span> en concepto de reintegro de gastos, cuyos tickets entrego. Firma: <b>${esc(n)}</b>`;
  }
  function revisar() { $('#at-guardar').disabled = !(firma.firmado() && inpP.value.trim().length >= 3 && Number(inpT.value) > 0); }
  inpP.addEventListener('input', () => { textoRecibo(); revisar(); });
  inpT.addEventListener('input', () => { textoRecibo(); revisar(); });
  textoRecibo();
  $('#at-borrar').addEventListener('click', firma.borrar);
  $('#at-foto').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { fotos.push(await reducirImagen(f)); $('#at-nfotos').textContent = `(${fotos.length})`; toast('Foto guardada en el recibo'); }
    catch (err) { toast(err.message, true); }
    e.target.value = '';
  });
  $('#at-guardar').addEventListener('click', async () => {
    const persona = inpP.value.trim(), total = Number(inpT.value);
    const p = personas.find((x) => x.nombre.toLowerCase() === persona.toLowerCase());
    $('#at-guardar').disabled = true;
    $('#at-guardar').textContent = 'Guardando…';
    try {
      const r = await API.llamar('atender', { op_id: crypto.randomUUID(), persona, persona_dni: p ? p.dni : '', total, firma: firma.dataUrl(), imagenes: fotos });
      await cargarEstado();
      toast(`${r.recibo.persona} · ${pesos(r.recibo.total)} · recibo guardado`);
      verAtender();
      setTimeout(() => $('#at-persona').focus(), 50);
    } catch (e) {
      toast(e.message, true);
      $('#at-guardar').innerHTML = ICO.ok + ' Guardar y siguiente';
      revisar();
    }
  });
  setTimeout(() => inpP.focus(), 50);
}

// ---------- RENDICIÓN (lista) ----------

function verInicio() {
  const a = estado.abierta;
  let h = avisosDiagnostico();
  if (!a || !a.cantidad) {
    h += `<div class="tarjeta"><h2>Rendición N° ${estado.proximo_numero}</h2>
      <p class="ayuda">Todavía no hay nada cargado. Cuando vengan a cobrar, usá <b>Atender</b>: nombre, monto y firma. Las transferencias van por <b>Transferir</b>.</p>
      <button class="principal" onclick="irA('atender')"><svg class="i" viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16zM13 7l4 4"/></svg> Atender reintegro</button></div>`;
    app.innerHTML = h;
    return;
  }
  const pend = a.recibos.filter((x) => !x.detallado);
  const listos = a.recibos.filter((x) => x.detallado);
  h += `<div class="hero"><div class="eti">Rendición N° ${a.numero} · desde el ${fechaLinda(a.fecha_apertura)}</div><div class="total">${pesos(a.total)}</div>
    <div class="hoy ${pend.length ? 'pend' : ''}"><div class="n">${pend.length ? pend.length : ICO.ok}</div><div class="t"><b>${pend.length ? `recibo${pend.length === 1 ? '' : 's'} sin detallar` : 'Todo detallado'}</b><span>${a.cantidad} recibo${a.cantidad === 1 ? '' : 's'} en total${pend.length ? ' · tocá uno para cargarle los tickets' : ' · ya se puede cerrar'}</span></div></div></div>`;
  const areas = Object.keys(a.por_area).sort();
  if (areas.length) h += `<div class="areas">${areas.map((x) => `<span class="chip">${esc(x)} <b>${pesos(a.por_area[x])}</b></span>`).join('')}</div>`;
  if (pend.length) h += `<div class="seccion-t">Para detallar · ${pend.length}</div><div class="lista">` + pend.map(filaRecibo).join('') + `</div>`;
  if (listos.length) h += `<div class="seccion-t">Detallados · ${listos.length}</div><div class="lista">` + listos.map(filaRecibo).join('') + `</div>`;
  h += `<div class="tarjeta"><h3>Cerrar y armar el PDF</h3>
    <p class="ayuda">${pend.length ? `Faltan detallar ${pend.length} recibo${pend.length === 1 ? '' : 's'}. Hasta que estén todos no se puede cerrar.` : 'Se genera el PDF con el resumen por área, el detalle, los recibos firmados y las capturas. Después no se puede cambiar nada.'}</p>
    <button class="principal" id="btn-cerrar" ${pend.length ? 'disabled' : ''}>${ICO.lock} Cerrar rendición N° ${a.numero}</button></div>`;
  app.innerHTML = h;
  if (!pend.length) $('#btn-cerrar').addEventListener('click', confirmarCierre);
  app.querySelectorAll('.gasto').forEach((el) => el.addEventListener('click', () => verRecibo(el.dataset.id)));
}

function filaRecibo(x) {
  const ico = x.tipo === 'ticket' ? (x.detallado ? ICO.recibo : ICO.clock) : ICO.transf;
  const sub = x.detallado
    ? x.lineas.map((l) => esc(l.area)).filter((v, i, a) => a.indexOf(v) === i).join(', ') + ` · ${x.lineas.length} gasto${x.lineas.length === 1 ? '' : 's'}`
    : (x.fotos ? `${x.fotos} foto${x.fotos === 1 ? '' : 's'} · falta detallar` : 'sin foto · falta detallar');
  return `<div class="gasto ${x.tipo} ${x.detallado ? '' : 'pendiente'}" data-id="${x.id}">
    <div class="n">${ico}</div>
    <div class="cuerpo"><div class="t">${esc(x.tipo === 'ticket' ? x.persona : (x.lineas[0] ? x.lineas[0].comercio : 'Transferencia'))}</div>
      <div class="d">${fechaLinda(x.fecha)} · ${sub}</div></div>
    <div class="m">${pesos(x.total)}</div></div>`;
}

// ---------- RECIBO: ver / detallar ----------

function verRecibo(id) {
  const x = estado.abierta.recibos.find((r) => r.id === id);
  if (!x) return;
  if (x.tipo === 'ticket' && !x.detallado) return detallar(x);
  app.innerHTML = `<div class="tarjeta">
    <h2>${x.tipo === 'ticket' ? esc(x.persona) : 'Transferencia'} · ${pesos(x.total)}</h2>
    <p class="ayuda">${fechaLinda(x.fecha)}${x.persona_dni ? ' · DNI ' + esc(x.persona_dni) : ''}${x.tiene_firma ? ' · firmado' : ''}</p>
    ${x.lineas.map((l) => `<div class="linea-gasto"><div class="linea-cab"><b>${esc(l.comercio)}</b><span>${pesos(l.monto)}</span></div>
      <div class="ayuda" style="margin:0 0 .4rem">${fechaLinda(l.fecha)} · ${esc(l.concepto)}</div>
      <div class="opciones" data-linea="${l.id}">${estado.areas.map((a) => `<button type="button" class="${a === l.area ? 'elegido' : ''}" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>`).join('')}
    ${x.tipo === 'ticket' ? `<button class="secundaria" id="r-redetallar">${ICO.edit} Volver a detallar (foto y líneas)</button>` : ''}
    <div class="fila-botones"><button class="secundaria" id="r-volver">Volver</button><button class="secundaria peligro" id="r-anular">Anular recibo</button></div>
  </div>`;
  app.querySelectorAll('[data-linea] button').forEach((b) => b.addEventListener('click', async () => {
    const lid = b.parentElement.dataset.linea;
    try {
      await API.llamar('editar_linea', { id: lid, area: b.dataset.a });
      b.parentElement.querySelectorAll('button').forEach((o) => o.classList.toggle('elegido', o === b));
      await cargarEstado();
      toast('Área cambiada');
    } catch (e) { toast(e.message, true); }
  }));
  $('#r-volver').addEventListener('click', verInicio);
  if ($('#r-redetallar')) $('#r-redetallar').addEventListener('click', () => detallar(x));
  $('#r-anular').addEventListener('click', async () => {
    if (!confirm(`¿Anular el recibo de ${x.persona || 'la transferencia'} por ${pesos(x.total)}? Sale de la rendición y del PDF.`)) return;
    try { await API.llamar('anular_recibo', { id }); await cargarEstado(); toast('Recibo anulado'); verInicio(); }
    catch (e) { toast(e.message, true); }
  });
}

/** Detallar un recibo de tickets: fotos → Claude → líneas → áreas → guardar. */
function detallar(x) {
  borrador = { recibo: x, imagenesNuevas: [], lineas: x.lineas.map((l) => ({ ...l, confianza: 'alta', observacion: '' })), fotosSubidas: x.fotos };
  if (!borrador.fotosSubidas && !borrador.lineas.length) return pasoFotoDetalle();
  if (!borrador.lineas.length) return pasoLeerFotosSubidas();
  pasoLineas();
}

function lineaVacia() {
  return { monto: '', fecha: estado.hoy, comercio: '', concepto: '', area: null, confianza: null, observacion: '' };
}

function pasoFotoDetalle() {
  const x = borrador.recibo;
  app.innerHTML = `<div class="tarjeta">${barraPasos(1, 3)}
    <h2>Tickets de ${esc(x.persona)}</h2>
    <p class="ayuda">Recibo por <b>${pesos(x.total)}</b>. Poné todos sus tickets en una foto (planos, sin taparse, buena luz). Claude lee cada uno por separado. Si no entran, sacá otra.</p>
    <label class="foto-caja" for="d-cam">${ICO.cam} Sacar foto</label><input id="d-cam" type="file" accept="image/*" capture="environment">
    <div style="height:.6rem"></div>
    <label class="foto-caja" for="d-gal">${ICO.gal} Elegir de la galería</label><input id="d-gal" type="file" accept="image/*">
    <button class="secundaria" style="margin-top:.9rem" id="d-mano">${ICO.edit} Cargar a mano, sin foto</button>
    <button class="secundaria" style="margin-top:.6rem" id="d-volver">Volver</button></div>`;
  $('#d-volver').addEventListener('click', () => borrador.lineas.length ? pasoLineas() : verInicio());
  $('#d-mano').addEventListener('click', () => { if (!borrador.lineas.length) borrador.lineas.push({ ...lineaVacia(), monto: x.total }); pasoLineas(); });
  ['#d-cam', '#d-gal'].forEach((s) => $(s).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    app.innerHTML = `<div class="tarjeta"><div class="cargando">Preparando la imagen…</div></div>`;
    try {
      const img = await reducirImagen(f);
      borrador.imagenesNuevas.push(img);
      await leerImagen(img);
      pasoLineas();
    } catch (err) { toast(err.message, true); pasoFotoDetalle(); }
  }));
}

/** El recibo ya tiene fotos en Drive (sacadas al atender) pero nadie las leyó todavía. */
async function pasoLeerFotosSubidas() {
  // Las fotos están en Drive; el backend las lee él mismo.
  app.innerHTML = `<div class="tarjeta">${barraPasos(2, 3)}<div class="cargando">Claude está leyendo las ${borrador.fotosSubidas} foto${borrador.fotosSubidas === 1 ? '' : 's'} que sacaste al atender…</div></div>`;
  try {
    const d = await API.llamar('leer_fotos_recibo', { id: borrador.recibo.id });
    agregarLeidos(d);
  } catch (e) { toast(e.message, true); }
  if (!borrador.lineas.length) borrador.lineas.push(lineaVacia());
  pasoLineas();
}

async function leerImagen(img) {
  app.innerHTML = `<div class="tarjeta">${barraPasos(2, 3)}<img class="previa" src="${img}"><div class="cargando" style="margin-top:.8rem">Claude está leyendo los tickets…</div></div>`;
  if (!estado.claude) { borrador.lineas.push(lineaVacia()); return; }
  try {
    const d = await API.llamar('leer_comprobante', { imagen: img });
    agregarLeidos(d);
  } catch (e) { toast(e.message, true); borrador.lineas.push(lineaVacia()); }
}

function agregarLeidos(d) {
  const leidos = (d && d.comprobantes) || [];
  if (!leidos.length) {
    toast(d && d.observacion_general ? '⚠️ ' + d.observacion_general : 'No se encontró ningún ticket legible. Completá a mano.', true);
    if (!borrador.lineas.length) borrador.lineas.push(lineaVacia());
    return;
  }
  leidos.forEach((c) => borrador.lineas.push({
    monto: c.monto > 0 ? c.monto : '', fecha: /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : estado.hoy,
    comercio: c.comercio || '', concepto: c.concepto || '', area: null, confianza: c.confianza, observacion: c.observacion || ''
  }));
  if (d.observacion_general) toast('⚠️ ' + d.observacion_general, true);
}

function sumaLineas() { return Math.round(borrador.lineas.reduce((a, l) => a + (Number(l.monto) || 0), 0) * 100) / 100; }

function leerFormularioLineas() {
  borrador.lineas.forEach((l, i) => {
    const q = (k) => app.querySelector(`[data-i="${i}"][data-k="${k}"]`);
    if (!q('monto')) return;
    l.monto = Number(q('monto').value);
    l.fecha = q('fecha').value;
    l.comercio = q('comercio').value.trim();
    l.concepto = q('concepto').value.trim();
  });
}

function pasoLineas() {
  const x = borrador.recibo, L = borrador.lineas;
  const suma = sumaLineas(), dif = Math.round((suma - x.total) * 100) / 100;
  const cuadra = Math.abs(dif) < 0.01;
  let h = `<div class="tarjeta">${barraPasos(2, 3)}
    <h2>Tickets de ${esc(x.persona)}</h2>
    <div class="kpi"><div><div class="v">${pesos(x.total)}</div><div class="l">Recibo firmado</div></div>
      <div class="${cuadra ? 'cuadra' : 'no-cuadra'}"><div class="v" id="l-suma">${pesos(suma)}</div><div class="l" id="l-dif">${cuadra ? 'Cuadra' : (dif > 0 ? 'sobran ' : 'faltan ') + pesos(Math.abs(dif))}</div></div></div>
    <p class="ayuda">Una línea por ticket. Corregí montos, sacá lo que sobre o agregá lo que falte hasta que cuadre con el recibo.</p>`;
  L.forEach((l, i) => {
    const dudoso = !l.confianza || l.confianza !== 'alta' || !l.monto;
    const aviso = !l.confianza ? '' : (l.observacion ? `<div class="aviso">⚠️ ${esc(l.observacion)}</div>` : '');
    h += `<div class="linea-gasto"><div class="linea-cab"><b>Ticket ${L.length > 1 ? i + 1 : ''}</b>${L.length > 1 ? `<button type="button" class="quitar" data-quitar="${i}">✕ Sacar</button>` : ''}</div>${aviso}
      <div class="dos-col"><div><label>Monto ($)</label><input data-i="${i}" data-k="monto" class="monto ${dudoso ? 'dudoso' : ''}" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.monto)}" placeholder="0,00"></div>
      <div><label>Fecha</label><input data-i="${i}" data-k="fecha" type="date" value="${esc(l.fecha)}" max="${estado.hoy}"></div></div>
      <label>Comercio</label><input data-i="${i}" data-k="comercio" value="${esc(l.comercio)}" placeholder="Ej: Ferretería López">
      <label>Concepto</label><input data-i="${i}" data-k="concepto" value="${esc(l.concepto)}" placeholder="Ej: tornillos y discos de corte"></div>`;
  });
  h += `<div class="fila-botones"><button class="secundaria" id="l-foto">${ICO.cam} Otra foto</button><button class="secundaria" id="l-agregar">${ICO.plus} Agregar a mano</button></div>
    <button class="principal" style="margin-top:.8rem" id="l-seguir">Siguiente: áreas</button>
    <button class="secundaria" style="margin-top:.6rem" id="l-volver">Volver a la rendición</button></div>`;
  app.innerHTML = h;
  const refrescarSuma = () => {
    leerFormularioLineas();
    const s = sumaLineas(), d = Math.round((s - x.total) * 100) / 100, ok = Math.abs(d) < 0.01;
    $('#l-suma').textContent = pesos(s);
    $('#l-dif').textContent = ok ? 'Cuadra' : (d > 0 ? 'sobran ' : 'faltan ') + pesos(Math.abs(d));
    $('#l-suma').parentElement.className = ok ? 'cuadra' : 'no-cuadra';
  };
  app.querySelectorAll('[data-k="monto"]').forEach((inp) => inp.addEventListener('input', refrescarSuma));
  app.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => { leerFormularioLineas(); L.splice(Number(b.dataset.quitar), 1); pasoLineas(); }));
  $('#l-foto').addEventListener('click', () => { leerFormularioLineas(); pasoFotoDetalle(); });
  $('#l-agregar').addEventListener('click', () => { leerFormularioLineas(); const falta = Math.round((x.total - sumaLineas()) * 100) / 100; L.push({ ...lineaVacia(), monto: falta > 0 ? falta : '' }); pasoLineas(); });
  $('#l-volver').addEventListener('click', verInicio);
  $('#l-seguir').addEventListener('click', () => {
    leerFormularioLineas();
    for (let i = 0; i < L.length; i++) {
      const n = L.length > 1 ? `Ticket ${i + 1}: ` : '';
      if (!(L[i].monto > 0)) return toast(n + 'poné el monto.', true);
      if (!L[i].fecha) return toast(n + 'poné la fecha.', true);
      if (!L[i].comercio) return toast(n + 'poné el comercio.', true);
    }
    pasoAreas();
  });
}

function pasoAreas() {
  const x = borrador.recibo, L = borrador.lineas;
  const botones = (sel) => estado.areas.map((a) => `<button type="button" class="${a === sel ? 'elegido' : ''}" data-a="${esc(a)}">${esc(a)}</button>`).join('');
  let h = `<div class="tarjeta">${barraPasos(3, 3)}<h2>Áreas · ${esc(x.persona)}</h2>`;
  if (L.length > 1) h += `<label>Todos los tickets</label><div class="opciones" id="a-todos">${botones(null)}</div><hr style="border:0;border-top:1px solid var(--borde);margin:.8rem 0">`;
  L.forEach((l, i) => {
    h += `<div class="linea-gasto"><div class="linea-cab"><b>${esc(l.comercio)}</b><span>${pesos(l.monto)}</span></div><div class="opciones" data-linea="${i}">${botones(l.area)}</div></div>`;
  });
  const suma = sumaLineas(), dif = Math.round((suma - x.total) * 100) / 100;
  if (Math.abs(dif) >= 0.01) h += `<div class="aviso">⚠️ Los tickets suman ${pesos(suma)} y el recibo es por ${pesos(x.total)} (${dif > 0 ? 'sobran' : 'faltan'} ${pesos(Math.abs(dif))}). Podés guardar igual: queda registrada la diferencia.</div>`;
  h += `<button class="principal" id="a-guardar">${ICO.save} Guardar detalle</button>
    <button class="secundaria" style="margin-top:.6rem" id="a-volver">Volver</button></div>`;
  app.innerHTML = h;
  const refrescar = () => {
    L.forEach((l, i) => app.querySelectorAll(`[data-linea="${i}"] button`).forEach((b) => b.classList.toggle('elegido', b.dataset.a === l.area)));
    $('#a-guardar').disabled = L.some((l) => !l.area);
  };
  refrescar();
  app.querySelectorAll('#a-todos button').forEach((b) => b.addEventListener('click', () => { L.forEach((l) => { l.area = b.dataset.a; }); app.querySelectorAll('#a-todos button').forEach((o) => o.classList.toggle('elegido', o === b)); refrescar(); }));
  L.forEach((l, i) => app.querySelectorAll(`[data-linea="${i}"] button`).forEach((b) => b.addEventListener('click', () => { l.area = b.dataset.a; refrescar(); })));
  $('#a-volver').addEventListener('click', pasoLineas);
  $('#a-guardar').addEventListener('click', async () => {
    $('#a-guardar').disabled = true;
    $('#a-guardar').textContent = 'Guardando…';
    try {
      if (borrador.imagenesNuevas.length) {
        await API.llamar('agregar_fotos', { id: x.id, imagenes: borrador.imagenesNuevas });
        borrador.imagenesNuevas = [];
      }
      await API.llamar('detallar', { id: x.id, forzar: Math.abs(dif) >= 0.01, lineas: L.map((l) => ({ fecha: l.fecha, monto: l.monto, comercio: l.comercio, concepto: l.concepto, area: l.area })) });
      await cargarEstado();
      toast(`${x.persona} detallado`);
      verInicio();
    } catch (e) { toast(e.message, true); $('#a-guardar').disabled = false; $('#a-guardar').innerHTML = ICO.save + ' Guardar detalle'; }
  });
}

// ---------- TRANSFERIR ----------

function verTransferir() {
  borrador = { imagenes: [], lineas: [] };
  app.innerHTML = `<div class="tarjeta">${barraPasos(1, 3)}<h2>Transferencia</h2>
    <p class="ayuda">Elegí la captura de la galería o sacale foto a la pantalla. Claude lee monto, fecha y destinatario.</p>
    <label class="foto-caja" for="t-gal">${ICO.gal} Elegir de la galería</label><input id="t-gal" type="file" accept="image/*">
    <div style="height:.6rem"></div>
    <label class="foto-caja" for="t-cam">${ICO.cam} Sacar foto</label><input id="t-cam" type="file" accept="image/*" capture="environment"></div>`;
  ['#t-gal', '#t-cam'].forEach((s) => $(s).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    app.innerHTML = `<div class="tarjeta"><div class="cargando">Preparando la imagen…</div></div>`;
    try {
      const img = await reducirImagen(f);
      borrador.imagenes.push(img);
      app.innerHTML = `<div class="tarjeta">${barraPasos(2, 3)}<img class="previa" src="${img}"><div class="cargando" style="margin-top:.8rem">Claude está leyendo la captura…</div></div>`;
      if (estado.claude) {
        try { agregarLeidos(await API.llamar('leer_comprobante', { imagen: img })); }
        catch (err) { toast(err.message, true); }
      }
      if (!borrador.lineas.length) borrador.lineas.push(lineaVacia());
      pasoTransfConfirmar();
    } catch (err) { toast(err.message, true); verTransferir(); }
  }));
}

function pasoTransfConfirmar() {
  const L = borrador.lineas;
  let h = `<div class="tarjeta">${barraPasos(2, 3)}<h2>Revisá la transferencia</h2>
    <div class="miniaturas">${borrador.imagenes.map((im) => `<img src="${im}">`).join('')}</div>`;
  L.forEach((l, i) => {
    h += `<div class="linea-gasto">${L.length > 1 ? `<div class="linea-cab"><b>Transferencia ${i + 1}</b><button type="button" class="quitar" data-quitar="${i}">✕ Sacar</button></div>` : ''}
      ${l.confianza && l.observacion ? `<div class="aviso">⚠️ ${esc(l.observacion)}</div>` : ''}
      <div class="dos-col"><div><label>Monto ($)</label><input data-i="${i}" data-k="monto" class="monto ${!l.monto || l.confianza !== 'alta' ? 'dudoso' : ''}" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.monto)}" placeholder="0,00"></div>
      <div><label>Fecha</label><input data-i="${i}" data-k="fecha" type="date" value="${esc(l.fecha)}" max="${estado.hoy}"></div></div>
      <label>¿A quién se transfirió?</label><input data-i="${i}" data-k="comercio" value="${esc(l.comercio)}" placeholder="Ej: Juan Pérez">
      <label>Concepto</label><input data-i="${i}" data-k="concepto" value="${esc(l.concepto)}" placeholder="Ej: arreglo de cubierta"></div>`;
  });
  h += `<button class="principal" id="t-seguir">Siguiente: área</button>
    <div class="fila-botones"><button class="secundaria" id="t-otra">Otra captura</button><button class="secundaria" id="t-cancel">Cancelar</button></div></div>`;
  app.innerHTML = h;
  app.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => { leerFormularioLineas(); L.splice(Number(b.dataset.quitar), 1); pasoTransfConfirmar(); }));
  $('#t-otra').addEventListener('click', () => { leerFormularioLineas(); const prev = borrador; verTransferir(); borrador = prev; });
  $('#t-cancel').addEventListener('click', () => irA('inicio'));
  $('#t-seguir').addEventListener('click', () => {
    leerFormularioLineas();
    for (let i = 0; i < L.length; i++) {
      if (!(L[i].monto > 0)) return toast('Poné el monto.', true);
      if (!L[i].fecha) return toast('Poné la fecha.', true);
      if (!L[i].comercio) return toast('Poné a quién se transfirió.', true);
    }
    pasoTransfArea();
  });
}

function pasoTransfArea() {
  const L = borrador.lineas;
  const botones = (sel) => estado.areas.map((a) => `<button type="button" class="${a === sel ? 'elegido' : ''}" data-a="${esc(a)}">${esc(a)}</button>`).join('');
  app.innerHTML = `<div class="tarjeta">${barraPasos(3, 3)}<h2>¿A qué área corresponde?</h2>` +
    L.map((l, i) => `<div class="linea-gasto"><div class="linea-cab"><b>${esc(l.comercio)}</b><span>${pesos(l.monto)}</span></div><div class="opciones" data-linea="${i}">${botones(l.area)}</div></div>`).join('') +
    `<button class="principal" id="t-guardar" disabled>${ICO.save} Guardar transferencia</button><button class="secundaria" style="margin-top:.6rem" id="t-volver">Volver</button></div>`;
  const refrescar = () => { L.forEach((l, i) => app.querySelectorAll(`[data-linea="${i}"] button`).forEach((b) => b.classList.toggle('elegido', b.dataset.a === l.area))); $('#t-guardar').disabled = L.some((l) => !l.area); };
  refrescar();
  L.forEach((l, i) => app.querySelectorAll(`[data-linea="${i}"] button`).forEach((b) => b.addEventListener('click', () => { l.area = b.dataset.a; refrescar(); })));
  $('#t-volver').addEventListener('click', pasoTransfConfirmar);
  $('#t-guardar').addEventListener('click', async () => {
    $('#t-guardar').disabled = true;
    try {
      const r = await API.llamar('transferencia', { op_id: crypto.randomUUID(), imagenes: borrador.imagenes, lineas: L.map((l) => ({ fecha: l.fecha, monto: l.monto, comercio: l.comercio, concepto: l.concepto, area: l.area })) });
      await cargarEstado();
      toast(`Transferencia guardada · ${pesos(r.recibo.total)}`);
      verInicio();
    } catch (e) { toast(e.message, true); $('#t-guardar').disabled = false; }
  });
}

// ---------- CIERRE ----------

async function confirmarCierre() {
  const a = estado.abierta;
  if (!confirm(`Vas a cerrar la rendición N° ${a.numero}: ${a.cantidad} recibos por ${pesos(a.total)}.\n\nDespués no se puede cambiar nada. ¿Cerrar y generar el PDF?`)) return;
  app.innerHTML = `<div class="tarjeta"><div class="cargando">Armando el PDF con recibos y capturas… puede tardar un minuto.</div></div>`;
  try {
    const r = await API.llamar('cerrar_rendicion', { op_id: crypto.randomUUID() });
    await cargarEstado();
    app.innerHTML = `<div class="tarjeta"><div class="aviso ok">Rendición N° ${a.numero} cerrada.</div>
      <h3>Ahora:</h3><ol class="ayuda" style="padding-left:1.2rem"><li>Abrí el PDF e imprimilo.</li><li>Abrochá los tickets físicos de la semana.</li><li>Entregalo a Contabilidad.</li></ol>
      <a href="${esc(r.pdf_url)}" target="_blank" rel="noopener"><button class="principal">${ICO.pdf} Abrir el PDF</button></a>
      <button class="secundaria" style="margin-top:.6rem" onclick="irA('inicio')">Empezar la próxima rendición</button></div>`;
  } catch (e) { toast(e.message, true); verInicio(); }
}

// ---------- HISTORIAL ----------

function verHistorial() {
  const c = estado.cerradas || [];
  if (!c.length) { app.innerHTML = `<div class="tarjeta"><h2>Rendiciones anteriores</h2><p class="ayuda">Todavía no cerraste ninguna.</p></div>`; return; }
  app.innerHTML = `<div class="seccion-t">Rendiciones anteriores</div><div class="lista">` + c.map((r) =>
    `<div class="historial-item"><div><b>N° ${r.numero}</b> · ${fechaLinda(r.fecha_cierre)}<div class="ayuda" style="margin:0">${r.cantidad} recibos · ${pesos(r.total)}</div></div>
     ${r.pdf_url ? `<a href="${esc(r.pdf_url)}" target="_blank" rel="noopener">${ICO.pdf} PDF</a>` : ''}</div>`).join('') + `</div>`;
}

// ---------- arranque ----------

(async () => {
  try {
    await cargarEstado();
    irA(estado.abierta && estado.abierta.cantidad ? 'inicio' : 'atender');
  } catch (e) {
    app.innerHTML = `<div class="tarjeta"><div class="aviso grave">${esc(e.message)}</div><button class="secundaria" onclick="location.reload()">Reintentar</button></div>`;
  }
})();
