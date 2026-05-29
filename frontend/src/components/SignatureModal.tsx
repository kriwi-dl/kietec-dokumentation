import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

interface Props {
  open: boolean;
  title: string;
  defaultName?: string;
  onCancel: () => void;
  onSubmit: (signerName: string, signatureDataUrl: string) => Promise<void>;
}

export function SignatureModal({ open, title, defaultName = '', onCancel, onSubmit }: Props) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit() {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError('Bitte Name eintragen.');
      return;
    }
    const dataUrl = padRef.current?.toDataUrl();
    if (!dataUrl) {
      setError('Bitte unterschreiben.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(trimmed, dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col">
      <header className="flex items-center justify-between p-3 bg-background border-b">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onCancel} disabled={submitting}>
          <X className="size-5" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="signer-name">Name in Druckbuchstaben</Label>
          <Input
            id="signer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Max Mustermann"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Unterschrift</Label>
          <SignaturePad ref={padRef} height={260} />
          <p className="text-xs text-muted-foreground">
            Bitte im Feld oben unterschreiben. Bei Fehler "Pad löschen" und neu versuchen.
          </p>
        </div>
      </div>

      <footer className="flex gap-2 p-3 bg-background border-t">
        <Button variant="outline" onClick={onCancel} disabled={submitting} className="flex-1">
          Abbrechen
        </Button>
        <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
          {submitting ? 'Speichern…' : 'Bestätigen'}
        </Button>
      </footer>
    </div>
  );
}