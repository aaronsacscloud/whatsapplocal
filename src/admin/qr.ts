/**
 * QR code widget for businesses — printable page with WhatsApp QR code
 */

const WHATSAPP_LINK = "https://wa.me/12058920417?text=Hola";

/**
 * Generate a simple SVG QR placeholder for the WhatsApp link.
 * Same compact representation as the landing page.
 */
function generateQRCodeSVG(size: number = 300): string {
  const rows = [
    "111111100101101001100111111",
    "100000101100110010100000001",
    "101110100010010111101011101",
    "101110101110100001101011101",
    "101110100100110100101011101",
    "100000101010001100100000001",
    "111111101010101010101111111",
    "000000001110010011000000000",
    "110101110100100111101001100",
    "010011010110011001011100010",
    "111010101001101100010110101",
    "001100001110010011100011010",
    "011011110100101110001100001",
    "101010000011001011010001110",
    "001111100110111100100110101",
    "010000011101000111111001010",
    "110110101010011010001110001",
    "001010001110100101011100110",
    "111011111001101110101111001",
    "000000001010010001100010110",
    "111111100110101010101011001",
    "100000100011001011011100110",
    "101110101100111110100110101",
    "101110100110000101110001010",
    "101110101001011110001110001",
    "100000100110100101010101110",
    "111111101010011010100110101",
  ];

  const moduleCount = 27;
  const moduleSize = size / moduleCount;

  let svgModules = "";
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      if (rows[row][col] === "1") {
        const x = (col * moduleSize).toFixed(1);
        const y = (row * moduleSize).toFixed(1);
        const w = moduleSize.toFixed(1);
        svgModules += `<rect x="${x}" y="${y}" width="${w}" height="${w}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#fff"/>
    <g fill="#000">${svgModules}</g>
  </svg>`;
}

export function getQRPageHTML(sourceName: string): string {
  const displayName = decodeURIComponent(sourceName)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const qrSVG = generateQRCodeSVG(300);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QR - ${escapeHtml(displayName)} - WhatsApp Local</title>
<style>
  @page {
    size: A5 portrait;
    margin: 0;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fff;
    color: #1a1a2e;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
  }

  .card {
    max-width: 400px;
    width: 100%;
    border: 3px solid #1a1a2e;
    border-radius: 20px;
    padding: 2.5rem 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
  }

  .logo {
    font-size: 1.1rem;
    font-weight: 800;
    color: #1a1a2e;
    letter-spacing: -0.02em;
  }

  .logo span {
    color: #C75B39;
  }

  .business-name {
    font-size: 1.5rem;
    font-weight: 800;
    color: #1a1a2e;
    line-height: 1.2;
  }

  .qr-container {
    padding: 0.75rem;
    border: 2px solid #eee;
    border-radius: 12px;
    display: inline-block;
  }

  .qr-container svg {
    display: block;
  }

  .cta-text {
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a1a2e;
    line-height: 1.3;
  }

  .subtitle {
    font-size: 0.85rem;
    color: #666;
    line-height: 1.4;
  }

  .whatsapp-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: #25D366;
    color: #fff;
    padding: 0.5rem 1.25rem;
    border-radius: 30px;
    font-size: 0.85rem;
    font-weight: 700;
    text-decoration: none;
  }

  .whatsapp-badge svg {
    width: 18px;
    height: 18px;
    fill: #fff;
  }

  .footer-text {
    font-size: 0.65rem;
    color: #aaa;
    margin-top: 0.5rem;
  }

  /* Print styles */
  @media print {
    body {
      padding: 0;
      min-height: auto;
    }

    .card {
      border-width: 2px;
      page-break-inside: avoid;
    }

    .no-print {
      display: none !important;
    }
  }

  /* Screen-only print button */
  .print-btn {
    margin-top: 1.5rem;
    background: #1a1a2e;
    color: #fff;
    border: none;
    padding: 0.6rem 1.5rem;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .print-btn:hover {
    opacity: 0.85;
  }
</style>
</head>
<body>

<div class="card">
  <div class="logo">WhatsApp <span>Local</span></div>

  <div class="business-name">${escapeHtml(displayName)}</div>

  <div class="qr-container">
    ${qrSVG}
  </div>

  <div class="cta-text">Escanea para descubrir<br>eventos en SMA</div>

  <div class="subtitle">Eventos, restaurantes, actividades y mas.<br>Gratis y al instante por WhatsApp.</div>

  <div class="whatsapp-badge">
    <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    Escribenos
  </div>

  <div class="footer-text">WhatsApp Local &middot; San Miguel de Allende</div>
</div>

<button class="print-btn no-print" onclick="window.print()">Imprimir QR</button>

</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
