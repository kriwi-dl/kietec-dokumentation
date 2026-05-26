import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { thumbnailPath } from './fileStorage';

type PdfDoc = InstanceType<typeof PDFDocument>;

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

const COLOR_PRIMARY = '#003366';
const COLOR_MUTED = '#666666';
const COLOR_LIGHT_BG = '#f5f5f5';
const PAGE_WIDTH = 595;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

export async function generatePdf(data: PdfData, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: {
        Title: `Lieferschein ${data.auftrag.sevdeskOrderNumber}`,
        Author: 'KieTec-Dokumentations-App',
        Creator: 'KieTec-Dokumentations-App'
      }
    });

    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('finish', () => resolve());
    stream.on('error', reject);

    try {
      buildHeader(doc, data);
      buildAuftragsInfo(doc, data);
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

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '–';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function ensureSpace(doc: PdfDoc, needed: number) {
  if (doc.y + needed > doc.page.height - MARGIN) {
    doc.addPage();
  }
}

function buildHeader(doc: PdfDoc, data: PdfData) {
  doc.fontSize(22).fillColor(COLOR_PRIMARY).font('Helvetica-Bold')
     .text('Lieferschein', MARGIN, MARGIN, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(13).font('Helvetica')
     .text('Abnahmedokumentation', { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(COLOR_MUTED)
     .text('KDS Kienitz UG · Photovoltaik-Installation', { align: 'center', width: CONTENT_WIDTH });
  doc.moveDown(0.5);
  doc.strokeColor(COLOR_PRIMARY).lineWidth(2)
     .moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke();
  doc.moveDown(1);
  doc.fillColor('black');
}

function buildAuftragsInfo(doc: PdfDoc, data: PdfData) {
  doc.fontSize(11).font('Helvetica-Bold').fillColor(COLOR_PRIMARY).text('AUFTRAG');
  doc.fillColor('black').font('Helvetica').fontSize(10);
  doc.moveDown(0.2);

  const labelWidth = 130;
  const valueX = MARGIN + labelWidth;

  let row = (label: string, value: string) => {
    const y = doc.y;
    doc.font('Helvetica-Bold').text(label, MARGIN, y);
    doc.font('Helvetica').text(value, valueX, y);
  };
  row('Auftragsnummer:', data.auftrag.sevdeskOrderNumber);
  row('Status:', data.status);
  row('Vorarbeiter:', data.vorarbeiter.name);
  if (data.completedAt) row('Abgeschlossen:', fmtDate(data.completedAt));
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fillColor(COLOR_PRIMARY).fontSize(11).text('KUNDE');
  doc.fillColor('black').font('Helvetica').fontSize(10);
  doc.moveDown(0.2);
  const customerLines = (data.auftrag.customerAddress ?? data.auftrag.customerName).split('\n');
  customerLines.forEach(line => doc.text(line));
  doc.moveDown(0.5);

  if (data.wetter || data.bemerkung || data.arbeitsstunden) {
    doc.font('Helvetica-Bold').fillColor(COLOR_PRIMARY).fontSize(11).text('ARBEITSBEDINGUNGEN');
    doc.fillColor('black').font('Helvetica').fontSize(10);
    doc.moveDown(0.2);
    if (data.wetter) doc.text(`Wetter: ${data.wetter}`);
    if (data.arbeitsstunden) doc.text(`Arbeitsstunden: ${data.arbeitsstunden} h`);
    if (data.bemerkung) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').text('Bemerkung:');
      doc.font('Helvetica').text(data.bemerkung, { width: CONTENT_WIDTH });
    }
    doc.moveDown(0.5);
  }
}

function buildPositionen(doc: PdfDoc, data: PdfData) {
  ensureSpace(doc, 100);
  doc.font('Helvetica-Bold').fillColor(COLOR_PRIMARY).fontSize(11).text('VERBAUTE POSITIONEN');
  doc.fillColor('black').font('Helvetica').fontSize(9);
  doc.moveDown(0.3);

  data.auftrag.positions.forEach((pos, idx) => {
    ensureSpace(doc, 80);
    const startY = doc.y;

    doc.rect(MARGIN, startY, CONTENT_WIDTH, 14).fill(COLOR_LIGHT_BG);
    doc.fillColor('black').font('Helvetica-Bold').fontSize(9.5);
    doc.text(`${pos.sevdeskPosNumber ?? (idx + 1)}. ${pos.bezeichnung}`, MARGIN + 5, startY + 3, {
      width: CONTENT_WIDTH - 10
    });
    doc.font('Helvetica').fontSize(9);
    doc.y = startY + 16;

    const indent = MARGIN + 10;
    doc.text(`Menge: ${pos.menge}${pos.einheit ? ' ' + pos.einheit : ''}`, indent, doc.y);
    if (pos.serialNumber) doc.text(`Serial-Nr.: ${pos.serialNumber}`, indent);
    if (pos.verbaut) {
      const installer = pos.verbautVon?.name ?? 'unbekannt';
      doc.fillColor('#1a7a1a').text(`Verbaut: ✓  durch ${installer}  am ${fmtDate(pos.verbautAm)}`, indent);
      doc.fillColor('black');
    } else {
      doc.fillColor('#888').text('Nicht verbaut', indent);
      doc.fillColor('black');
    }
    if (pos.bemerkung) {
      doc.text(`Bemerkung: ${pos.bemerkung}`, indent, doc.y, { width: CONTENT_WIDTH - 20 });
    }

    if (pos.abnahmen.length > 0) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLOR_MUTED)
         .text('Teilabnahmen:', indent);
      doc.font('Helvetica').fontSize(8.5);
      pos.abnahmen.forEach(a => {
        doc.text(`  • ${a.signerName} (${a.typ}) am ${fmtDate(a.signedAt)}`, indent + 5);
      });
      doc.fillColor('black').fontSize(9);
    }
    doc.moveDown(0.4);
  });
  doc.moveDown(0.5);
}

function buildFotos(doc: PdfDoc, data: PdfData) {
  if (data.fotos.length === 0) return;
  ensureSpace(doc, 200);
  doc.font('Helvetica-Bold').fillColor(COLOR_PRIMARY).fontSize(11)
     .text(`FOTODOKUMENTATION (${data.fotos.length})`);
  doc.fillColor('black').font('Helvetica').fontSize(9);
  doc.moveDown(0.3);

  const cols = 3;
  const gap = 10;
  const imgWidth = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
  const imgHeight = imgWidth * 0.75;

  let col = 0;
  data.fotos.forEach(foto => {
    if (col === 0) ensureSpace(doc, imgHeight + 30);
    const x = MARGIN + col * (imgWidth + gap);
    const y = doc.y;

    try {
      doc.image(thumbnailPath(foto.dokumentationId, foto.filename), x, y, {
        fit: [imgWidth, imgHeight],
        align: 'center',
        valign: 'center'
      });
    } catch {
      doc.rect(x, y, imgWidth, imgHeight).stroke();
      doc.text('(Bild nicht verfügbar)', x, y + imgHeight / 2 - 5, { width: imgWidth, align: 'center' });
    }
    doc.fontSize(8).fillColor(COLOR_MUTED).text(foto.kategorie, x, y + imgHeight + 2, {
      width: imgWidth, align: 'center'
    });
    doc.fillColor('black').fontSize(9);

    col++;
    if (col >= cols) {
      col = 0;
      doc.y = y + imgHeight + 18;
    } else {
      doc.y = y;
    }
  });
  if (col !== 0) doc.y = doc.y + imgHeight + 18;
  doc.moveDown(0.5);
}

function buildSchlussunterschriften(doc: PdfDoc, data: PdfData) {
  const schluss = data.unterschriften.filter(u => u.positionId === null);
  if (schluss.length === 0) return;

  ensureSpace(doc, 200);
  doc.font('Helvetica-Bold').fillColor(COLOR_PRIMARY).fontSize(11).text('SCHLUSSUNTERSCHRIFTEN');
  doc.fillColor('black').font('Helvetica').fontSize(10);
  doc.moveDown(0.3);

  const monteur = schluss.find(u => u.typ === 'MONTEUR');
  const kunde = schluss.find(u => u.typ === 'KUNDE');

  const colWidth = (CONTENT_WIDTH - 20) / 2;
  const startY = doc.y;
  const sigBoxHeight = 80;

  renderSigBox(doc, MARGIN, startY, colWidth, sigBoxHeight, 'Monteur', monteur);
  renderSigBox(doc, MARGIN + colWidth + 20, startY, colWidth, sigBoxHeight, 'Kunde', kunde);

  doc.y = startY + sigBoxHeight + 60;
}

function renderSigBox(
  doc: PdfDoc,
  x: number,
  y: number,
  width: number,
  height: number,
  rolle: string,
  sig: PdfData['unterschriften'][number] | undefined
) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(rolle, x, y);

  if (sig) {
    try {
      const buf = Buffer.from(sig.signatureData, 'base64');
      doc.image(buf, x, y + 15, { fit: [width, height], align: 'left', valign: 'top' });
    } catch {
      // Bild kaputt → ignorieren
    }
  }

  doc.strokeColor('black').lineWidth(0.5)
     .moveTo(x, y + height + 15).lineTo(x + width, y + height + 15).stroke();

  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED);
  if (sig) {
    doc.text(sig.signerName, x, y + height + 20);
    doc.text(`Unterschrieben am ${fmtDate(sig.signedAt)}`, x);
  } else {
    doc.text('Keine Unterschrift vorhanden', x, y + height + 20);
  }
  doc.fillColor('black');
}

function buildFooter(doc: PdfDoc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED).text(
      `Erstellt am ${fmtDate(new Date())} mit KieTec-Dokumentation v0.1 · Seite ${i - range.start + 1} von ${range.count}`,
      MARGIN,
      doc.page.height - 35,
      { width: CONTENT_WIDTH, align: 'center' }
    );
  }
}