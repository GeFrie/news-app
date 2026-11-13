import { IntervalType } from '../../interfaces/item';

export function createTageRecord(): Record<IntervalType, number[]> {
  return {
    'none': [],
    'daily': [],
    'weekly': [],
    'monthly_date': [],
    'monthly_weekday': [],
    'defined_date': [],
    'defined_input': []
  };
}