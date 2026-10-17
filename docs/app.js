/**
 * Pantallas de Agustín.
 *
 *  Rendición  → resumen de la abierta, lista de gastos, botón Cerrar.
 *  Nuevo gasto → ¿ticket o transferencia? → foto(s) → Claude propone una línea por
 *                comprobante → confirmar/editar/agregar líneas → área por línea →
 *                (ticket) persona + firma de UN recibo por el total → guardar.
 *  Anteriores → rendiciones cerradas con link al PDF.
 */

const $ = (s) => document.querySelector(s);
const app = $('#app');
let estado = null;
let borrador = null; // carga en construcción
let vista = 'inicio';

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
  toastTimer = setTimeout(() => { t.hidden = true; }, error ? 5000 : 2500);
}
function totalLineas() { return borrador.lineas.reduce((a, l) => a + (Number(l.monto) || 0), 0); }

async function cargarEstado() {
  estado = await API.llamar('estado');
  const a = estado.abierta;
  $('#cab-sub').textContent = a
    ? `N° ${a.numero} abierta · ${a.cantidad} gasto${a.cantidad === 1 ? '' : 's'} · ${pesos(a.total)}`
    : `Próxima: N° ${estado.proximo_numero} · sin gastos todavía`;
}

function irA(v) {
  vista = v;
  document.querySelectorAll('.barra button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === v));
  window.scrollTo(0, 0);
  if (v === 'inicio') verInicio();
  if (v === 'nuevo') verNuevo();
  if (v === 'historial') verHistorial();
}
document.querySelectorAll('.barra button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));

function avisosDiagnostico() {
  const d = (estado && estado.diagnostico) || [];
  if (!d.length) return '';
  return `<div class="aviso grave">⚠️ Hay un problema en la planilla o la configuración:<br>` +
    d.map((x) => `• ${esc(x.hoja !== '-' ? x.hoja + ': ' : '')}${esc(x.detalle)}`).join('<br>') + '</div>';
}

// ---------- vista: rendición abierta ----------

function verInicio() {
  const a = estado.abierta;
  let h = avisosDiagnostico();
  if (!a || !a.cantidad) {
    h += `<div class="tarjeta"><h2>Rendición N° ${estado.proximo_numero}</h2>
      <p class="ayuda">Todavía no cargaste ningún gasto. Cada vez que te traen tickets o hacés una transferencia, cargalo en el momento, así el viernes está todo listo.</p>
      <button class="principal" onclick="irA('nuevo')">➕ Cargar el primer gasto</button></div>`;
    app.innerHTML = h;
    return;
  }
  const tickets = a.gastos.filter((g) => g.tipo === 'ticket').length;
  const transf = a.gastos.length - tickets;
  h += `<div class="kpi">
      <div><div class="v">${pesos(a.total)}</div><div class="l">Total rendición N° ${a.numero}</div></div>
      <div><div class="v">${a.cantidad}</div><div class="l">${tickets} ticket${tickets === 1 ? '' : 's'} · ${transf} transf.</div></div>
    </div>`;
  const areas = Object.keys(a.por_area).sort();
  h += `<div class="areas">${areas.map((x) => `<span class="chip">${esc(x)}: ${pesos(a.por_area[x])}</span>`).join('')}</div>`;
  h += `<div class="tarjeta"><h3>Gastos cargados</h3>` + a.gastos.map(filaGasto).join('') + `</div>`;
  h += `<div class="tarjeta"><h3>Cerrar y armar el PDF</h3>
    <p class="ayuda">Al cerrar se genera el PDF con el resumen, los recibos firmados y las capturas. Después no se puede agregar ni cambiar nada: lo que falte va a la rendición siguiente.</p>
    <button class="principal" id="btn-cerrar">🔒 Cerrar rendición N° ${a.numero}</button></div>`;
  app.innerHTML = h;
  $('#btn-cerrar').addEventListener('click', confirmarCierre);
  app.querySelectorAll('.gasto').forEach((el) => el.addEventListener('click', () => verGasto(el.dataset.id)));
}

function filaGasto(g) {
  const ico = g.tipo === 'ticket' ? '🧾' : '💸';
  return `<div class="gasto ${g.tipo}" data-id="${g.id}">
    <div class="n">${ico}</div>
    <div class="cuerpo"><div class="t">${esc(g.comercio)} ${g.concepto ? '· ' + esc(g.concepto) : ''}</div>
      <div class="d">${fechaLinda(g.fecha)} · ${esc(g.area)}${g.persona ? ' · ' + esc(g.persona) : ''}</div></div>
    <div class="m">${pesos(g.monto)}</div></div>`;
}

function verGasto(id) {
  const g = estado.abierta.gastos.find((x) => x.id === id);
  if (!g) return;
  const hermanos = estado.abierta.gastos.filter((x) => x.recibo_id && x.recibo_id === g.recibo_id && x.id !== g.id);
  app.innerHTML = `<div class="tarjeta">
    <h2>${g.tipo === 'ticket' ? '🧾 Ticket' : '💸 Transferencia'}</h2>
    ${hermanos.length ? `<p class="ayuda">Está en el mismo recibo que otros ${hermanos.length} gasto${hermanos.length === 1 ? '' : 's'} de ${esc(g.persona)}. El monto no se puede cambiar porque el recibo ya está firmado.</p>` : ''}
    <label>Monto</label><div style="font-size:1.5rem;font-weight:800;margin-bottom:.7rem">${pesos(g.monto)}</div>
    <label>Fecha</label><input id="e-fecha" type="date" value="${esc(g.fecha)}">
    <label>${g.tipo === 'ticket' ? 'Comercio' : 'Destinatario'}</label><input id="e-comercio" value="${esc(g.comercio)}">
    <label>Concepto</label><input id="e-concepto" value="${esc(g.concepto)}">
    <label>Área</label><div class="opciones" id="e-areas">${estado.areas.map((a) => `<button type="button" class="${a === g.area ? 'elegido' : ''}" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div>
    ${g.persona ? `<label>Reintegrado a</label><div style="margin-bottom:.7rem">${esc(g.persona)}${g.persona_dni ? ' · DNI ' + esc(g.persona_dni) : ''} ✍️ firmado</div>` : ''}
    <button class="principal" id="e-guardar">Guardar cambios</button>
    <div class="fila-botones"><button class="secundaria" id="e-volver">Volver</button><button class="secundaria peligro" id="e-anular">Anular este gasto</button></div>
  </div>`;
  let area = g.area;
  $('#e-areas').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    area = b.dataset.a;
    $('#e-areas').querySelectorAll('button').forEach((x) => x.classList.toggle('elegido', x === b));
  }));
  $('#e-volver').addEventListener('click', verInicio);
  $('#e-guardar').addEventListener('click', async () => {
    try {
      $('#e-guardar').disabled = true;
      await API.llamar('editar_gasto', { id, fecha: $('#e-fecha').value, comercio: $('#e-comercio').value, concepto: $('#e-concepto').value, area });
      await cargarEstado();
      toast('✅ Gasto actualizado');
      verInicio();
    } catch (e) { toast(e.message, true); $('#e-guardar').disabled = false; }
  });
  $('#e-anular').addEventListener('click', async () => {
    if (!confirm(`¿Anular este gasto de ${pesos(g.monto)} (${g.comercio})? Sale de la rendición y del PDF.`)) return;
    try {
      await API.llamar('anular_gasto', { id });
      await cargarEstado();
      toast('Gasto anulado');
      verInicio();
    } catch (e) { toast(e.message, true); }
  });
}

async function confirmarCierre() {
  const a = estado.abierta;
  if (!confirm(`Vas a cerrar la rendición N° ${a.numero}: ${a.cantidad} gastos por ${pesos(a.total)}.\n\nDespués no se puede agregar ni cambiar nada. ¿Cerrar y generar el PDF?`)) return;
  app.innerHTML = `<div class="tarjeta"><div class="cargando">Armando el PDF con recibos y capturas… puede tardar un minuto.</div></div>`;
  try {
    const r = await API.llamar('cerrar_rendicion', { op_id: crypto.randomUUID() });
    await cargarEstado();
    app.innerHTML = `<div class="tarjeta"><div class="aviso ok">✅ Rendición N° ${a.numero} cerrada.</div>
      <h3>Ahora:</h3><ol class="ayuda" style="padding-left:1.2rem">
        <li>Abrí el PDF e imprimilo.</li>
        <li>Abrochá los tickets físicos de la semana.</li>
        <li>Entregalo a Contabilidad.</li></ol>
      <a href="${esc(r.pdf_url)}" target="_blank" rel="noopener"><button class="principal">📄 Abrir el PDF</button></a>
      <button class="secundaria" style="margin-top:.6rem" onclick="irA('inicio')">Empezar la próxima rendición</button></div>`;
  } catch (e) {
    toast(e.message, true);
    verInicio();
  }
}

// ---------- vista: nuevo gasto ----------

function barraPasos(n, total) {
  return `<div class="pasos">${Array.from({ length: total }, (_, i) => `<span class="${i < n ? 'hecho' : ''}"></span>`).join('')}</div>`;
}

function verNuevo() {
  borrador = { tipo: null, imagenes: [], claude: [], lineas: [], persona: '', persona_dni: '', firma: null };
  app.innerHTML = `<div class="tarjeta">${barraPasos(0, 4)}<h2>¿Qué vas a cargar?</h2>
    <div class="grande">
      <button id="t-ticket"><span class="ico">🧾</span><span>Tickets / facturas<small>Le devolvés la plata a alguien y firma el recibo acá. Pueden ser varios tickets.</small></span></button>
      <button id="t-transf"><span class="ico">💸</span><span>Transferencia<small>Subís la captura; no hace falta recibo</small></span></button>
    </div></div>`;
  $('#t-ticket').addEventListener('click', () => { borrador.tipo = 'ticket'; pasoFoto(); });
  $('#t-transf').addEventListener('click', () => { borrador.tipo = 'transferencia'; pasoFoto(); });
}

function pasoFoto() {
  const esTicket = borrador.tipo === 'ticket';
  const otra = borrador.imagenes.length > 0;
  app.innerHTML = `<div class="tarjeta">${barraPasos(1, 4)}
    <h2>${otra ? 'Otra foto' : esTicket ? 'Foto de los tickets' : 'Captura de la transferencia'}</h2>
    <p class="ayuda">${esTicket ? 'Podés poner varios tickets en la misma foto: apoyalos planos, sin que se tapen, con buena luz. Claude lee cada uno por separado.' : 'Elegí la captura de la galería o sacale foto a la pantalla.'}</p>
    <label class="foto-caja" for="f-cam">📷 Sacar foto</label>
    <input id="f-cam" type="file" accept="image/*" capture="environment">
    <div style="height:.6rem"></div>
    <label class="foto-caja" for="f-gal">🖼️ Elegir de la galería</label>
    <input id="f-gal" type="file" accept="image/*">
    <button class="secundaria" style="margin-top:.9rem" id="f-volver">${otra ? 'Volver a la lista' : 'Volver'}</button></div>`;
  $('#f-volver').addEventListener('click', () => otra ? pasoConfirmar() : verNuevo());
  ['#f-cam', '#f-gal'].forEach((s) => $(s).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    app.innerHTML = `<div class="tarjeta"><div class="cargando">Preparando la imagen…</div></div>`;
    try {
      const img = await reducirImagen(f);
      borrador.imagenes.push(img);
      await pasoLeer(img);
    } catch (err) { toast(err.message, true); pasoFoto(); }
  }));
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

function lineaVacia() {
  return { monto: '', fecha: estado.hoy, comercio: '', concepto: '', area: null, confianza: null, observacion: '', tipo_leido: '' };
}

async function pasoLeer(img) {
  app.innerHTML = `<div class="tarjeta">${barraPasos(2, 4)}
    <img class="previa" src="${img}">
    <div class="cargando" style="margin-top:.8rem">Claude está leyendo los comprobantes…</div></div>`;
  let d = null;
  if (estado.claude) {
    try { d = await API.llamar('leer_comprobante', { imagen: img }); }
    catch (e) { toast(e.message, true); }
  }
  borrador.claude.push(d);
  const leidos = (d && d.comprobantes) || [];
  if (!leidos.length) {
    borrador.lineas.push(lineaVacia());
    if (d && d.observacion_general) toast('⚠️ ' + d.observacion_general, true);
    else if (d) toast('No se encontró ningún comprobante legible. Completá a mano.', true);
  } else {
    leidos.forEach((c) => borrador.lineas.push({
      monto: c.monto > 0 ? c.monto : '',
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : estado.hoy,
      comercio: c.comercio || '',
      concepto: c.concepto || '',
      area: null,
      confianza: c.confianza,
      observacion: c.observacion || '',
      tipo_leido: c.tipo
    }));
    if (d.observacion_general) toast('⚠️ ' + d.observacion_general, true);
  }
  pasoConfirmar();
}

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

function pasoConfirmar() {
  const esTicket = borrador.tipo === 'ticket';
  const L = borrador.lineas;
  let h = `<div class="tarjeta">${barraPasos(2, 4)}
    <h2>${L.length === 1 ? 'Revisá el gasto' : `Revisá los ${L.length} gastos`}</h2>
    <p class="ayuda">Claude leyó ${L.filter((l) => l.confianza).length} comprobante${L.filter((l) => l.confianza).length === 1 ? '' : 's'} en ${borrador.imagenes.length} foto${borrador.imagenes.length === 1 ? '' : 's'}. Corregí lo que esté mal, sacá lo que sobre o agregá lo que falte.</p>
    <div style="display:flex;gap:.4rem;overflow-x:auto;margin-bottom:.8rem">${borrador.imagenes.map((im) => `<img src="${im}" style="height:5rem;border-radius:.5rem">`).join('')}</div>`;
  L.forEach((l, i) => {
    const dudoso = !l.confianza || l.confianza !== 'alta' || !l.monto;
    let aviso = '';
    if (!l.confianza) aviso = `<div class="aviso">Completá a mano mirando la foto.</div>`;
    else if (l.observacion) aviso = `<div class="aviso">⚠️ ${esc(l.observacion)}</div>`;
    else if (esTicket && l.tipo_leido === 'transferencia') aviso = `<div class="aviso">⚠️ Esto parece una transferencia, no un ticket.</div>`;
    else if (!esTicket && ['ticket', 'factura'].includes(l.tipo_leido)) aviso = `<div class="aviso">⚠️ Esto parece un ticket, no una transferencia.</div>`;
    h += `<div class="linea-gasto"><div class="linea-cab"><b>${esTicket ? 'Ticket' : 'Transferencia'} ${L.length > 1 ? i + 1 : ''}</b>${L.length > 1 ? `<button type="button" class="quitar" data-quitar="${i}">✕ Sacar</button>` : ''}</div>
      ${aviso}
      <label>Monto total ($)</label><input data-i="${i}" data-k="monto" class="monto ${dudoso ? 'dudoso' : ''}" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.monto)}" placeholder="0,00">
      <label>Fecha</label><input data-i="${i}" data-k="fecha" type="date" value="${esc(l.fecha)}" max="${estado.hoy}">
      <label>${esTicket ? 'Comercio' : '¿A quién se transfirió?'}</label><input data-i="${i}" data-k="comercio" value="${esc(l.comercio)}" placeholder="${esTicket ? 'Ej: Ferretería López' : 'Ej: Juan Pérez'}">
      <label>Concepto</label><input data-i="${i}" data-k="concepto" value="${esc(l.concepto)}" placeholder="Ej: tornillos y discos de corte"></div>`;
  });
  h += `<div class="fila-botones"><button class="secundaria" id="c-otra">📷 Otra foto</button><button class="secundaria" id="c-agregar">➕ Agregar a mano</button></div>
    <div class="kpi" style="margin-top:.8rem"><div><div class="v" id="c-total">${pesos(totalLineas())}</div><div class="l">Total a ${esTicket ? 'reintegrar' : 'cargar'}</div></div><div><div class="v">${L.length}</div><div class="l">gasto${L.length === 1 ? '' : 's'}</div></div></div>
    <button class="principal" id="c-seguir">Siguiente: elegir el área</button>
    <button class="secundaria" style="margin-top:.6rem" id="c-cancel">Cancelar la carga</button></div>`;
  app.innerHTML = h;
  app.querySelectorAll('[data-k="monto"]').forEach((inp) => inp.addEventListener('input', () => { leerFormularioLineas(); $('#c-total').textContent = pesos(totalLineas()); }));
  app.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => { leerFormularioLineas(); L.splice(Number(b.dataset.quitar), 1); pasoConfirmar(); }));
  $('#c-otra').addEventListener('click', () => { leerFormularioLineas(); pasoFoto(); });
  $('#c-agregar').addEventListener('click', () => { leerFormularioLineas(); L.push(lineaVacia()); pasoConfirmar(); setTimeout(() => app.querySelector(`[data-i="${L.length - 1}"][data-k="monto"]`)?.focus(), 50); });
  $('#c-cancel').addEventListener('click', () => { if (confirm('¿Descartar esta carga?')) irA('inicio'); });
  $('#c-seguir').addEventListener('click', () => {
    leerFormularioLineas();
    for (let i = 0; i < L.length; i++) {
      const n = L.length > 1 ? `Gasto ${i + 1}: ` : '';
      if (!(L[i].monto > 0)) return toast(n + 'poné el monto total.', true);
      if (!L[i].fecha) return toast(n + 'poné la fecha.', true);
      if (!L[i].comercio) return toast(n + (esTicket ? 'poné el comercio.' : 'poné a quién se transfirió.'), true);
    }
    pasoArea();
  });
}

function pasoArea() {
  const L = borrador.lineas;
  const esTicket = borrador.tipo === 'ticket';
  const botones = (sel, attr) => estado.areas.map((a) => `<button type="button" class="${a === sel ? 'elegido' : ''}" ${attr} data-a="${esc(a)}">${esc(a)}</button>`).join('');
  let h = `<div class="tarjeta">${barraPasos(3, 4)}<h2>¿A qué área corresponde?</h2>`;
  if (L.length > 1) h += `<p class="ayuda">Elegí una para todos y después cambiá la que haga falta.</p><label>Todos</label><div class="opciones" id="a-todos">${botones(null, '')}</div><hr style="border:0;border-top:1px solid var(--borde);margin:.8rem 0">`;
  L.forEach((l, i) => {
    h += `<div class="linea-gasto"><div class="linea-cab"><b>${esc(l.comercio)}</b><span>${pesos(l.monto)}</span></div><div class="opciones" data-linea="${i}">${botones(l.area, '')}</div></div>`;
  });
  h += `<button class="principal" id="a-seguir">${esTicket ? 'Siguiente: recibo y firma' : 'Guardar transferencia'}</button>
    <button class="secundaria" style="margin-top:.6rem" id="a-volver">Volver</button></div>`;
  app.innerHTML = h;
  const refrescar = () => {
    L.forEach((l, i) => app.querySelectorAll(`[data-linea="${i}"] button`).forEach((b) => b.classList.toggle('elegido', b.dataset.a === l.area)));
    $('#a-seguir').disabled = L.some((l) => !l.area);
  };
  refrescar();
  app.querySelectorAll('#a-todos button').forEach((b) => b.addEventListener('click', () => { L.forEach((l) => { l.area = b.dataset.a; }); app.querySelectorAll('#a-todos button').forEach((x) => x.classList.toggle('elegido', x === b)); refrescar(); }));
  L.forEach((l, i) => app.querySelectorAll(`[data-linea="${i}"] button`).forEach((b) => b.addEventListener('click', () => { l.area = b.dataset.a; refrescar(); })));
  $('#a-volver').addEventListener('click', pasoConfirmar);
  $('#a-seguir').addEventListener('click', () => esTicket ? pasoFirma() : guardar());
}

function pasoFirma() {
  const L = borrador.lineas;
  const total = totalLineas();
  const personas = estado.personas || [];
  app.innerHTML = `<div class="tarjeta">${barraPasos(4, 4)}<h2>Recibo de reintegro</h2>
    <p class="ayuda">Dale el celular a quien recibe la plata: que revise el recibo y firme con el dedo.</p>
    <label>¿Quién recibe el reintegro?</label>
    <input id="s-persona" list="s-lista" value="${esc(borrador.persona)}" placeholder="Nombre y apellido" autocomplete="off">
    <datalist id="s-lista">${personas.map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
    <label>DNI (opcional)</label><input id="s-dni" inputmode="numeric" value="${esc(borrador.persona_dni)}" placeholder="Sin puntos">
    <div class="recibo-previa" id="s-recibo"></div>
    <label>Firma</label>
    <canvas class="firma" id="s-canvas"></canvas>
    <button class="secundaria" id="s-borrar">Borrar la firma</button>
    <button class="principal" style="margin-top:.8rem" id="s-guardar" disabled>✍️ Guardar recibo firmado</button>
    <button class="secundaria" style="margin-top:.6rem" id="s-volver">Volver</button></div>`;

  const inpP = $('#s-persona'), inpD = $('#s-dni');
  function textoRecibo() {
    const nombre = inpP.value.trim() || '________________';
    const items = L.map((l) => `<li>${esc(l.concepto || l.comercio)}${l.comercio && l.concepto ? ' (' + esc(l.comercio) + ')' : ''} · ${fechaLinda(l.fecha)} · ${pesos(l.monto)}</li>`).join('');
    $('#s-recibo').innerHTML = `Recibí de <b>INGECO S.A. (${esc(estado.responsable)})</b> la suma de <span class="monto">${pesos(total)}</span> en concepto de reintegro de ${L.length === 1 ? 'el siguiente gasto' : 'los siguientes gastos'}, cuyos tickets entrego:<ul style="margin:.4rem 0 .4rem 1.1rem;padding:0">${items}</ul>Firma: <b>${esc(nombre)}</b>`;
  }
  inpP.addEventListener('input', () => {
    const p = personas.find((x) => x.nombre.toLowerCase() === inpP.value.trim().toLowerCase());
    if (p && p.dni && !inpD.value) inpD.value = p.dni;
    textoRecibo(); revisar();
  });
  textoRecibo();

  const canvas = $('#s-canvas');
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
  canvas.addEventListener('pointermove', (e) => { if (!dibujando) return; ctx.lineTo(...pos(e)); ctx.stroke(); firmado = true; revisar(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => canvas.addEventListener(ev, () => { dibujando = false; }));
  $('#s-borrar').addEventListener('click', () => { ctx.clearRect(0, 0, rect.width, rect.height); firmado = false; revisar(); });
  function revisar() { $('#s-guardar').disabled = !(firmado && inpP.value.trim().length >= 3); }

  $('#s-volver').addEventListener('click', pasoArea);
  $('#s-guardar').addEventListener('click', () => {
    borrador.persona = inpP.value.trim();
    borrador.persona_dni = inpD.value.trim();
    borrador.firma = canvas.toDataURL('image/png');
    guardar();
  });
}

async function guardar() {
  app.innerHTML = `<div class="tarjeta"><div class="cargando">Guardando…</div></div>`;
  try {
    const r = await API.llamar('guardar_gasto', {
      op_id: crypto.randomUUID(),
      tipo: borrador.tipo,
      imagenes: borrador.imagenes,
      lineas: borrador.lineas.map((l) => ({ monto: l.monto, fecha: l.fecha, comercio: l.comercio, concepto: l.concepto, area: l.area })),
      persona: borrador.persona, persona_dni: borrador.persona_dni,
      firma: borrador.firma,
      detalle_claude: borrador.claude
    });
    await cargarEstado();
    const n = r.gastos.length;
    app.innerHTML = `<div class="tarjeta"><div class="aviso ok">✅ ${n === 1 ? 'Gasto guardado' : n + ' gastos guardados'} · ${pesos(r.total)}</div>
      ${borrador.tipo === 'ticket' ? `<p style="font-size:1.05rem"><b>Guardá los tickets de papel</b> con los demás de esta rendición: van abrochados al PDF del viernes.</p>` : '<p class="ayuda">La captura queda en el anexo del PDF. No hace falta guardar nada en papel.</p>'}
      <button class="principal" onclick="irA('nuevo')">➕ Cargar otro</button>
      <button class="secundaria" style="margin-top:.6rem" onclick="irA('inicio')">Ver la rendición</button></div>`;
  } catch (e) {
    toast(e.message, true);
    if (borrador.tipo === 'ticket') pasoFirma(); else pasoArea();
  }
}

// ---------- vista: historial ----------

function verHistorial() {
  const c = estado.cerradas || [];
  if (!c.length) {
    app.innerHTML = `<div class="tarjeta"><h2>Rendiciones anteriores</h2><p class="ayuda">Todavía no cerraste ninguna.</p></div>`;
    return;
  }
  app.innerHTML = `<div class="tarjeta"><h2>Rendiciones anteriores</h2>` + c.map((r) =>
    `<div class="historial-item"><div><b>N° ${r.numero}</b> · ${fechaLinda(r.fecha_cierre)}<div class="ayuda" style="margin:0">${r.cantidad} gastos · ${pesos(r.total)}</div></div>
     ${r.pdf_url ? `<a href="${esc(r.pdf_url)}" target="_blank" rel="noopener">📄 PDF</a>` : ''}</div>`).join('') + `</div>`;
}

// ---------- arranque ----------

(async () => {
  try {
    await cargarEstado();
    irA('inicio');
  } catch (e) {
    app.innerHTML = `<div class="tarjeta"><div class="aviso grave">${esc(e.message)}</div><button class="secundaria" onclick="location.reload()">Reintentar</button></div>`;
  }
})();
