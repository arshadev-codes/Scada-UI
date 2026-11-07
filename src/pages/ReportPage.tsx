import { motion } from 'framer-motion';
import { ArrowLeft, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { COMPANY } from '@/config/company';
import { useAppStore } from '@/store/appStore';
import type { TestObject, TestResults } from '@/store/types';
import { energisedRatedCurrent, ratedCurrents } from '@/lib/electrical';
import { cn } from '@/lib/format';
import { TOLERANCE } from '@/tests/no-load-loss/calculation';
import { PHASES, SUM_TOLERANCE, checkRound } from '@/tests/magnetic-balance/calculation';
import { IMBALANCE_LIMIT_PCT, REF_TEMP_C, formatOhms, type WrmSideResult } from '@/tests/winding-resistance/calculation';
import { RATIO_PHASES, RATIO_TOLERANCE_PCT } from '@/tests/ratio/calculation';
import { ttrSupplyV } from '@/tests/ratio/runRatioTest';
import { DAI_MIN, PI_MIN, formatMohm } from '@/tests/insulation-resistance/calculation';
import { wrmTestCurrent } from '@/tests/winding-resistance/runWindingResistanceTest';

/**
 * Printable test report in the layout of a test-lab certificate:
 *   1. Test report (particulars + signatures)
 *   2. Summary of test results
 *   3. List of tests conducted + technical particulars
 *   4+. One page per test, numbered sections and ruled tables
 * Black lines on white paper only, so it prints well in black & white.
 * Lab name / address come from src/config/company.ts.
 */

const fmt = (n: number | undefined | null, d = 1) => (n === undefined || n === null || !Number.isFinite(n) ? '—' : n.toFixed(d));
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026-10-27" → Date in local time (no UTC shift). */
function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
const dotted = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;

/** Tests that have a report page. */
const PRINTABLE = ['magnetic-balance', 'no-load', 'winding-resistance', 'ratio', 'insulation-resistance'] as const;
type Printable = (typeof PRINTABLE)[number];
const FIRST_TEST_PAGE = 4;

export function ReportPage() {
  const navigate = useNavigate();
  const testObject = useAppStore((s) => s.testObject);
  const operator = useAppStore((s) => s.operator);
  const selection = useAppStore((s) => s.selection);
  const runs = useAppStore((s) => s.runs);
  const results = useAppStore((s) => s.results);

  if (!testObject) return <Navigate to="/test-object" replace />;

  const o = testObject;
  const date = parseDate(o.testDate) ?? new Date();
  const reportNo = `TR/${(o.serialNo || 'XXXX').replace(/\s+/g, '')}/${pad2(date.getMonth() + 1)}/${String(date.getFullYear()).slice(2)}`;

  // Sections: every selected test that has a report page, numbered in run order.
  const sections = selection
    .map((s) => s.testId)
    .filter((id): id is Printable => (PRINTABLE as readonly string[]).includes(id))
    .map((id, i) => ({ id, n: i + 1 }));
  const total = FIRST_TEST_PAGE - 1 + sections.length;

  const verdicts = sections.map((s) => verdictOf(s.id, results));
  const anyFail = verdicts.includes('FAIL') || selection.some((s) => runs[s.testId]?.status === 'aborted');
  const allPass = sections.length > 0 && verdicts.every((v) => v === 'PASS');
  const conclusion = anyFail
    ? 'One or more test results do not meet the specified requirements. See the summary of test results.'
    : allPass
      ? 'All the test results are found to meet the specified requirements and the reference standard.'
      : 'Testing is not complete. Results are given for the tests carried out.';

  const head = { reportNo, date: dotted(date), total };

  return (
    <div className="min-h-screen bg-ink-950 py-8 print:bg-white print:py-0">
      {/* Toolbar (screen only) */}
      <div className="sticky top-0 z-10 mx-auto mb-6 flex w-[210mm] max-w-full items-center gap-3 rounded-[8px] border border-line bg-ink-850/90 px-4 py-2.5 backdrop-blur-md print:hidden">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-fg-muted transition-colors hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          <span className="text-[13px] font-semibold">Back</span>
        </button>
        <span className="num ml-2 truncate text-[12px] text-fg-dim">
          {reportNo} · {total} pages · A4
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto flex items-center gap-2 rounded-[6px] bg-accent px-4 py-2 font-semibold text-ink-950 transition-transform hover:scale-[1.03]"
        >
          <Printer className="size-4" aria-hidden />
          Print / Save PDF
        </button>
      </div>

      <motion.div
        className="flex flex-col items-center gap-8 print:gap-0"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.45 } } }}
      >
        {/* ── 1. Test report ──────────────────────────────────── */}
        <Sheet head={head} page={1}>
          <PageTitle>TEST REPORT</PageTitle>
          <Grid
            rows={[
              ['Discipline', 'Electrical'],
              ['Product group', 'Transformers'],
              ['Name of the customer', o.customerName],
              ['Job / order no.', o.jobNo],
              ['Name of the manufacturer', o.manufacturer],
              ['Particulars of the sample tested', particulars(o)],
              ['Transformer serial no.', o.serialNo],
              ['Year of manufacture', o.yearOfManufacture],
              ['Quantity', 'One No.'],
              ['Date(s) of the test', dotted(date)],
              ['Reference standard', o.standard],
              ['Tests carried out as per', `Routine tests as per ${o.standard}`],
              ['No. of pages', `${total} Pages`],
              ['Test results', conclusion],
            ]}
          />
          <Signatures testedBy={o.testedBy} operatorId={operator?.id} />
        </Sheet>

        {/* ── 2. Summary of test results ──────────────────────── */}
        <Sheet head={head} page={2}>
          <PageTitle underline>Summary of Test Results</PageTitle>
          <table className="rpt w-full">
            <thead>
              <tr>
                <th className="w-[36%]">Parameters</th>
                <th>kVA</th>
                <th>Measured Values</th>
                <th>Guaranteed Values</th>
                <th>Tolerance</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const row = summaryRow(s.id, o, results);
                return (
                  <tr key={s.id}>
                    <td className="text-left">{row.parameter}</td>
                    <td>{o.ratedPowerKva || '—'}</td>
                    <td>{row.measured}</td>
                    <td>{row.guaranteed}</td>
                    <td>{row.tolerance}</td>
                    <td>{verdictText(verdictOf(s.id, results))}</td>
                  </tr>
                );
              })}
              {sections.length === 0 && (
                <tr>
                  <td colSpan={6}>No tests in this report</td>
                </tr>
              )}
            </tbody>
          </table>
          <Signatures testedBy={o.testedBy} operatorId={operator?.id} />
        </Sheet>

        {/* ── 3. List of tests + technical particulars ────────── */}
        <Sheet head={head} page={3}>
          <PageTitle underline>List of Tests Conducted</PageTitle>
          <table className="rpt w-full">
            <thead>
              <tr>
                <th className="w-16">S. No.</th>
                <th>Name of the Tests Conducted</th>
                <th className="w-24">Page No.</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s, i) => (
                <tr key={s.id}>
                  <td>{s.n}.</td>
                  <td className="text-left">{TEST_TITLE[s.id]}</td>
                  <td>{pad2(FIRST_TEST_PAGE + i)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-[8mm] mb-2 text-[13px] font-bold">Technical Particulars of the Transformer</h3>
          <Grid rows={specRows(o)} />
        </Sheet>

        {/* ── 4+. One page per test ───────────────────────────── */}
        {sections.map((s, i) => (
          <Sheet key={s.id} head={head} page={FIRST_TEST_PAGE + i} testedFooter={o.testedBy}>
            {s.id === 'magnetic-balance' ? (
              <MbtPage n={s.n} o={o} results={results} side={runs[s.id]?.side ?? 'LV'} />
            ) : s.id === 'no-load' ? (
              <NllPage n={s.n} o={o} results={results} />
            ) : s.id === 'winding-resistance' ? (
              <WrmPage n={s.n} o={o} results={results} />
            ) : s.id === 'ratio' ? (
              <TtrPage n={s.n} o={o} results={results} />
            ) : (
              <IrPage n={s.n} o={o} results={results} />
            )}
          </Sheet>
        ))}
      </motion.div>
    </div>
  );
}

// ── Test pages ──────────────────────────────────────────────────────────────

function MbtPage({ n, o, results, side }: { n: number; o: TestObject; results: TestResults; side: string }) {
  const rounds = results.mbt?.rounds ?? [];
  const checks = ([0, 1, 2] as const).map((e) => (rounds[e] ? checkRound(rounds[e]!) : null));
  const others = (e: number) => PHASES.filter((_, i) => i !== e);
  return (
    <>
      <SectionTitle>{n}. Magnetic Balance Test</SectionTitle>
      <h4 className="mt-1 mb-1.5 text-[12px] font-bold">Test Condition:</h4>
      <Conditions
        rows={[
          ['Voltage applied on', `${side} side`],
          ['Supply', 'Single phase, one pair of terminals at a time'],
          ['Vector group', o.vectorGroup],
          ['Test frequency', `${o.frequency} Hz`],
        ]}
      />

      <SubTitle>
        {n}. A) Voltage Applied on {side} side
      </SubTitle>
      <table className="rpt w-full">
        <thead>
          <tr>
            <th rowSpan={2} className="w-[34%]">
              Voltage Applied on
              <br />
              (Volts)
            </th>
            <th colSpan={3}>Voltage Measured on (Volts)</th>
          </tr>
          <tr>
            {PHASES.map((p) => (
              <th key={p}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {checks.map((c, e) => (
            <tr key={e}>
              <td>{PHASES[e]}</td>
              {([0, 1, 2] as const).map((i) => (
                <td key={i} className={cn(i === e && 'font-bold')}>
                  {c ? fmt(c.v[i], 2) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <SubTitle>
        {n}. B) Conditions to be Satisfied
      </SubTitle>
      <table className="rpt w-full">
        <thead>
          <tr>
            <th>Condition</th>
            <th>Applied ≈ Sum of Other Two (V)</th>
            <th>Sum as % of Applied</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, e) => (
            <tr key={e}>
              <td>
                {PHASES[e]} = {others(e).join(' + ')}
              </td>
              <td>{c ? `${fmt(c.applied, 2)} ≈ ${fmt(c.v[(e + 1) % 3] + c.v[(e + 2) % 3], 2)}` : '—'}</td>
              <td>{c ? `${fmt(c.sum * 100, 1)} %` : '—'}</td>
              <td>{c ? (c.pass ? 'Satisfied' : 'Not satisfied') : 'Not measured'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px]">
        <b>Acceptance:</b> In each round the sum of the two induced voltages shall equal the applied voltage within ±{SUM_TOLERANCE * 100} %.
      </p>
      <p className="mt-1 text-[12px]">
        <b>Result:</b>{' '}
        {results.mbt?.result
          ? results.mbt.result.pass
            ? 'All conditions are satisfied. Magnetic balance is verified.'
            : 'All conditions are not satisfied. Magnetic balance is not verified.'
          : 'Test not completed.'}
      </p>
    </>
  );
}

function NllPage({ n, o, results }: { n: number; o: TestObject; results: TestResults }) {
  const r = results.nll;
  const ratedLv = energisedRatedCurrent(o, 'LV');
  const i0Pct = r && ratedLv && Number.isFinite(r.current) ? (r.current / ratedLv) * 100 : null;
  const phaseV = r?.phaseV.length ? r.phaseV : [NaN, NaN, NaN];
  return (
    <>
      <SectionTitle>{n}. Measurement of No Load Loss and No Load Current</SectionTitle>
      <h4 className="mt-1 mb-1.5 text-[12px] font-bold">Test Condition:</h4>
      <Conditions
        rows={[
          ['Transformer energized from', 'LV side (HV kept open)'],
          ['Applied voltage (100 % of rated)', `${o.lvVoltageV} V`],
          ['Test frequency', `${o.frequency} Hz`],
          ['Tap position', o.tapChanger === 'NONE' ? 'Not applicable' : `${o.nominalTap} (Normal tap)`],
          ['Guaranteed no load loss at rated voltage', o.guaranteedNoLoadLossW ? `${o.guaranteedNoLoadLossW} W` : '—'],
          ['Acceptance', `Measured loss ≤ guaranteed + ${TOLERANCE * 100} %`],
        ]}
      />

      <SubTitle>
        {n}. A) Applied Voltage
      </SubTitle>
      <table className="rpt w-full">
        <thead>
          <tr>
            <th>% Rated Voltage</th>
            {phaseV.map((_, i) => (
              <th key={i}>V{i + 1} (V)</th>
            ))}
            <th>Average (V)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>100 %</td>
            {phaseV.map((v, i) => (
              <td key={i}>{fmt(v, 2)}</td>
            ))}
            <td className="font-bold">{fmt(r?.voltage, 2)}</td>
          </tr>
        </tbody>
      </table>

      <SubTitle>
        {n}. B) No Load Loss and No Load Current
      </SubTitle>
      <table className="rpt w-full">
        <thead>
          <tr>
            <th>No Load Current (A)</th>
            <th>
              No Load Current in terms
              <br />
              of % Full Load Current
            </th>
            <th>Measured No Load Loss (W)</th>
            <th>Guaranteed No Load Loss (W)</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{fmt(r?.current, 3)}</td>
            <td>{i0Pct !== null ? `${fmt(i0Pct, 3)} %` : '—'}</td>
            <td>{fmt(r?.p0, 1)}</td>
            <td>{o.guaranteedNoLoadLossW || '—'}</td>
            <td>{r ? (Number.isFinite(r.p0) ? (r.pass ? 'Within limit' : 'Exceeds limit') : 'Not measured') : 'Not tested'}</td>
          </tr>
        </tbody>
      </table>
      {r && !Number.isFinite(r.p0) && (
        <p className="mt-3 text-[11.5px] italic">Note: the power and current meter registers are not yet connected, so loss and current are shown as “—”.</p>
      )}
    </>
  );
}

function WrmPage({ n, o, results }: { n: number; o: TestObject; results: TestResults }) {
  const r = results.wrm;
  const ohm = (x: number | undefined) => {
    const f = formatOhms(x);
    return f.value === '—' ? '—' : `${f.value} ${f.unit}`;
  };
  const side = (label: string, res: WrmSideResult | undefined, material: string) => (
    <>
      <SubTitle>{label}</SubTitle>
      <table className="rpt w-full">
        <thead>
          <tr>
            <th>Terminals</th>
            <th>Measured at {r ? `${fmt(r.tempC, 1)} °C` : 'test temperature'}</th>
            <th>Corrected to {REF_TEMP_C} °C</th>
          </tr>
        </thead>
        <tbody>
          {(res?.pairs ?? ['—']).map((p, i) => (
            <tr key={p}>
              <td>{p}</td>
              <td>{ohm(res?.r[i])}</td>
              <td>{ohm(res?.r75[i])}</td>
            </tr>
          ))}
          <tr>
            <td>Imbalance / average</td>
            <td>{res ? `${fmt(res.imbalancePct, 2)} %` : '—'}</td>
            <td className="font-bold">{ohm(res?.avg75)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11.5px] italic">Winding material: {material === 'Al' ? 'Aluminium (K = 225)' : 'Copper (K = 235)'}</p>
    </>
  );
  return (
    <>
      <SectionTitle>{n}. Measurement of Winding Resistance</SectionTitle>
      <h4 className="mt-1 mb-1.5 text-[12px] font-bold">Test Condition:</h4>
      <Conditions
        rows={[
          ['Method', 'DC four-wire (Kelvin) resistance measurement'],
          ['Test current HV / LV', `${wrmTestCurrent(o, 'HV')} A / ${wrmTestCurrent(o, 'LV')} A`],
          ['Winding temperature', r ? `${fmt(r.tempC, 1)} °C` : '—'],
          ['Tap position', o.tapChanger === 'NONE' ? 'Not applicable' : `${o.nominalTap} (Normal tap)`],
          ['Correction', `R${REF_TEMP_C} = R × (K + ${REF_TEMP_C}) / (K + T)`],
        ]}
      />
      {side(`${n}. A) HV Winding`, r?.hv, o.windingHv)}
      {side(`${n}. B) LV Winding`, r?.lv, o.windingLv)}
      <p className="mt-3 text-[12px]">
        <b>Acceptance:</b> The resistances of the phases of each winding shall not differ by more than {IMBALANCE_LIMIT_PCT} % of their average.
      </p>
      <p className="mt-1 text-[12px]">
        <b>Result:</b> {r ? (r.pass ? 'Winding resistances are balanced and within limit.' : 'Imbalance exceeds the limit.') : 'Test not completed.'}
      </p>
    </>
  );
}

function TtrPage({ n, o, results }: { n: number; o: TestObject; results: TestResults }) {
  // results saved by the earlier TTR-meter version have no voltages
  const r = results.ttr?.rows.every((row) => Array.isArray(row.hvV)) ? results.ttr : undefined;
  const nPh = o.phases === '1' ? 1 : 3;
  const ph = nPh === 1 ? ['1.1–1.2 / 2.1–2.2'] : RATIO_PHASES;
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return (
    <>
      <SectionTitle>{n}. Measurement of Voltage Ratio</SectionTitle>
      <h4 className="mt-1 mb-1.5 text-[12px] font-bold">Test Condition:</h4>
      <Conditions
        rows={[
          ['Method', 'Test voltage applied on HV side, line voltage measured on LV side'],
          ['Applied voltage (HV)', `${ttrSupplyV(o)} V, three phase`],
          ['Rated voltages', `${o.hvVoltageKv} kV / ${o.lvVoltageV} V`],
          ['Tap changer', o.tapChanger === 'NONE' ? 'None' : `${o.tapChanger}, ${o.tapCount} positions, normal tap ${o.nominalTap}`],
          ['Ratio', 'Measured ratio = HV voltage applied / LV voltage measured'],
        ]}
      />
      <SubTitle>{n}. A) Voltage Ratio</SubTitle>
      <table className="rpt w-full">
        <thead>
          <tr>
            <th rowSpan={2}>Tap</th>
            <th rowSpan={2}>HV Applied (V)</th>
            <th rowSpan={2}>LV Measured (V)</th>
            <th rowSpan={2}>Rated Ratio</th>
            <th colSpan={nPh}>Measured Ratio</th>
            <th rowSpan={2}>Max. Deviation (%)</th>
          </tr>
          <tr>
            {ph.map((p) => (
              <th key={p}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(r?.rows ?? []).map((row) => (
            <tr key={row.tap} className={cn(row.nominal && 'font-bold')}>
              <td>
                {row.tap} ({row.pct >= 0 ? '+' : ''}
                {fmt(row.pct, 2)} %)
              </td>
              <td>{fmt(avg(row.hvV), 1)}</td>
              <td>{fmt(avg(row.lvV), 3)}</td>
              <td>{fmt(row.rated, 3)}</td>
              {row.measured.map((m, i) => (
                <td key={i}>{fmt(m, 3)}</td>
              ))}
              <td>{fmt(Math.max(...row.errorPct.map(Math.abs)), 3)}</td>
            </tr>
          ))}
          {!r && (
            <tr>
              <td colSpan={5 + nPh}>Not tested</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-[12px]">
        <b>Acceptance:</b> Deviation of the measured ratio from the rated ratio within ±{RATIO_TOLERANCE_PCT} % on every tap and phase.
      </p>
      <p className="mt-1 text-[12px]">
        <b>Result:</b> {r ? (r.pass ? 'Voltage ratio is within the permissible limit on all taps.' : 'Voltage ratio is outside the permissible limit.') : 'Test not completed.'}
      </p>
    </>
  );
}

function IrPage({ n, o, results }: { n: number; o: TestObject; results: TestResults }) {
  const r = results.ir;
  const mohm = (x: number | undefined) => {
    const f = formatMohm(x);
    return f.value === '—' ? '—' : `${f.value} ${f.unit}`;
  };
  return (
    <>
      <SectionTitle>{n}. Measurement of Insulation Resistance</SectionTitle>
      <h4 className="mt-1 mb-1.5 text-[12px] font-bold">Test Condition:</h4>
      <Conditions
        rows={[
          ['Instrument', 'Insulation resistance tester (DC)'],
          ['Ambient temperature', o.ambientTempC ? `${o.ambientTempC} °C` : '—'],
          ['Connection', 'Terminals of each winding shorted; winding not under test and tank earthed'],
          ['Readings', 'At 15 s, 60 s and 600 s after applying the test voltage'],
        ]}
      />
      <SubTitle>{n}. A) Insulation Resistance</SubTitle>
      <table className="rpt w-full">
        <thead>
          <tr>
            <th>Between</th>
            <th>Test Voltage (V DC)</th>
            <th>15 s</th>
            <th>60 s</th>
            <th>600 s</th>
            <th>DAI (60/15)</th>
            <th>PI (600/60)</th>
          </tr>
        </thead>
        <tbody>
          {(r?.pairs ?? []).map((p) => (
            <tr key={p.pair}>
              <td>{p.pair}</td>
              <td>{p.testV}</td>
              <td>{mohm(p.r15)}</td>
              <td>{mohm(p.r60)}</td>
              <td>{mohm(p.r600)}</td>
              <td>{fmt(p.dai, 2)}</td>
              <td className="font-bold">{fmt(p.pi, 2)}</td>
            </tr>
          ))}
          {!r && (
            <tr>
              <td colSpan={7}>Not tested</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-[12px]">
        <b>Acceptance:</b> DAI ≥ {DAI_MIN} and PI ≥ {PI_MIN} for each insulation.
      </p>
      <p className="mt-1 text-[12px]">
        <b>Result:</b> {r ? (r.pass ? 'Insulation resistance values are satisfactory.' : 'Insulation resistance is not satisfactory.') : 'Test not completed.'}
      </p>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_TITLE: Record<Printable, string> = {
  'no-load': 'Measurement of No-load Loss and No-load Current',
  'magnetic-balance': 'Magnetic Balance Test',
  'winding-resistance': 'Measurement of Winding Resistance',
  ratio: 'Measurement of Voltage Ratio',
  'insulation-resistance': 'Measurement of Insulation Resistance',
};

/** One row of the Summary of Test Results. */
function summaryRow(id: Printable, o: TestObject, results: TestResults) {
  switch (id) {
    case 'no-load':
      return {
        parameter: 'No Load Loss at 100 % of Rated Voltage',
        measured: results.nll && Number.isFinite(results.nll.p0) ? `${fmt(results.nll.p0)} W` : '—',
        guaranteed: o.guaranteedNoLoadLossW ? `${o.guaranteedNoLoadLossW} W` : '—',
        tolerance: `+${TOLERANCE * 100} %`,
      };
    case 'magnetic-balance':
      return { parameter: 'Magnetic Balance (sum of induced voltages = applied)', measured: mbtSummary(results), guaranteed: '100 %', tolerance: `±${SUM_TOLERANCE * 100} %` };
    case 'winding-resistance':
      return {
        parameter: `Winding Resistance at ${REF_TEMP_C} °C (phase imbalance)`,
        measured: results.wrm ? `HV ${fmt(results.wrm.hv.imbalancePct, 2)} %, LV ${fmt(results.wrm.lv.imbalancePct, 2)} %` : '—',
        guaranteed: '—',
        tolerance: `≤ ${IMBALANCE_LIMIT_PCT} %`,
      };
    case 'ratio': {
      const ttr = results.ttr?.rows.every((r) => Array.isArray(r.hvV)) ? results.ttr : undefined;
      const max = ttr?.rows.length ? Math.max(...ttr.rows.flatMap((r) => r.errorPct.map(Math.abs))) : NaN;
      return {
        parameter: 'Voltage Ratio (all taps)',
        measured: ttr ? `Max deviation ${fmt(max, 3)} %` : '—',
        guaranteed: 'Rated ratio',
        tolerance: `±${RATIO_TOLERANCE_PCT} %`,
      };
    }
    case 'insulation-resistance':
      return {
        parameter: 'Insulation Resistance (polarisation index)',
        measured: results.ir ? results.ir.pairs.map((p) => `${p.pair} PI ${fmt(p.pi, 2)}`).join(', ') : '—',
        guaranteed: '—',
        tolerance: `PI ≥ ${PI_MIN}`,
      };
  }
}


type Verdict = 'PASS' | 'FAIL' | null;

function verdictOf(id: string, results: TestResults): Verdict {
  if (id === 'no-load' && results.nll && Number.isFinite(results.nll.p0)) return results.nll.pass ? 'PASS' : 'FAIL';
  if (id === 'magnetic-balance' && results.mbt?.result) return results.mbt.result.pass ? 'PASS' : 'FAIL';
  if (id === 'winding-resistance' && results.wrm) return results.wrm.pass ? 'PASS' : 'FAIL';
  if (id === 'ratio' && results.ttr?.rows.every((r) => Array.isArray(r.hvV))) return results.ttr.pass ? 'PASS' : 'FAIL';
  if (id === 'insulation-resistance' && results.ir) return results.ir.pass ? 'PASS' : 'FAIL';
  return null;
}
const verdictText = (v: Verdict) => (v === 'PASS' ? 'Passed' : v === 'FAIL' ? 'Failed' : '—');

function mbtSummary(results: TestResults): string {
  const checks = (results.mbt?.rounds ?? []).filter(Boolean).map((r) => checkRound(r!));
  if (!checks.length) return '—';
  return checks.map((c) => `${PHASES[c.energised]} ${fmt(c.sum * 100, 1)} %`).join(', ');
}

function particulars(o: TestObject): string {
  return [
    o.ratedPowerKva && `${o.ratedPowerKva} kVA`,
    `${o.hvVoltageKv} kV / ${o.lvVoltageV} V`,
    o.vectorGroup,
    `${o.phases}-Phase`,
    o.cooling === 'DRY' ? 'Dry type' : `Oil filled (${o.cooling})`,
    `${o.windingHv === 'Cu' ? 'Copper' : 'Aluminium'} wound transformer`,
  ]
    .filter(Boolean)
    .join(', ');
}

function specRows(o: TestObject): Array<[string, string]> {
  const c = ratedCurrents(o);
  return [
    ['Rated power', o.ratedPowerKva ? `${o.ratedPowerKva} kVA` : ''],
    ['Rated voltage HV / LV', `${o.hvVoltageKv} kV / ${o.lvVoltageV} V`],
    ['Rated current HV / LV', `${fmt(c.hv, 2)} A / ${fmt(c.lv, 2)} A`],
    ['Phases / frequency', `${o.phases} / ${o.frequency} Hz`],
    ['Vector group', o.vectorGroup],
    ['Impedance voltage', o.impedancePct ? `${o.impedancePct} %` : ''],
    ['Type of cooling', o.cooling === 'DRY' ? 'Dry type' : o.cooling],
    ['Winding material HV / LV', `${o.windingHv} / ${o.windingLv}`],
    [
      'Tap changer',
      o.tapChanger === 'NONE' ? 'None' : `${o.tapChanger}, ${o.tapMinPct} % to +${o.tapMaxPct} %, ${o.tapCount} positions, normal tap ${o.nominalTap}`,
    ],
    ['Guaranteed no load loss', o.guaranteedNoLoadLossW ? `${o.guaranteedNoLoadLossW} W` : ''],
    ['Guaranteed load loss at 75 °C', o.guaranteedLoadLossW ? `${o.guaranteedLoadLossW} W` : ''],
    ['Ambient temperature during test', o.ambientTempC ? `${o.ambientTempC} °C` : ''],
  ];
}

// ── Page furniture ──────────────────────────────────────────────────────────

const sheetVariants = {
  hidden: { opacity: 0, y: 36 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

/** One A4 page: framed lab header, report number bar, page number. */
function Sheet({
  head,
  page,
  testedFooter,
  children,
}: {
  head: { reportNo: string; date: string; total: number };
  page: number;
  /** Test pages end with "Tested By / Witnessed By", like the sample */
  testedFooter?: string;
  children: ReactNode;
}) {
  const lines = [COMPANY.name, COMPANY.lab, COMPANY.address, COMPANY.phone].filter(Boolean);
  return (
    <motion.section
      variants={sheetVariants}
      className="relative flex h-[297mm] w-[210mm] shrink-0 flex-col bg-white px-[12mm] py-[12mm] report-sheet text-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] print:break-after-page print:shadow-none print:last:break-after-auto"
    >
      <div className="flex flex-1 flex-col border-[1.5px] border-black">
        {/* Lab header */}
        <div className="grid grid-cols-[42mm_1fr] border-b-[1.5px] border-black">
          <div className="grid place-items-center border-r-[1.5px] border-black p-3">
            <img src="/logo.png" alt="Company logo" className="logo-dark max-h-[22mm] w-auto" />
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 px-4 py-3 text-center">
            {lines.length ? (
              lines.map((l, i) => (
                <div key={i} className={i === 0 ? 'text-[17px] font-bold' : 'text-[12.5px] font-semibold'}>
                  {l}
                </div>
              ))
            ) : (
              <div className="text-[17px] font-bold">Transformer Test Laboratory</div>
            )}
          </div>
        </div>
        <div className="flex justify-between border-b-[1.5px] border-black px-3 py-1.5 text-[12.5px] font-bold">
          <span>Test Report No: {head.reportNo}</span>
          <span>Dated: {head.date}</span>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col px-[7mm] pt-3 pb-4">
          <div className="mb-2 text-right text-[12.5px] font-bold">
            Page No: {pad2(page)} of {pad2(head.total)}
          </div>
          {children}
          {testedFooter !== undefined && (
            <div className="mt-auto flex justify-between pt-[16mm] text-[12.5px] font-bold">
              <div>
                <div className="mb-1 h-[10mm] w-[50mm] border-b border-black text-[13px] font-normal italic leading-[10mm]">{testedFooter}</div>
                Tested By
              </div>
              <div className="text-right">
                <div className="mb-1 h-[10mm] w-[50mm] border-b border-black" />
                Witnessed By
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function PageTitle({ children, underline }: { children: ReactNode; underline?: boolean }) {
  return <h1 className={cn('mb-4 text-center text-[17px] font-bold', underline && 'underline underline-offset-4')}>{children}</h1>;
}
function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-[15px] font-bold">{children}</h2>;
}
function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 mb-1.5 text-[12.5px] font-bold">{children}</h3>;
}

/** Two-column ruled table: label | value. */
function Grid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="rpt w-full">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td className="w-[38%] text-left">{k}</td>
            <td className="text-left">{v || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Label : value" list, as in the sample's test conditions. */
function Conditions({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="mb-1 ml-4 text-[12.5px]">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td className="py-[3px] pr-6">{k}</td>
            <td className="px-3 py-[3px]">:</td>
            <td className="py-[3px]">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Signatures({ testedBy, operatorId }: { testedBy: string; operatorId?: string }) {
  return (
    <table className="rpt mt-auto w-full">
      <thead>
        <tr>
          <th className="w-1/3">TESTED BY</th>
          <th className="w-1/3">VERIFIED BY</th>
          <th className="w-1/3">WITNESSED BY</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="h-[34mm] align-bottom">
            <div className="font-bold">{testedBy}</div>
            {operatorId && <div className="text-[11px]">Operator {operatorId}</div>}
          </td>
          <td className="h-[34mm]" />
          <td className="h-[34mm]" />
        </tr>
      </tbody>
    </table>
  );
}
