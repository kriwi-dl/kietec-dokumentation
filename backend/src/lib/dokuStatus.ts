import { DokuStatus } from '@prisma/client';

/**
 * Final-Status der Dokumentation: ab hier können keine Fotos,
 * Unterschriften oder andere Inhalte mehr verändert werden.
 */
export const FINAL_DOKU_STATUSES: DokuStatus[] = [
  DokuStatus.UNTERSCHRIEBEN,
  DokuStatus.VERSENDET,
  DokuStatus.SEVDESK_HOCHGELADEN
];

/**
 * Prüft, ob ein Status-Übergang erlaubt ist.
 *
 * Workflow:
 *   ENTWURF → IN_ARBEIT → ZUR_UNTERSCHRIFT ↔ UNTERSCHRIEBEN → VERSENDET → SEVDESK_HOCHGELADEN
 *
 * ZUR_UNTERSCHRIFT kann zurück auf IN_ARBEIT (falls noch was zu fixen ist).
 */
export function isValidDokuStatusTransition(from: DokuStatus, to: DokuStatus): boolean {
  const transitions: Record<DokuStatus, DokuStatus[]> = {
    ENTWURF:             [DokuStatus.IN_ARBEIT],
    IN_ARBEIT:           [DokuStatus.ZUR_UNTERSCHRIFT],
    ZUR_UNTERSCHRIFT:    [DokuStatus.IN_ARBEIT, DokuStatus.UNTERSCHRIEBEN],
    UNTERSCHRIEBEN:      [DokuStatus.VERSENDET],
    VERSENDET:           [DokuStatus.SEVDESK_HOCHGELADEN],
    SEVDESK_HOCHGELADEN: []
  };
  return transitions[from]?.includes(to) ?? false;
}

/** True wenn die Dokumentation finalisiert ist. */
export function isFinalDokuStatus(status: DokuStatus): boolean {
  return FINAL_DOKU_STATUSES.includes(status);
}