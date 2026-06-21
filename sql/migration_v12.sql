-- migration_v12: adiciona campos UTM ao histórico de visitas
ALTER TABLE analytics_visits
  ADD COLUMN utm_source   VARCHAR(100) NULL AFTER referrer,
  ADD COLUMN utm_medium   VARCHAR(100) NULL AFTER utm_source,
  ADD COLUMN utm_campaign VARCHAR(200) NULL AFTER utm_medium;
