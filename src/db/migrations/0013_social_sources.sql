-- Seed Instagram sources for San Miguel de Allende venues
INSERT INTO sources (name, url, type, is_active, poll_priority) VALUES
  ('Sie7e Rooftop', 'https://www.instagram.com/sie7erooftop/', 'instagram', true, 'medium'),
  ('Rain Dogs SMA', 'https://www.instagram.com/raindogsma/', 'instagram', true, 'medium'),
  ('Johnnys Piano Bar SMA', 'https://www.instagram.com/johnnyspianobar_sma/', 'instagram', true, 'medium'),
  ('Lavanda Cafe SMA', 'https://www.instagram.com/lavandacafesma/', 'instagram', true, 'medium'),
  ('La Posadita SMA', 'https://www.instagram.com/laposadita_sma/', 'instagram', true, 'medium'),
  ('Casa Dragones', 'https://www.instagram.com/casadragones/', 'instagram', true, 'medium'),
  ('Fabrica La Aurora', 'https://www.instagram.com/fabricalaaurora/', 'instagram', true, 'medium'),
  ('Teatro Angela Peralta', 'https://www.instagram.com/teatroangelaperalta/', 'instagram', true, 'medium'),
  ('Instituto San Miguel de Allende', 'https://www.instagram.com/institutosanmigueldeallende/', 'instagram', true, 'medium'),
  ('Dos Buhos Vinedos', 'https://www.instagram.com/dosbuhosvinedos/', 'instagram', true, 'medium'),
  ('Cuna de Tierra', 'https://www.instagram.com/cunadetierra/', 'instagram', true, 'medium'),
  ('Charco Ingeniero SMA', 'https://www.instagram.com/charcoingenioresma/', 'instagram', true, 'medium'),
  ('Parroquia SMA', 'https://www.instagram.com/parroquiasma/', 'instagram', true, 'medium'),
  ('Hotel Matilda SMA', 'https://www.instagram.com/hotelmatlida_sma/', 'instagram', true, 'medium'),
  ('Live Aqua SMA', 'https://www.instagram.com/liveaquasma/', 'instagram', true, 'medium'),
  ('Centanni SMA', 'https://www.instagram.com/centannisma/', 'instagram', true, 'medium'),
  ('Berli Bar SMA', 'https://www.instagram.com/berlibarsma/', 'instagram', true, 'medium'),
  ('Los Milagros SMA', 'https://www.instagram.com/losmilagrossma/', 'instagram', true, 'medium'),
  ('La Cantibar', 'https://www.instagram.com/lacantibar/', 'instagram', true, 'medium'),
  ('Altar Terraza SMA', 'https://www.instagram.com/altarterrazasma/', 'instagram', true, 'medium');

-- Seed TikTok hashtag-based sources (supplementary, low priority)
INSERT INTO sources (name, url, type, is_active, poll_priority) VALUES
  ('TikTok #sanmigueldeallende', 'https://www.tiktok.com/tag/sanmigueldeallende', 'tiktok', true, 'low'),
  ('TikTok #sanmigueldeallendemexico', 'https://www.tiktok.com/tag/sanmigueldeallendemexico', 'tiktok', true, 'low'),
  ('TikTok #smaevents', 'https://www.tiktok.com/tag/smaevents', 'tiktok', true, 'low'),
  ('TikTok #sanmigueleventos', 'https://www.tiktok.com/tag/sanmigueleventos', 'tiktok', true, 'low');
