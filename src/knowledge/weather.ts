import { getLogger } from "../utils/logger.js";

const logger = getLogger();

// SMA coordinates
const LAT = 20.9144;
const LON = -100.7452;

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  description: string;
  isDay: boolean;
  windSpeed: number;
  precipitation: number;
}

let _cachedWeather: { data: WeatherData; fetchedAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get current weather for San Miguel de Allende.
 * Uses Open-Meteo API (free, no API key required).
 */
export async function getCurrentWeather(): Promise<WeatherData | null> {
  if (_cachedWeather && Date.now() - _cachedWeather.fetchedAt < CACHE_TTL) {
    return _cachedWeather.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,is_day,weather_code&timezone=America/Mexico_City`;

    const response = await fetch(url);
    const data = await response.json();
    const current = data.current;

    const weather: WeatherData = {
      temperature: Math.round(current.temperature_2m),
      feelsLike: Math.round(current.apparent_temperature),
      humidity: current.relative_humidity_2m,
      description: weatherCodeToDescription(current.weather_code),
      isDay: current.is_day === 1,
      windSpeed: Math.round(current.wind_speed_10m),
      precipitation: current.precipitation,
    };

    _cachedWeather = { data: weather, fetchedAt: Date.now() };
    return weather;
  } catch (error) {
    logger.error({ error }, "Failed to fetch weather");
    return null;
  }
}

/**
 * Get a human-readable weather summary in Spanish for LLM context.
 */
export async function getWeatherContext(): Promise<string> {
  const weather = await getCurrentWeather();
  if (!weather) return "Clima: no disponible en este momento.";

  return `CLIMA ACTUAL EN SAN MIGUEL DE ALLENDE:
Temperatura: ${weather.temperature}°C (sensación térmica ${weather.feelsLike}°C)
Condición: ${weather.description}
Humedad: ${weather.humidity}%
Viento: ${weather.windSpeed} km/h
${weather.precipitation > 0 ? `Precipitación: ${weather.precipitation}mm` : "Sin lluvia"}
${weather.isDay ? "De día" : "De noche"}`;
}

function weatherCodeToDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: "Despejado",
    1: "Principalmente despejado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Neblina",
    48: "Neblina con escarcha",
    51: "Llovizna ligera",
    53: "Llovizna moderada",
    55: "Llovizna intensa",
    61: "Lluvia ligera",
    63: "Lluvia moderada",
    65: "Lluvia intensa",
    71: "Nevada ligera",
    73: "Nevada moderada",
    75: "Nevada intensa",
    80: "Chubascos ligeros",
    81: "Chubascos moderados",
    82: "Chubascos intensos",
    95: "Tormenta eléctrica",
    96: "Tormenta con granizo ligero",
    99: "Tormenta con granizo",
  };
  return descriptions[code] || "Condición desconocida";
}
