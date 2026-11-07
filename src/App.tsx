import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ScanWipe } from '@/components/layout/ScanWipe';
import { usePlcBridge } from '@/hooks/usePlcBridge';
import { useAppStore } from '@/store/appStore';
import { LoginPage } from '@/pages/LoginPage';
import { TestObjectPage } from '@/pages/TestObjectPage';
import { TestSelectionPage } from '@/pages/TestSelectionPage';
import { TestExecutionPage } from '@/pages/TestExecutionPage';
import { INSTRUMENT_TESTS, InstrumentTestPage } from '@/pages/InstrumentTestPage';
import { SummaryPage } from '@/pages/SummaryPage';
import { PlcTestPage } from '@/pages/PlcTestPage';
import { ReportPage } from '@/pages/ReportPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const operator = useAppStore((s) => s.operator);
  return operator ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireTestObject({ children }: { children: ReactNode }) {
  const testObject = useAppStore((s) => s.testObject);
  return testObject ? <>{children}</> : <Navigate to="/test-object" replace />;
}

function RequireRun({ children }: { children: ReactNode }) {
  const { testId = '' } = useParams();
  const hasRun = useAppStore((s) => testId in s.runs);
  return hasRun ? <>{children}</> : <Navigate to="/test-selection" replace />;
}

/** Winding Resistance, Voltage Ratio and Insulation Resistance have their own screen. */
function TestScreen() {
  const { testId = '' } = useParams();
  return (INSTRUMENT_TESTS as readonly string[]).includes(testId) ? <InstrumentTestPage /> : <TestExecutionPage />;
}

function AppRoutes() {
  const location = useLocation();

  // Each route starts at the top (the form page is long).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/test-object" element={<TestObjectPage />} />
          <Route
            path="/test-selection"
            element={
              <RequireTestObject>
                <TestSelectionPage />
              </RequireTestObject>
            }
          />
          <Route
            path="/test/:testId"
            element={
              <RequireTestObject>
                <RequireRun>
                  <TestScreen />
                </RequireRun>
              </RequireTestObject>
            }
          />
          <Route
            path="/summary"
            element={
              <RequireTestObject>
                <SummaryPage />
              </RequireTestObject>
            }
          />
          <Route path="*" element={<Navigate to="/test-object" replace />} />
        </Routes>
      </AnimatePresence>
    </AppShell>
  );
}

export default function App() {
  usePlcBridge();
  const location = useLocation();
  const isLogin = location.pathname === '/login';

  // Test → test on the execution page gets the light scan; any other page change the curtain.
  const prevPath = useRef(location.pathname);
  const testToTest = prevPath.current.startsWith('/test/') && location.pathname.startsWith('/test/');
  useEffect(() => {
    prevPath.current = location.pathname;
  }, [location.pathname]);

  // Hidden diagnostics page: reachable only by typing /plc-test, no login needed.
  if (location.pathname === '/plc-test') {
    return (
      <MotionConfig reducedMotion="user">
        <PlcTestPage />
      </MotionConfig>
    );
  }

  // Printable report: full page, no app chrome.
  if (location.pathname === '/report') {
    return (
      <MotionConfig reducedMotion="user">
        <ScanWipe key="report" />
        <RequireAuth>
          <ReportPage />
        </RequireAuth>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <ScanWipe key={location.pathname} variant={testToTest ? 'scan' : 'curtain'} />
      <AnimatePresence mode="wait">
        {isLogin ? (
          <motion.div key="login" exit={{ opacity: 0, transition: { duration: 0.25 } }}>
            <LoginPage />
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <RequireAuth>
              <AppRoutes />
            </RequireAuth>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
