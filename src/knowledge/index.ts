import { SMA_KNOWLEDGE } from "./sma-base.js";
import { SMA_SERVICES } from "./sma-services.js";
import { getLogger } from "../utils/logger.js";

let _knowledge: string = "";

/**
 * Get the complete local knowledge context.
 * Combines static base knowledge with any dynamic updates.
 */
export function getLocalKnowledge(): string {
  if (_knowledge.length > 0) return _knowledge;

  const logger = getLogger();

  try {
    _knowledge = SMA_KNOWLEDGE + "\n\n" + SMA_SERVICES;
    logger.info(
      { chars: _knowledge.length },
      "Local knowledge base loaded"
    );
  } catch (error) {
    logger.warn({ error }, "Failed to load knowledge base, using default");
    _knowledge = getDefaultKnowledge();
  }

  return _knowledge;
}

export function reloadKnowledge(): void {
  _knowledge = "";
}

function getDefaultKnowledge(): string {
  return `SAN MIGUEL DE ALLENDE - GUÍA LOCAL

Ubicación: Estado de Guanajuato, México. Altitud 1,900m. Clima templado.
Patrimonio UNESCO desde 2008. Una de las ciudades más bellas de México.

CÓMO LLEGAR:
- Aeropuerto BJX (León/Guanajuato): 1.5 hrs en auto
- Aeropuerto QRO (Querétaro): 2 hrs en auto
- Desde CDMX: 3.5-4 hrs por carretera, buses ETN y Primera Plus

GASTRONOMÍA:
- Comida típica: enchiladas mineras, gorditas, nieves de Dolores Hidalgo
- Mercado San Juan de Dios: comida local económica

TIPS:
- No tomar agua de la llave
- Propina 10-15%
- Zapatos cómodos (todo es empedrado)
- Semana Santa es el evento más grande del año`;
}
