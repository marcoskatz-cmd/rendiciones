/**
 * Cliente de la API. Sin cola offline: la rendición se arma en la oficina con
 * señal, y un gasto con foto y firma necesita la respuesta de Claude al momento.
 * Cada guardado lleva un op_id fijo: si se corta la respuesta y se reintenta,
 * el backend devuelve el mismo gasto en vez de duplicarlo.
 */
const API_URL = window.RENDICIONES_API_URL;
const SIN_SEÑAL = 'No hay conexión con el servidor. Revisá la señal y probá de nuevo.';

/** Respuesta entera ({data, all}): para pedir el estado de yapa con con_all. */
async function llamarCompleto(action, datos = {}) {
  let r;
  try {
    r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...datos, ingeco_sesion: window.INGECO_SESION || '' })
    });
  } catch (e) {
    throw new Error(SIN_SEÑAL);
  }
  if (!r.ok) throw new Error(SIN_SEÑAL);
  let j;
  try { j = await r.json(); } catch (e) { throw new Error(SIN_SEÑAL); }
  if (!j.ok) throw new Error(j.error || 'Ocurrió un error inesperado.');
  return j;
}

async function llamar(action, datos = {}) {
  return (await llamarCompleto(action, datos)).data;
}

window.API = { llamar, llamarCompleto, SIN_SEÑAL };
