import { getLogger } from "../utils/logger.js";

let _knowledge: string = "";

/**
 * Get the complete local knowledge context.
 * Combines static base knowledge with any dynamic updates.
 * This is included in LLM prompts so the bot is always a local expert.
 */
export function getLocalKnowledge(): string {
  if (_knowledge.length > 0) return _knowledge;

  try {
    // Dynamic import to avoid circular deps
    const { SMA_KNOWLEDGE } = require("./sma-base.js");
    _knowledge = SMA_KNOWLEDGE;
  } catch {
    _knowledge = getDefaultKnowledge();
  }

  return _knowledge;
}

/**
 * Force reload knowledge (useful after updates)
 */
export function reloadKnowledge(): void {
  _knowledge = "";
}

/**
 * Fallback knowledge if the full base hasn't been loaded yet
 */
function getDefaultKnowledge(): string {
  return `SAN MIGUEL DE ALLENDE - GUÍA LOCAL

Ubicación: Estado de Guanajuato, México. Altitud 1,900m. Clima templado.
Patrimonio UNESCO desde 2008. Una de las ciudades más bellas de México.

CÓMO LLEGAR:
- Aeropuerto BJX (León/Guanajuato): 1.5 hrs en auto
- Aeropuerto QRO (Querétaro): 2 hrs en auto
- Desde CDMX: 3.5-4 hrs por carretera, buses ETN y Primera Plus
- Uber y DiDi funcionan limitadamente. Hay taxis locales.

BARRIOS:
- Centro Histórico: Jardín Principal, Parroquia, restaurantes, galerías
- San Antonio: Fábrica La Aurora, galerías de arte
- Guadalupe: residencial tranquilo
- Ojo de Agua: zona residencial con vistas

GASTRONOMÍA:
- Comida típica: enchiladas mineras, gorditas, nieves de Dolores Hidalgo
- Mercado San Juan de Dios: comida local económica
- Zona de restaurantes: calles Ancha, Recreo, Umarán, Sollano

TIPS:
- No tomar agua de la llave
- Propina 10-15%
- Zapatos cómodos (todo es empedrado)
- Semana Santa es el evento más grande del año
- La comunidad expat es grande, muchos hablan inglés
- Seguridad: generalmente seguro, precauciones normales de ciudad turística`;
}
