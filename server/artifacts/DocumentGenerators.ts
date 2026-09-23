import { z } from 'zod';
import * as docx from 'docx';
import ExcelJS from 'exceljs';
import pptxgen from 'pptxgenjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import path from 'path';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────
// SCHÉMAS ZOD DE VALIDATION POUR LES SPÉCIFICATIONS JSON (N2)
// ─────────────────────────────────────────────────────────────

export const TableSpecSchema = z.object({
  headers: z.array(z.string()).default([]),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
});

export const DocxSectionSchema = z.object({
  heading: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  bulletPoints: z.array(z.string()).optional(),
  table: TableSpecSchema.optional()
});

export const DocxSpecSchema = z.object({
  title: z.string().min(1, 'Le titre du document Word est requis.'),
  description: z.string().optional(),
  sections: z.array(DocxSectionSchema).min(1, 'Au moins une section est requise.')
});

export const XlsxSheetSchema = z.object({
  name: z.string().min(1, 'Le nom de la feuille est requis.'),
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).default([])
});

export const XlsxSpecSchema = z.object({
  title: z.string().optional(),
  sheets: z.array(XlsxSheetSchema).min(1, 'Au moins une feuille est requise.')
});

export const PptxSlideSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  textBlocks: z.array(z.string()).optional(),
  table: TableSpecSchema.optional()
});

export const PptxSpecSchema = z.object({
  title: z.string().min(1, 'Le titre de la présentation est requis.'),
  author: z.string().optional(),
  slides: z.array(PptxSlideSchema).min(1, 'Au moins une diapositive est requise.')
});

export const PdfPageSchema = z.object({
  title: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  lines: z.array(z.string()).optional(),
  bulletPoints: z.array(z.string()).optional()
});

export const PdfSpecSchema = z.object({
  title: z.string().min(1, 'Le titre du document PDF est requis.'),
  author: z.string().optional(),
  pages: z.array(PdfPageSchema).min(1, 'Au moins une page est requise.')
});

export const ZipEntrySchema = z.object({
  name: z.string().min(1, 'Le nom de fichier dans le ZIP est requis.'),
  content: z.string().optional(),
  sourcePath: z.string().optional()
});

export const ZipSpecSchema = z.object({
  entries: z.array(ZipEntrySchema).min(1, 'Au moins une entrée est requise dans l\'archive.')
});

export type DocxSpec = z.infer<typeof DocxSpecSchema>;
export type XlsxSpec = z.infer<typeof XlsxSpecSchema>;
export type PptxSpec = z.infer<typeof PptxSpecSchema>;
export type PdfSpec = z.infer<typeof PdfSpecSchema>;
export type ZipSpec = z.infer<typeof ZipSpecSchema>;

export type SupportedFormat = 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'zip';

// ─────────────────────────────────────────────────────────────
// GÉNÉRATEURS DE DOCUMENTS DÉDIÉS
// ─────────────────────────────────────────────────────────────

export class DocumentGenerators {
  /**
   * Génère un document Word (.docx) valide et ouvrable.
   */
  public static async generateDocx(spec: DocxSpec): Promise<Buffer> {
    const docChildren: any[] = [];

    // Titre principal
    docChildren.push(
      new docx.Paragraph({
        text: spec.title,
        heading: docx.HeadingLevel.TITLE,
        spacing: { after: 300 }
      })
    );

    if (spec.description) {
      docChildren.push(
        new docx.Paragraph({
          children: [new docx.TextRun({ text: spec.description, italics: true })],
          spacing: { after: 200 }
        })
      );
    }

    // Sections
    for (const section of spec.sections) {
      if (section.heading) {
        docChildren.push(
          new docx.Paragraph({
            text: section.heading,
            heading: docx.HeadingLevel.HEADING_1,
            spacing: { before: 250, after: 150 }
          })
        );
      }

      if (section.paragraphs) {
        for (const p of section.paragraphs) {
          docChildren.push(
            new docx.Paragraph({
              text: p,
              spacing: { after: 120 }
            })
          );
        }
      }

      if (section.bulletPoints) {
        for (const bp of section.bulletPoints) {
          docChildren.push(
            new docx.Paragraph({
              text: bp,
              bullet: { level: 0 },
              spacing: { after: 80 }
            })
          );
        }
      }

      if (section.table && section.table.rows) {
        const tableRows: docx.TableRow[] = [];

        // En-têtes
        if (section.table.headers && section.table.headers.length > 0) {
          tableRows.push(
            new docx.TableRow({
              children: section.table.headers.map(h =>
                new docx.TableCell({
                  children: [new docx.Paragraph({
                    children: [new docx.TextRun({ text: String(h), bold: true })]
                  })]
                })
              )
            })
          );
        }

        // Lignes
        for (const row of section.table.rows) {
          tableRows.push(
            new docx.TableRow({
              children: row.map(cell =>
                new docx.TableCell({
                  children: [new docx.Paragraph({ text: cell === null ? '' : String(cell) })]
                })
              )
            })
          );
        }

        docChildren.push(
          new docx.Table({
            rows: tableRows,
            width: { size: 100, type: docx.WidthType.PERCENTAGE }
          })
        );
      }
    }

    const doc = new docx.Document({
      sections: [{
        children: docChildren
      }]
    });

    const buffer = await docx.Packer.toBuffer(doc);
    return Buffer.from(buffer);
  }

  /**
   * Génère un classeur Excel (.xlsx) valide et ouvrable.
   */
  public static async generateXlsx(spec: XlsxSpec): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Iroko Code Agent';
    workbook.created = new Date();

    for (const sheetSpec of spec.sheets) {
      const sheet = workbook.addWorksheet(sheetSpec.name);

      if (sheetSpec.headers && sheetSpec.headers.length > 0) {
        sheet.addRow(sheetSpec.headers);
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true };
      }

      for (const row of sheetSpec.rows) {
        sheet.addRow(row);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Génère une présentation PowerPoint (.pptx) valide et ouvrable.
   */
  public static async generatePptx(spec: PptxSpec): Promise<Buffer> {
    // pptxgenjs peut être importé en ESM ou CommonJS
    const PptxCtor = (pptxgen as any).default || pptxgen;
    const pres = new PptxCtor();
    pres.author = spec.author || 'Iroko Code Agent';
    pres.title = spec.title;

    for (let i = 0; i < spec.slides.length; i++) {
      const slideSpec = spec.slides[i];
      const slide = pres.addSlide();

      // Diapositive de titre pour la première diapo si spécifiée
      if (i === 0 && slideSpec.title && !slideSpec.bullets && !slideSpec.table) {
        slide.addText(slideSpec.title, {
          x: 0.5,
          y: 2.0,
          w: '90%',
          h: 1.5,
          fontSize: 32,
          bold: true,
          color: '363636',
          align: 'center'
        });
        if (slideSpec.subtitle) {
          slide.addText(slideSpec.subtitle, {
            x: 0.5,
            y: 3.5,
            w: '90%',
            h: 1.0,
            fontSize: 18,
            color: '666666',
            align: 'center'
          });
        }
        continue;
      }

      let yOffset = 0.5;

      if (slideSpec.title) {
        slide.addText(slideSpec.title, {
          x: 0.5,
          y: yOffset,
          w: '90%',
          h: 0.8,
          fontSize: 24,
          bold: true,
          color: '363636'
        });
        yOffset += 0.9;
      }

      if (slideSpec.subtitle) {
        slide.addText(slideSpec.subtitle, {
          x: 0.5,
          y: yOffset,
          w: '90%',
          h: 0.5,
          fontSize: 15,
          italic: true,
          color: '666666'
        });
        yOffset += 0.6;
      }

      if (slideSpec.bullets && slideSpec.bullets.length > 0) {
        const bulletObjects = slideSpec.bullets.map(b => ({
          text: b,
          options: { bullet: true, fontSize: 14, color: '444444' }
        }));
        slide.addText(bulletObjects as any, {
          x: 0.5,
          y: yOffset,
          w: '90%',
          h: Math.min(3.5, slideSpec.bullets.length * 0.4 + 0.5)
        });
        yOffset += Math.min(3.5, slideSpec.bullets.length * 0.4 + 0.6);
      }

      if (slideSpec.textBlocks && slideSpec.textBlocks.length > 0) {
        for (const tb of slideSpec.textBlocks) {
          slide.addText(tb, {
            x: 0.5,
            y: yOffset,
            w: '90%',
            h: 0.6,
            fontSize: 13,
            color: '444444'
          });
          yOffset += 0.7;
        }
      }

      if (slideSpec.table && slideSpec.table.rows && slideSpec.table.rows.length > 0) {
        const tableData: any[][] = [];
        if (slideSpec.table.headers && slideSpec.table.headers.length > 0) {
          tableData.push(
            slideSpec.table.headers.map(h => ({
              text: h,
              options: { bold: true, fill: 'EEEEEE', color: '222222' }
            }))
          );
        }
        for (const row of slideSpec.table.rows) {
          tableData.push(row.map(c => ({ text: c === null ? '' : String(c) })));
        }
        slide.addTable(tableData, {
          x: 0.5,
          y: yOffset,
          w: '90%'
        });
      }
    }

    const out = await pres.write({ outputType: 'nodebuffer' });
    return Buffer.isBuffer(out) ? out : Buffer.from(out as any);
  }

  /**
   * Génère un document PDF valide et consultable via pdf-lib.
   */
  public static async generatePdf(spec: PdfSpec): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(spec.title);
    if (spec.author) pdfDoc.setAuthor(spec.author);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    for (const pageSpec of spec.pages) {
      const page = pdfDoc.addPage([595.28, 841.89]); // A4 en points
      const { height } = page.getSize();
      let currentY = height - 50;

      // Titre principal du document sur la première page ou titre de section
      const titleToPrint = pageSpec.title || spec.title;
      page.drawText(titleToPrint, {
        x: 50,
        y: currentY,
        size: 18,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1)
      });
      currentY -= 35;

      if (pageSpec.paragraphs) {
        for (const para of pageSpec.paragraphs) {
          if (currentY < 60) break;
          // Découpage sommaire des lignes pour ne pas déborder
          const words = para.split(' ');
          let line = '';
          for (const w of words) {
            const testLine = line + (line ? ' ' : '') + w;
            const textWidth = font.widthOfTextAtSize(testLine, 11);
            if (textWidth > 495 && line) {
              page.drawText(line, { x: 50, y: currentY, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
              currentY -= 16;
              line = w;
              if (currentY < 60) break;
            } else {
              line = testLine;
            }
          }
          if (line && currentY >= 60) {
            page.drawText(line, { x: 50, y: currentY, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
            currentY -= 22;
          }
        }
      }

      if (pageSpec.bulletPoints) {
        for (const bp of pageSpec.bulletPoints) {
          if (currentY < 60) break;
          page.drawText(`•  ${bp}`, {
            x: 65,
            y: currentY,
            size: 11,
            font,
            color: rgb(0.2, 0.2, 0.2)
          });
          currentY -= 18;
        }
        currentY -= 10;
      }

      if (pageSpec.lines) {
        for (const l of pageSpec.lines) {
          if (currentY < 60) break;
          page.drawText(l, {
            x: 50,
            y: currentY,
            size: 10,
            font,
            color: rgb(0.25, 0.25, 0.25)
          });
          currentY -= 15;
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Génère une archive ZIP à partir de fichiers existants ou de contenu texte.
   */
  public static async generateZip(
    spec: ZipSpec,
    options?: { workspacePath?: string }
  ): Promise<Buffer> {
    const zip = new JSZip();

    for (const entry of spec.entries) {
      if (entry.content !== undefined) {
        zip.file(entry.name, entry.content);
      } else if (entry.sourcePath) {
        if (!options?.workspacePath) {
          throw new Error(`Impossible de lire "${entry.sourcePath}" sans dossier de travail actif.`);
        }
        const resolved = path.resolve(options.workspacePath, entry.sourcePath);
        // Confinement strict : sourcePath doit être sous workspacePath
        const normalizedBase = path.normalize(options.workspacePath).toLowerCase();
        const normalizedResolved = path.normalize(resolved).toLowerCase();
        if (!normalizedResolved.startsWith(normalizedBase)) {
          throw new Error(`Accès interdit : "${entry.sourcePath}" réside hors du dossier de travail.`);
        }
        if (!fs.existsSync(resolved)) {
          throw new Error(`Fichier introuvable pour inclusion dans l'archive ZIP : "${entry.sourcePath}".`);
        }
        const data = fs.readFileSync(resolved);
        zip.file(entry.name, data);
      } else {
        zip.file(entry.name, '');
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    return zipBuffer;
  }

  /**
   * Point d'entrée universel pour la génération N2.
   */
  public static async generate(
    format: SupportedFormat,
    spec: unknown,
    options?: { workspacePath?: string }
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    switch (format) {
      case 'docx': {
        const validated = DocxSpecSchema.parse(spec);
        const buffer = await this.generateDocx(validated);
        return {
          buffer,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
      }
      case 'xlsx': {
        const validated = XlsxSpecSchema.parse(spec);
        const buffer = await this.generateXlsx(validated);
        return {
          buffer,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };
      }
      case 'pptx': {
        const validated = PptxSpecSchema.parse(spec);
        const buffer = await this.generatePptx(validated);
        return {
          buffer,
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        };
      }
      case 'pdf': {
        const validated = PdfSpecSchema.parse(spec);
        const buffer = await this.generatePdf(validated);
        return {
          buffer,
          mimeType: 'application/pdf'
        };
      }
      case 'zip': {
        const validated = ZipSpecSchema.parse(spec);
        const buffer = await this.generateZip(validated, options);
        return {
          buffer,
          mimeType: 'application/zip'
        };
      }
      default:
        throw new Error(`Format de document non pris en charge : "${format}". Formats autorisés : docx, xlsx, pptx, pdf, zip.`);
    }
  }
}
