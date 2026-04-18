/**
 * Exporters for the AI Reports Intelligence Center.
 *
 * Every exporter takes the same `SessionExportInput` and produces a Buffer +
 * suggested filename + content type. The UI presents them as a download menu.
 *
 * Supported formats (Phase 1):
 *   - txt   (plain text)
 *   - md    (Markdown)
 *   - docx  (Word — RTL, Arabic)
 *   - xlsx  (Excel — one sheet, section per row block)
 *   - pptx  (PowerPoint — title slide + one slide per section)
 *
 * PDF is handled on the client via a print-optimized route; see the web app.
 */

import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  AlignmentType,
  TextRun,
} from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { SECTION_TITLES_AR, SectionKey } from './ai-prompt';

export type ExportFormat = 'txt' | 'md' | 'docx' | 'xlsx' | 'pptx';

export interface ExportSection {
  key: string;
  body: string;
}

export interface SessionExportInput {
  title: string;
  createdAtIso: string;
  createdByName?: string;
  outputModeAr: string;
  filtersSummaryAr: string;
  sections: ExportSection[];
}

export interface ExportArtifact {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

function titleFor(key: string): string {
  return SECTION_TITLES_AR[key as SectionKey] ?? key;
}

function safeBaseName(input: SessionExportInput): string {
  const d = input.createdAtIso.slice(0, 10);
  return `roya-intelligence-${d}`;
}

// ─── TXT ──────────────────────────────────────────────────────────────────

function toTxt(i: SessionExportInput): string {
  const lines: string[] = [];
  lines.push(i.title);
  lines.push('='.repeat(Math.max(8, i.title.length)));
  lines.push(`تاريخ الإنشاء: ${i.createdAtIso}`);
  if (i.createdByName) lines.push(`أنشئ بواسطة: ${i.createdByName}`);
  lines.push(`النمط: ${i.outputModeAr}`);
  lines.push(`المعايير: ${i.filtersSummaryAr}`);
  lines.push('');
  for (const s of i.sections) {
    const body = (s.body || '').trim();
    if (!body) continue;
    lines.push(titleFor(s.key));
    lines.push('-'.repeat(Math.max(4, titleFor(s.key).length)));
    lines.push(body);
    lines.push('');
  }
  return lines.join('\n');
}

// ─── Markdown ─────────────────────────────────────────────────────────────

function toMarkdown(i: SessionExportInput): string {
  const lines: string[] = [];
  lines.push(`# ${i.title}`);
  lines.push('');
  lines.push(`- **تاريخ الإنشاء:** ${i.createdAtIso}`);
  if (i.createdByName) lines.push(`- **أنشئ بواسطة:** ${i.createdByName}`);
  lines.push(`- **النمط:** ${i.outputModeAr}`);
  lines.push(`- **المعايير:** ${i.filtersSummaryAr}`);
  lines.push('');
  for (const s of i.sections) {
    const body = (s.body || '').trim();
    if (!body) continue;
    lines.push(`## ${titleFor(s.key)}`);
    lines.push('');
    lines.push(body);
    lines.push('');
  }
  return lines.join('\n');
}

// ─── DOCX ─────────────────────────────────────────────────────────────────

async function toDocx(i: SessionExportInput): Promise<Buffer> {
  const rtl: { bidirectional: true; alignment: typeof AlignmentType.RIGHT } = {
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
  };

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: i.title, rightToLeft: true, bold: true, size: 36 })],
    }),
    new Paragraph({
      ...rtl,
      children: [
        new TextRun({ text: `تاريخ الإنشاء: ${i.createdAtIso}`, rightToLeft: true }),
      ],
    }),
    ...(i.createdByName
      ? [
          new Paragraph({
            ...rtl,
            children: [
              new TextRun({
                text: `أنشئ بواسطة: ${i.createdByName}`,
                rightToLeft: true,
              }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      ...rtl,
      children: [new TextRun({ text: `النمط: ${i.outputModeAr}`, rightToLeft: true })],
    }),
    new Paragraph({
      ...rtl,
      children: [
        new TextRun({ text: `المعايير: ${i.filtersSummaryAr}`, rightToLeft: true }),
      ],
    }),
    new Paragraph({ children: [new TextRun(' ')] }),
  ];

  for (const s of i.sections) {
    const body = (s.body || '').trim();
    if (!body) continue;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        ...rtl,
        children: [new TextRun({ text: titleFor(s.key), rightToLeft: true, bold: true })],
      }),
    );
    for (const line of body.split('\n')) {
      children.push(
        new Paragraph({
          ...rtl,
          children: [new TextRun({ text: line, rightToLeft: true })],
        }),
      );
    }
    children.push(new Paragraph({ children: [new TextRun(' ')] }));
  }

  const doc = new Document({
    creator: 'Roya Platform — AI Intelligence Center',
    title: i.title,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri' },
        },
      },
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

// ─── XLSX ─────────────────────────────────────────────────────────────────

async function toXlsx(i: SessionExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Roya Platform — AI Intelligence Center';
  wb.created = new Date();

  const sheet = wb.addWorksheet('التقرير', {
    views: [{ rightToLeft: true }],
  });

  sheet.columns = [
    { header: 'القسم', key: 'section', width: 32 },
    { header: 'المحتوى', key: 'body', width: 100 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: 'right', vertical: 'middle' };

  // Metadata block
  sheet.addRow({ section: 'العنوان', body: i.title });
  sheet.addRow({ section: 'تاريخ الإنشاء', body: i.createdAtIso });
  if (i.createdByName)
    sheet.addRow({ section: 'أنشئ بواسطة', body: i.createdByName });
  sheet.addRow({ section: 'النمط', body: i.outputModeAr });
  sheet.addRow({ section: 'المعايير', body: i.filtersSummaryAr });
  sheet.addRow({});

  for (const s of i.sections) {
    const body = (s.body || '').trim();
    if (!body) continue;
    const row = sheet.addRow({ section: titleFor(s.key), body });
    row.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
    row.getCell('section').font = { bold: true };
  }

  sheet.eachRow((row) => {
    row.alignment = { ...row.alignment, horizontal: 'right', wrapText: true };
  });

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

// ─── PPTX ─────────────────────────────────────────────────────────────────

async function toPptx(i: SessionExportInput): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.rtlMode = true;

  // Title slide
  const title = pres.addSlide();
  title.addText(i.title, {
    x: 0.5,
    y: 2,
    w: 12.3,
    h: 1.2,
    fontSize: 40,
    bold: true,
    align: 'center',
    color: '0F172A',
    rtlMode: true,
  });
  title.addText(
    [
      { text: `تاريخ الإنشاء: ${i.createdAtIso}`, options: { bullet: false } },
      ...(i.createdByName
        ? [{ text: `أنشئ بواسطة: ${i.createdByName}`, options: { bullet: false } }]
        : []),
      { text: `النمط: ${i.outputModeAr}`, options: { bullet: false } },
      { text: `المعايير: ${i.filtersSummaryAr}`, options: { bullet: false } },
    ],
    {
      x: 0.5,
      y: 3.5,
      w: 12.3,
      h: 2,
      fontSize: 16,
      align: 'center',
      color: '475569',
      rtlMode: true,
    },
  );

  for (const s of i.sections) {
    const body = (s.body || '').trim();
    if (!body) continue;
    const slide = pres.addSlide();
    slide.addText(titleFor(s.key), {
      x: 0.5,
      y: 0.3,
      w: 12.3,
      h: 0.8,
      fontSize: 28,
      bold: true,
      align: 'right',
      color: '0F172A',
      rtlMode: true,
    });
    // Split body into bullets on newline; collapse empty lines.
    const bullets = body
      .split('\n')
      .map((l) => l.replace(/^[-•]\s*/, '').trim())
      .filter((l) => l.length > 0);
    slide.addText(
      bullets.map((t) => ({ text: t, options: { bullet: true } })),
      {
        x: 0.5,
        y: 1.3,
        w: 12.3,
        h: 5.8,
        fontSize: 18,
        color: '1E293B',
        align: 'right',
        rtlMode: true,
        valign: 'top',
      },
    );
  }

  // pptxgenjs supports writeFile / write — use write with outputType 'nodebuffer'.
  const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  return buf;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

export async function exportSession(
  format: ExportFormat,
  input: SessionExportInput,
): Promise<ExportArtifact> {
  const base = safeBaseName(input);
  switch (format) {
    case 'txt':
      return {
        buffer: Buffer.from(toTxt(input), 'utf8'),
        filename: `${base}.txt`,
        contentType: 'text/plain; charset=utf-8',
      };
    case 'md':
      return {
        buffer: Buffer.from(toMarkdown(input), 'utf8'),
        filename: `${base}.md`,
        contentType: 'text/markdown; charset=utf-8',
      };
    case 'docx':
      return {
        buffer: await toDocx(input),
        filename: `${base}.docx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    case 'xlsx':
      return {
        buffer: await toXlsx(input),
        filename: `${base}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    case 'pptx':
      return {
        buffer: await toPptx(input),
        filename: `${base}.pptx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unsupported export format: ${_exhaustive}`);
    }
  }
}
