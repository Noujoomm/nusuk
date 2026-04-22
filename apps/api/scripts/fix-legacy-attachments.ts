/**
 * Migration: fix legacy custody-fund invoice attachments.
 *
 * For every CustodyFundInvoice:
 *   1. If `attachmentOriginalName` is Latin-1 mojibake of Arabic, fix it.
 *   2. If `attachmentData` is null but `attachmentUrl` still exists on disk,
 *      slurp the bytes into the DB so the file survives the next redeploy.
 *   3. Otherwise, flag as orphan (file lost to Railway's ephemeral FS).
 *
 * Usage:
 *   # Dry-run (default) — prints what would change, writes nothing.
 *   npx ts-node apps/api/scripts/fix-legacy-attachments.ts
 *
 *   # Apply — actually writes to the database.
 *   npx ts-node apps/api/scripts/fix-legacy-attachments.ts --apply
 *
 * Safe to re-run: already-fixed rows are skipped.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const APPLY = process.argv.includes('--apply');
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

interface Report {
  total: number;
  namesFixed: number;
  namesAlreadyOk: number;
  bytesRecovered: number;
  orphaned: Array<{ id: string; invoiceName: string; attachmentUrl: string | null; reason: string }>;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Detect Arabic text stuck in Latin-1 → UTF-8 mojibake. Returns the fixed
 * string if the heuristic fires, otherwise the original unchanged.
 */
function tryFixMojibake(name: string | null): string | null {
  if (!name) return name;
  if (ARABIC_RE.test(name)) return name; // already proper Arabic
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (ARABIC_RE.test(decoded)) return decoded;
  } catch { /* keep original */ }
  return name;
}

async function main() {
  const prisma = new PrismaClient();
  const report: Report = {
    total: 0,
    namesFixed: 0,
    namesAlreadyOk: 0,
    bytesRecovered: 0,
    orphaned: [],
    errors: [],
  };

  console.log(`[migration] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('[migration] scanning custody_fund_invoices...\n');

  const invoices = await prisma.custodyFundInvoice.findMany({
    select: {
      id: true,
      invoiceName: true,
      attachmentOriginalName: true,
      attachmentUrl: true,
      attachmentData: true,
      attachmentMimeType: true,
    },
  });
  report.total = invoices.length;

  for (const inv of invoices) {
    try {
      const updates: Record<string, unknown> = {};

      // (1) Filename mojibake.
      const currentName = inv.attachmentOriginalName;
      if (currentName) {
        const fixed = tryFixMojibake(currentName);
        if (fixed && fixed !== currentName) {
          updates.attachmentOriginalName = fixed;
          report.namesFixed++;
          console.log(
            `[fix-name] ${inv.id}\n   old: ${currentName}\n   new: ${fixed}`,
          );
        } else {
          report.namesAlreadyOk++;
        }
      }

      // (2) FS → DB recovery. Only if we have a path, the file exists there,
      // and the DB bytes column is empty.
      const hasDbBytes = !!inv.attachmentData;
      if (!hasDbBytes && inv.attachmentUrl) {
        if (fs.existsSync(inv.attachmentUrl)) {
          const buf = fs.readFileSync(inv.attachmentUrl);
          updates.attachmentData = new Uint8Array(buf);
          updates.attachmentSizeBytes = buf.length;
          if (!inv.attachmentMimeType) {
            const ext = (inv.attachmentUrl.split('.').pop() || '').toLowerCase();
            const mimes: Record<string, string> = {
              pdf: 'application/pdf',
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              png: 'image/png',
              webp: 'image/webp',
              xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              xls: 'application/vnd.ms-excel',
              docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            };
            if (mimes[ext]) updates.attachmentMimeType = mimes[ext];
          }
          report.bytesRecovered++;
          console.log(
            `[recover-bytes] ${inv.id} ← ${inv.attachmentUrl} (${buf.length} bytes)`,
          );
        } else {
          report.orphaned.push({
            id: inv.id,
            invoiceName: inv.invoiceName,
            attachmentUrl: inv.attachmentUrl,
            reason: 'file missing on disk (likely wiped by Railway ephemeral FS)',
          });
        }
      }

      if (Object.keys(updates).length > 0 && APPLY) {
        await prisma.custodyFundInvoice.update({
          where: { id: inv.id },
          data: updates as any,
        });
      }
    } catch (e: any) {
      report.errors.push({ id: inv.id, error: String(e?.message ?? e).slice(0, 300) });
    }
  }

  console.log('\n============================');
  console.log('📊 Migration Report');
  console.log('============================');
  console.log(`total invoices scanned : ${report.total}`);
  console.log(`filenames fixed        : ${report.namesFixed}`);
  console.log(`filenames already ok   : ${report.namesAlreadyOk}`);
  console.log(`bytes recovered → DB   : ${report.bytesRecovered}`);
  console.log(`orphaned (file lost)   : ${report.orphaned.length}`);
  console.log(`errors                 : ${report.errors.length}`);
  console.log('============================');

  if (report.orphaned.length) {
    console.log('\nOrphaned attachments:');
    for (const o of report.orphaned.slice(0, 50)) {
      console.log(`  - ${o.id} | ${o.invoiceName} | ${o.attachmentUrl}`);
    }
    if (report.orphaned.length > 50) {
      console.log(`  ... and ${report.orphaned.length - 50} more`);
    }
  }
  if (report.errors.length) {
    console.log('\nErrors:');
    for (const e of report.errors) console.log(`  - ${e.id}: ${e.error}`);
  }

  if (!APPLY) {
    console.log('\n[dry-run] no rows were modified. Re-run with --apply to commit.');
  } else {
    console.log('\n[applied] database updated.');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[migration] FATAL:', e);
  process.exit(1);
});
