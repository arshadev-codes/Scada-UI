import { motion } from 'framer-motion';
import { ArrowRight, Calculator, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '@/components/layout/Page';
import { Nameplate } from '@/components/feature/Nameplate';
import { Button, CountUp, Panel, Segmented, SelectField, TextField, powerUp, stagger } from '@/components/ui';
import { useAppStore } from '@/store/appStore';
import { usePlcStore } from '@/store/plcStore';
import { writeSetVoltage } from '@/tests/no-load-loss/runNoLoadLossTest';
import type { TestObject } from '@/store/types';
import { ratedCurrents } from '@/lib/electrical';
import {
  CUSTOM_VG,
  VECTOR_GROUP_PRESETS_1PH,
  VECTOR_GROUP_PRESETS_3PH,
  createDefaultTestObject,
  validateTestObject,
} from '@/lib/testObject';

const DRAFT_KEY = 'ttb01.testObjectDraft';

function loadDraft(): TestObject | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as TestObject) : null;
  } catch {
    return null;
  }
}

/** Ids are derived from field keys so validation can focus the first invalid control. */
const fid = (k: keyof TestObject) => `to-${k}`;

function Section({ tag, title, children, cols = 3 }: { tag: string; title: string; children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grid = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-4' }[cols];
  return (
    <Panel tag={tag} title={title}>
      <motion.div variants={stagger(0.03, 0.15)} className={`grid grid-cols-1 gap-x-4 gap-y-4 ${grid}`}>
        {children}
      </motion.div>
    </Panel>
  );
}

const Item = ({ children, span }: { children: ReactNode; span?: string }) => (
  <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className={span}>
    {children}
  </motion.div>
);

export function TestObjectPage() {
  const navigate = useNavigate();
  const operator = useAppStore((s) => s.operator);
  const saved = useAppStore((s) => s.testObject);
  const save = useAppStore((s) => s.saveTestObject);

  const [form, setForm] = useState<TestObject>(
    () => loadDraft() ?? saved ?? createDefaultTestObject(operator?.id ?? ''),
  );
  const [touched, setTouched] = useState<Partial<Record<keyof TestObject, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [customVg, setCustomVg] = useState(
    () => !([...VECTOR_GROUP_PRESETS_3PH, ...VECTOR_GROUP_PRESETS_1PH] as readonly string[]).includes(form.vectorGroup),
  );

  // Persist the draft so a refresh never loses typing.
  useEffect(() => {
    const id = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(form)), 300);
    return () => clearTimeout(id);
  }, [form]);

  const errors = useMemo(() => validateTestObject(form), [form]);
  const currents = useMemo(() => ratedCurrents(form), [form]);
  const errorCount = Object.keys(errors).length;

  const set = <K extends keyof TestObject>(k: K, v: TestObject[K]) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: keyof TestObject) => ((touched[k] || submitted) ? errors[k] : undefined);

  /** Common props for a text field bound to a key. */
  const bind = (k: keyof TestObject) => ({
    id: fid(k),
    value: String(form[k]),
    onChange: (e: { target: { value: string } }) => set(k, e.target.value as TestObject[typeof k]),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    error: err(k),
  });
  const numeric = { inputMode: 'decimal' as const, mono: true, autoComplete: 'off' };

  const setPhases = (p: TestObject['phases']) =>
    setForm((f) => ({
      ...f,
      phases: p,
      vectorGroup: p === '1' ? (f.vectorGroup.startsWith('I') ? f.vectorGroup : 'Ii0') : f.vectorGroup.startsWith('I') ? 'Dyn11' : f.vectorGroup,
    }));

  const vgPresets = form.phases === '3' ? VECTOR_GROUP_PRESETS_3PH : VECTOR_GROUP_PRESETS_1PH;
  const vgOptions = [...vgPresets.map((v) => ({ value: v as string, label: v })), { value: CUSTOM_VG, label: 'Custom…' }];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const first = Object.keys(errors)[0] as keyof TestObject | undefined;
    if (first) {
      const el = document.getElementById(fid(first));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
      return;
    }
    const clean = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
    ) as unknown as TestObject;
    save(clean);
    // LV rated voltage = dimmer set voltage for No-Load Loss → D426/D427 (float).
    const lv = Number(clean.lvVoltageV);
    if (usePlcStore.getState().status?.link === 'ONLINE' && lv > 0) {
      void writeSetVoltage(lv)
        .then((back) => console.info(`[TTB] D426/D427 set voltage ${lv} V, PLC reads back ${back}`))
        .catch((err) => console.error('[TTB] writing D426/D427 failed', err));
    }
    localStorage.removeItem(DRAFT_KEY);
    navigate('/test-selection');
  };

  const reset = () => {
    setForm(createDefaultTestObject(operator?.id ?? ''));
    setTouched({});
    setSubmitted(false);
    setCustomVg(false);
  };

  const tapsDisabled = form.tapChanger === 'NONE';

  return (
    <Page>
      <PageHeader
        code="STEP 01 / TEST OBJECT"
        title="Test Object Details"
        subtitle="Register the transformer under test. Rated currents are derived live from the ratings."
        aside={
          <Button variant="ghost" size="sm" onClick={reset} icon={<RotateCcw className="size-3.5" aria-hidden />}>
            Clear form
          </Button>
        }
      />

      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <motion.div variants={stagger(0.08, 0)} className="flex min-w-0 flex-col gap-5">
          <Section tag="SEC-A" title="Identification">
            <Item span="xl:col-span-2"><TextField label="Customer name" required {...bind('customerName')} /></Item>
            <Item><TextField label="Job / Order no." required mono {...bind('jobNo')} /></Item>
            <Item><TextField label="Transformer serial no." required mono {...bind('serialNo')} /></Item>
            <Item><TextField label="Manufacturer" required {...bind('manufacturer')} /></Item>
            <Item><TextField label="Year of manufacture" required {...numeric} inputMode="numeric" maxLength={4} {...bind('yearOfManufacture')} /></Item>
          </Section>

          <Section tag="SEC-B" title="Ratings" cols={4}>
            <Item><TextField label="Rated power" unit="kVA" required {...numeric} {...bind('ratedPowerKva')} /></Item>
            <Item><TextField label="HV rated voltage" unit="kV" required {...numeric} {...bind('hvVoltageKv')} /></Item>
            <Item><TextField label="LV rated voltage" unit="V" required {...numeric} {...bind('lvVoltageV')} /></Item>
            <Item><TextField label="Impedance" unit="%" required {...numeric} {...bind('impedancePct')} /></Item>
            <Item>
              <Segmented
                label="Phases"
                value={form.phases}
                onChange={setPhases}
                options={[{ value: '1', label: '1-PH' }, { value: '3', label: '3-PH' }]}
              />
            </Item>
            <Item>
              <Segmented
                label="Frequency"
                value={form.frequency}
                onChange={(v) => set('frequency', v)}
                options={[{ value: '50', label: '50 Hz' }, { value: '60', label: '60 Hz' }]}
              />
            </Item>
            <Item>
              <SelectField
                id={customVg ? undefined : fid('vectorGroup')}
                label="Vector group"
                required
                value={customVg ? CUSTOM_VG : form.vectorGroup}
                options={vgOptions}
                onChange={(v) => {
                  if (v === CUSTOM_VG) setCustomVg(true);
                  else {
                    setCustomVg(false);
                    set('vectorGroup', v);
                  }
                }}
                error={customVg ? undefined : err('vectorGroup')}
              />
            </Item>
            <Item>
              {customVg ? (
                <TextField label="Custom vector group" required mono placeholder="e.g. YNyn0" {...bind('vectorGroup')} />
              ) : (
                <div aria-hidden className="hidden h-full items-end pb-2.5 xl:flex">
                  <span className="num text-[13px] text-fg-dim">IEC 60076-1 clock notation</span>
                </div>
              )}
            </Item>
          </Section>

          <Section tag="SEC-C" title="Construction" cols={4}>
            <Item>
              <SelectField
                label="Cooling type"
                value={form.cooling}
                onChange={(v) => set('cooling', v)}
                options={[
                  { value: 'ONAN', label: 'ONAN' },
                  { value: 'ONAF', label: 'ONAF' },
                  { value: 'OFAF', label: 'OFAF' },
                  { value: 'DRY', label: 'Dry type' },
                ]}
              />
            </Item>
            <Item>
              <Segmented label="HV winding" preserveCase value={form.windingHv} onChange={(v) => set('windingHv', v)} options={[{ value: 'Cu', label: 'Cu' }, { value: 'Al', label: 'Al' }]} />
            </Item>
            <Item>
              <Segmented label="LV winding" preserveCase value={form.windingLv} onChange={(v) => set('windingLv', v)} options={[{ value: 'Cu', label: 'Cu' }, { value: 'Al', label: 'Al' }]} />
            </Item>
            <Item>
              <SelectField
                label="Tap changer"
                value={form.tapChanger}
                onChange={(v) => set('tapChanger', v)}
                options={[
                  { value: 'NONE', label: 'None' },
                  { value: 'OCTC', label: 'OCTC (off-circuit)' },
                  { value: 'OLTC', label: 'OLTC (on-load)' },
                ]}
              />
            </Item>
            <Item><TextField label="Tap range min" unit="%" disabled={tapsDisabled} {...numeric} {...bind('tapMinPct')} /></Item>
            <Item><TextField label="Tap range max" unit="%" disabled={tapsDisabled} {...numeric} {...bind('tapMaxPct')} /></Item>
            <Item><TextField label="Number of taps" disabled={tapsDisabled} {...numeric} inputMode="numeric" {...bind('tapCount')} /></Item>
            <Item><TextField label="Nominal tap" disabled={tapsDisabled} {...numeric} inputMode="numeric" {...bind('nominalTap')} /></Item>
          </Section>

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
            <Section tag="SEC-D" title="Guaranteed Values" cols={2}>
              <Item><TextField label="No-load loss" unit="W" required {...numeric} {...bind('guaranteedNoLoadLossW')} /></Item>
              <Item><TextField label="Load loss @ 75 °C" unit="W" required {...numeric} {...bind('guaranteedLoadLossW')} /></Item>
            </Section>

            <Section tag="SEC-E" title="Test Conditions" cols={2}>
              <Item><TextField label="Ambient temperature" unit="°C" required {...numeric} {...bind('ambientTempC')} /></Item>
              <Item><TextField label="Test date" type="date" required mono {...bind('testDate')} /></Item>
              <Item><TextField label="Tested by" required mono {...bind('testedBy')} /></Item>
              <Item>
                <Segmented
                  label="Applicable standard"
                  value={form.standard}
                  onChange={(v) => set('standard', v)}
                  options={[{ value: 'IEC 60076', label: 'IEC 60076' }, { value: 'IS 2026', label: 'IS 2026' }]}
                />
              </Item>
            </Section>
          </div>
        </motion.div>

        {/* Side column */}
        <motion.aside variants={stagger(0.1, 0.1)} className="flex flex-col gap-5 xl:sticky xl:top-20 xl:self-start">
          <Panel
            tag="CALC"
            title="Rated Currents"
            aside={<Calculator className="size-3.5 text-fg-dim" aria-hidden />}
            bodyClassName="p-0"
          >
            <div className="grid grid-cols-2 divide-x divide-line">
              {(
                [
                  ['HV', currents.hv],
                  ['LV', currents.lv],
                ] as const
              ).map(([side, a]) => (
                <div key={side} className="px-4 py-4" aria-live="polite">
                  <div className="label-tech text-[13px]">I<sub className="text-[11px]">N</sub> {side}</div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <CountUp value={a} decimals={a !== null && a < 100 ? 2 : 1} className="text-[28px] font-medium leading-none text-accent-grad" />
                    <span className="num text-xs text-fg-dim">A</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="num border-t border-line px-4 py-2 text-[13px] text-fg-dim">
              {form.phases === '3' ? 'I = S·1000 / (√3 · V)' : 'I = S·1000 / V'} · read-only
            </div>
          </Panel>

          <Nameplate data={form} currents={currents} />

          <motion.div variants={powerUp} className="flex flex-col gap-2">
            <Button type="submit" variant="primary" size="lg" magnetic icon={<ArrowRight className="size-4" aria-hidden />} className="w-full">
              Save &amp; Continue
            </Button>
            <p className="num text-center text-[13px]" aria-live="polite">
              {submitted && errorCount > 0 ? (
                <span className="text-fault">{errorCount} FIELD{errorCount > 1 ? 'S' : ''} NEED ATTENTION</span>
              ) : saved ? (
                <span className="text-fg-dim">SAVED RECORD ON FILE · {saved.serialNo}</span>
              ) : (
                <span className="text-fg-dim">DRAFT AUTOSAVED LOCALLY</span>
              )}
            </p>
          </motion.div>
        </motion.aside>
      </form>
    </Page>
  );
}
