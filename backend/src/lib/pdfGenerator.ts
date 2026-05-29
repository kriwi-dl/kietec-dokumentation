import PDFDocument from 'pdfkit';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { thumbnailPath } from './fileStorage';

type PdfDoc = InstanceType<typeof PDFDocument>;

// === BRANDING (hier ggf. anpassen) ===
const LOGO_PATH = path.resolve(process.cwd(), 'src/assets/kietec-logo.png');
const COMPANY_NAME = 'KDS Kienitz UG';
const COMPANY_SUBLINE = 'Photovoltaik-Installation';
const COLOR_PRIMARY = '#15414a';
const COLOR_TEXT = '#0f1419';
const COLOR_MUTED = '#6b7280';
const COLOR_BORDER = '#e5e7eb';
const COLOR_SUCCESS = '#0d6e3a';

// === Layout ===
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_WIDTH = 595 - 2 * MARGIN;

export interface PdfData {
  id: string;
  status: string;
  wetter: string | null;
  bemerkung: string | null;
  arbeitsstunden: number | null;
  startedAt: Date;
  completedAt: Date | null;
  vorarbeiter: { name: string; email: string };
  auftrag: {
    sevdeskOrderNumber: string;
    customerName: string;
    customerAddress: string | null;
    orderDate: Date | null;
    positions: Array<{
      id: string;
      sevdeskPosNumber: string | null;
      bezeichnung: string;
      menge: number;
      einheit: string | null;
      serialNumber: string | null;
      verbaut: boolean;
      verbautAm: Date | null;
      bemerkung: string | null;
      verbautVon: { name: string } | null;
      abnahmen: Array<{
        signerName: string;
        signedAt: Date;
        typ: string;
        signatureData: string | null;
      }>;
    }>;
  };
  fotos: Array<{
    id: string;
    dokumentationId: string;
    filename: string;
    kategorie: string;
    beschreibung: string | null;
  }>;
  unterschriften: Array<{
    typ: string;
    signerName: string;
    signedAt: Date;
    signatureData: string;
    positionId: string | null;
  }>;
}

export async function generatePdf(data: PdfData, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Lieferschein ${data.auftrag.sevdeskOrderNumber}`,
        Author: `${COMPANY_NAME} · KieTec-Dokumentation`,
        Creator: 'KieTec-Dokumentation',
      },
    });

    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('finish', () => resolve());
    stream.on('error', reject);

    try {
      buildHeader(doc, data);
      buildAuftragInfo(doc, data);
      buildKundenInfo(doc, data);
      buildBedingungen(doc, data);
      buildPositionen(doc, data);
      buildFotos(doc, data);
      buildSchlussunterschriften(doc, data);
      buildFooter(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// === Utilities ===

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '–';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ensureSpace(doc: PdfDoc, needed: number) {
  if (doc.y + needed > PAGE_HEIGHT - MARGIN - 35) {
    doc.addPage();
  }
}

function sectionHeader(doc: PdfDoc, title: string) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_PRIMARY)
    .text(title.toUpperCase(), MARGIN, doc.y, {
      characterSpacing: 1.5, lineBreak: false,
    });
  doc.y += 16;
  doc.fillColor(COLOR_TEXT);
}

function keyValueRow(doc: PdfDoc, label: string, value: string) {
  const labelWidth = 120;
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
    .text(label, MARGIN, y, { lineBreak: false, width: labelWidth });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXT)
    .text(value, MARGIN + labelWidth, y - 1, {
      lineBreak: true, width: CONTENT_WIDTH - labelWidth,
    });
  doc.y = Math.max(doc.y, y + 15);
}

function drawCheckmark(doc: PdfDoc, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.strokeColor(color).lineWidth(Math.max(1, size * 0.18))
    .lineCap('round').lineJoin('round')
    .moveTo(x, y + size * 0.55)
    .lineTo(x + size * 0.4, y + size * 0.85)
    .lineTo(x + size * 0.95, y + size * 0.15)
    .stroke();
  doc.restore();
}

// === Sections ===

function buildHeader(doc: PdfDoc, data: PdfData) {
  const top = MARGIN;
  const logoHeight = 45;

  if (existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, MARGIN, top, { height: logoHeight });
    } catch { /* ignore */ }
  }

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXT)
    .text(COMPANY_NAME, MARGIN, top + 6, {
      width: CONTENT_WIDTH, align: 'right', lineBreak: false,
    });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
    .text(COMPANY_SUBLINE, MARGIN, top + 22, {
      width: CONTENT_WIDTH, align: 'right', lineBreak: false,
    });
  doc.fontSize(9).text('Abnahme-Dokumentation', MARGIN, top + 34, {
    width: CONTENT_WIDTH, align: 'right', lineBreak: false,
  });

  const barY = top + logoHeight + 12;
  doc.strokeColor(COLOR_PRIMARY).lineWidth(1.5)
    .moveTo(MARGIN, barY).lineTo(MARGIN + CONTENT_WIDTH, barY).stroke();

  doc.y = barY + 18;

  const titleY = doc.y;
  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLOR_PRIMARY)
    .text(data.auftrag.sevdeskOrderNumber, MARGIN, titleY, {
      width: CONTENT_WIDTH / 2, lineBreak: false,
    });

  const completed = data.completedAt ?? data.startedAt;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
    .text('Abgeschlossen', MARGIN, titleY + 4, {
      width: CONTENT_WIDTH, align: 'right', lineBreak: false,
    });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXT)
    .text(fmtDate(completed), MARGIN, titleY + 18, {
      width: CONTENT_WIDTH, align: 'right', lineBreak: false,
    });

  doc.y = titleY + 40;
  doc.fillColor(COLOR_TEXT);
}

function buildAuftragInfo(doc: PdfDoc, data: PdfData) {
  sectionHeader(doc, 'Auftrag');
  keyValueRow(doc, 'Vorarbeiter', data.vorarbeiter.name);
  keyValueRow(doc, 'Status', data.status);
  doc.y += 10;
}

function buildKundenInfo(doc: PdfDoc, data: PdfData) {
  sectionHeader(doc, 'Kunde');
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXT);
  const lines = (data.auftrag.customerAddress ?? data.auftrag.customerName).split('\n');
  lines.forEach(line => {
    doc.text(line, MARGIN, doc.y);
  });
  doc.y += 10;
}

function buildBedingungen(doc: PdfDoc, data: PdfData) {
  if (!data.wetter && !data.bemerkung && data.arbeitsstunden == null) return;
  sectionHeader(doc, 'Arbeitsbedingungen');
  if (data.wetter) keyValueRow(doc, 'Wetter', data.wetter);
  if (data.arbeitsstunden) keyValueRow(doc, 'Arbeitsstunden', `${data.arbeitsstunden} h`);
  if (data.bemerkung) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
      .text('Bemerkung', MARGIN, y, { lineBreak: false, width: 120 });
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXT)
      .text(data.bemerkung, MARGIN + 120, y - 1, {
        lineBreak: true, width: CONTENT_WIDTH - 120,
      });
  }
  doc.y += 10;
}

function buildPositionen(doc: PdfDoc, data: PdfData) {
  ensureSpace(doc, 60);
  sectionHeader(doc, 'Verbaute Positionen');

  data.auftrag.positions.forEach((pos, idx) => {
    ensureSpace(doc, 70 + pos.abnahmen.length * 58);
    const startY = doc.y;
    const indent = MARGIN + 14;
    const innerWidth = CONTENT_WIDTH - 18;

    // Title
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXT)
      .text(`${pos.sevdeskPosNumber ?? idx + 1}. ${pos.bezeichnung}`, indent, startY + 8, {
        width: innerWidth,
      });

    // Menge
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
      .text(`Menge: ${pos.menge}${pos.einheit ? ' ' + pos.einheit : ''}`, indent, doc.y, {
        lineBreak: false, width: innerWidth,
      });
    doc.y += 13;

    // Serial
    if (pos.serialNumber) {
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
        .text(`Serial-Nr.: ${pos.serialNumber}`, indent, doc.y, {
          lineBreak: false, width: innerWidth,
        });
      doc.y += 13;
    }

    // Verbaut
    if (pos.verbaut) {
      const verbY = doc.y;
      drawCheckmark(doc, indent, verbY + 1, 10, COLOR_SUCCESS);
      const installer = pos.verbautVon?.name ?? 'unbekannt';
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_SUCCESS)
        .text(`Verbaut durch ${installer} am ${fmtDate(pos.verbautAm)}`, indent + 16, verbY, {
          lineBreak: false, width: innerWidth - 16,
        });
      doc.y = verbY + 13;
    } else {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR_MUTED)
        .text('Nicht verbaut', indent, doc.y, { lineBreak: false });
      doc.y += 13;
    }

    if (pos.bemerkung) {
      doc.font('Helvetica').fontSize(9).fillColor(COLOR_TEXT)
        .text(pos.bemerkung, indent, doc.y, { width: innerWidth });
    }

    if (pos.abnahmen.length > 0) {
      doc.y += 4;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_PRIMARY)
        .text('Abnahme durch Kunden', indent, doc.y, { lineBreak: false });
      doc.y += 14;

      pos.abnahmen.forEach(a => {
        const sigY = doc.y;
        // Unterschriftsbild
        if (a.signatureData) {
          try {
            const buf = Buffer.from(a.signatureData, 'base64');
            doc.image(buf, indent, sigY, { fit: [150, 34], align: 'left', valign: 'top' });
          } catch { /* ignore */ }
        }
        // Trennlinie unter der Unterschrift
        const lineY = sigY + 36;
        doc.strokeColor(COLOR_BORDER).lineWidth(0.5)
          .moveTo(indent, lineY).lineTo(indent + 150, lineY).stroke();
        // Name + Datum
        doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
          .text(`${a.signerName} · ${fmtDate(a.signedAt)}`, indent, lineY + 3, {
            lineBreak: false, width: 150,
          });
        doc.y = lineY + 16;
      });
    }

    const totalH = doc.y - startY + 6;
    doc.strokeColor(COLOR_BORDER).lineWidth(0.7)
      .roundedRect(MARGIN, startY, CONTENT_WIDTH, totalH, 4).stroke();
    doc.fillColor(COLOR_PRIMARY)
      .rect(MARGIN, startY, 3, totalH).fill();
    doc.fillColor(COLOR_TEXT);
    doc.y = startY + totalH + 8;
  });

  doc.y += 4;
}

function buildFotos(doc: PdfDoc, data: PdfData) {
  if (data.fotos.length === 0) return;
  ensureSpace(doc, 130);
  sectionHeader(doc, `Fotodokumentation (${data.fotos.length})`);

  const cols = 3;
  const gap = 8;
  const imgWidth = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
  const imgHeight = imgWidth * 0.7;
  const captionH = 14;

  let col = 0;
  data.fotos.forEach(foto => {
    if (col === 0) ensureSpace(doc, imgHeight + captionH + 10);
    const x = MARGIN + col * (imgWidth + gap);
    const y = doc.y;

    try {
      doc.image(thumbnailPath(foto.dokumentationId, foto.filename), x, y, {
        fit: [imgWidth, imgHeight],
        align: 'center', valign: 'center',
      });
    } catch {
      doc.strokeColor(COLOR_BORDER).rect(x, y, imgWidth, imgHeight).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
        .text('Bild nicht verfügbar', x, y + imgHeight / 2 - 5, {
          width: imgWidth, align: 'center',
        });
    }

    doc.font('Helvetica').fontSize(7).fillColor(COLOR_MUTED)
      .text(foto.kategorie, x, y + imgHeight + 3, {
        width: imgWidth, align: 'center', characterSpacing: 0.5, lineBreak: false,
      });

    col++;
    if (col >= cols) {
      col = 0;
      doc.y = y + imgHeight + captionH + 6;
    } else {
      doc.y = y;
    }
  });
  if (col !== 0) doc.y = doc.y + imgHeight + captionH + 6;
  doc.fillColor(COLOR_TEXT);
}

function buildSchlussunterschriften(doc: PdfDoc, data: PdfData) {
  const schluss = data.unterschriften.filter(u => u.positionId === null);
  if (schluss.length === 0) return;

  ensureSpace(doc, 130);
  sectionHeader(doc, 'Schlussunterschriften');

  const monteur = schluss.find(u => u.typ === 'MONTEUR');
  const kunde = schluss.find(u => u.typ === 'KUNDE');

  const gap = 30;
  const boxWidth = (CONTENT_WIDTH - gap) / 2;
  const boxHeight = 65;
  const startY = doc.y;

  renderSigBox(doc, MARGIN, startY, boxWidth, boxHeight, 'Monteur', monteur);
  renderSigBox(doc, MARGIN + boxWidth + gap, startY, boxWidth, boxHeight, 'Kunde', kunde);

  doc.y = startY + boxHeight + 45;
}

function renderSigBox(
  doc: PdfDoc,
  x: number, y: number,
  width: number, height: number,
  role: string,
  sig: PdfData['unterschriften'][number] | undefined
) {
  doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
    .text(role.toUpperCase(), x, y, {
      lineBreak: false, characterSpacing: 1.2,
    });

  if (sig) {
    try {
      const buf = Buffer.from(sig.signatureData, 'base64');
      doc.image(buf, x, y + 12, {
        fit: [width, height - 12],
        align: 'left', valign: 'top',
      });
    } catch { /* ignore */ }
  }

  const lineY = y + height + 4;
  doc.strokeColor(COLOR_TEXT).lineWidth(0.5)
    .moveTo(x, lineY).lineTo(x + width, lineY).stroke();

  if (sig) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXT)
      .text(sig.signerName, x, lineY + 5, { lineBreak: false, width });
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
      .text(fmtDate(sig.signedAt), x, lineY + 19, { lineBreak: false, width });
  } else {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR_MUTED)
      .text('Keine Unterschrift', x, lineY + 5, { lineBreak: false, width });
  }
}

function buildFooter(doc: PdfDoc) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const createdAt = fmtDate(new Date());

  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    const pageNum = i - range.start + 1;
    const footerY = PAGE_HEIGHT - 28;

    doc.strokeColor(COLOR_BORDER).lineWidth(0.5)
      .moveTo(MARGIN, footerY - 6).lineTo(MARGIN + CONTENT_WIDTH, footerY - 6).stroke();

    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_MUTED).text(
      `${COMPANY_NAME} · Erstellt am ${createdAt}`,
      MARGIN, footerY,
      { width: CONTENT_WIDTH / 2, lineBreak: false, align: 'left' },
    );
    doc.text(
      `Seite ${pageNum} von ${total}`,
      MARGIN + CONTENT_WIDTH / 2, footerY,
      { width: CONTENT_WIDTH / 2, lineBreak: false, align: 'right' },
    );
  }
}