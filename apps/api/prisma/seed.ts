import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TRACKS = [
  { name: 'consulting', nameAr: 'المسار الاستشاري', color: '#10B981', sortOrder: 0 },
  { name: 'printing', nameAr: 'مسار الطباعة', color: '#0EA5E9', sortOrder: 1 },
  { name: 'distribution', nameAr: 'مسار التوزيع', color: '#8B5CF6', sortOrder: 2 },
  { name: 'corporate_relations', nameAr: 'مسار علاقات الشركات', color: '#F59E0B', sortOrder: 3 },
  { name: 'technical_support', nameAr: 'مسار الدعم الفني', color: '#F43F5E', sortOrder: 4 },
  { name: 'training', nameAr: 'مسار التدريب', color: '#14B8A6', sortOrder: 5 },
];

async function main() {
  console.log('Seeding database...\n');

  // 1. Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@nusuk.sa' },
    update: {},
    create: {
      email: 'admin@nusuk.sa',
      name: 'System Administrator',
      nameAr: 'مدير النظام',
      passwordHash: adminPassword,
      role: 'admin',
      isActive: true,
    },
  });
  console.log(`  Admin: admin@nusuk.sa / admin123 (id: ${admin.id})`);

  // 1b. Create main admin user
  const mainAdminPassword = await bcrypt.hash('Ma112001', 12);
  const mainAdmin = await prisma.user.upsert({
    where: { email: 'snoujoom@gmail.com' },
    update: {},
    create: {
      email: 'snoujoom@gmail.com',
      name: 'Mazin Admin',
      nameAr: 'مازن المدير',
      passwordHash: mainAdminPassword,
      role: 'admin',
      isActive: true,
    },
  });
  console.log(`  Main Admin: snoujoom@gmail.com / Ma112001 (id: ${mainAdmin.id})`);

  // 2. Create PM user
  const pmPassword = await bcrypt.hash('pm123', 12);
  const pm = await prisma.user.upsert({
    where: { email: 'pm@nusuk.sa' },
    update: {},
    create: {
      email: 'pm@nusuk.sa',
      name: 'Project Manager',
      nameAr: 'مدير المشروع',
      passwordHash: pmPassword,
      role: 'pm',
      isActive: true,
    },
  });
  console.log(`  PM: pm@nusuk.sa / pm123 (id: ${pm.id})`);

  // 3. Create track lead user
  const leadPassword = await bcrypt.hash('lead123', 12);
  const lead = await prisma.user.upsert({
    where: { email: 'lead@nusuk.sa' },
    update: {},
    create: {
      email: 'lead@nusuk.sa',
      name: 'Track Lead',
      nameAr: 'قائد المسار',
      passwordHash: leadPassword,
      role: 'track_lead',
      isActive: true,
    },
  });
  console.log(`  Lead: lead@nusuk.sa / lead123 (id: ${lead.id})`);

  // 4. Create tracks
  const trackObjects: Record<string, any> = {};
  for (const t of TRACKS) {
    const track = await prisma.track.upsert({
      where: { name: t.name },
      update: {},
      create: {
        name: t.name,
        nameAr: t.nameAr,
        color: t.color,
        sortOrder: t.sortOrder,
        fieldSchema: {
          fields: [
            { key: 'department', label: 'القسم', type: 'text' },
            { key: 'responsible', label: 'المسؤول', type: 'text' },
            { key: 'completionPct', label: 'نسبة الإنجاز', type: 'number' },
          ],
        },
      },
    });
    trackObjects[t.name] = track;
    console.log(`  Track: ${t.nameAr} (id: ${track.id})`);
  }

  // 5. Assign track lead permissions
  const consultingTrack = trackObjects['consulting'];
  if (consultingTrack) {
    await prisma.trackPermission.upsert({
      where: { userId_trackId: { userId: lead.id, trackId: consultingTrack.id } },
      update: { permissions: ['view', 'edit', 'create', 'delete'] },
      create: {
        userId: lead.id,
        trackId: consultingTrack.id,
        permissions: ['view', 'edit', 'create', 'delete'],
      },
    });
    console.log(`  Permission: lead -> consulting (view, edit, create, delete)`);
  }

  // 6. Create sample records
  const statuses = ['draft', 'active', 'in_progress', 'completed'] as const;
  const priorities = ['low', 'medium', 'high', 'critical'] as const;

  for (const [name, track] of Object.entries(trackObjects)) {
    for (let i = 1; i <= 5; i++) {
      await prisma.record.create({
        data: {
          trackId: track.id,
          title: `${name} task ${i}`,
          titleAr: `مهمة ${name} رقم ${i}`,
          status: statuses[i % statuses.length],
          priority: priorities[i % priorities.length],
          owner: i % 2 === 0 ? 'فريق المسار' : 'قائد المسار',
          progress: Math.round(Math.random() * 100),
          createdById: i % 3 === 0 ? lead.id : pm.id,
          extraFields: {
            department: `قسم ${i}`,
            responsible: `مسؤول ${i}`,
            completionPct: Math.round(Math.random() * 100),
          },
        },
      });
    }
    console.log(`  Created 5 sample records for ${name}`);
  }

  console.log('\nSeed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
