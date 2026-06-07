import { Equipment, snakeToCamel } from '@/types/equipment';

const UUID_COLS = ['scrapped_by'];

/** Map a single equipment row from DB snake_case to frontend camelCase */
export function mapEquipmentFromDb(item: Record<string, unknown>): Equipment {
  const mapped: Record<string, unknown> = {};
  for (const dbKey of Object.keys(item)) {
    const value = item[dbKey];
    mapped[snakeToCamel(dbKey)] =
      value === null && UUID_COLS.includes(dbKey) ? null : (value ?? '');
  }
  if (!mapped.description) mapped.description = mapped.notes || '';
  if (!mapped.calibrationDate) {
    mapped.calibrationDate = mapped.nextCalibrationDate || mapped.calibrationDate || '';
  }
  return mapped as Equipment;
}

export function mapEquipmentListFromDb(rows: Record<string, unknown>[]): Equipment[] {
  return rows.map(mapEquipmentFromDb);
}
