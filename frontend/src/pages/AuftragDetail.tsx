import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, FileText } from 'lucide-react';
import { api, ApiError, type Auftrag, type Dokumentation } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { DokuStatusBadge } from '@/components/DokuStatusBadge';

export function AuftragDetail() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [auftrag, setAuftrag] = useState<Auftrag | null>(null);
  const [dokus, setDokus] = useState<Dokumentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    Promise.all([
      api.getAuftrag(token, id),
      api.listDokus(token, { auftragId: id }),
    ])
      .then(([a, d]) => {
        setAuftrag(a);
        setDokus(d.dokumentationen);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
      .finally(() => setLoading(false));
  }, [token, id]);

  async function handleCreateDoku() {
    if (!token || !id) return;
    setCreating(true);
    setError(null);
    try {
      const doku = await api.createDoku(token, id);
      navigate(`/dokumentationen/${doku.id}`);
    } catch (err) {
      // 409: es existiert bereits eine Doku → zur vorhandenen navigieren
      if (err instanceof ApiError && err.status === 409) {
        const existingId = (err.bodyData as { dokuId?: string } | null)?.dokuId;
        if (existingId) {
          navigate(`/dokumentationen/${existingId}`);
          return;
        }
      }
      setError(err instanceof Error ? err.message : 'Fehler beim Anlegen');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Lädt …
      </div>
    );
  }

  if (error || !auftrag) {
    return (
      <div className="min-h-screen p-4 max-w-md mx-auto space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/"><ChevronLeft className="size-4" /> Zurück</Link>
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Auftrag nicht gefunden'}
        </div>
      </div>
    );
  }

  const existingDoku = dokus[0];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-md mx-auto flex items-center gap-2 px-2 h-14">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/"><ChevronLeft className="size-5" /></Link>
          </Button>
          <h1 className="font-mono font-semibold text-primary">{auftrag.sevdeskOrderNumber}</h1>
          <div className="ml-auto"><StatusBadge status={auftrag.status} /></div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Kunde */}
        <Card>
          <CardHeader><CardTitle className="text-base">Kunde</CardTitle></CardHeader>
          <CardContent>
            <p className="font-medium">{auftrag.customerName}</p>
            {auftrag.customerAddress && (
              <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">
                {auftrag.customerAddress}
              </p>
            )}
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
            {auftrag.positions?.length === 0 && (
              <p className="text-sm text-muted-foreground">Keine Positionen.</p>
            )}
            {auftrag.positions?.map((p) => (
              <div key={p.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{p.bezeichnung}</span>
                  {p.verbaut && (
                    <span className="text-xs text-primary shrink-0">✓ verbaut</span>
                  )}
                </div>
                {p.beschreibung && p.beschreibung.trim() && (
                  <p className="text-foreground/80 text-xs mt-0.5 whitespace-pre-line">
                    {p.beschreibung}
                  </p>
                )}
                <p className="text-muted-foreground text-xs mt-0.5">
                  {p.menge} {p.einheit ?? ''}
                  {p.serialNumbers.length > 0 && (
                    ` · ${p.serialNumbers.length === 1 ? 'SN' : 'SNs'}: ${
                      p.serialNumbers.length <= 2
                        ? p.serialNumbers.join(', ')
                        : `${p.serialNumbers[0]} (+${p.serialNumbers.length - 1} weitere)`
                    }`
                  )}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Dokumentation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Dokumentation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dokus.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Noch keine Doku. Mit „Neue Doku starten" beginnen.
              </p>
            )}
            {dokus.map((d) => (
              <Link
                key={d.id}
                to={`/dokumentationen/${d.id}`}
                className="block rounded-lg border p-3 active:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Doku vom {new Date(d.startedAt).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                  <DokuStatusBadge status={d.status} />
                </div>
                {d.bemerkung && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {d.bemerkung}
                  </p>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>

        {existingDoku ? (
          <Button size="lg" className="w-full" asChild>
            <Link to={`/dokumentationen/${existingDoku.id}`}>
              <FileText className="size-5" />
              Dokumentation öffnen
            </Link>
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full"
            onClick={handleCreateDoku}
            disabled={creating}
          >
            <Plus className="size-5" />
            {creating ? 'Wird angelegt…' : 'Neue Doku starten'}
          </Button>
        )}
      </main>
    </div>
  );
}