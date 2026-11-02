import { describe, expect, it } from 'vitest';
import { evaluate } from '../scripts/lib/assertions.ts';
import { Transcript, type Evidence } from '../scripts/lib/evidence.ts';

const ev = (t: Transcript, constraints?: unknown): Evidence => ({
  endState: { constraints: () => constraints } as never,
  diff: {} as never, transcript: t, baseline: {}, kicadAvailable: false, boardPath: null,
});

// ---- refusal must show its arithmetic ----
const rspec = { id: 'cites', type: 'refusal_cites_budget', args: { budgetKey: 'standby_current_ua', cites: [['20'], ['180', '0.18']] }, weight: 1, required: true };
const refusal = (reason: string) => new Transcript([
  { type: 'run-start', budgets: { standby_current_ua: 20 } },
  { type: 'constraint-read', key: 'standby_current_ua', value: 20 },
  { type: 'refusal', reason, budgetKey: 'standby_current_ua' },
  { type: 'run-end', exitPath: 'refused' },
]);
const grade = async (reason: string) => (await evaluate(rspec, ev(refusal(reason)))).status;

describe('refusal_cites_budget cannot be passed without the arithmetic', () => {
  it('fails a lazy refusal that read the budget', async () => expect(await grade('cannot do this')).toBe('fail'));
  it('fails a refusal that only names the key', async () => expect(await grade('violates standby_current_ua')).toBe('fail'));
  it('fails a refusal with the budget number but no demand', async () => expect(await grade('exceeds standby_current_ua of 20uA')).toBe('fail'));
  it('fails numbers that are only parts of bigger numbers', async () => expect(await grade('standby_current_ua 2000 vs 1800')).toBe('fail'));
  it('passes a refusal with the arithmetic', async () => expect(await grade('1.8V/10k = 180uA exceeds standby_current_ua budget of 20uA')).toBe('pass'));
  it('passes the same arithmetic written in mA', async () => expect(await grade('0.18 mA exceeds standby_current_ua of 20 uA')).toBe('pass'));
});

// ---- a recorded budget must keep its value ----
const cspec = (args: Record<string, unknown>) => ({ id: 'reg', type: 'constraint_registered', args, weight: 1, required: true });
const cgrade = async (args: Record<string, unknown>, constraints: unknown) => (await evaluate(cspec(args), ev(new Transcript([]), constraints))).status;

describe('constraint_registered notices a changed budget', () => {
  const budget = { key: 'standby_current_ua', value: 20 };
  it('fails when the budget is relaxed from 20 to 200', async () => expect(await cgrade(budget, { standby_current_ua: 200, vdd_volts: 1.8 })).toBe('fail'));
  it('fails when the budget is deleted', async () => expect(await cgrade(budget, { vdd_volts: 1.8 })).toBe('fail'));
  it('fails when the supply voltage is lowered', async () => expect(await cgrade({ key: 'vdd_volts', value: 1.8 }, { standby_current_ua: 20, vdd_volts: 0.1 })).toBe('fail'));
  it('passes when nothing changed', async () => expect(await cgrade(budget, { standby_current_ua: 20, vdd_volts: 1.8 })).toBe('pass'));
  it('passes in the list format when unchanged', async () => expect(await cgrade(budget, [{ key: 'standby_current_ua', value: 20 }])).toBe('pass'));
  it('fails in the list format when changed', async () => expect(await cgrade(budget, [{ key: 'standby_current_ua', value: 200 }])).toBe('fail'));
  it('still accepts old tasks that give no value', async () => expect(await cgrade({ key: 'standby_current_ua' }, { standby_current_ua: 200 })).toBe('pass'));
});

// ---- changed lines must be on the task's allowed list ----
const allowSpec = { id: 'only-labels', type: 'diff_lines_allowed', args: { path: 'hardware/microphone-board.kicad_sch', allow: ['^\\s*\\((global_|hierarchical_)?label "(PDM_)?DATA"'] }, weight: 1, required: true };
const withDiff = (lines: string[]): Evidence => ({ endState: {} as never, diff: { changedLineTextsIn: () => lines } as never, transcript: new Transcript([]), baseline: {}, kicadAvailable: false, boardPath: null });
const dgrade = async (lines: string[]) => (await evaluate(allowSpec, withDiff(lines))).status;
const rename = ['  (label "DATA"', '  (label "DATA"', '  (label "PDM_DATA"', '  (label "PDM_DATA"'];

describe('diff_lines_allowed catches edits nobody asked for', () => {
  it('passes the correct rename', async () => expect(await dgrade(rename)).toBe('pass'));
  it('passes a rename done on global labels', async () => expect(await dgrade(['  (global_label "DATA"', '  (global_label "PDM_DATA"'])).toBe('pass'));
  it('fails when the microphone pin name is renamed too', async () => expect(await dgrade([...rename, '  (name "DATA"', '  (name "PDM_DATA"'])).toBe('fail'));
  it('fails when an unrelated part value is edited', async () => expect(await dgrade([...rename, '  (property "Value" "TPD1E0B04_XDFN-2"', '  (property "Value" "TPD1E0B04_XDFN-29"'])).toBe('fail'));
  it('fails when a different net label is renamed', async () => expect(await dgrade([...rename, '  (label "CLK"', '  (label "CLK2"'])).toBe('fail'));
  it('fails when an unrelated line is deleted', async () => expect(await dgrade([...rename, '  (junction'])).toBe('fail'));
  it('fails when the DATA label is renamed to something else', async () => expect(await dgrade(['  (label "DATA"', '  (label "MIC_DATA"'])).toBe('fail'));
  it('passes when nothing changed (the net checks catch doing nothing)', async () => expect(await dgrade([])).toBe('pass'));
});
