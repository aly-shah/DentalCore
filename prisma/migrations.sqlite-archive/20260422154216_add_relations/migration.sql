-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT,
    "patientId" TEXT,
    "callerName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentName" TEXT,
    "type" TEXT NOT NULL DEFAULT 'INBOUND',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "outcome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CallLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CallLog" ("agentName", "callerName", "createdAt", "duration", "id", "leadId", "notes", "outcome", "patientId", "type", "userId") SELECT "agentName", "callerName", "createdAt", "duration", "id", "leadId", "notes", "outcome", "patientId", "type", "userId" FROM "CallLog";
DROP TABLE "CallLog";
ALTER TABLE "new_CallLog" RENAME TO "CallLog";
CREATE TABLE "new_Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CALL',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "interest" TEXT,
    "assignedToId" TEXT,
    "branchId" TEXT NOT NULL,
    "notes" TEXT,
    "convertedPatientId" TEXT,
    "callbackDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lead_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_convertedPatientId_fkey" FOREIGN KEY ("convertedPatientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("assignedToId", "branchId", "callbackDate", "convertedPatientId", "createdAt", "email", "id", "interest", "name", "notes", "phone", "source", "status", "updatedAt") SELECT "assignedToId", "branchId", "callbackDate", "convertedPatientId", "createdAt", "email", "id", "interest", "name", "notes", "phone", "source", "status", "updatedAt" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "brand" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "unit" TEXT,
    "sellPrice" REAL NOT NULL DEFAULT 0,
    "costPrice" REAL NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 5,
    "expiryDate" DATETIME,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("barcode", "branchId", "brand", "category", "costPrice", "createdAt", "description", "expiryDate", "id", "isActive", "name", "quantity", "reorderLevel", "sellPrice", "sku", "unit", "updatedAt") SELECT "barcode", "branchId", "brand", "category", "costPrice", "createdAt", "description", "expiryDate", "id", "isActive", "name", "quantity", "reorderLevel", "sellPrice", "sku", "unit", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
