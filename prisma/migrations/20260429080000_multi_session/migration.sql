-- Ensure pgcrypto is available for gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "coachFee" INTEGER NOT NULL,
    "gymFee" INTEGER NOT NULL,
    "openAt" TIMESTAMP(3),
    "closeAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_isArchived_date_idx" ON "Session"("isArchived", "date");

-- Backfill: create a single Session row from existing Setting rows so that
-- pre-existing slots/bookings keep working after the FK is added. This block
-- is fully idempotent so the migration can be safely retried after a partial
-- failure (e.g. via `prisma migrate resolve --rolled-back`).
DO $$
DECLARE
    v_session_id TEXT;
    v_name TEXT;
    v_location TEXT;
    v_date TIMESTAMP(3);
    v_coach_fee INTEGER;
    v_gym_fee INTEGER;
    v_open_at TIMESTAMP(3);
    v_close_at TIMESTAMP(3);
    v_open_str TEXT;
    v_close_str TEXT;
    v_training_str TEXT;
    v_has_session_col BOOLEAN;
BEGIN
    -- Add Slot.sessionId up-front (nullable) so we can reason about it.
    ALTER TABLE "Slot" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

    -- Only backfill if (a) there are slots and (b) some slot still has NULL sessionId.
    IF EXISTS (SELECT 1 FROM "Slot" WHERE "sessionId" IS NULL) THEN
        v_name := 'HYROX';

        SELECT value INTO v_location FROM "Setting" WHERE key = 'gymLocation';
        IF v_location IS NULL THEN v_location := 'TBD'; END IF;

        SELECT value INTO v_training_str FROM "Setting" WHERE key = 'trainingDate';
        IF v_training_str IS NOT NULL AND v_training_str <> '' THEN
            BEGIN
                -- Try parsing as-is first (handles ISO datetimes).
                v_date := v_training_str::timestamp;
            EXCEPTION WHEN OTHERS THEN
                BEGIN
                    -- Fall back to date-only by appending a time component.
                    v_date := (v_training_str || 'T00:00:00Z')::timestamp;
                EXCEPTION WHEN OTHERS THEN
                    v_date := NULL;
                END;
            END;
        END IF;
        IF v_date IS NULL THEN
            SELECT MIN("date") INTO v_date FROM "Slot";
        END IF;
        IF v_date IS NULL THEN
            v_date := CURRENT_TIMESTAMP;
        END IF;

        BEGIN
            SELECT value::int INTO v_coach_fee FROM "Setting" WHERE key = 'coachFee';
        EXCEPTION WHEN OTHERS THEN
            v_coach_fee := NULL;
        END;
        IF v_coach_fee IS NULL THEN v_coach_fee := 150; END IF;

        BEGIN
            SELECT value::int INTO v_gym_fee FROM "Setting" WHERE key = 'gymFee';
        EXCEPTION WHEN OTHERS THEN
            v_gym_fee := NULL;
        END;
        IF v_gym_fee IS NULL THEN v_gym_fee := 100; END IF;

        SELECT value INTO v_open_str FROM "Setting" WHERE key = 'bookingsOpenAt';
        IF v_open_str IS NOT NULL AND v_open_str <> '' THEN
            BEGIN
                v_open_at := v_open_str::timestamp;
            EXCEPTION WHEN OTHERS THEN
                v_open_at := NULL;
            END;
        END IF;

        SELECT value INTO v_close_str FROM "Setting" WHERE key = 'bookingsCloseAt';
        IF v_close_str IS NOT NULL AND v_close_str <> '' THEN
            BEGIN
                v_close_at := v_close_str::timestamp;
            EXCEPTION WHEN OTHERS THEN
                v_close_at := NULL;
            END;
        END IF;

        -- Reuse an existing legacy Session if a previous partial run created one.
        SELECT "id" INTO v_session_id FROM "Session" WHERE "id" LIKE 'legacy_%' ORDER BY "createdAt" ASC LIMIT 1;
        IF v_session_id IS NULL THEN
            v_session_id := 'legacy_' || replace(gen_random_uuid()::text, '-', '');
            INSERT INTO "Session" ("id", "name", "location", "date", "coachFee", "gymFee", "openAt", "closeAt", "isArchived")
            VALUES (v_session_id, v_name, v_location, v_date, v_coach_fee, v_gym_fee, v_open_at, v_close_at, false);
        END IF;

        UPDATE "Slot" SET "sessionId" = v_session_id WHERE "sessionId" IS NULL;
    END IF;
END $$;

-- Enforce NOT NULL on Slot.sessionId now that it has been backfilled. Only do
-- this if there are no remaining NULLs (true after the block above).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "Slot" WHERE "sessionId" IS NULL) THEN
        ALTER TABLE "Slot" ALTER COLUMN "sessionId" SET NOT NULL;
    END IF;
END $$;

-- Deduplicate slots that now collide on (sessionId, time). The pre-existing
-- unique constraint was (date, time), so legacy data may contain multiple
-- slots sharing the same time across different dates. After the backfill
-- collapses them onto a single legacy Session, those rows would violate the
-- new (sessionId, time) unique index. For each duplicate group we keep the
-- earliest slot (smallest id) and re-point its siblings' bookings onto it
-- before deleting the duplicates. This block is idempotent.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT "sessionId", "time", MIN("id") AS keep_id, array_agg("id") AS all_ids
        FROM "Slot"
        WHERE "sessionId" IS NOT NULL
        GROUP BY "sessionId", "time"
        HAVING COUNT(*) > 1
    LOOP
        UPDATE "Booking"
            SET "slotId" = r.keep_id
            WHERE "slotId" = ANY(r.all_ids) AND "slotId" <> r.keep_id;
        DELETE FROM "Slot"
            WHERE "sessionId" = r."sessionId"
              AND "time" = r."time"
              AND "id" <> r.keep_id;
    END LOOP;
END $$;

-- DropIndex (the old unique was (date, time); new unique is (sessionId, time))
DROP INDEX IF EXISTS "Slot_date_time_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Slot_sessionId_time_key" ON "Slot"("sessionId", "time");
CREATE INDEX IF NOT EXISTS "Slot_sessionId_order_idx" ON "Slot"("sessionId", "order");

-- AddForeignKey (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Slot_sessionId_fkey'
    ) THEN
        ALTER TABLE "Slot" ADD CONSTRAINT "Slot_sessionId_fkey"
            FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Drop now-obsolete training/fee/location/window settings rows. The Setting
-- table itself stays for adminPasswordHash and any future global settings.
DELETE FROM "Setting" WHERE key IN ('gymLocation', 'trainingDate', 'coachFee', 'gymFee', 'bookingsOpenAt', 'bookingsCloseAt');
