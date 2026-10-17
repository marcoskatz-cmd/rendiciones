/**
 * Archivos a Drive: fotos de comprobantes, capturas de transferencia, firmas y PDFs.
 * Carpeta por rendición (RENDICION-0007), así Contabilidad encuentra todo junto.
 */

function subcarpetaDe_(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

function carpetaRendicion_(numero) {
  return subcarpetaDe_(carpeta_(), 'RENDICION-' + numeroStr_(numero));
}

function numeroStr_(n) {
  var s = String(n);
  while (s.length < 4) s = '0' + s;
  return s;
}

function dataUrlABlob_(dataUrl, nombreBase) {
  var m = String(dataUrl || '').match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) throw new Error('La imagen llegó en un formato que no se puede leer.');
  var mime = m[1];
  var ext = mime.indexOf('png') !== -1 ? 'png' : 'jpg';
  return Utilities.newBlob(Utilities.base64Decode(m[2]), mime, nombreBase + '.' + ext);
}

/**
 * @return {{id:string, url:string}}
 */
function guardarImagen_(dataUrl, numeroRendicion, nombreBase) {
  if (!dataUrl) return { id: '', url: '' };
  var blob = dataUrlABlob_(dataUrl, nombreBase);
  var archivo = carpetaRendicion_(numeroRendicion).createFile(blob);
  return { id: archivo.getId(), url: archivo.getUrl() };
}

/** Vuelve a leer una imagen de Drive como data URL (para meterla en el PDF). */
function imagenComoDataUrl_(urlODrive) {
  var id = idDeUrlDrive_(urlODrive);
  if (!id) return '';
  try {
    var f = DriveApp.getFileById(id);
    var blob = f.getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    return '';
  }
}

function idDeUrlDrive_(s) {
  s = String(s || '');
  var m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}
