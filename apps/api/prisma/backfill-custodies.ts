/**
 * Backfill script for custodies table.
 * Populates new fields (code, initialBalance, currentBalance, balanceAddedAt)
 * from existing legacy fields (totalAmount, remainingAmount, createdAt).
 *
 * Safe to run multiple times (idempotent).
 * Run: npx ts-node prisma/backfill-custodies.ts
 * Or:  node -e "require('./dist/prisma/backfill-custodies.js')"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Custody Backfill Start ===');

  const custodies = await prisma.custody.findMany();
  console.log(`Found ${custodies.length} custody records`);

  let updated = 0;
  let skipped = 0;

  for (const c of custodies) {
    const updates: Record<string, any> = {};

    // Backfill code if missing
    if (!c.code) {
      updates.code = `CUS-${c.id.slice(-8).toUpperCase()}`;
    }

    // Backfill initialBalance from totalAmount
    if (c.initialBalance === null || c.initialBalance === undefined) {
      updates.initialBalance = (c as any).totalAmount || 0;
    }

    // Backfill currentBalance from remainingAmount
    if (c.currentBalance === null || c.currentBalance === undefined) {
      updates.currentBalance = (c as any).remainingAmount || 0;
    }

    // Backfill balanceAddedAt from createdAt
    if (!c.balanceAddedAt) {
      updates.balanceAddedAt = c.createdAt;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.custody.update({
        where: { id: c.id },
        data: updates,
      });
      console.log(`  Updated: ${c.name} (${c.id}) → ${JSON.stringify(updates)}`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`=== Backfill Complete: ${updated} updated, ${skipped} skipped ===`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
