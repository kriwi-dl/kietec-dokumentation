import { cn } from '@/lib/utils';
import type { AuftragStatus } from '@/lib/api';

const STATUS_STYLES: Record<AuftragStatus, { bg: string; text: string; label: string }> = {
  OFFEN: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Offen' },
  ZUGEWIESEN: { bg: 'bg-accent/20', text: 'text-accent-foreground', label: 'Zugewiesen' },
  IN_BEARBEITUNG: { bg: 'bg-secondary/20', text: 'text-secondary', label: 'In Bearbeitung' },
  DOKUMENTIERT: { bg: 'bg-primary/15', text: 'text-primary', label: 'Dokumentiert' },
  ABGESCHLOSSEN: { bg: 'bg-primary', text: 'text-primary-foreground', label: 'Abgeschlossen' },
  STORNIERT: { bg: 'bg-destructive/15', text: 'text-destructive', label: 'Storniert' },
};

export function StatusBadge({ status, className }: { status: AuftragStatus; className?: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        s.bg,
        s.text,
        className
      )}
    >
      {s.label}
    </span>
  );
}