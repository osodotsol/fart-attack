// Data-driven level definitions. Only verified expressions are used (docs/SDK_VALIDATION.md):
// HAPPY → freshener (all levels), SURPRISE → windows (optional faster route where enabled). Keyboard always works.

export interface FreshenerConfig {
  /** How long one activation sprays for. */
  durationMs: number;
  /** Stink removed per second while spraying. */
  drainPerSec: number;
  /** Reload time after the spray ends. */
  cooldownMs: number;
  points: number;
}

export interface WindowsConfig {
  stink: number;
  points: number;
  cooldownMs: number;
}

/** Classroom "DON'T LAUGH!" — penalises only NEW freshener activations while the teacher is watching. */
export interface TeacherConfig {
  firstTurnMs: number;
  /** Time facing the board between turns. */
  awayMinMs: number;
  awayMaxMs: number;
  /** Visible warning before the teacher turns round. */
  warnMs: number;
  watchMinMs: number;
  watchMaxMs: number;
  penaltyPoints: number;
  penaltyStink: number;
}

/** Restaurant: every Nth fart is a MEGA fart. */
export interface MegaConfig {
  every: number;
  stink: number;
}

/** Restaurant: customers leave while the stink is high. Affects score only (never causes a loss). */
export interface CustomersConfig {
  start: number;
  leaveAtStink: number;
  leaveEveryMs: number;
  pointsPerCustomer: number;
}

export interface LevelDef {
  id: number;
  name: string;
  tagline: string;
  theme: 'living' | 'classroom' | 'restaurant';
  /** false = shown in level select as "coming soon" (not playable yet). */
  available: boolean;
  roundMs: number;
  startStink: number;
  firstFartMs: number;
  fart: { minMs: number; maxMs: number; stink: number };
  /** Number of distinct places farts can come from (desks / tables) — drives the scene. */
  fartSources: number;
  /** Passive stink growth per second, ramping linearly over the round. */
  growth: { start: number; end: number };
  freshener: FreshenerConfig;
  /** null = windows not available in this level. */
  windows: WindowsConfig | null;
  teacher?: TeacherConfig;
  mega?: MegaConfig;
  customers?: CustomersConfig;
  howTo: string[];
}

const FRESHENER: FreshenerConfig = { durationMs: 4_000, drainPerSec: 6, cooldownMs: 2_000, points: 100 };

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    name: 'Living Room Disaster',
    tagline: 'Bean Kid has contaminated the family living room.',
    theme: 'living',
    available: true,
    roundMs: 45_000,
    startStink: 10,
    firstFartMs: 1_500,
    fart: { minMs: 7_000, maxMs: 10_000, stink: 15 },
    fartSources: 1,
    growth: { start: 0.6, end: 1.2 },
    freshener: FRESHENER,
    windows: null,
    howTo: ['😄 A quick smile turns on the air freshener for 4 seconds.', 'Relax while it sprays — no need to keep smiling.', 'Keep the stink meter out of the red until time runs out!'],
  },
  {
    id: 2,
    name: 'Classroom Chaos',
    tagline: "DON'T LAUGH when the teacher is watching!",
    theme: 'classroom',
    available: true,
    roundMs: 55_000,
    startStink: 12,
    firstFartMs: 2_000,
    fart: { minMs: 5_000, maxMs: 8_000, stink: 14 },
    fartSources: 4,
    growth: { start: 0.7, end: 1.3 },
    freshener: FRESHENER,
    windows: null,
    teacher: {
      firstTurnMs: 9_000, awayMinMs: 6_000, awayMaxMs: 9_000, warnMs: 1_500, watchMinMs: 2_500, watchMaxMs: 3_500,
      penaltyPoints: 150, penaltyStink: 10,
    },
    howTo: ['😄 Smile to spray — but NOT while the teacher is watching!', '⚠️ When you see the warning, get your spray in or wait.', 'Caught = spray confiscated, points lost, more stink.'],
  },
  {
    id: 3,
    name: 'Restaurant Emergency',
    tagline: 'Bean Kid ordered the biggest plate of beans on the menu.',
    theme: 'restaurant',
    available: true,
    roundMs: 60_000,
    startStink: 12,
    firstFartMs: 2_000,
    fart: { minMs: 5_500, maxMs: 8_000, stink: 14 },
    fartSources: 3,
    growth: { start: 0.7, end: 1.3 },
    freshener: FRESHENER,
    windows: { stink: 35, points: 250, cooldownMs: 6_000 },
    mega: { every: 3, stink: 28 },
    customers: { start: 12, leaveAtStink: 60, leaveEveryMs: 2_500, pointsPerCustomer: 100 },
    howTo: ['😄 Smile to spray — it works on everything.', '😮 Surprise face (or K) throws the windows open: a faster fix for MEGA farts.', 'Keep the stink low so customers stay — each one left is bonus points!'],
  },
];

export const getLevel = (id: number): LevelDef => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
export const nextLevel = (id: number): LevelDef | undefined => LEVELS.find((l) => l.id === id + 1 && l.available);

/** Funny end-of-campaign title from total score. Calibrated 2026-11-17 by simulation: perfect play + windows ≈9.5–10.5k,
 *  diligent smile-only ≈6.1–6.9k, relaxed ≈5.0k, sloppy ≈4.6k (all 3 levels). */
export const RANKS: readonly { min: number; title: string }[] = [
  { min: 9_000, title: 'SUPREME MINISTER OF FRESH AIR' },
  { min: 6_500, title: 'Grand Febreze Ninja' },
  { min: 5_500, title: 'Certified Window Warrior' },
  { min: 3_500, title: 'Junior Stink Inspector' },
  { min: 0, title: 'Professional Nose-Holder' },
];

export const rankTitle = (score: number): string => (RANKS.find((r) => score >= r.min) ?? RANKS[RANKS.length - 1]).title;
