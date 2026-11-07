import { addr, SIDE_CODE } from '@/config/tags';
import type { SequenceDurations, Side } from '@/config/tests';
import type { PlcService } from './PlcService';

/**
 * High-level sequence commands built on the raw PlcService primitives.
 * These encode *how* the ladder program expects to be driven; the UI calls
 * these and never touches addresses directly.
 */

export interface SequenceConfig {
  testCode: number;
  side: Side;
  durations: SequenceDurations;
  /** Variac output target, V (written to VARIAC_SET) */
  variacSetV: number;
}

const PULSE_MS = 120;

async function pulse(service: PlcService, address: number): Promise<void> {
  await service.writeCoil(address, true);
  // The ladder resets the coil on its own; this is a fallback for programs
  // that expect the HMI to drop it.
  setTimeout(() => {
    if (service.isConnected()) void service.writeCoil(address, false).catch(() => undefined);
  }, PULSE_MS);
}

export async function writeSequenceConfig(service: PlcService, cfg: SequenceConfig): Promise<void> {
  await service.writeRegister(addr('TEST_SELECT'), cfg.testCode);
  await service.writeRegister(addr('SIDE_SELECT'), SIDE_CODE[cfg.side]);
  await service.writeRegister(addr('T1_PRESET'), Math.round(cfg.durations.t1));
  await service.writeRegister(addr('WAIT_PRESET'), Math.round(cfg.durations.wait));
  await service.writeRegister(addr('T2_PRESET'), Math.round(cfg.durations.t2));
  await service.writeRegister(addr('VARIAC_SET'), Math.max(0, Math.min(0xffff, Math.round(cfg.variacSetV))));
}

export async function startSequence(service: PlcService, cfg: SequenceConfig): Promise<void> {
  await writeSequenceConfig(service, cfg);
  await pulse(service, addr('START'));
}

/** Aborts a running sequence; when idle, acknowledges/resets the step to IDLE. */
export async function stopSequence(service: PlcService): Promise<void> {
  await pulse(service, addr('STOP'));
}
