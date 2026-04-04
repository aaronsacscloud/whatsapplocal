/**
 * Seed script: inserts recurring activities, workshops, and classes
 * in San Miguel de Allende into the events table.
 *
 * Data gathered from web research of local businesses, studios,
 * schools, and activity providers operating in SMA.
 *
 * Usage: npx tsx scripts/seed-recurring.ts
 */
import { loadConfig } from "../src/config.js";
import { getDb, closeDb } from "../src/db/index.js";
import { events } from "../src/db/schema.js";
import { sql } from "drizzle-orm";
import { eventDeduplicationHash } from "../src/utils/hash.js";

loadConfig();
const db = getDb();

const CITY = "San Miguel de Allende";

interface RecurringActivity {
  title: string;
  venueName: string;
  venueAddress?: string;
  neighborhood?: string;
  category: string;
  contentType: "recurring" | "workshop";
  recurrenceDay?: number | null; // 0=Sun..6=Sat, null if daily or multi-day workshop
  recurrenceTime?: string | null; // "10:00" 24h format
  price?: string | null;
  duration?: string | null;
  description: string;
  sourceUrl: string;
}

// ============================================================
// YOGA & WELLNESS
// ============================================================
const YOGA_WELLNESS: RecurringActivity[] = [
  {
    title: "Yoga Class at Esencia Yoga Spa",
    venueName: "Esencia Yoga Spa",
    venueAddress: "Hernandez Macias 75, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "09:00",
    price: null,
    duration: "1.5 hours",
    description: "Daily yoga classes (up to 3 per day) at SMA's premier wellness center. Vinyasa, Hatha, and restorative styles. Book via MindBody app.",
    sourceUrl: "https://www.esenciayogaspa.com/yogaeg",
  },
  {
    title: "Yoga Class at Esencia Yoga Spa",
    venueName: "Esencia Yoga Spa",
    venueAddress: "Hernandez Macias 75, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "09:00",
    price: null,
    duration: "1.5 hours",
    description: "Daily yoga classes at SMA's premier wellness center. Multiple sessions daily. Book via MindBody app.",
    sourceUrl: "https://www.esenciayogaspa.com/yogaeg",
  },
  {
    title: "Yoga Class at Esencia Yoga Spa",
    venueName: "Esencia Yoga Spa",
    venueAddress: "Hernandez Macias 75, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 3, // Wednesday
    recurrenceTime: "09:00",
    price: null,
    duration: "1.5 hours",
    description: "Daily yoga classes at SMA's premier wellness center. Multiple sessions daily. Book via MindBody app.",
    sourceUrl: "https://www.esenciayogaspa.com/yogaeg",
  },
  {
    title: "Yoga Class at Esencia Yoga Spa",
    venueName: "Esencia Yoga Spa",
    venueAddress: "Hernandez Macias 75, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 4, // Thursday
    recurrenceTime: "09:00",
    price: null,
    duration: "1.5 hours",
    description: "Daily yoga classes at SMA's premier wellness center. Multiple sessions daily. Book via MindBody app.",
    sourceUrl: "https://www.esenciayogaspa.com/yogaeg",
  },
  {
    title: "Yoga Class at Esencia Yoga Spa",
    venueName: "Esencia Yoga Spa",
    venueAddress: "Hernandez Macias 75, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 5, // Friday
    recurrenceTime: "09:00",
    price: null,
    duration: "1.5 hours",
    description: "Daily yoga classes at SMA's premier wellness center. Multiple sessions daily. Book via MindBody app.",
    sourceUrl: "https://www.esenciayogaspa.com/yogaeg",
  },
  {
    title: "Morning Yoga with Fabienne",
    venueName: "Posada Corazon",
    venueAddress: "Aldama 9, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "10:00",
    price: null,
    duration: "1 hour",
    description: "Fabienne teaches yoga Monday through Friday at 10am at Posada Corazon. All levels welcome.",
    sourceUrl: "https://www.facebook.com/fabiennesyogastudio/",
  },
  {
    title: "Morning Yoga with Fabienne",
    venueName: "Posada Corazon",
    venueAddress: "Aldama 9, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 3, // Wednesday
    recurrenceTime: "10:00",
    price: null,
    duration: "1 hour",
    description: "Fabienne teaches yoga Monday through Friday at 10am at Posada Corazon. All levels welcome.",
    sourceUrl: "https://www.facebook.com/fabiennesyogastudio/",
  },
  {
    title: "Morning Yoga with Fabienne",
    venueName: "Posada Corazon",
    venueAddress: "Aldama 9, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 5, // Friday
    recurrenceTime: "10:00",
    price: null,
    duration: "1 hour",
    description: "Fabienne teaches yoga Monday through Friday at 10am at Posada Corazon. All levels welcome.",
    sourceUrl: "https://www.facebook.com/fabiennesyogastudio/",
  },
  {
    title: "Yoga & Wellness at The Now Studio",
    venueName: "The Now Yoga and Wellness Studio",
    venueAddress: "Correo 34, Zona Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "08:00",
    price: null,
    duration: "1 hour",
    description: "Community yoga classes and holistic programs in the heart of SMA. Designed to rejuvenate body and spirit.",
    sourceUrl: "https://www.thenowyoga.com/",
  },
  {
    title: "Yoga & Wellness at The Now Studio",
    venueName: "The Now Yoga and Wellness Studio",
    venueAddress: "Correo 34, Zona Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 3, // Wednesday
    recurrenceTime: "08:00",
    price: null,
    duration: "1 hour",
    description: "Community yoga classes and holistic programs in the heart of SMA. Designed to rejuvenate body and spirit.",
    sourceUrl: "https://www.thenowyoga.com/",
  },
  {
    title: "Yoga & Wellness at The Now Studio",
    venueName: "The Now Yoga and Wellness Studio",
    venueAddress: "Correo 34, Zona Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 5, // Friday
    recurrenceTime: "08:00",
    price: null,
    duration: "1 hour",
    description: "Community yoga classes and holistic programs in the heart of SMA. Designed to rejuvenate body and spirit.",
    sourceUrl: "https://www.thenowyoga.com/",
  },
  {
    title: "Meditation Sitting at Meditation Center of San Miguel",
    venueName: "Meditation Center of San Miguel",
    venueAddress: "Callejon Blanco 4, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 6, // Saturday
    recurrenceTime: "10:00",
    price: "Gratis",
    duration: "1 hour",
    description: "Buddhist-oriented silent meditation. New meditators receive basic instruction at the 10am Saturday sitting. Non-profit, donations welcome. Open since 1995.",
    sourceUrl: "https://meditationsma.org/about/",
  },
  {
    title: "Temazcal Ceremony at Sagrada Holistic Ranch",
    venueName: "Sagrada Holistic Ranch",
    neighborhood: "Countryside",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 6, // Saturday
    recurrenceTime: "11:00",
    price: null,
    duration: "2.5 hours",
    description: "Traditional Mexican temazcal ceremony for purification and healing. Includes guided sweat lodge experience with medicinal herbs.",
    sourceUrl: "https://www.sagradaholisticranch.com/",
  },
];

// ============================================================
// TAI CHI & FITNESS
// ============================================================
const FITNESS: RecurringActivity[] = [
  {
    title: "Tai Chi in the Park",
    venueName: "San Miguel Tai Chi",
    venueAddress: "Parque Juarez, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "09:30",
    price: null,
    duration: "1 hour",
    description: "Park classes Mon/Wed/Fri 9:30-10:30am. Studio classes Tue/Thu 2:45-4pm. Led by Lydia Wong, internationally recognized Tai Chi master with 35+ years experience. Email sanmigueltaichi@gmail.com to reserve.",
    sourceUrl: "https://sanmigueltaichi.com/",
  },
  {
    title: "Tai Chi in the Park",
    venueName: "San Miguel Tai Chi",
    venueAddress: "Parque Juarez, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 3, // Wednesday
    recurrenceTime: "09:30",
    price: null,
    duration: "1 hour",
    description: "Park classes Mon/Wed/Fri 9:30-10:30am. Led by Lydia Wong, internationally recognized Tai Chi master.",
    sourceUrl: "https://sanmigueltaichi.com/",
  },
  {
    title: "Tai Chi in the Park",
    venueName: "San Miguel Tai Chi",
    venueAddress: "Parque Juarez, Centro",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 5, // Friday
    recurrenceTime: "09:30",
    price: null,
    duration: "1 hour",
    description: "Park classes Mon/Wed/Fri 9:30-10:30am. Led by Lydia Wong, internationally recognized Tai Chi master.",
    sourceUrl: "https://sanmigueltaichi.com/",
  },
  {
    title: "Tai Chi Studio Class",
    venueName: "San Miguel Tai Chi",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "14:45",
    price: null,
    duration: "1.25 hours",
    description: "Studio classes Tue/Thu 2:45-4pm. Led by Lydia Wong, internationally recognized Tai Chi master.",
    sourceUrl: "https://sanmigueltaichi.com/",
  },
  {
    title: "Tai Chi Studio Class",
    venueName: "San Miguel Tai Chi",
    neighborhood: "Centro",
    category: "wellness",
    contentType: "recurring",
    recurrenceDay: 4, // Thursday
    recurrenceTime: "14:45",
    price: null,
    duration: "1.25 hours",
    description: "Studio classes Tue/Thu 2:45-4pm. Led by Lydia Wong, internationally recognized Tai Chi master.",
    sourceUrl: "https://sanmigueltaichi.com/",
  },
  {
    title: "Reformer Pilates at La Linea Studio",
    venueName: "La Linea Studio",
    neighborhood: "Centro",
    category: "sports",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "09:00",
    price: null,
    duration: "1 hour",
    description: "Light-filled Reformer Pilates studio in the heart of SMA. Classes for all levels with experienced instructors.",
    sourceUrl: "https://www.lalinea-studio.com/",
  },
  {
    title: "SMA Pilates + Barre Class",
    venueName: "SMA Pilates + Barre",
    neighborhood: "Centro",
    category: "sports",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "09:00",
    price: null,
    duration: "1 hour",
    description: "Contemporary Pilates and Barre classes grounded in tradition, taught with expertise, practiced in community.",
    sourceUrl: "https://www.smapilates.com/",
  },
  {
    title: "CrossFit at JADA Fit",
    venueName: "JADA Fit",
    venueAddress: "San Miguel de Allende",
    category: "sports",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "07:00",
    price: "$800 MXN",
    duration: "1 hour",
    description: "Dynamic CrossFit classes with attentive trainers. Family plan from $650, gym-only $400, 12 CrossFit classes $750, unlimited $800. Spacious, ventilated facility.",
    sourceUrl: "https://www.facebook.com/jadasanmigueldeallende/",
  },
  {
    title: "CrossFit and Gym at Wolf Gym",
    venueName: "Wolf Gym",
    venueAddress: "Salida a Celaya 49, La Lejona",
    neighborhood: "La Lejona",
    category: "sports",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "06:00",
    price: null,
    duration: "1 hour",
    description: "Open Mon-Fri 6am-10pm, Sat 7am-2pm. Classes include zumba, yoga, pilates, spinning, boxing, and crossfit.",
    sourceUrl: "https://gimnasios.cercademiubicacion.com.mx/guanajuato/san-miguel-de-allende/",
  },
  {
    title: "Saturday Zumba in Parque Juarez",
    venueName: "Parque Juarez",
    venueAddress: "Parque Juarez, Centro",
    neighborhood: "Centro",
    category: "sports",
    contentType: "recurring",
    recurrenceDay: 6, // Saturday
    recurrenceTime: "09:00",
    price: "Gratis",
    duration: "1 hour",
    description: "Free public Zumba classes every Saturday morning in the central sports area of Parque Juarez.",
    sourceUrl: "https://www.destinationsanmiguel.com/post/a-local-s-guide-to-the-best-things-to-do-in-san-miguel-de-allende",
  },
];

// ============================================================
// DANCE
// ============================================================
const DANCE: RecurringActivity[] = [
  {
    title: "Salsa & Bachata Classes at Ritmo y Sabor",
    venueName: "Ritmo y Sabor",
    neighborhood: "Centro",
    category: "culture",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "19:00",
    price: null,
    duration: "1.5 hours",
    description: "Salsa, bachata, tango, chachacha, and cumbia dance classes with instructor Fernando. Private and group lessons available. Highly rated on TripAdvisor.",
    sourceUrl: "https://www.tripadvisor.com/Attraction_Review-g151932-d7258636-Reviews-Ritmo_y_Sabor_Salsa_Tango_Lessons-San_Miguel_de_Allende_Central_Mexico_and_Gulf_C.html",
  },
  {
    title: "Salsa & Bachata Classes at Ritmo y Sabor",
    venueName: "Ritmo y Sabor",
    neighborhood: "Centro",
    category: "culture",
    contentType: "recurring",
    recurrenceDay: 4, // Thursday
    recurrenceTime: "19:00",
    price: null,
    duration: "1.5 hours",
    description: "Salsa, bachata, tango, chachacha, and cumbia dance classes with instructor Fernando. Private and group lessons available.",
    sourceUrl: "https://www.tripadvisor.com/Attraction_Review-g151932-d7258636-Reviews-Ritmo_y_Sabor_Salsa_Tango_Lessons-San_Miguel_de_Allende_Central_Mexico_and_Gulf_C.html",
  },
  {
    title: "Ballroom Dance Lessons at Arthur Murray",
    venueName: "Arthur Murray San Miguel",
    venueAddress: "Carretera a Queretaro KM 3.5",
    category: "culture",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "18:00",
    price: null,
    duration: "1 hour",
    description: "Ballroom dancing lessons, adult dance classes, and salsa classes. All skill levels welcome. Located on the Queretaro highway.",
    sourceUrl: "https://www.arthurmurraysanmiguel.com/",
  },
];

// ============================================================
// ART CLASSES & CERAMICS
// ============================================================
const ART_CLASSES: RecurringActivity[] = [
  {
    title: "Ceramic Sculpture Classes at Barro.Co",
    venueName: "Barro.Co Clay Studio",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "11:00",
    price: null,
    duration: "4 hours",
    description: "Ceramic sculpture classes Mon/Wed and Tue/Thu 11am-3pm. Learn slab and coil-building, surface techniques including sgraffito, burnishing, and painting with engobes. All tools supplied. Instructor: Adria Calaresu (MFA).",
    sourceUrl: "http://barro-co.com/classes-english-version",
  },
  {
    title: "Ceramic Sculpture Classes at Barro.Co",
    venueName: "Barro.Co Clay Studio",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "11:00",
    price: null,
    duration: "4 hours",
    description: "Ceramic sculpture classes Tue/Thu 11am-3pm. Learn slab and coil-building, surface techniques. All tools supplied.",
    sourceUrl: "http://barro-co.com/classes-english-version",
  },
  {
    title: "Ceramic Sculpture Classes at Barro.Co",
    venueName: "Barro.Co Clay Studio",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 3, // Wednesday
    recurrenceTime: "11:00",
    price: null,
    duration: "4 hours",
    description: "Ceramic sculpture classes Mon/Wed 11am-3pm. Learn slab and coil-building, surface techniques. All tools supplied.",
    sourceUrl: "http://barro-co.com/classes-english-version",
  },
  {
    title: "Ceramic Sculpture Classes at Barro.Co",
    venueName: "Barro.Co Clay Studio",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 4, // Thursday
    recurrenceTime: "11:00",
    price: null,
    duration: "4 hours",
    description: "Ceramic sculpture classes Tue/Thu 11am-3pm. Learn slab and coil-building, surface techniques. All tools supplied.",
    sourceUrl: "http://barro-co.com/classes-english-version",
  },
  {
    title: "Talavera Ceramic Class at LorenzoLorenzzo",
    venueName: "LorenzoLorenzzo",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 6, // Saturday
    recurrenceTime: "10:00",
    price: null,
    duration: "3 hours",
    description: "Learn the traditional talavera ceramic painting technique. Beginner and master level classes available in San Miguel de Allende.",
    sourceUrl: "https://www.lorenzolorenzzo.com/airbnb-talavera-experiences",
  },
  {
    title: "Art Classes with Isis Rodriguez",
    venueName: "Isis Rodriguez Studio",
    neighborhood: "Centro",
    category: "class",
    contentType: "workshop",
    recurrenceDay: null,
    recurrenceTime: "10:00",
    price: null,
    duration: null,
    description: "Drawing and painting classes in graphite, charcoal, pastel, watercolors, and oils. Available for 1 day, 1 week, or 1 month. All levels.",
    sourceUrl: "https://www.isisrodriguez.com/art-classes-by-isis-rodriguez",
  },
  {
    title: "Art Workshops at Instituto Allende",
    venueName: "Instituto Allende",
    venueAddress: "Ancha de San Antonio 22, Centro",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "09:00",
    price: null,
    duration: null,
    description: "Courses in painting, drawing, sculpture, ceramics, weaving, jewelry, photography, batik, lithography, and more. Open Mon-Fri 9am-6pm, Sat 9am-1pm.",
    sourceUrl: "https://www.instituto-allende.edu.mx/en",
  },
  {
    title: "Art Walk at Fabrica La Aurora",
    venueName: "Fabrica La Aurora",
    venueAddress: "Calzada de la Aurora, Centro",
    neighborhood: "Centro",
    category: "culture",
    contentType: "recurring",
    recurrenceDay: 6, // Saturday (first Saturday of every month)
    recurrenceTime: "17:00",
    price: "Gratis",
    duration: "2 hours",
    description: "Monthly art walk on the first Saturday of every month from 5-7pm. All galleries open doors, offer cocktails, and inaugurate new exhibitions. 15-min walk north of El Jardin.",
    sourceUrl: "https://fabricalaaurora.com/en/home/",
  },
];

// ============================================================
// COOKING CLASSES & FOOD
// ============================================================
const COOKING: RecurringActivity[] = [
  {
    title: "Mexican Cooking Class at Pura Vida Kitchen",
    venueName: "Pura Vida Kitchen",
    neighborhood: "Col. Guadalupe",
    category: "food",
    contentType: "recurring",
    recurrenceDay: 3, // Wednesday
    recurrenceTime: "10:00",
    price: null,
    duration: "3 hours",
    description: "Market tours, tacos, mole, mezcal tasting, and healthy eating classes. Available throughout the week with advance notice. Taught by Dona Maria Luisa.",
    sourceUrl: "https://www.puravidakitchen.com/classes",
  },
  {
    title: "Cooking Class at La Cocina (Delicious Expeditions)",
    venueName: "La Cocina Cooking School",
    neighborhood: "Centro",
    category: "food",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "10:00",
    price: null,
    duration: "3 hours",
    description: "Scheduled cooking classes and market tours at the best cooking school in San Miguel. Traditional Mexican cuisine from scratch.",
    sourceUrl: "https://deliciousexpeditions.com/classes-san-miguel.html",
  },
  {
    title: "Food Tour by Taste of San Miguel",
    venueName: "Taste of San Miguel",
    neighborhood: "Centro",
    category: "food",
    contentType: "recurring",
    recurrenceDay: 6, // Saturday
    recurrenceTime: "10:00",
    price: null,
    duration: "3.5 hours",
    description: "Walking food tour through San Miguel's markets and street food vendors. Taste traditional dishes and learn about local culinary culture.",
    sourceUrl: "https://www.facebook.com/tasteofsanmiguel/",
  },
];

// ============================================================
// SPANISH & LANGUAGE CLASSES
// ============================================================
const LANGUAGE: RecurringActivity[] = [
  {
    title: "Intensive Spanish at Liceo de la Lengua Espanola",
    venueName: "Liceo de la Lengua Espanola",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 1, // Monday (new classes start every Monday)
    recurrenceTime: "09:00",
    price: null,
    duration: null,
    description: "New classes for all levels starting every Monday year-round. Small group and private Spanish language instruction.",
    sourceUrl: "https://liceodelalengua.com/",
  },
  {
    title: "Spanish Immersion at Academia Hispano Americana",
    venueName: "Academia Hispano Americana",
    neighborhood: "Centro",
    category: "class",
    contentType: "workshop",
    recurrenceDay: null,
    recurrenceTime: "09:00",
    price: null,
    duration: null,
    description: "Since 1959, the first Spanish school in SMA. Intensive (6hrs/day) and semi-intensive (3-4hrs/day) programs. Max 8 students per class. Includes cultural workshops in literature, history, and folk singing/dancing.",
    sourceUrl: "https://www.ahaspeakspanish.com/",
  },
  {
    title: "Warren Hardy Spanish Class",
    venueName: "Warren Hardy Spanish",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "09:00",
    price: null,
    duration: null,
    description: "Since 1990, over 20,000 students have learned to converse in Spanish. Group and private classes available throughout the week.",
    sourceUrl: "https://warrenhardy.com/",
  },
];

// ============================================================
// WINE & MEZCAL TASTING
// ============================================================
const WINE_MEZCAL: RecurringActivity[] = [
  {
    title: "Mezcal Tasting Masterclass",
    venueName: "ICAVI Tasting Room",
    neighborhood: "Centro",
    category: "wine",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "16:00",
    price: null,
    duration: "1.5 hours",
    description: "Weekly mezcal masterclass on Tuesdays from 4-10pm. Includes 45-min masterclass about wines, tequilas, and mezcales, followed by a 45-min blind tasting.",
    sourceUrl: "https://veronikasadventure.com/mezcal-tasting-masterclass-blind-tasting/",
  },
  {
    title: "Wine & Spirits Tasting Experience",
    venueName: "1826 Tequila Bar at Rosewood",
    venueAddress: "Nemesio Diez 11, Centro",
    neighborhood: "Centro",
    category: "wine",
    contentType: "recurring",
    recurrenceDay: 5, // Friday
    recurrenceTime: "17:00",
    price: null,
    duration: "1.5 hours",
    description: "Curated tequilas and mezcals with expert pairings at the elegant 1826 Tequila Bar. Guided tastings exploring the tradition and folklore of Mexican spirits.",
    sourceUrl: "https://www.rosewoodhotels.com/en/san-miguel-de-allende/dining/1826-tequila-bar",
  },
];

// ============================================================
// ADVENTURE & OUTDOOR
// ============================================================
const ADVENTURE: RecurringActivity[] = [
  {
    title: "Hot Air Balloon Sunrise Flight",
    venueName: "Globo San Miguel",
    venueAddress: "Mesones 74, Centro",
    neighborhood: "Centro",
    category: "adventure",
    contentType: "recurring",
    recurrenceDay: null, // Daily
    recurrenceTime: "06:30",
    price: null,
    duration: "1 hour",
    description: "Daily sunrise balloon flights over SMA and the colonial countryside. Founded in 1993. Flights depart at dawn, last approx. 1 hour. Book 1-2 weeks ahead, especially for weekends.",
    sourceUrl: "https://www.globosanmiguel.com/hot-air-balloon-rides/",
  },
  {
    title: "Horseback Riding Tour at Coyote Canyon",
    venueName: "Coyote Canyon Adventures",
    neighborhood: "Countryside",
    category: "adventure",
    contentType: "recurring",
    recurrenceDay: null, // Daily
    recurrenceTime: "12:00",
    price: "$172 USD",
    duration: "2.5 hours",
    description: "Half-day horseback riding through Coyote Canyon, crossing La Virgen river. Includes authentic ranch lunch. Min 2 riders. 30 min SW of SMA. All ages and levels.",
    sourceUrl: "https://www.coyotecanyonadventures.com/",
  },
  {
    title: "Sunset Horseback Ride with Ranch Dinner",
    venueName: "Coyote Canyon Adventures",
    neighborhood: "Countryside",
    category: "adventure",
    contentType: "recurring",
    recurrenceDay: null, // Daily
    recurrenceTime: "17:00",
    price: "$172 USD",
    duration: "2.5 hours",
    description: "Sunset horseback riding tour with authentic ranch dinner. Min 2 riders. Experience the countryside around San Miguel de Allende.",
    sourceUrl: "https://www.coyotecanyonadventures.com/",
  },
];

// ============================================================
// MARKETS & COMMUNITY
// ============================================================
const MARKETS: RecurringActivity[] = [
  {
    title: "Mercado Organico (Saturday Organic Market)",
    venueName: "Instituto Allende Gardens",
    venueAddress: "Ancha de San Antonio 22, Centro",
    neighborhood: "Centro",
    category: "food",
    contentType: "recurring",
    recurrenceDay: 6, // Saturday
    recurrenceTime: "09:00",
    price: "Gratis",
    duration: "4 hours",
    description: "Every Saturday, 40-50 organic traders under shady trees next to Instituto Allende. Fresh breads, cakes, fruit, vegetables, handmade textiles, condiments, chocolates, and more.",
    sourceUrl: "https://theculturetrip.com/north-america/mexico/articles/4-markets-to-explore-in-san-miguel-de-allende",
  },
  {
    title: "Tianguis de los Martes (Tuesday Market)",
    venueName: "Tianguis de los Martes",
    neighborhood: "Periphery",
    category: "food",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "08:00",
    price: "Gratis",
    duration: null,
    description: "Every Tuesday, huge open market just outside Centro. Clothes, cleaning products, electronics, fruit, vegetables, cactus leaves, and even live cattle. A local tradition.",
    sourceUrl: "https://theculturetrip.com/north-america/mexico/articles/4-markets-to-explore-in-san-miguel-de-allende",
  },
  {
    title: "Mercado de Lunes (Monday Market)",
    venueName: "Callejon de las Moras",
    venueAddress: "Cjon. de las Moras, Colonia Allende",
    neighborhood: "Colonia Allende",
    category: "food",
    contentType: "recurring",
    recurrenceDay: 1, // Monday
    recurrenceTime: "08:00",
    price: "Gratis",
    duration: null,
    description: "Small, colorful Monday market along Callejon de las Moras in Colonia Allende. Fruits, flowers, candy, vegetables, clothes, and more.",
    sourceUrl: "https://theculturetrip.com/north-america/mexico/articles/4-markets-to-explore-in-san-miguel-de-allende",
  },
  {
    title: "Guided Tour of Biblioteca Publica",
    venueName: "Biblioteca Publica AC",
    venueAddress: "Insurgentes 25 A, Centro",
    neighborhood: "Centro",
    category: "tour",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "11:00",
    price: "Gratis",
    duration: "1.5 hours",
    description: "Every Tuesday at 11am, English-language guided tour of the historic public library. Donations welcome. Tickets at the Bookstore (Insurgentes 25), buy 2 days ahead. Min 3 participants.",
    sourceUrl: "https://labibliotecapublica.org/en/tourseng/",
  },
];

// ============================================================
// MUSIC & ENTERTAINMENT
// ============================================================
const MUSIC_ENTERTAINMENT: RecurringActivity[] = [
  {
    title: "Open Mic / Jam Session at Cent'Anni",
    venueName: "Cent'Anni Live EATertainment House",
    neighborhood: "Centro",
    category: "music",
    contentType: "recurring",
    recurrenceDay: 3, // Wednesday
    recurrenceTime: "20:00",
    price: "Gratis",
    duration: "3 hours",
    description: "Open mic and jam session at Cent'Anni Live EATertainment House. Musicians welcome to sign up and perform.",
    sourceUrl: "https://www.sanmiguellive.com/venue/centanni-live-eatertainment-house",
  },
  {
    title: "Karaoke Night at La Chope",
    venueName: "La Chope",
    neighborhood: "Centro",
    category: "nightlife",
    contentType: "recurring",
    recurrenceDay: 2, // Tuesday
    recurrenceTime: "20:00",
    price: null,
    duration: null,
    description: "Karaoke on Tuesday and Friday nights at La Chope. Also features live music Thu/Sat/Sun and 'The SMA Voice' on Wednesdays.",
    sourceUrl: "https://www.sanmiguellive.com/venue/la-chope",
  },
  {
    title: "Karaoke Night at La Chope",
    venueName: "La Chope",
    neighborhood: "Centro",
    category: "nightlife",
    contentType: "recurring",
    recurrenceDay: 5, // Friday
    recurrenceTime: "20:00",
    price: null,
    duration: null,
    description: "Karaoke on Friday night at La Chope. Weekend nightlife in Centro.",
    sourceUrl: "https://www.sanmiguellive.com/venue/la-chope",
  },
  {
    title: "The SMA Voice at La Chope",
    venueName: "La Chope",
    neighborhood: "Centro",
    category: "nightlife",
    contentType: "recurring",
    recurrenceDay: 3, // Wednesday
    recurrenceTime: "20:00",
    price: null,
    duration: null,
    description: "Weekly singing competition 'The SMA Voice' at La Chope every Wednesday night.",
    sourceUrl: "https://www.sanmiguellive.com/venue/la-chope",
  },
  {
    title: "Pro Musica Academy Saturday Classes",
    venueName: "Pro Musica San Miguel de Allende",
    neighborhood: "Centro",
    category: "class",
    contentType: "recurring",
    recurrenceDay: 6, // Saturday
    recurrenceTime: "09:00",
    price: null,
    duration: null,
    description: "Music academy holds classes all day on Saturdays, 40 weeks per year. Instrument lessons and music education for youth and adults.",
    sourceUrl: "https://promusicasma.org/youth-and-music/",
  },
];

// ============================================================
// Combine all activities
// ============================================================
const ALL_ACTIVITIES: RecurringActivity[] = [
  ...YOGA_WELLNESS,
  ...FITNESS,
  ...DANCE,
  ...ART_CLASSES,
  ...COOKING,
  ...LANGUAGE,
  ...WINE_MEZCAL,
  ...ADVENTURE,
  ...MARKETS,
  ...MUSIC_ENTERTAINMENT,
];

async function seed() {
  console.log(`\nSeeding ${ALL_ACTIVITIES.length} recurring activities for ${CITY}...\n`);

  let added = 0;
  let skipped = 0;

  for (const activity of ALL_ACTIVITIES) {
    // Generate dedup hash based on venue + day + title
    const dedupKey = `${activity.venueName}-${activity.recurrenceDay ?? "any"}-${activity.title}`;
    const dedupHash = eventDeduplicationHash(dedupKey, activity.contentType, CITY);

    // Check if already exists
    const existing = await db
      .select()
      .from(events)
      .where(sql`dedup_hash = ${dedupHash}`)
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Set expiry 6 months out for recurring, 3 months for workshops
    const expiresAt = activity.contentType === "recurring"
      ? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    try {
      await db.insert(events).values({
        title: activity.title,
        venueName: activity.venueName,
        venueAddress: activity.venueAddress ?? null,
        neighborhood: activity.neighborhood ?? null,
        city: CITY,
        eventDate: null, // Recurring events don't have a single event_date
        category: activity.category as any,
        contentType: activity.contentType,
        recurrenceDay: activity.recurrenceDay ?? null,
        recurrenceTime: activity.recurrenceTime ?? null,
        recurrenceEndDate: null,
        workshopStartDate: null,
        workshopEndDate: null,
        price: activity.price ?? null,
        duration: activity.duration ?? null,
        description: activity.description,
        sourceUrl: activity.sourceUrl,
        sourceType: "website",
        confidence: 0.9,
        rawContent: null,
        imageUrl: null,
        dedupHash,
        expiresAt,
      });
      added++;
      const dayName = activity.recurrenceDay !== null && activity.recurrenceDay !== undefined
        ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][activity.recurrenceDay]
        : "daily";
      console.log(`  + [${activity.contentType}] ${activity.title} @ ${activity.venueName} (${dayName} ${activity.recurrenceTime || ""})`);
    } catch (e: any) {
      console.error(`  x ${activity.title}: ${e.message?.substring(0, 80)}`);
    }
  }

  // Summary
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(events);
  const [{ recurring }] = await db.select({ recurring: sql<number>`count(*)` }).from(events).where(sql`content_type = 'recurring'`);
  const [{ workshops }] = await db.select({ workshops: sql<number>`count(*)` }).from(events).where(sql`content_type = 'workshop'`);

  console.log(`\n=== Summary ===`);
  console.log(`Added: ${added} | Skipped (already exist): ${skipped}`);
  console.log(`Total events in DB: ${count}`);
  console.log(`  Recurring: ${recurring}`);
  console.log(`  Workshops: ${workshops}`);

  await closeDb();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
