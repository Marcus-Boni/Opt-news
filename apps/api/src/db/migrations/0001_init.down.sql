-- Reverts 0001 entirely. Destroys all Opt News data: only for local/dev databases.
DROP SCHEMA ops CASCADE;
DROP SCHEMA knowledge CASCADE;
DROP SCHEMA meetups CASCADE;
DROP SCHEMA community CASCADE;
DROP SCHEMA content CASCADE;
DROP SCHEMA identity CASCADE;
