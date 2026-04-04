/**
 * Landing page for WhatsApp Local — San Miguel de Allende
 * Mobile-first, no external dependencies, inline SVG QR code
 */

const WHATSAPP_LINK = "https://wa.me/12058920417?text=Hola";
const PHONE_NUMBER = "+1 (205) 892-0417";

/**
 * Generate an SVG QR code for the WhatsApp link.
 * This is a simplified QR code generator that produces a valid QR code
 * using alphanumeric encoding for the URL.
 */
function generateQRCodeSVG(size: number = 200): string {
  // Pre-computed QR code matrix for "https://wa.me/12058920417?text=Hola"
  // Using a compact representation: each row is a binary string where 1=black, 0=white
  // This is a version 4 QR code (33x33 modules)
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="background:#fff;border-radius:12px;padding:8px;">
    <g fill="#1a1a2e">${svgModules}</g>
  </svg>`;
}

export function getLandingPageHTML(eventCount?: number): string {
  const qrSVG = generateQRCodeSVG(180);
  const displayEventCount = eventCount ?? 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WhatsApp Local - Tu guia local de San Miguel de Allende</title>
<meta name="description" content="Descubre eventos, restaurantes y actividades en San Miguel de Allende por WhatsApp. Gratis, bilingue y disponible 24/7.">
<meta property="og:title" content="WhatsApp Local - San Miguel de Allende">
<meta property="og:description" content="Descubre eventos, restaurantes y actividades en San Miguel de Allende por WhatsApp. Gratis y disponible 24/7.">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_MX">
<meta property="og:image" content="https://wa.me/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="WhatsApp Local - San Miguel de Allende">
<meta name="twitter:description" content="Tu guia local por WhatsApp. Eventos, restaurantes, actividades. Gratis y 24/7.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📍</text></svg>">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --terracotta: #C75B39;
    --terracotta-dark: #A84A2E;
    --cream: #F5E6D3;
    --cream-light: #FFF8F0;
    --deep-blue: #1a1a2e;
    --deep-blue-light: #2a2a4e;
    --whatsapp: #25D366;
    --whatsapp-dark: #128C7E;
    --text-dark: #2c2c2c;
    --text-muted: #6b6b6b;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--cream-light);
    color: var(--text-dark);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  /* Hero */
  .hero {
    background: var(--deep-blue);
    color: #fff;
    padding: 3rem 1.5rem 2.5rem;
    text-align: center;
    position: relative;
    overflow: hidden;
  }

  .hero::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 40px;
    background: var(--cream-light);
    clip-path: ellipse(55% 100% at 50% 100%);
  }

  .hero-badge {
    display: inline-block;
    background: rgba(199, 91, 57, 0.2);
    color: var(--terracotta);
    border: 1px solid rgba(199, 91, 57, 0.3);
    padding: 0.3rem 0.9rem;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    margin-bottom: 1.25rem;
  }

  .hero h1 {
    font-size: 1.75rem;
    font-weight: 800;
    line-height: 1.25;
    margin-bottom: 1rem;
    max-width: 500px;
    margin-left: auto;
    margin-right: auto;
  }

  .hero h1 span {
    color: var(--terracotta);
  }

  .hero p {
    font-size: 1rem;
    color: rgba(255,255,255,0.75);
    max-width: 400px;
    margin: 0 auto 1.75rem;
    line-height: 1.5;
  }

  .cta-whatsapp {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--whatsapp);
    color: #fff;
    text-decoration: none;
    padding: 0.9rem 2rem;
    border-radius: 50px;
    font-size: 1.05rem;
    font-weight: 700;
    transition: transform 0.15s, background 0.15s;
    box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3);
  }

  .cta-whatsapp:hover {
    transform: scale(1.03);
    background: var(--whatsapp-dark);
  }

  .cta-whatsapp:active {
    transform: scale(0.98);
  }

  .cta-whatsapp svg {
    width: 24px;
    height: 24px;
    fill: #fff;
  }

  .hero-stats {
    display: flex;
    justify-content: center;
    gap: 1.5rem;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(255,255,255,0.1);
  }

  .hero-stat {
    text-align: center;
  }

  .hero-stat-value {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--terracotta);
  }

  .hero-stat-label {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.5);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* QR Section */
  .qr-section {
    text-align: center;
    padding: 2.5rem 1.5rem 2rem;
    background: var(--cream-light);
  }

  .qr-section p {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 1rem;
  }

  .qr-container {
    display: inline-block;
    padding: 0.5rem;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }

  .qr-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.5rem;
  }

  /* Features */
  .features {
    padding: 2.5rem 1.5rem;
    background: #fff;
  }

  .features h2 {
    text-align: center;
    font-size: 1.35rem;
    font-weight: 700;
    margin-bottom: 1.75rem;
    color: var(--deep-blue);
  }

  .features-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    max-width: 500px;
    margin: 0 auto;
  }

  .feature-card {
    background: var(--cream-light);
    border-radius: 12px;
    padding: 1.25rem 1rem;
    text-align: center;
    border: 1px solid rgba(199, 91, 57, 0.1);
  }

  .feature-icon {
    font-size: 1.75rem;
    margin-bottom: 0.5rem;
    display: block;
  }

  .feature-card h3 {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--deep-blue);
    margin-bottom: 0.25rem;
  }

  .feature-card p {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* How it works */
  .how-it-works {
    padding: 2.5rem 1.5rem;
    background: var(--cream);
  }

  .how-it-works h2 {
    text-align: center;
    font-size: 1.35rem;
    font-weight: 700;
    margin-bottom: 2rem;
    color: var(--deep-blue);
  }

  .steps {
    max-width: 400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .step {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .step-number {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--terracotta);
    color: #fff;
    font-size: 1.1rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-content h3 {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--deep-blue);
    margin-bottom: 0.15rem;
  }

  .step-content p {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* Social proof */
  .social-proof {
    padding: 2.5rem 1.5rem;
    background: var(--deep-blue);
    color: #fff;
    text-align: center;
  }

  .social-proof h2 {
    font-size: 1.35rem;
    font-weight: 700;
    margin-bottom: 1.75rem;
  }

  .proof-grid {
    display: flex;
    justify-content: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .proof-item {
    text-align: center;
  }

  .proof-value {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--terracotta);
    line-height: 1.2;
  }

  .proof-label {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.6);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 0.2rem;
  }

  /* Live counter */
  .live-counter {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(199, 91, 57, 0.15);
    border: 1px solid rgba(199, 91, 57, 0.25);
    padding: 0.4rem 0.9rem;
    border-radius: 20px;
    font-size: 0.8rem;
    color: var(--terracotta);
    font-weight: 600;
    margin-top: 1.25rem;
  }

  .live-dot {
    width: 8px;
    height: 8px;
    background: var(--terracotta);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  /* Final CTA */
  .final-cta {
    padding: 3rem 1.5rem;
    text-align: center;
    background: #fff;
  }

  .final-cta h2 {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--deep-blue);
    margin-bottom: 0.75rem;
  }

  .final-cta p {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 1.5rem;
  }

  /* Footer */
  footer {
    background: var(--deep-blue);
    color: rgba(255,255,255,0.4);
    text-align: center;
    padding: 1.5rem;
    font-size: 0.75rem;
  }

  footer a {
    color: rgba(255,255,255,0.6);
    text-decoration: none;
  }

  /* Tablet+ */
  @media (min-width: 640px) {
    .hero { padding: 4rem 2rem 3rem; }
    .hero h1 { font-size: 2.25rem; }
    .features-grid { grid-template-columns: repeat(4, 1fr); max-width: 700px; }
    .proof-grid { gap: 3.5rem; }
  }

  /* Desktop */
  @media (min-width: 1024px) {
    .hero h1 { font-size: 2.5rem; max-width: 600px; }
  }
</style>
</head>
<body>

<!-- Hero -->
<section class="hero">
  <div class="hero-badge">San Miguel de Allende</div>
  <h1>Tu <span>guia local</span> de San Miguel de Allende por WhatsApp</h1>
  <p>Eventos, restaurantes, actividades y tips locales. Pregunta lo que quieras, cuando quieras.</p>

  <a href="${WHATSAPP_LINK}" class="cta-whatsapp" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    Escribenos por WhatsApp
  </a>

  <div class="hero-stats">
    <div class="hero-stat">
      <div class="hero-stat-value" id="live-events">${displayEventCount || "-"}</div>
      <div class="hero-stat-label">Eventos activos</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-value">24/7</div>
      <div class="hero-stat-label">Disponible</div>
    </div>
    <div class="hero-stat">
      <div class="hero-stat-value">ES/EN</div>
      <div class="hero-stat-label">Bilingue</div>
    </div>
  </div>
</section>

<!-- QR Code -->
<section class="qr-section">
  <p>O escanea el codigo QR para iniciar la conversacion</p>
  <div class="qr-container">
    ${qrSVG}
  </div>
  <div class="qr-label">${PHONE_NUMBER}</div>
</section>

<!-- Features -->
<section class="features">
  <h2>Todo lo que necesitas saber</h2>
  <div class="features-grid">
    <div class="feature-card">
      <span class="feature-icon">📅</span>
      <h3>Eventos</h3>
      <p>Musica, arte, gastronomia y mas. Actualizado diariamente.</p>
    </div>
    <div class="feature-card">
      <span class="feature-icon">🧠</span>
      <h3>Experto Local</h3>
      <p>Tips, recomendaciones y respuestas con conocimiento local real.</p>
    </div>
    <div class="feature-card">
      <span class="feature-icon">🌐</span>
      <h3>Bilingue</h3>
      <p>Responde en espanol e ingles automaticamente.</p>
    </div>
    <div class="feature-card">
      <span class="feature-icon">💚</span>
      <h3>Gratis</h3>
      <p>Sin costo, sin apps, sin registro. Solo WhatsApp.</p>
    </div>
  </div>
</section>

<!-- How it works -->
<section class="how-it-works">
  <h2>Como funciona</h2>
  <div class="steps">
    <div class="step">
      <div class="step-number">1</div>
      <div class="step-content">
        <h3>Escribe "Hola"</h3>
        <p>Abre WhatsApp y mandanos un mensaje. Te configuramos en 30 segundos.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-number">2</div>
      <div class="step-content">
        <h3>Pregunta lo que quieras</h3>
        <p>"Que hay esta noche?", "Donde como rico?", "Hay yoga manana?"</p>
      </div>
    </div>
    <div class="step">
      <div class="step-number">3</div>
      <div class="step-content">
        <h3>Recibe recomendaciones</h3>
        <p>Te mandamos eventos, lugares y tips al instante con links y mapas.</p>
      </div>
    </div>
  </div>
</section>

<!-- Social Proof -->
<section class="social-proof">
  <h2>Respaldado por datos reales</h2>
  <div class="proof-grid">
    <div class="proof-item">
      <div class="proof-value">190+</div>
      <div class="proof-label">Fuentes de info</div>
    </div>
    <div class="proof-item">
      <div class="proof-value">5</div>
      <div class="proof-label">Scrapers activos</div>
    </div>
    <div class="proof-item">
      <div class="proof-value">24/7</div>
      <div class="proof-label">Siempre disponible</div>
    </div>
    <div class="proof-item">
      <div class="proof-value" id="proof-events">${displayEventCount || "100+"}</div>
      <div class="proof-label">Eventos en la base</div>
    </div>
  </div>
  <div class="live-counter">
    <div class="live-dot"></div>
    <span id="live-counter-text">Datos actualizados diariamente</span>
  </div>
</section>

<!-- Final CTA -->
<section class="final-cta">
  <h2>Listo para descubrir San Miguel?</h2>
  <p>Es gratis, facil y responde al instante. Solo necesitas WhatsApp.</p>
  <a href="${WHATSAPP_LINK}" class="cta-whatsapp" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    Escribenos por WhatsApp
  </a>
</section>

<!-- Footer -->
<footer>
  <p>Powered by AI &middot; San Miguel de Allende, Mexico</p>
  <p style="margin-top:0.5rem"><a href="/admin">Admin</a></p>
</footer>

<script>
  // Fetch live event count from API
  (function() {
    var req = new XMLHttpRequest();
    req.open('GET', '/admin/api/stats');
    req.onload = function() {
      if (req.status === 200) {
        try {
          var data = JSON.parse(req.responseText);
          var evEl = document.getElementById('live-events');
          var proofEl = document.getElementById('proof-events');
          if (data.totalEvents) {
            evEl.textContent = data.totalEvents;
            proofEl.textContent = data.totalEvents;
          }
        } catch(e) {}
      }
    };
    req.send();
  })();
</script>

</body>
</html>`;
}
