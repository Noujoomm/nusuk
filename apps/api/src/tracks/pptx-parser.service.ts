import { Injectable, Logger } from '@nestjs/common';
import * as JSZip from 'jszip';

export interface SlideContent {
  slideNumber: number;
  title: string;
  bullets: string[];
  notes: string;
  rawText: string;
}

export interface PptxParseResult {
  slides: SlideContent[];
  totalSlides: number;
  fullText: string;
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

    // Sort by slide number
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

    const slides: SlideContent[] = [];

    for (const slidePath of slideFiles) {
      const slideNum = parseInt(slidePath.match(/slide(\d+)\.xml/)?.[1] || '0');
      const xml = await zip.file(slidePath)!.async('text');

      const texts = this.extractTexts(xml);
      const title = texts[0] || '';
      const bullets = texts.slice(1).filter(t => t.trim().length > 0);

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
      });
    }

    const fullText = slides
      .map(s => `--- Slide ${s.slideNumber} ---\n${s.title}\n${s.bullets.join('\n')}${s.notes ? '\n[Notes: ' + s.notes + ']' : ''}`)
      .join('\n\n');

    return { slides, totalSlides: slides.length, fullText };
  }

  private extractTexts(xml: string): string[] {
    // Strip namespace prefixes for easier parsing
    const clean = xml
      .replace(/<\/?[a-zA-Z]+:/g, (m) => m.replace(/[a-zA-Z]+:/, ''))
      .replace(/\s+xmlns(?::\w+)?="[^"]*"/g, '');

    const texts: string[] = [];

    // Extract text from <sp> (shape) elements - each shape is typically a text block
    const spBlocks = clean.match(/<sp>[\s\S]*?<\/sp>/g) || [];

    for (const sp of spBlocks) {
      // Each <p> (paragraph) within the shape
      const paragraphs = sp.match(/<p>[\s\S]*?<\/p>/g) || [];
      const shapeTexts: string[] = [];

      for (const p of paragraphs) {
        // Extract all <t> text nodes within this paragraph
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
