-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "time" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "uber" BOOLEAN NOT NULL DEFAULT false,
    "payment" TEXT NOT NULL DEFAULT 'PayMe',
    "amount" INTEGER,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Confirmed',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "Slot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Slot_date_time_key" ON "Slot"("date", "time");

-- CreateIndex
CREATE INDEX "Booking_slotId_status_createdAt_idx" ON "Booking"("slotId", "status", "createdAt");
