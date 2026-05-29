import { useState } from 'react';
import { PenLine, CheckCircle2 } from 'lucide-react';
import { api, type Dokumentation, type Unterschrift, type UnterschriftTyp } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SignatureModal } from './SignatureModal';

interface Props {
  doku: Dokumentation;
  customerName: string;
  onSigned: (updatedDoku: Dokumentation) => void;
}

export function SignatureSection({ doku, customerName, onSigned }: Props) {
  const { token, user } = useAuth();
  const [activeType, setActiveType] = useState<UnterschriftTyp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schluss = (doku.unterschriften ?? []).filter((u) => !u.positionId);
  const monteurSig = schluss.find((s) => s.typ === 'MONTEUR');
  const kundeSig = schluss.find((s) => s.typ === 'KUNDE');

  async function handleSubmit(signerName: string, signatureDataUrl: string) {
    if (!token || !activeType) return;
    setError(null);
    const result = await api.createSignature(token, doku.id, {
      typ: activeType,
      signerName,
      signatureData: signatureDataUrl,
    });
    const newSig: Unterschrift = {
      id: result.signature.id,
      typ: result.signature.typ,
      signerName: result.signature.signerName,
      signedAt: result.signature.signedAt,
      positionId: result.signature.positionId,
    };
    const updated: Dokumentation = {
      ...doku,
      unterschriften: [...(doku.unterschriften ?? []), newSig],
      status: result.statusAdvanced ? 'UNTERSCHRIEBEN' : doku.status,
      completedAt: result.statusAdvanced ? new Date().toISOString() : doku.completedAt,
    };
    onSigned(updated);
    setActiveType(null);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schluss-Unterschriften</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <SignatureRow
            label="Monteur"
            sig={monteurSig}
            onClick={() => setActiveType('MONTEUR')}
            disabled={doku.status === 'UNTERSCHRIEBEN' || doku.status === 'VERSENDET' || doku.status === 'SEVDESK_HOCHGELADEN'}
          />
          <SignatureRow
            label="Kunde"
            sig={kundeSig}
            onClick={() => setActiveType('KUNDE')}
            disabled={doku.status === 'UNTERSCHRIEBEN' || doku.status === 'VERSENDET' || doku.status === 'SEVDESK_HOCHGELADEN'}
          />

          {monteurSig && kundeSig && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              Doku unterschrieben — bereit für PDF + Versand
            </div>
          )}
        </CardContent>
      </Card>

      {activeType && (
        <SignatureModal
          open={true}
          title={activeType === 'MONTEUR' ? 'Monteur-Unterschrift' : 'Kunden-Unterschrift'}
          defaultName={activeType === 'MONTEUR' ? user?.name ?? '' : customerName}
          onCancel={() => setActiveType(null)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}

function SignatureRow({
  label,
  sig,
  onClick,
  disabled,
}: {
  label: string;
  sig: Unterschrift | undefined;
  onClick: () => void;
  disabled: boolean;
}) {
  if (sig) {
    return (
      <div className="rounded-lg border p-3 flex items-start gap-3">
        <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-medium truncate">{sig.signerName}</p>
          <p className="text-xs text-muted-foreground">
            unterschrieben am {new Date(sig.signedAt).toLocaleString('de-DE')}
          </p>
        </div>
      </div>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="w-full justify-start h-auto py-3"
    >
      <PenLine className="size-4" />
      <span className="flex flex-col items-start">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium">Unterschreiben</span>
      </span>
    </Button>
  );
}