import { cn } from '@/lib/utils';
import type { DokuStatus } from '@/lib/api';

const STYLES: Record<DokuStatus, { bg: string; text: string; label: string }> = {
  ENTWURF: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Entwurf' },
  IN_ARBEIT: { bg: 'bg-secondary/20', text: 'text-secondary', label: 'In Arbeit' },
  ZUR_UNTERSCHRIFT: { bg: 'bg-accent/30', text: 'text-accent-foreground', label: 'Zur Unterschrift' },
  UNTERSCHRIEBEN: { bg: 'bg-primary/15', text: 'text-primary', label: 'Unterschrieben' },
  VERSENDET: { bg: 'bg-primary/30', text: 'text-primary', label: 'Versendet' },
  SEVDESK_HOCHGELADEN: { bg: 'bg-primary', text: 'text-primary-foreground', label: 'Abgeschlossen' },
};

export function DokuStatusBadge({ status, className }: { status: DokuStatus; className?: string }) {
  const s = STYLES[status];
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      s.bg, s.text, className
    )}>
      {s.label}
    </span>
  );
}