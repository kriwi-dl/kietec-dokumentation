import { useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { api, type Auftrag, type Dokumentation } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const OFFICE_EMAIL = 'info@kriwi-dl.de';

interface Props {
  doku: Dokumentation;
  auftrag: Auftrag;
  onUpdate: (updated: Dokumentation) => void;
}

export function CompletionSection({ doku, auftrag, onUpdate }: Props) {
  const { token, user } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  if (
    doku.status !== 'UNTERSCHRIEBEN' &&
    doku.status !== 'VERSENDET' &&
    doku.status !== 'SEVDESK_HOCHGELADEN'
  ) {
    return null;
  }

  const isDone = !!doku.sevdeskVoucherId;

  async function handleAbschluss() {
    if (!token) return;
    setRunning(true);
    setError(null);

    let currentDoku: Dokumentation = { ...doku };

    try {
      // Schritt 1: PDF
      if (!currentDoku.pdfPath) {
        setProgress('Erstelle PDF…');
        await api.generatePdf(token, currentDoku.id);
        currentDoku = { ...currentDoku, pdfPath: 'generated' };
        onUpdate(currentDoku);
      }

      // Schritt 2: Mail ans Büro
      if (!currentDoku.versendetAn) {
        setProgress('Sende E-Mail ans Büro…');
        const subject = `Neue Doku: ${auftrag.sevdeskOrderNumber} – ${auftrag.customerName}`;
        const message =
`Eine Auftrags-Dokumentation wurde abgeschlossen:

Auftrag:        ${auftrag.sevdeskOrderNumber}
Kunde:          ${auftrag.customerName}
Monteur:        ${user?.name ?? 'unbekannt'}
Abgeschlossen:  ${new Date().toLocaleString('de-DE')}

Die PDF-Dokumentation ist als Anhang beigefügt.
Das Dokument liegt zusätzlich in sevdesk → Dokumente → Dokumentationen.`;

        await api.sendEmail(token, currentDoku.id, {
          to: OFFICE_EMAIL,
          subject,
          message,
        });
        currentDoku = {
          ...currentDoku,
          versendetAn: OFFICE_EMAIL,
          versendetAm: new Date().toISOString(),
          status: currentDoku.status === 'UNTERSCHRIEBEN' ? 'VERSENDET' : currentDoku.status,
        };
        onUpdate(currentDoku);
      }

      // Schritt 3: sevdesk
      if (!currentDoku.sevdeskVoucherId) {
        setProgress('Lade nach sevdesk hoch…');
        const sev = await api.uploadToSevdesk(token, currentDoku.id);
        currentDoku = {
          ...currentDoku,
          sevdeskVoucherId: sev.documentId,
          status: 'SEVDESK_HOCHGELADEN',
        };
        onUpdate(currentDoku);
      }

      setProgress('Fertig');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Abschluss');
    } finally {
      setRunning(false);
      setTimeout(() => setProgress(null), 1500);
    }
  }

  async function handleViewPdf() {
    if (!token) return;
    setViewing(true);
    setError(null);
    try {
      const blob = await api.fetchPdfBlob(token, doku.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF konnte nicht geöffnet werden');
    } finally {
      setViewing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Abschluss</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!isDone && (
          <>
            <Button
              size="lg"
              className="w-full"
              onClick={handleAbschluss}
              disabled={running}
            >
              {running ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Sparkles className="size-5" />
              )}
              {running ? (progress ?? 'Arbeitet…') : 'Dokumentation abschließen'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              PDF wird erstellt, an das Büro versendet und in sevdesk abgelegt
            </p>
          </>
        )}

        {isDone && (
          <>
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
                <p className="font-medium text-primary">Dokumentation abgeschlossen</p>
              </div>
              <div className="pl-7 text-xs text-muted-foreground space-y-0.5">
                {doku.versendetAn && (
                  <p>
                    E-Mail an{' '}
                    <span className="font-medium text-foreground">{doku.versendetAn}</span>
                  </p>
                )}
                <p>
                  sevdesk Document-ID:{' '}
                  <span className="font-mono text-foreground">{doku.sevdeskVoucherId}</span>
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleViewPdf}
              disabled={viewing}
              className="w-full"
            >
              <ExternalLink className="size-4" />
              {viewing ? 'Lädt PDF…' : 'PDF anzeigen'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}