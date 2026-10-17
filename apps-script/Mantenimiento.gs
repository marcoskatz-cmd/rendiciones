/**
 * Limpieza de datos de prueba. Solo por GET con la clave de instalación.
 * Sin aplicar=si solo informa qué se borraría. Mirar antes de borrar.
 */
function limpiarPruebas_(aplicar) {
  var rend = leer_('RENDICIONES');
  var gastos = leer_('GASTOS');
  var info = { rendiciones: rend.length, gastos: gastos.length, carpetas: [], aplicado: !!aplicar };
  var raiz = carpeta_();
  var it = raiz.getFolders();
  while (it.hasNext()) info.carpetas.push(it.next().getName());
  if (!aplicar) return info;
  ['RENDICIONES', 'GASTOS'].forEach(function (n) {
    var sh = hoja_(n);
    if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  });
  var it2 = raiz.getFolders();
  while (it2.hasNext()) it2.next().setTrashed(true);
  log_('bootstrap', 'LIMPIAR_PRUEBAS', JSON.stringify(info), '');
  return info;
}
