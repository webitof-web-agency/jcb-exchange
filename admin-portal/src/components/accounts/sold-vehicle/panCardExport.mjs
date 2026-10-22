export const buildPanCardExportSvg = ({ width, height, markup }) => (
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
  `<foreignObject width="${width}" height="${height}">` +
  `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden">${markup}</div>` +
  '</foreignObject></svg>'
);
