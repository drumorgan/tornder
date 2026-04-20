-- Remap flags.preferred_company_types from the old shifted IDs to the
-- canonical Torn API company type IDs. Run once in the Supabase SQL Editor
-- after deploying the UI fix that aligns COMPANY_TYPES with the canonical list.
--
-- Label-preserving mapping (by what the user actually clicked):
--   old 17 (Zoo)                -> new 18
--   old 18 (Firework Stand)     -> new 19
--   old 19 (Property Broker)    -> new 20
--   old 20 (Furniture Store)    -> new 21
--   old 21 (Gas Station)        -> new 22
--   old 22 (Nightclub)          -> new 24
--   old 23 (Music Store)        -> new 23   (unchanged)
--   old 24 (Pub)                -> new 25
--   old 25 (Gents Strip Club)   -> new 26
--   old 26 (Restaurant)         -> new 27
--   old 27 (Oil Rig)            -> new 28
--   old 28 (Fitness Center)     -> new 29
--   old 29 (Mechanic Shop)      -> new 30
--   old 30 (Amusement Park)     -> new 31
--   old 31 (Lingerie Store)     -> new 32
--   old 32 (Meat Warehouse)     -> new 33
--   old 33 (Farm)               -> new 34
--   old 34 (Software Corp)      -> new 35
--   old 35 (Ladies Strip Club)  -> new 36
--   old 36 (Private Security)   -> new 37
--   old 37 (Mining Corporation) -> new 38
--   old 38 (Detective Agency)   -> new 39
--   old 39 (Logistics Mgmt)     -> new 40
-- IDs 1-16 are unchanged.

UPDATE flags
SET
  preferred_company_types = (
    SELECT array_agg(
      CASE old_id
        WHEN 17 THEN 18
        WHEN 18 THEN 19
        WHEN 19 THEN 20
        WHEN 20 THEN 21
        WHEN 21 THEN 22
        WHEN 22 THEN 24
        WHEN 24 THEN 25
        WHEN 25 THEN 26
        WHEN 26 THEN 27
        WHEN 27 THEN 28
        WHEN 28 THEN 29
        WHEN 29 THEN 30
        WHEN 30 THEN 31
        WHEN 31 THEN 32
        WHEN 32 THEN 33
        WHEN 33 THEN 34
        WHEN 34 THEN 35
        WHEN 35 THEN 36
        WHEN 36 THEN 37
        WHEN 37 THEN 38
        WHEN 38 THEN 39
        WHEN 39 THEN 40
        ELSE old_id
      END
    )
    FROM unnest(preferred_company_types) AS old_id
  ),
  updated_at = NOW()
WHERE preferred_company_types IS NOT NULL
  AND array_length(preferred_company_types, 1) > 0;
