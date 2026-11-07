import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, Eraser, ListOrdered, Play } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '@/components/layout/Page';
import { TestCard } from '@/components/feature/TestCard';
import { Button, Panel, stagger } from '@/components/ui';
import { TEST_DEFINITIONS, connectionLabel, getTestDefinition, totalDuration } from '@/config/tests';
import { useAppStore } from '@/store/appStore';
import { durationLabel } from '@/lib/format';
import { applySelectionBits } from '@/services/plc/selectionBits';
import { usePlcStore } from '@/store/plcStore';

export function TestSelectionPage() {
  const navigate = useNavigate();
  const testObject = useAppStore((s) => s.testObject);
  const selection = useAppStore((s) => s.selection);
  const toggleTest = useAppStore((s) => s.toggleTest);
  const selectAllTests = useAppStore((s) => s.selectAllTests);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const beginSequence = useAppStore((s) => s.beginSequence);
  const online = usePlcStore((s) => s.status?.link === 'ONLINE');

  // Selection bits go HIGH the moment a test is ticked, LOW when it is unticked.
  const selectedKey = selection.map((s) => s.testId).join(',');
  useEffect(() => {
    if (online) void applySelectionBits(selectedKey ? selectedKey.split(',') : []).catch(() => undefined);
  }, [selectedKey, online]);

  const available = TEST_DEFINITIONS.filter((t) => t.available);
  const total = selection.reduce((acc, s) => {
    const d = getTestDefinition(s.testId);
    return acc + (d ? totalDuration(d.defaultDurations) : 0);
  }, 0);

  const start = () => {
    if (!selection.length) return;
    beginSequence();
    navigate(`/test/${selection[0].testId}`);
  };

  return (
    <Page>
      <PageHeader
        code="STEP 02 / TEST SELECTION"
        title="Select Tests"
        subtitle={
          <>
            Tests run in the order you select them. Object:{' '}
            <span className="num text-fg">{testObject?.serialNo}</span> · {testObject?.ratedPowerKva} kVA ·{' '}
            {testObject?.hvVoltageKv} kV / {testObject?.lvVoltageV} V
          </>
        }
        aside={
          <>
            <Button size="sm" variant="ghost" onClick={selectAllTests} icon={<CheckCheck className="size-3.5" aria-hidden />}>
              Select all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={selection.length === 0}
              icon={<Eraser className="size-3.5" aria-hidden />}
            >
              Clear
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <motion.div
          variants={stagger(0.04, 0)}
          className="grid min-w-0 auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
        >
          {available.map((def) => {
            const idx = selection.findIndex((s) => s.testId === def.id);
            return <TestCard key={def.id} def={def} order={idx >= 0 ? idx + 1 : null} onToggle={() => toggleTest(def.id)} />;
          })}
        </motion.div>

        <motion.aside variants={stagger(0.1, 0)} className="xl:sticky xl:top-20 xl:self-start">
          <Panel
            tag="SEQ"
            title="Run Order"
            aside={
              <span className="num flex items-center gap-1.5 text-[13px] text-fg-dim">
                <ListOrdered className="size-3.5" aria-hidden />
                {selection.length}/{available.length}
              </span>
            }
            bodyClassName="p-0"
          >
            <ol className="max-h-[52vh] min-h-[136px] overflow-y-auto" aria-live="polite">
              <AnimatePresence initial={false}>
                {selection.length === 0 && (
                  <motion.li
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    className="num px-4 py-10 text-center text-[13px] text-fg-dim"
                  >
                    NO TESTS SELECTED
                  </motion.li>
                )}
                {selection.map((s, i) => {
                  const def = getTestDefinition(s.testId);
                  if (!def) return null;
                  return (
                    <motion.li
                      key={s.testId}
                      layout
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      className="flex items-center gap-3 border-b border-line px-4 py-2.5"
                    >
                      <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[14px] font-bold text-[var(--on-accent)]">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] text-fg">{def.name}</div>
                        <div className="num truncate text-[13px] text-fg-dim">
                          {def.code} · {connectionLabel(def.defaultSide, def.otherWinding).toUpperCase()}
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <span className="label-tech text-[13px]">Total sequence time</span>
              <span className="num text-sm text-fg">{durationLabel(total)}</span>
            </div>
            <div className="border-t border-line p-4">
              <Button
                variant="primary"
                size="xl"
                magnetic
                className="w-full"
                disabled={selection.length === 0}
                onClick={start}
                icon={<Play className="size-5 fill-current" aria-hidden />}
              >
                Start
              </Button>
              <p className="num mt-2 text-center text-[13px] text-fg-dim">
                {selection.length ? `Opens test 1 of ${selection.length}` : 'Select at least one test'}
              </p>
            </div>
          </Panel>
        </motion.aside>
      </div>
    </Page>
  );
}
