-- CreateTable
CREATE TABLE "Session" (
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
CREATE INDEX "Session_isArchived_date_idx" ON "Session"("isArchived", "date");

-- Backfill: create a single Session row from existing Setting rows so that
-- pre-existing slots/bookings keep working after the FK is added.
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
BEGIN
    IF EXISTS (SELECT 1 FROM "Slot") THEN
        v_name := 'HYROX';
        SELECT value INTO v_location FROM "Setting" WHERE key = 'gymLocation';
        IF v_location IS NULL THEN v_location := 'TBD'; END IF;

        SELECT value INTO v_training_str FROM "Setting" WHERE key = 'trainingDate';
        IF v_training_str IS NOT NULL THEN
            v_date := (v_training_str || 'T00:00:00Z')::timestamp;
        ELSE
            SELECT MIN("date") INTO v_date FROM "Slot";
        END IF;

        SELECT value::int INTO v_coach_fee FROM "Setting" WHERE key = 'coachFee';
        IF v_coach_fee IS NULL THEN v_coach_fee := 150; END IF;

        SELECT value::int INTO v_gym_fee FROM "Setting" WHERE key = 'gymFee';
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

        v_session_id := 'legacy_' || replace(gen_random_uuid()::text, '-', '');

        INSERT INTO "Session" ("id", "name", "location", "date", "coachFee", "gymFee", "openAt", "closeAt", "isArchived")
        VALUES (v_session_id, v_name, v_location, v_date, v_coach_fee, v_gym_fee, v_open_at, v_close_at, false);

        ALTER TABLE "Slot" ADD COLUMN "sessionId" TEXT;
        UPDATE "Slot" SET "sessionId" = v_session_id;
    ELSE
        ALTER TABLE "Slot" ADD COLUMN "sessionId" TEXT;
    END IF;
END $$;

-- Enforce NOT NULL on Slot.sessionId now that it has been backfilled.
ALTER TABLE "Slot" ALTER COLUMN "sessionId" SET NOT NULL;

-- DropIndex (the old unique was (date, time); new unique is (sessionId, time))
DROP INDEX IF EXISTS "Slot_date_time_key";

-- CreateIndex
CREATE UNIQUE INDEX "Slot_sessionId_time_key" ON "Slot"("sessionId", "time");
CREATE INDEX "Slot_sessionId_order_idx" ON "Slot"("sessionId", "order");

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop now-obsolete training/fee/location/window settings rows. The Setting
-- table itself stays for adminPasswordHash and any future global settings.
DELETE FROM "Setting" WHERE key IN ('gymLocation', 'trainingDate', 'coachFee', 'gymFee', 'bookingsOpenAt', 'bookingsCloseAt');
