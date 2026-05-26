import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import { api, type Dokumentation, type Position, type Auftrag } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DokuStatusBadge } from '@/components/DokuStatusBadge';

export function DokuDetail() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [doku, setDoku] = useState<Dokumentation | null>(null);
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [wetter, setWetter] = useState('');
  const [bemerkung, setBemerkung] = useState('');
  const [arbeitsstunden, setArbeitsstunden] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    api.getDoku(token, id)
      .then(async (d) => {
        setDoku(d);
        setWetter(d.wetter ?? '');
        setBemerkung(d.bemerkung ?? '');
        setArbeitsstunden(d.arbeitsstunden?.toString() ?? '');
        const a = await api.getAuftrag(token, d.auftragId);
        setAuftrag(a);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false));
  }, [token, id]);

  async function handleSaveMeta() {
    if (!token || !id) return;
    setSavingMeta(true);
    setError(null);
    try {
      const updated = await api.updateDoku(token, id, {
        wetter: wetter || undefined,
        bemerkung: bemerkung || undefined,
        arbeitsstunden: arbeitsstunden ? parseFloat(arbeitsstunden) : undefined,
      });
      setDoku(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSavingMeta(false);
    }
  }

  async function togglePositionVerbaut(pos: Position) {
    if (!token || !auftrag) return;
    try {
      const updated = await api.updatePosition(token, pos.id, { verbaut: !pos.verbaut });
      setAuftrag({
        ...auftrag,
        positions: auftrag.positions?.map((p) => (p.id === updated.id ? updated : p)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    }
  }

  async function updatePositionSerial(pos: Position, serialNumber: string) {
    if (!token || !auftrag) return;
    try {
      const updated = await api.updatePosition(token, pos.id, { serialNumber });
      setAuftrag({
        ...auftrag,
        positions: auftrag.positions?.map((p) => (p.id === updated.id ? updated : p)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
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

        {/* Bedingungen */}
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
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button onClick={handleSaveMeta} disabled={savingMeta} className="w-full">
              <Save className="size-4" />
              {savingMeta ? 'Speichern…' : 'Bedingungen speichern'}
            </Button>
          </CardContent>
        </Card>

        {/* Positionen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Positionen ({auftrag.positions?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {auftrag.positions?.map((p) => (
              <div key={p.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => togglePositionVerbaut(p)}
                    className={`mt-0.5 size-6 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      p.verbaut
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input bg-background'
                    }`}
                    aria-label={p.verbaut ? 'Als nicht verbaut markieren' : 'Als verbaut markieren'}
                  >
                    {p.verbaut && '✓'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.bezeichnung}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.menge} {p.einheit ?? ''}
                    </p>
                  </div>
                </div>
                {p.verbaut && (
                  <Input
                    placeholder="Seriennummer"
                    defaultValue={p.serialNumber ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (p.serialNumber ?? '')) {
                        updatePositionSerial(p, e.target.value);
                      }
                    }}
                    className="h-9 text-sm"
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Platzhalter für Phase 4 + 5 */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            📸 Foto-Upload kommt in Phase 4
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            ✍️ Unterschrifts-Pad kommt in Phase 5
          </CardContent>
        </Card>
      </main>
    </div>
  );
}