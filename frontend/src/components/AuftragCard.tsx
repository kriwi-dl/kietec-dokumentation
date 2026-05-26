import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Auftrag } from '@/lib/api';
import { StatusBadge } from './StatusBadge';

export function AuftragCard({ auftrag }: { auftrag: Auftrag }) {
  return (
    <Link
      to={`/auftraege/${auftrag.id}`}
      className="block rounded-xl border bg-card p-4 active:bg-muted/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-primary">
              {auftrag.sevdeskOrderNumber}
            </span>
            <StatusBadge status={auftrag.status} />
          </div>
          <p className="mt-1.5 font-medium truncate">{auftrag.customerName}</p>
          {auftrag.customerAddress && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {auftrag.customerAddress.split('\n').join(', ')}
            </p>
          )}
          {auftrag.positionsCount !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
              {auftrag.positionsCount} Position{auftrag.positionsCount === 1 ? '' : 'en'}
            </p>
          )}
        </div>
        <ChevronRight className="size-5 text-muted-foreground shrink-0 mt-0.5" />
      </div>
    </Link>
  );
}