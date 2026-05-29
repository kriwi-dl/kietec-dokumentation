import { useRef, useState } from 'react';
import { Camera, Check, ChevronDown, ChevronUp, PenLine, X } from 'lucide-react';
import { api, type Position, type Foto } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AuthedImage } from '@/components/AuthedImage';
import { SignatureModal } from '@/components/SignatureModal';

interface Props {
  pos: Position;
  fotos: Foto[];          // bereits auf diese Position gefiltert
  dokuId: string;
  canEdit: boolean;
  customerName: string;
  onReload: () => void;   // lädt die Doku neu
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function PositionCard({ pos, fotos, dokuId, canEdit, customerName, onReload }: Props) {
  const { token } = useAuth();
  const isMulti = pos.menge > 1;

  const [serialOpen, setSerialOpen] = useState(false);
  const [serialText, setSerialText] = useState(pos.serialNumbers.join('\n'));
  const [singleSerial, setSingleSerial] = useState(pos.serialNumbers[0] ?? '');

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sigOpen, setSigOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kundeAbnahme = pos.abnahmen?.find((a) => a.typ === 'KUNDE');

  async function toggleVerbaut() {
    if (!token || !canEdit) return;
    setError(null);
    try {
      await api.updatePosition(token, pos.id, { verbaut: !pos.verbaut });
      onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
  }

  async function saveSerials(serialNumbers: string[]) {
    if (!token) return;
    try {
      await api.updatePosition(token, pos.id, { serialNumbers });
      onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
    }
  }

  function handleSingleBlur(value: string) {
    const trimmed = value.trim();
    const current = pos.serialNumbers[0] ?? '';
    if (trimmed !== current) saveSerials(trimmed ? [trimmed] : []);
  }

  function handleMultiBlur(value: string) {
    const lines = value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.join('\n') !== pos.serialNumbers.join('\n')) saveSerials(lines);
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadFoto(token, dokuId, file, {
        kategorie: 'TYPENSCHILD',
        positionId: pos.id,
      });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeletePhoto(fotoId: string) {
    if (!token) return;
    try {
      await api.deleteFoto(token, fotoId);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  async function handleAbnahme(name: string, dataUrl: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.createSignature(token, dokuId, {
        typ: 'KUNDE',
        signerName: name,
        signatureData: dataUrl,
        positionId: pos.id,
      });
      setSigOpen(false);
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abnahme fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      {/* Verbaut-Toggle + Bezeichnung */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={toggleVerbaut}
          disabled={!canEdit}
          className={`mt-0.5 size-6 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            pos.verbaut
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-input bg-background'
          } ${!canEdit ? 'opacity-60' : ''}`}
          aria-label={pos.verbaut ? 'Als nicht verbaut markieren' : 'Als verbaut markieren'}
        >
          {pos.verbaut && <Check className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{pos.bezeichnung}</p>
          {pos.beschreibung && pos.beschreibung.trim() && (
            <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-line">
              {pos.beschreibung}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {pos.menge} {pos.einheit ?? ''}
            {pos.verbaut && fotos.length > 0 && ` · ${fotos.length} Seriennummer-Foto${fotos.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {pos.verbaut && (
        <>
          {/* Seriennummer-Fotos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Seriennummern (Fotos)
              </span>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera className="size-4" />
                  {uploading ? 'Lädt…' : 'Foto'}
                </Button>
              )}
            </div>

            {fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map((f) => (
                  <div key={f.id} className="relative">
                    <AuthedImage
                      fotoId={f.id}
                      kind="thumbnail"
                      alt="Seriennummer"
                      className="w-full aspect-square object-cover rounded-md border"
                    />
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(f.id)}
                        className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                        aria-label="Foto löschen"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </div>

          {/* Manuelle Seriennummer-Eingabe (eingeklappt) */}
          <div>
            <button
              type="button"
              onClick={() => setSerialOpen((v) => !v)}
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              {serialOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              Seriennummer manuell eingeben
            </button>
            {serialOpen && (
              <div className="mt-2">
                {!isMulti ? (
                  <Input
                    placeholder="Seriennummer (optional)"
                    value={singleSerial}
                    onChange={(e) => setSingleSerial(e.target.value)}
                    onBlur={(e) => handleSingleBlur(e.target.value)}
                    className="h-9 text-sm"
                    disabled={!canEdit}
                  />
                ) : (
                  <textarea
                    value={serialText}
                    onChange={(e) => setSerialText(e.target.value)}
                    onBlur={(e) => handleMultiBlur(e.target.value)}
                    placeholder={`Seriennummern, eine pro Zeile (max ${pos.menge})`}
                    rows={Math.min(pos.menge, 5)}
                    disabled={!canEdit}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                  />
                )}
              </div>
            )}
          </div>

          {/* Kunden-Abnahme dieser Position */}
          <div className="border-t pt-2.5">
            {kundeAbnahme ? (
              <div className="flex items-center gap-2 text-sm">
                <div className="size-5 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                  <Check className="size-3.5" />
                </div>
                <span className="text-muted-foreground">
                  Abgenommen von{' '}
                  <span className="font-medium text-foreground">{kundeAbnahme.signerName}</span>
                  {' '}am {fmtDateTime(kundeAbnahme.signedAt)}
                </span>
              </div>
            ) : canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setSigOpen(true)} disabled={busy}>
                <PenLine className="size-4" />
                Kunde nimmt Position ab
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground italic">Keine Abnahme</span>
            )}
          </div>
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {sigOpen && (
        <SignatureModal
          open={true}
          title={`Abnahme: ${pos.bezeichnung}`}
          defaultName={customerName}
          onCancel={() => setSigOpen(false)}
          onSubmit={handleAbnahme}
        />
      )}
    </div>
  );
}