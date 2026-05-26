import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UserRole, DokuStatus } from '@prisma/client';
import { z } from 'zod';
import { sendEmail, verifyEmail } from '../lib/emailService';

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().max(200).optional(),
  message: z.string().max(10000).optional()
});

const emailRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // Test-Endpoint: SMTP-Verbindung prüfen (Admin)
  fastify.get('/email/test', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!fastify.requireAdmin(request, reply)) return;
    try {
      const ok = await verifyEmail();
      return { success: ok, message: ok ? 'SMTP-Verbindung OK' : 'SMTP verify fehlgeschlagen' };
    } catch (e) {
      return reply.code(500).send({
        success: false,
        message: e instanceof Error ? e.message : String(e)
      });
    }
  });

  // PDF einer Doku per E-Mail versenden
  fastify.post('/dokumentationen/:id/email', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = sendEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const doku = await fastify.prisma.dokumentation.findUnique({
      where: { id },
      include: { auftrag: true }
    });
    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });
    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const allowedStatuses: DokuStatus[] = [
      DokuStatus.UNTERSCHRIEBEN,
      DokuStatus.VERSENDET,
      DokuStatus.SEVDESK_HOCHGELADEN
    ];
    if (!allowedStatuses.includes(doku.status)) {
      return reply.code(400).send({
        error: `Doku muss UNTERSCHRIEBEN (oder später) sein. Aktuell: ${doku.status}`
      });
    }

    if (!doku.pdfPath) {
      return reply.code(400).send({
        error: 'Kein PDF generiert. Zuerst POST /dokumentationen/:id/pdf aufrufen.'
      });
    }

    const orderNr = doku.auftrag.sevdeskOrderNumber;
    const customerName = doku.auftrag.customerName;
    const subject = parsed.data.subject ?? `Ihre Lieferschein-Dokumentation ${orderNr}`;

    const defaultText =
`Sehr geehrte Damen und Herren,

im Anhang erhalten Sie die Abnahme-Dokumentation zu Auftrag ${orderNr}.

Die Dokumentation enthält:
- Die verbauten Positionen mit Seriennummern
- Foto-Dokumentation der Installation
- Alle Unterschriften (Teilabnahmen und Schlussabnahme)

Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
KDS Kienitz UG
`;

    const textBody = parsed.data.message ?? defaultText;
    const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:Arial,sans-serif;color:#222;line-height:1.5;max-width:600px">
<div style="border-bottom:3px solid #003366;padding-bottom:8px;margin-bottom:16px">
  <h2 style="color:#003366;margin:0">KDS Kienitz UG</h2>
  <p style="color:#666;margin:4px 0 0;font-size:13px">Photovoltaik-Installation</p>
</div>
<div style="white-space:pre-wrap">${textBody.replace(/</g, '&lt;')}</div>
<hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
<p style="font-size:11px;color:#888">Diese Nachricht wurde automatisch generiert.</p>
</body></html>`;

    try {
      const result = await sendEmail({
        to: parsed.data.to,
        subject,
        text: textBody,
        html: htmlBody,
        attachments: [{
          filename: `Lieferschein_${orderNr}.pdf`,
          path: doku.pdfPath,
          contentType: 'application/pdf'
        }]
      });

      // Status-Update: UNTERSCHRIEBEN → VERSENDET (nur beim ersten Versand)
      const updateData: Record<string, unknown> = {
        versendetAn: parsed.data.to,
        versendetAm: new Date()
      };
      if (doku.status === DokuStatus.UNTERSCHRIEBEN) {
        updateData.status = DokuStatus.VERSENDET;
      }
      await fastify.prisma.dokumentation.update({
        where: { id },
        data: updateData
      });

      return {
        success: true,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
        sentTo: parsed.data.to,
        sentAt: new Date(),
        statusAdvanced: doku.status === DokuStatus.UNTERSCHRIEBEN
      };
    } catch (e) {
      request.log.error(e);
      return reply.code(500).send({
        error: 'E-Mail-Versand fehlgeschlagen',
        message: e instanceof Error ? e.message : String(e)
      });
    }
  });
};

export default emailRoutes;