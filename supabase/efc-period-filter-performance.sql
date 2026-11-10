-- Preserve every source row and view column; allow period filters to reach the base scan.
create or replace view public.report_03023601_current with(security_invoker=true) as  WITH latest AS MATERIALIZED (
         SELECT DISTINCT ON ((m.value ->> 'map'::text)) m.value ->> 'map'::text AS map,
            i.id,
            i.completed_at,
            i.headers,
            i.source_file
           FROM efc_ocp_imports i
             CROSS JOIN LATERAL jsonb_array_elements(i.maps) m(value)
          WHERE i.status = 'completed'::text
          ORDER BY (m.value ->> 'map'::text), i.completed_at DESC, i.id DESC
        ), expanded AS NOT MATERIALIZED (
         SELECT c.import_id,
            r.value AS payload
           FROM efc_ocp_chunks c
             CROSS JOIN LATERAL jsonb_array_elements(c.rows) r(value)
          WHERE (c.import_id IN ( SELECT latest.id
                   FROM latest))
        )
 SELECT l.map,
    (e.payload ->> 'date'::text)::date AS reference_date,
    (e.payload ->> 'row_no'::text)::integer AS row_no,
    e.payload ->> 'plate'::text AS plate,
    l.headers,
    e.payload -> 'raw_values'::text AS raw_values,
    e.payload,
    l.source_file,
    l.completed_at
   FROM expanded e
     JOIN latest l ON e.import_id = l.id AND (e.payload ->> 'map'::text) = l.map;
create or replace view public.report_031120_current with(security_invoker=true) as  WITH candidates AS NOT MATERIALIZED (
         SELECT DISTINCT report_031120_rows.reference_date,
            report_031120_rows.import_id
           FROM report_031120_rows
          WHERE report_031120_rows.reference_date IS NOT NULL
        ), latest AS (
         SELECT DISTINCT ON (c.reference_date) c.reference_date,
            i_1.id
           FROM candidates c
             JOIN report_031120_imports i_1 ON i_1.id = c.import_id
          WHERE i_1.status = 'completed'::text
          ORDER BY c.reference_date, i_1.created_at DESC, i_1.id DESC
        )
 SELECT r.import_id,
    r.row_no,
    r.reference_date,
    r.vehicle,
    r.map_number,
    r.movement,
    r.is_entrada_cdd,
    r.raw_values,
    i.source_file,
    i.headers,
    i.completed_at
   FROM latest l
     JOIN report_031120_rows r ON r.import_id = l.id AND r.reference_date = l.reference_date
     JOIN report_031120_imports i ON i.id = r.import_id;
