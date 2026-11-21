-- A mesma carreta pode retornar no dia, mas o mesmo mapa não abre duas viagens ativas.
create unique index if not exists receiving_nri_distinct_trip_idx
on public.receiving_nri_receipts (arrival_date, plate, upper(btrim(map_number)))
where status <> 'cancelled' and map_number is not null and btrim(map_number) <> '';
