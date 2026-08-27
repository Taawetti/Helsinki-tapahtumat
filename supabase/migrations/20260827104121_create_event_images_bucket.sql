-- Tapahtumailmoitusten kuvat.
--
-- MIKSI TALLENNUSTILA EIKÄ SÄHKÖPOSTIN LIITE. Liite kasvattaisi viestin kokoa
-- ja huonontaisi perillemenoa — ja juuri perillemeno on tällä hetkellä ongelma
-- (ilmoitukset päätyivät roskapostiin). Linkki on kevyt eikä vaikuta
-- roskapostipisteytykseen.
--
-- MIKSI JULKINEN. Kuvan pitää näkyä sähköpostissa ja päätyä lopulta
-- tapahtumakortille. Yksityinen tila vaatisi allekirjoitetun osoitteen, joka
-- vanhenee — sähköpostissa oleva linkki lakkaisi toimimasta.
--
-- KIRJOITUS VAIN PALVELIMELTA. Bucketille ei luoda yhtään policyä, joten
-- anon-avaimella ei voi kirjoittaa. Lataus tapahtuu /api/submit-event -reitistä
-- service_role-avaimella, joka ohittaa RLS:n. Ilman tätä kuka tahansa voisi
-- täyttää tallennustilan.

insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
