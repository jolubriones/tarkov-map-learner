/**
 * Canonical Tarkov location roster.
 *
 * Map ids are storage keys (per-map ELO ratings live under them) — never
 * rename one; only append. Unknown ids (legacy data, future maps) fall
 * back to a prettified label so nothing ever renders blank.
 */
export const MAPS = [
  { id: 'customs', label: 'Customs' },
  { id: 'woods', label: 'Woods' },
  { id: 'shoreline', label: 'Shoreline' },
  { id: 'interchange', label: 'Interchange' },
  { id: 'reserve', label: 'Reserve' },
  { id: 'lighthouse', label: 'Lighthouse' },
  { id: 'streets', label: 'Streets of Tarkov' },
  { id: 'factory', label: 'Factory' },
  { id: 'labs', label: 'The Lab' },
  { id: 'ground-zero', label: 'Ground Zero' },
] as const;

export type MapId = (typeof MAPS)[number]['id'];

export const MAP_IDS: readonly string[] = MAPS.map((m) => m.id);

export function isMapId(value: string): value is MapId {
  return (MAP_IDS as readonly string[]).includes(value);
}

export function mapLabel(mapId: string): string {
  const found = MAPS.find((m) => m.id === mapId);
  if (found) return found.label;
  const pretty = mapId
    .split(/[-_]+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  return pretty || 'Unknown map';
}
