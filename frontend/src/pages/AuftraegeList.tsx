import { useEffect, useState } from 'react';
import { RefreshCw, LogOut } from 'lucide-react';
import { api, type Auftrag, type AuftragStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { AuftragCard } from '@/components/AuftragCard';
import { cn } from '@/lib/utils';
import logoUrl from '@/assets/logo.png';

const STATUS_ORDER: Record<AuftragStatus, number> = {
  IN_BEARBEITUNG: 0,
  ZUGEWIESEN: 1,
  OFFEN: 2,
  DOKUMENTIERT: 3,
  ABGESCHLOSSEN: 4,
  STORNIERT: 5,
};

const FILTER_OPTIONS: Array<{ value: AuftragStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Alle' },
  { value: 'OFFEN', label: 'Offen' },
  { value: 'IN_BEARBEITUNG', label: 'In Arbeit' },
  { value: 'DOKUMENTIERT', label: 'Fertig' },
];

export function AuftraegeList() {
  const { token, user, logout } = useAuth();
  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [filter, setFilter] = useState<AuftragStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function load(showSpinner = true) {
    if (!token) return;
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const statusFilter = filter === 'ALL' ? undefined : filter;
      const res = await api.listAuftraege(token, statusFilter);
      const sorted = [...res.auftraege].sort((a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      );
      setAuftraege(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Lokale Liste laden bei Filter-/Token-Wechsel
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, token]);

  // Stiller sevdesk-Sync beim ersten Öffnen, danach Liste neu laden
  useEffect(() => {
    if (!token) return;
    api.syncSevdesk(token)
      .then(() => load(false))
      .catch(() => { /* still: lokale Daten reichen */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manueller Refresh: sevdesk-Sync + Liste neu laden
  async function handleRefresh() {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    setSyncMsg(null);
    try {
      const result = await api.syncSevdesk(token);
      const created = result.created ?? 0;
      const updated = result.updated ?? 0;
      if (created || updated) {
        const parts: string[] = [];
        if (created) parts.push(`${created} neu`);
        if (updated) parts.push(`${updated} aktualisiert`);
        setSyncMsg(parts.join(' · '));
        setTimeout(() => setSyncMsg(null), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync fehlgeschlagen');
    }
    await load(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-14">
          <img src={logoUrl} alt="KieTec" className="h-8 object-contain" />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </Button>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Filter chips */}
      <div className="max-w-md mx-auto w-full px-4 py-3 flex gap-2 overflow-x-auto">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-sm transition-colors',
              filter === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="max-w-md mx-auto w-full px-4 pb-6 flex-1">
        <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between gap-2">
          <span>Eingeloggt als {user?.name} · {user?.role}</span>
          {syncMsg && <span className="text-primary font-medium">{syncMsg}</span>}
        </div>

        {loading && (
          <div className="text-center py-12 text-muted-foreground">Lade Aufträge…</div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && auftraege.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Keine Aufträge für diesen Filter.
          </div>
        )}

        {!loading && !error && auftraege.length > 0 && (
          <div className="space-y-3">
            {auftraege.map((a) => (
              <AuftragCard key={a.id} auftrag={a} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}