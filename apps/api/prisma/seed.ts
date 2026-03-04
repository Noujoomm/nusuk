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

  // 6. Create default work calendar
  const calendar = await prisma.workCalendar.upsert({
    where: { id: 'default-saudi-calendar' },
    update: {},
    create: {
      id: 'default-saudi-calendar',
      name: 'Saudi Standard',
      nameAr: 'التقويم السعودي',
      isDefault: true,
      workDays: [0, 1, 2, 3, 4], // Sun-Thu
      workStartHour: 9,
      workEndHour: 17,
      holidays: JSON.parse('[]'),
      timezone: 'Asia/Riyadh',
    },
  });
  console.log(`  Calendar: ${calendar.name} (id: ${calendar.id})`);

  // 7. Create sample Gantt tasks
  if (consultingTrack) {
    const today = new Date();
    const d = (offset: number) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      return date;
    };

    // Summary: Phase 1
    const phase1 = await prisma.task.create({
      data: {
        title: 'Phase 1: Planning',
        titleAr: 'المرحلة 1: التخطيط',
        trackId: consultingTrack.id,
        createdById: admin.id,
        assigneeType: 'TRACK',
        assigneeTrackId: consultingTrack.id,
        isSummary: true,
        startDate: d(0),
        dueDate: d(15),
        duration: 12,
        wbs: '1',
        outlineLevel: 1,
        sortOrder: 1,
      },
    });

    const task1 = await prisma.task.create({
      data: {
        title: 'Requirements Gathering',
        titleAr: 'جمع المتطلبات',
        trackId: consultingTrack.id,
        createdById: admin.id,
        assigneeType: 'TRACK',
        assigneeTrackId: consultingTrack.id,
        parentTaskId: phase1.id,
        startDate: d(0),
        dueDate: d(4),
        duration: 5,
        progress: 80,
        status: 'in_progress',
        priority: 'high',
        wbs: '1.1',
        outlineLevel: 2,
        sortOrder: 2,
      },
    });

    const task2 = await prisma.task.create({
      data: {
        title: 'Stakeholder Analysis',
        titleAr: 'تحليل أصحاب المصلحة',
        trackId: consultingTrack.id,
        createdById: admin.id,
        assigneeType: 'TRACK',
        assigneeTrackId: consultingTrack.id,
        parentTaskId: phase1.id,
        startDate: d(3),
        dueDate: d(7),
        duration: 4,
        progress: 50,
        status: 'in_progress',
        priority: 'medium',
        wbs: '1.2',
        outlineLevel: 2,
        sortOrder: 3,
      },
    });

    const milestone1 = await prisma.task.create({
      data: {
        title: 'Planning Complete',
        titleAr: 'اكتمال التخطيط',
        trackId: consultingTrack.id,
        createdById: admin.id,
        assigneeType: 'TRACK',
        assigneeTrackId: consultingTrack.id,
        parentTaskId: phase1.id,
        isMilestone: true,
        startDate: d(8),
        dueDate: d(8),
        duration: 0,
        wbs: '1.3',
        outlineLevel: 2,
        sortOrder: 4,
      },
    });

    // Summary: Phase 2
    const phase2 = await prisma.task.create({
      data: {
        title: 'Phase 2: Execution',
        titleAr: 'المرحلة 2: التنفيذ',
        trackId: consultingTrack.id,
        createdById: admin.id,
        assigneeType: 'TRACK',
        assigneeTrackId: consultingTrack.id,
        isSummary: true,
        startDate: d(9),
        dueDate: d(30),
        duration: 16,
        wbs: '2',
        outlineLevel: 1,
        sortOrder: 5,
      },
    });

    const task3 = await prisma.task.create({
      data: {
        title: 'System Design',
        titleAr: 'تصميم النظام',
        trackId: consultingTrack.id,
        createdById: admin.id,
        assigneeType: 'TRACK',
        assigneeTrackId: consultingTrack.id,
        parentTaskId: phase2.id,
        startDate: d(9),
        dueDate: d(16),
        duration: 6,
        priority: 'critical',
        isCritical: true,
        wbs: '2.1',
        outlineLevel: 2,
        sortOrder: 6,
      },
    });

    const task4 = await prisma.task.create({
      data: {
        title: 'Development',
        titleAr: 'التطوير',
        trackId: consultingTrack.id,
        createdById: admin.id,
        assigneeType: 'TRACK',
        assigneeTrackId: consultingTrack.id,
        parentTaskId: phase2.id,
        startDate: d(17),
        dueDate: d(30),
        duration: 10,
        priority: 'critical',
        isCritical: true,
        wbs: '2.2',
        outlineLevel: 2,
        sortOrder: 7,
      },
    });

    const task5 = await prisma.task.create({
      data: {
        title: 'Testing',
        titleAr: 'الاختبار',
        trackId: consultingTrack.id,
        createdById: admin.id,
        assigneeType: 'TRACK',
        assigneeTrackId: consultingTrack.id,
        parentTaskId: phase2.id,
        startDate: d(25),
        dueDate: d(30),
        duration: 4,
        wbs: '2.3',
        outlineLevel: 2,
        sortOrder: 8,
      },
    });

    // Dependencies: FS
    await prisma.taskDependency.createMany({
      data: [
        { predecessorId: task1.id, successorId: task2.id, type: 'SS', lag: 2 },
        { predecessorId: task2.id, successorId: milestone1.id, type: 'FS', lag: 0 },
        { predecessorId: milestone1.id, successorId: task3.id, type: 'FS', lag: 0 },
        { predecessorId: task3.id, successorId: task4.id, type: 'FS', lag: 0 },
        { predecessorId: task4.id, successorId: task5.id, type: 'SS', lag: -3 },
      ],
      skipDuplicates: true,
    });

    console.log('  Gantt tasks: 7 tasks + 5 dependencies created for consulting track');
  }

  console.log('\nSeed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
