import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import { api, type Dokumentation } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DokuStatusBadge } from '@/components/DokuStatusBadge';
import { PhotoSection } from '@/components/PhotoSection';
import { SignatureSection } from '@/components/SignatureSection';
import { CompletionSection } from '@/components/CompletionSection';
import { PositionCard } from '@/components/PositionCard';

const FINAL_STATUSES = ['VERSENDET', 'SEVDESK_HOCHGELADEN'];

export function DokuDetail() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [doku, setDoku] = useState<Dokumentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [wetter, setWetter] = useState('');
  const [bemerkung, setBemerkung] = useState('');
  const [arbeitsstunden, setArbeitsstunden] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const auftrag = doku?.auftrag ?? null;
  const canEdit = !!doku && !FINAL_STATUSES.includes(doku.status);

  // Erstes Laden: Doku + Meta-Felder setzen
  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    api.getDoku(token, id)
      .then((d) => {
        setDoku(d);
        setWetter(d.wetter ?? '');
        setBemerkung(d.bemerkung ?? '');
        setArbeitsstunden(d.arbeitsstunden?.toString() ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false));
  }, [token, id]);

  // Reload nach Aktionen (ohne Meta-Felder zu überschreiben)
  async function reloadDoku() {
    if (!token || !id) return;
    try {
      const d = await api.getDoku(token, id);
      setDoku(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    }
  }

  async function handleSaveMeta() {
    if (!token || !id) return;
    setSavingMeta(true);
    setError(null);
    try {
      await api.updateDoku(token, id, {
        wetter: wetter || undefined,
        bemerkung: bemerkung || undefined,
        arbeitsstunden: arbeitsstunden ? parseFloat(arbeitsstunden) : undefined,
      });
      await reloadDoku();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSavingMeta(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Lädt …</div>;
  }
  if (error || !doku || !auftrag) {
    return (
      <div className="min-h-screen p-4 max-w-md mx-auto space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/"><ChevronLeft className="size-4" /> Zurück</Link>
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Doku nicht gefunden'}
        </div>
      </div>
    );
  }

  const positionFotos = (posId: string) =>
    (doku.fotos ?? []).filter((f) => f.positionId === posId);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-md mx-auto flex items-center gap-2 px-2 h-14">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/auftraege/${doku.auftragId}`}><ChevronLeft className="size-5" /></Link>
          </Button>
          <h1 className="font-mono font-semibold text-primary truncate">
            {auftrag.sevdeskOrderNumber}
          </h1>
          <div className="ml-auto"><DokuStatusBadge status={doku.status} /></div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Bedingungen</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wetter">Wetter</Label>
              <Input
                id="wetter"
                value={wetter}
                onChange={(e) => setWetter(e.target.value)}
                placeholder="z.B. Sonnig, 22°C"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arbeitsstunden">Arbeitsstunden</Label>
              <Input
                id="arbeitsstunden"
                type="number"
                inputMode="decimal"
                step="0.5"
                value={arbeitsstunden}
                onChange={(e) => setArbeitsstunden(e.target.value)}
                placeholder="z.B. 6.5"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bemerkung">Bemerkung</Label>
              <textarea
                id="bemerkung"
                value={bemerkung}
                onChange={(e) => setBemerkung(e.target.value)}
                placeholder="Anfahrt, Auffälligkeiten, …"
                rows={3}
                disabled={!canEdit}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button onClick={handleSaveMeta} disabled={savingMeta || !canEdit} className="w-full">
              <Save className="size-4" />
              {savingMeta ? 'Speichern…' : 'Bedingungen speichern'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Positionen ({auftrag.positions?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {auftrag.positions?.map((p) => (
              <PositionCard
                key={p.id}
                pos={p}
                fotos={positionFotos(p.id)}
                dokuId={doku.id}
                canEdit={canEdit}
                customerName={auftrag.customerName}
                onReload={reloadDoku}
              />
            ))}
          </CardContent>
        </Card>

        <PhotoSection
          dokuId={doku.id}
          fotos={(doku.fotos ?? []).filter((f) => !f.positionId)}
          onChange={() => reloadDoku()}
        />

        <SignatureSection
          doku={doku}
          customerName={auftrag.customerName}
          onSigned={setDoku}
        />

        <CompletionSection
          doku={doku}
          auftrag={auftrag}
          onUpdate={setDoku}
        />
      </main>
    </div>
  );
}