const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Cleaning up all records...');

  // Delete dependent models first (foreign key constraints)
  const subtasks = await prisma.subtask.deleteMany({});
  console.log(`  Deleted ${subtasks.count} subtasks`);

  const checklist = await prisma.checklistItem.deleteMany({});
  console.log(`  Deleted ${checklist.count} checklist items`);

  const records = await prisma.record.deleteMany({});
  console.log(`  Deleted ${records.count} records`);

  console.log('✅ All records cleaned up successfully');
}

main()
  .catch((e) => { console.error('Cleanup error:', e); })
  .finally(() => prisma.$disconnect());
