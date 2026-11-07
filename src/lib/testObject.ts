import type { TestObject } from '@/store/types';
import { isoDate } from './format';
import { toNumber } from './electrical';

export const VECTOR_GROUP_PRESETS_3PH = ['Dyn11', 'Dyn1', 'Dyn5', 'YNd11', 'YNd1', 'Yyn0', 'Dd0', 'Yzn11'] as const;
export const VECTOR_GROUP_PRESETS_1PH = ['Ii0', 'Ii6'] as const;
export const CUSTOM_VG = '__custom__';

export function createDefaultTestObject(testedBy: string): TestObject {
  return {
    customerName: '',
    jobNo: '',
    serialNo: '',
    manufacturer: '',
    yearOfManufacture: String(new Date().getFullYear()),
    ratedPowerKva: '',
    hvVoltageKv: '',
    lvVoltageV: '',
    phases: '3',
    frequency: '50',
    vectorGroup: 'Dyn11',
    impedancePct: '',
    cooling: 'ONAN',
    windingHv: 'Cu',
    windingLv: 'Cu',
    tapChanger: 'OCTC',
    tapMinPct: '-10',
    tapMaxPct: '5',
    tapCount: '7',
    nominalTap: '3',
    guaranteedNoLoadLossW: '',
    guaranteedLoadLossW: '',
    ambientTempC: '',
    testDate: isoDate(),
    testedBy,
    standard: 'IEC 60076',
  };
}

export type TestObjectErrors = Partial<Record<keyof TestObject, string>>;

const VG_PATTERN = /^(?:(?:[DYZ]N?)(?:[dyz]n?)|Ii)(?:[0-9]|1[01])$/;

function num(
  errors: TestObjectErrors,
  key: keyof TestObject,
  raw: string,
  opts: { min?: number; max?: number; integer?: boolean; gt?: number; label?: string } = {},
): number | null {
  if (raw.trim() === '') {
    errors[key] = 'REQUIRED';
    return null;
  }
  const n = toNumber(raw);
  if (n === null) {
    errors[key] = 'NOT A NUMBER';
    return null;
  }
  if (opts.integer && !Number.isInteger(n)) errors[key] = 'WHOLE NUMBER ONLY';
  else if (opts.gt !== undefined && n <= opts.gt) errors[key] = `MUST BE > ${opts.gt}`;
  else if (opts.min !== undefined && n < opts.min) errors[key] = `MIN ${opts.min}`;
  else if (opts.max !== undefined && n > opts.max) errors[key] = `MAX ${opts.max}`;
  return n;
}

export function validateTestObject(o: TestObject): TestObjectErrors {
  const e: TestObjectErrors = {};
  const req = (k: keyof TestObject) => {
    if (String(o[k]).trim() === '') e[k] = 'REQUIRED';
  };

  (['customerName', 'jobNo', 'serialNo', 'manufacturer', 'testedBy', 'testDate'] as const).forEach(req);

  num(e, 'yearOfManufacture', o.yearOfManufacture, { integer: true, min: 1950, max: new Date().getFullYear() });
  num(e, 'ratedPowerKva', o.ratedPowerKva, { gt: 0, max: 1_000_000 });
  const hvKv = num(e, 'hvVoltageKv', o.hvVoltageKv, { gt: 0, max: 800 });
  const lvV = num(e, 'lvVoltageV', o.lvVoltageV, { gt: 0, max: 66_000 });
  if (hvKv !== null && lvV !== null && !e.hvVoltageKv && !e.lvVoltageV && lvV >= hvKv * 1000) {
    e.lvVoltageV = 'LV MUST BE BELOW HV';
  }
  num(e, 'impedancePct', o.impedancePct, { min: 0.5, max: 30 });

  if (!o.vectorGroup.trim()) e.vectorGroup = 'REQUIRED';
  else if (!VG_PATTERN.test(o.vectorGroup.trim())) e.vectorGroup = 'INVALID · e.g. Dyn11, YNd1';
  else if (o.phases === '1' && !o.vectorGroup.startsWith('I')) e.vectorGroup = '1-PH USES Ii0 / Ii6';
  else if (o.phases === '3' && o.vectorGroup.startsWith('I')) e.vectorGroup = '3-PH GROUP REQUIRED';

  if (o.tapChanger !== 'NONE') {
    const min = num(e, 'tapMinPct', o.tapMinPct, { min: -30, max: 0 });
    const max = num(e, 'tapMaxPct', o.tapMaxPct, { min: 0, max: 30 });
    if (min !== null && max !== null && !e.tapMinPct && !e.tapMaxPct && min === max) {
      e.tapMaxPct = 'RANGE IS ZERO';
    }
    const count = num(e, 'tapCount', o.tapCount, { integer: true, min: 2, max: 41 });
    const nominal = num(e, 'nominalTap', o.nominalTap, { integer: true, min: 1 });
    if (count !== null && nominal !== null && !e.tapCount && !e.nominalTap && nominal > count) {
      e.nominalTap = `MAX ${count}`;
    }
  }

  num(e, 'guaranteedNoLoadLossW', o.guaranteedNoLoadLossW, { gt: 0 });
  num(e, 'guaranteedLoadLossW', o.guaranteedLoadLossW, { gt: 0 });
  num(e, 'ambientTempC', o.ambientTempC, { min: -10, max: 60 });

  return e;
}

/** Fraction of required nameplate fields that have a value — drives the fill meter. */
export function completion(o: TestObject): number {
  const keys: Array<keyof TestObject> = [
    'customerName', 'jobNo', 'serialNo', 'manufacturer', 'yearOfManufacture',
    'ratedPowerKva', 'hvVoltageKv', 'lvVoltageV', 'vectorGroup', 'impedancePct',
    'guaranteedNoLoadLossW', 'guaranteedLoadLossW', 'ambientTempC', 'testDate', 'testedBy',
  ];
  return keys.filter((k) => String(o[k]).trim() !== '').length / keys.length;
}
