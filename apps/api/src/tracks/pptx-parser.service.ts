import { Injectable, Logger } from '@nestjs/common';
import * as JSZip from 'jszip';

export interface SlideContent {
  slideNumber: number;
  title: string;
  bullets: string[];
  notes: string;
  rawText: string;
  tables: string[][]; // rows of cells
  images: SlideImage[];
}

export interface SlideImage {
  name: string;
  mimeType: string;
  base64: string; // data URI ready for GPT-4o vision
}

export interface PptxParseResult {
  slides: SlideContent[];
  totalSlides: number;
  fullText: string;
  hasImages: boolean;
  hasTables: boolean;
}

@Injectable()
export class PptxParserService {
  private readonly logger = new Logger('PptxParserService');

  async parse(buffer: Buffer): Promise<PptxParseResult> {
    const zip = await JSZip.loadAsync(buffer);

    // Find all slide XML files
    const slideFiles: string[] = [];
    zip.forEach((path) => {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
        slideFiles.push(path);
      }
    });

    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
      return numA - numB;
    });

    // Find notes files
    const notesFiles: Record<number, string> = {};
    zip.forEach((path) => {
      const match = path.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);
      if (match) notesFiles[parseInt(match[1])] = path;
    });

    // Build slide-to-rels mapping for image extraction
    const slideRels: Record<string, Record<string, string>> = {};
    for (const slidePath of slideFiles) {
      const slideNum = slidePath.match(/slide(\d+)\.xml/)?.[1] || '0';
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      const relsFile = zip.file(relsPath);
      if (relsFile) {
        const relsXml = await relsFile.async('text');
        const rels: Record<string, string> = {};
        const relMatches = relsXml.match(/<Relationship[^>]*>/g) || [];
        for (const rel of relMatches) {
          const idMatch = rel.match(/Id="([^"]+)"/);
          const targetMatch = rel.match(/Target="([^"]+)"/);
          if (idMatch && targetMatch) {
            rels[idMatch[1]] = targetMatch[1];
          }
        }
        slideRels[slidePath] = rels;
      }
    }

    let hasImages = false;
    let hasTables = false;
    const slides: SlideContent[] = [];

    for (const slidePath of slideFiles) {
      const slideNum = parseInt(slidePath.match(/slide(\d+)\.xml/)?.[1] || '0');
      const xml = await zip.file(slidePath)!.async('text');

      const texts = this.extractTexts(xml);
      const title = texts[0] || '';
      const bullets = texts.slice(1).filter(t => t.trim().length > 0);

      // Extract tables
      const tables = this.extractTables(xml);
      if (tables.length > 0) hasTables = true;

      // Extract images
      const images: SlideImage[] = [];
      const rels = slideRels[slidePath] || {};
      const imageRefs = this.extractImageRefs(xml);

      for (const ref of imageRefs) {
        const target = rels[ref];
        if (!target) continue;
        // Resolve relative path
        const imgPath = target.startsWith('/')
          ? target.substring(1)
          : `ppt/slides/${target}`.replace(/\/\.\.\//g, '/').replace(/[^/]+\/\.\.\//g, '');

        // Normalize the path
        const normalizedPath = this.normalizePath(imgPath);
        const imgFile = zip.file(normalizedPath);
        if (!imgFile) continue;

        const ext = normalizedPath.split('.').pop()?.toLowerCase() || '';
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
          tiff: 'image/tiff', tif: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf',
        };

        // Only extract raster images that GPT-4o can analyze
        if (!['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(ext)) continue;

        try {
          const imgBuffer = await imgFile.async('base64');
          const mimeType = mimeMap[ext] || 'image/png';
          images.push({
            name: normalizedPath.split('/').pop() || `image_${ref}`,
            mimeType,
            base64: `data:${mimeType};base64,${imgBuffer}`,
          });
          hasImages = true;
        } catch (e) {
          this.logger.warn(`Failed to extract image ${normalizedPath}: ${e}`);
        }
      }

      // Parse notes if available
      let notes = '';
      if (notesFiles[slideNum]) {
        const notesXml = await zip.file(notesFiles[slideNum])!.async('text');
        const noteTexts = this.extractTexts(notesXml);
        notes = noteTexts.filter(t => t.trim().length > 0 && !t.match(/^\d+$/)).join('\n');
      }

      slides.push({
        slideNumber: slideNum,
        title,
        bullets,
        notes,
        rawText: texts.join('\n'),
        tables,
        images,
      });
    }

    const fullText = slides
      .map(s => {
        let text = `--- Slide ${s.slideNumber} ---\n${s.title}\n${s.bullets.join('\n')}`;
        if (s.tables.length > 0) {
          text += '\n[Table Data:';
          for (const row of s.tables) {
            text += '\n  ' + row.join(' | ');
          }
          text += '\n]';
        }
        if (s.images.length > 0) {
          text += `\n[${s.images.length} image(s) attached]`;
        }
        if (s.notes) text += `\n[Notes: ${s.notes}]`;
        return text;
      })
      .join('\n\n');

    return { slides, totalSlides: slides.length, fullText, hasImages, hasTables };
  }

  private normalizePath(path: string): string {
    const parts = path.split('/');
    const normalized: string[] = [];
    for (const part of parts) {
      if (part === '..') normalized.pop();
      else if (part !== '.' && part !== '') normalized.push(part);
    }
    return normalized.join('/');
  }

  private extractImageRefs(xml: string): string[] {
    const clean = xml
      .replace(/<\/?[a-zA-Z]+:/g, (m) => m.replace(/[a-zA-Z]+:/, ''))
      .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '');

    const refs: string[] = [];
    // Match blipFill > blip elements with r:embed attribute
    const embedMatches = xml.match(/r:embed="([^"]+)"/g) || [];
    for (const m of embedMatches) {
      const id = m.match(/r:embed="([^"]+)"/)?.[1];
      if (id) refs.push(id);
    }
    return refs;
  }

  private extractTables(xml: string): string[][] {
    const clean = xml
      .replace(/<\/?[a-zA-Z]+:/g, (m) => m.replace(/[a-zA-Z]+:/, ''))
      .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '');

    const tables: string[][] = [];
    // Find <tbl> table blocks
    const tblBlocks = clean.match(/<tbl>[\s\S]*?<\/tbl>/g) || [];

    for (const tbl of tblBlocks) {
      // Each <tr> is a row
      const rows = tbl.match(/<tr[\s\S]*?<\/tr>/g) || [];
      for (const row of rows) {
        const cells: string[] = [];
        // Each <tc> is a cell
        const tcs = row.match(/<tc[\s\S]*?<\/tc>/g) || [];
        for (const tc of tcs) {
          const tMatches = tc.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
          const cellText = tMatches
            .map(t => t.replace(/<t[^>]*>([\s\S]*?)<\/t>/, '$1'))
            .join(' ')
            .trim();
          cells.push(cellText);
        }
        if (cells.some(c => c.length > 0)) tables.push(cells);
      }
    }

    return tables;
  }

  private extractTexts(xml: string): string[] {
    const clean = xml
      .replace(/<\/?[a-zA-Z]+:/g, (m) => m.replace(/[a-zA-Z]+:/, ''))
      .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '');

    const texts: string[] = [];

    const spBlocks = clean.match(/<sp>[\s\S]*?<\/sp>/g) || [];

    for (const sp of spBlocks) {
      const paragraphs = sp.match(/<p>[\s\S]*?<\/p>/g) || [];
      const shapeTexts: string[] = [];

      for (const p of paragraphs) {
        const tMatches = p.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        const lineText = tMatches
          .map(t => t.replace(/<t[^>]*>([\s\S]*?)<\/t>/, '$1'))
          .join('')
          .trim();
        if (lineText) shapeTexts.push(lineText);
      }

      if (shapeTexts.length > 0) {
        texts.push(...shapeTexts);
      }
    }

    return texts;
  }
}
