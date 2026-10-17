/**
 * Pantallas de Agustín.
 *
 *  Rendición  → resumen de la abierta, lista de gastos, botón Cerrar.
 *  Nuevo gasto → ¿ticket o transferencia? → foto → Claude propone datos →
 *                confirmar monto/fecha/comercio/concepto → área →
 *                (ticket) persona + firma en pantalla → guardar.
 *  Anteriores → rendiciones cerradas con link al PDF.
 */

const $ = (s) => document.querySelector(s);
const app = $('#app');
let estado = null;
let borrador = null; // gasto en construcción
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
      <p class="ayuda">Todavía no cargaste ningún gasto. Cada ticket que te traen o cada transferencia que hacés, cargala acá en el momento, así el viernes está todo listo.</p>
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
    <div class="n">${g.numero}</div>
    <div class="cuerpo"><div class="t">${ico} ${esc(g.comercio)} ${g.concepto ? '· ' + esc(g.concepto) : ''}</div>
      <div class="d">${fechaLinda(g.fecha)} · ${esc(g.area)}${g.persona ? ' · ' + esc(g.persona) : ''}</div></div>
    <div class="m">${pesos(g.monto)}</div></div>`;
}

function verGasto(id) {
  const g = estado.abierta.gastos.find((x) => x.id === id);
  if (!g) return;
  app.innerHTML = `<div class="tarjeta">
    <h2>Gasto N° ${g.numero} · ${g.tipo === 'ticket' ? 'Ticket' : 'Transferencia'}</h2>
    <p class="ayuda">${g.tipo === 'ticket' ? 'Escribí el <b>N° ' + g.numero + '</b> en el ticket de papel para que Contabilidad lo encuentre.' : 'La captura va en el anexo B del PDF.'}</p>
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
    if (!confirm(`¿Anular el gasto N° ${g.numero} (${pesos(g.monto)})? Sale de la rendición y del PDF.`)) return;
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
        <li>Abrochá los tickets físicos numerados detrás.</li>
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
  borrador = { tipo: null, imagen: null, claude: null, datos: {}, area: null, persona: '', persona_dni: '', firma: null };
  app.innerHTML = `<div class="tarjeta">${barraPasos(0, 4)}<h2>¿Qué vas a cargar?</h2>
    <div class="grande">
      <button id="t-ticket"><span class="ico">🧾</span><span>Ticket / factura<small>Le devolvés la plata a alguien y firma el recibo acá</small></span></button>
      <button id="t-transf"><span class="ico">💸</span><span>Transferencia<small>Subís la captura; no hace falta recibo</small></span></button>
    </div></div>`;
  $('#t-ticket').addEventListener('click', () => { borrador.tipo = 'ticket'; pasoFoto(); });
  $('#t-transf').addEventListener('click', () => { borrador.tipo = 'transferencia'; pasoFoto(); });
}

function pasoFoto() {
  const esTicket = borrador.tipo === 'ticket';
  app.innerHTML = `<div class="tarjeta">${barraPasos(1, 4)}
    <h2>${esTicket ? 'Foto del ticket' : 'Captura de la transferencia'}</h2>
    <p class="ayuda">${esTicket ? 'Apoyalo plano, con buena luz, que se lea el total.' : 'Elegí la captura de la galería o sacale foto a la pantalla.'}</p>
    <label class="foto-caja" for="f-cam">📷 ${esTicket ? 'Sacar foto' : 'Sacar foto de la pantalla'}</label>
    <input id="f-cam" type="file" accept="image/*" capture="environment">
    <div style="height:.6rem"></div>
    <label class="foto-caja" for="f-gal">🖼️ Elegir de la galería</label>
    <input id="f-gal" type="file" accept="image/*">
    <button class="secundaria" style="margin-top:.9rem" id="f-volver">Volver</button></div>`;
  $('#f-volver').addEventListener('click', verNuevo);
  ['#f-cam', '#f-gal'].forEach((s) => $(s).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    app.innerHTML = `<div class="tarjeta"><div class="cargando">Preparando la imagen…</div></div>`;
    try {
      borrador.imagen = await reducirImagen(f);
      pasoLeer();
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
      const esc = Math.min(1, MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * esc);
      c.height = Math.round(img.height * esc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => rej(new Error('No se pudo leer la imagen.'));
    img.src = url;
  });
}

async function pasoLeer() {
  app.innerHTML = `<div class="tarjeta">${barraPasos(2, 4)}
    <img class="previa" src="${borrador.imagen}">
    <div class="cargando" style="margin-top:.8rem">Claude está leyendo el comprobante…</div></div>`;
  let d = null;
  if (estado.claude) {
    try {
      d = await API.llamar('leer_comprobante', { imagen: borrador.imagen });
    } catch (e) {
      toast(e.message, true);
    }
  }
  borrador.claude = d;
  borrador.datos = {
    monto: d && d.monto > 0 ? d.monto : '',
    fecha: d && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : estado.hoy,
    comercio: (d && d.comercio) || '',
    concepto: (d && d.concepto) || ''
  };
  pasoConfirmar();
}

function pasoConfirmar() {
  const d = borrador.datos;
  const c = borrador.claude;
  const esTicket = borrador.tipo === 'ticket';
  const dudoso = c && c.confianza !== 'alta';
  let aviso = '';
  if (!c) aviso = `<div class="aviso">No se pudo leer automáticamente. Completá los datos a mano mirando la foto.</div>`;
  else if (c.tipo === 'ilegible') aviso = `<div class="aviso">⚠️ La foto no se lee bien. Revisá los datos o volvé a sacarla.</div>`;
  else if (c.observacion) aviso = `<div class="aviso">⚠️ ${esc(c.observacion)}</div>`;
  else if (esTicket && c.tipo === 'transferencia') aviso = `<div class="aviso">⚠️ Esto parece una transferencia, no un ticket. ¿Elegiste bien el tipo?</div>`;
  else if (!esTicket && ['ticket', 'factura'].includes(c.tipo)) aviso = `<div class="aviso">⚠️ Esto parece un ticket, no una transferencia. ¿Elegiste bien el tipo?</div>`;
  else aviso = `<div class="aviso ok">✅ Leído. Revisá que el monto y la fecha estén bien.</div>`;

  app.innerHTML = `<div class="tarjeta">${barraPasos(2, 4)}
    <img class="previa" src="${borrador.imagen}" style="max-height:30vh">
    <div style="height:.8rem"></div>${aviso}
    <label>Monto total ($)</label><input id="c-monto" class="monto ${dudoso || !d.monto ? 'dudoso' : ''}" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(d.monto)}" placeholder="0,00">
    <label>Fecha del gasto</label><input id="c-fecha" type="date" value="${esc(d.fecha)}" max="${estado.hoy}">
    <label>${esTicket ? 'Comercio' : '¿A quién se transfirió?'}</label><input id="c-comercio" value="${esc(d.comercio)}" placeholder="${esTicket ? 'Ej: Ferretería López' : 'Ej: Juan Pérez'}">
    <label>Concepto (qué se compró o pagó)</label><input id="c-concepto" value="${esc(d.concepto)}" placeholder="Ej: tornillos y discos de corte">
    <button class="principal" id="c-seguir">Siguiente: elegir el área</button>
    <div class="fila-botones"><button class="secundaria" id="c-foto">Otra foto</button><button class="secundaria" id="c-cancel">Cancelar</button></div></div>`;
  $('#c-foto').addEventListener('click', pasoFoto);
  $('#c-cancel').addEventListener('click', () => irA('inicio'));
  $('#c-seguir').addEventListener('click', () => {
    d.monto = Number($('#c-monto').value);
    d.fecha = $('#c-fecha').value;
    d.comercio = $('#c-comercio').value.trim();
    d.concepto = $('#c-concepto').value.trim();
    if (!(d.monto > 0)) return toast('Poné el monto total.', true);
    if (!d.fecha) return toast('Poné la fecha del gasto.', true);
    if (!d.comercio) return toast(esTicket ? 'Poné el nombre del comercio.' : 'Poné a quién se transfirió.', true);
    pasoArea();
  });
}

function pasoArea() {
  app.innerHTML = `<div class="tarjeta">${barraPasos(3, 4)}<h2>¿A qué área corresponde?</h2>
    <p class="ayuda">${esc(borrador.datos.comercio)} · ${pesos(borrador.datos.monto)}</p>
    <div class="opciones" id="a-ops">${estado.areas.map((a) => `<button type="button" class="${a === borrador.area ? 'elegido' : ''}" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div>
    <button class="principal" id="a-seguir" ${borrador.area ? '' : 'disabled'}>${borrador.tipo === 'ticket' ? 'Siguiente: recibo y firma' : 'Guardar transferencia'}</button>
    <button class="secundaria" style="margin-top:.6rem" id="a-volver">Volver</button></div>`;
  $('#a-ops').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    borrador.area = b.dataset.a;
    $('#a-ops').querySelectorAll('button').forEach((x) => x.classList.toggle('elegido', x === b));
    $('#a-seguir').disabled = false;
  }));
  $('#a-volver').addEventListener('click', pasoConfirmar);
  $('#a-seguir').addEventListener('click', () => borrador.tipo === 'ticket' ? pasoFirma() : guardar());
}

function pasoFirma() {
  const d = borrador.datos;
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
    $('#s-recibo').innerHTML = `Recibí de <b>INGECO S.A. (${esc(estado.responsable)})</b> la suma de <span class="monto">${pesos(d.monto)}</span> en concepto de reintegro de <b>${esc(d.concepto || d.comercio)}</b>${d.comercio ? ' en ' + esc(d.comercio) : ''}, del día ${fechaLinda(d.fecha)}, área <b>${esc(borrador.area)}</b>.<br><br>Firma: <b>${esc(nombre)}</b>`;
  }
  inpP.addEventListener('input', () => {
    const p = personas.find((x) => x.nombre.toLowerCase() === inpP.value.trim().toLowerCase());
    if (p && p.dni && !inpD.value) inpD.value = p.dni;
    textoRecibo(); revisar();
  });
  textoRecibo();

  // firma
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
  app.innerHTML = `<div class="tarjeta"><div class="cargando">Guardando el gasto…</div></div>`;
  const d = borrador.datos;
  try {
    const r = await API.llamar('guardar_gasto', {
      op_id: crypto.randomUUID(),
      tipo: borrador.tipo,
      imagen: borrador.imagen,
      monto: d.monto, fecha: d.fecha, comercio: d.comercio, concepto: d.concepto,
      area: borrador.area,
      persona: borrador.persona, persona_dni: borrador.persona_dni,
      firma: borrador.firma,
      detalle_claude: borrador.claude
    });
    await cargarEstado();
    const g = r.gasto;
    app.innerHTML = `<div class="tarjeta"><div class="aviso ok">✅ Gasto N° ${g.numero} guardado · ${pesos(g.monto)} · ${esc(g.area)}</div>
      ${g.tipo === 'ticket' ? `<p style="font-size:1.1rem"><b>Escribí el N° ${g.numero} en el ticket de papel</b> y guardalo con los demás de esta rendición.</p>` : '<p class="ayuda">La captura queda en el anexo del PDF. No hace falta guardar nada en papel.</p>'}
      <button class="principal" onclick="irA('nuevo')">➕ Cargar otro gasto</button>
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
