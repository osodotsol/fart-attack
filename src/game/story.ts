// "The Great Stink Disaster" — story script as data. Rendered by renderer/Cutscene.tsx; shown once per session.

export type Speaker = 'narrator' | 'robot' | 'kid' | 'teacher' | 'waiter' | 'crowd';
export type Backdrop = 'living' | 'classroom' | 'restaurant' | 'city';
/** Visual cue for the panel — each maps to a small character arrangement in Cutscene.tsx. */
export type Cue =
  | 'peaceful' | 'beans' | 'pfft' | 'alarm' | 'robot-arrives' | 'robot-scan' | 'robot-hope'
  | 'robot-cheer' | 'robot-phone' | 'robot-shock' | 'kid-school' | 'teacher-warns'
  | 'teacher-busts' | 'kid-escapes' | 'kid-restaurant' | 'waiter-special' | 'city-saved' | 'kid-sorry';
export type Sfx = 'fart' | 'bigfart' | 'alarm' | 'beep' | 'cheer' | 'whistle' | 'oops' | 'gag' | 'ahem';

export interface Panel {
  backdrop: Backdrop;
  cue: Cue;
  speaker: Speaker;
  /** Subtitle (always shown). */
  text: string;
  sfx?: Sfx;
  /** Spoken aloud when the voice is on/available. Only the best moments are voiced. */
  voice?: boolean;
  /** Speech-friendly wording when it differs from the subtitle (numbers, symbols). */
  say?: string;
}

export type SceneId = 'opening' | 'after1' | 'after2' | 'finale';

export const STORY: Record<SceneId, readonly Panel[]> = {
  opening: [
    { backdrop: 'living', cue: 'peaceful', speaker: 'narrator', text: 'A peaceful afternoon in the quiet town of Beanbury…', voice: true },
    { backdrop: 'living', cue: 'beans', speaker: 'kid', text: 'Mmm… my FOURTH plate of beans! Best. Day. Ever.', voice: true },
    { backdrop: 'living', cue: 'pfft', speaker: 'narrator', text: 'PFFFFFFFFFFFT! 💨', sfx: 'bigfart' },
    { backdrop: 'living', cue: 'alarm', speaker: 'narrator', text: '⚠️ STINK EMERGENCY! ⚠️ The family flees. The furniture trembles.', sfx: 'alarm' },
    { backdrop: 'living', cue: 'robot-arrives', speaker: 'robot', text: "FRESHBOT 3000 reporting! EMERGENCY! We've got a Category 5 FARTASTROPHE!", voice: true, say: "Freshbot three thousand reporting! EMERGENCY! We've got a Category five FARTASTROPHE!" },
    { backdrop: 'living', cue: 'robot-scan', speaker: 'robot', text: 'My cleaning gadgets need a pilot… wait. Your FACE! My sensors can read your expressions!', sfx: 'beep' },
    { backdrop: 'living', cue: 'robot-hope', speaker: 'robot', text: 'Smile at me and I spray. Your face is our only hope, Stink Control Hero!', voice: true, say: 'Smile at me and I spray. Your face is our only hope, Stink Control Hero!' },
  ],
  after1: [
    { backdrop: 'living', cue: 'robot-cheer', speaker: 'robot', text: 'YOU DID IT! The living room is safe!', sfx: 'cheer', voice: true },
    { backdrop: 'living', cue: 'robot-phone', speaker: 'robot', text: '*beep beep* Incoming stink alert…', sfx: 'beep' },
    { backdrop: 'living', cue: 'robot-shock', speaker: 'robot', text: "Oh no… HE'S GOING TO SCHOOL!", voice: true },
    { backdrop: 'classroom', cue: 'kid-school', speaker: 'kid', text: 'Bean burrito for lunch, bean salad for snack… what could go wrong?' },
    { backdrop: 'classroom', cue: 'teacher-warns', speaker: 'teacher', text: 'Settle down, class. And I want NO giggling today. None!' },
    { backdrop: 'classroom', cue: 'robot-hope', speaker: 'robot', text: "Psst! Smile to spray — but DON'T LAUGH while the teacher is looking!" },
  ],
  after2: [
    { backdrop: 'classroom', cue: 'teacher-busts', speaker: 'teacher', text: 'BEAN KID! Was that YOU?!', sfx: 'whistle', voice: true },
    { backdrop: 'classroom', cue: 'kid-escapes', speaker: 'kid', text: 'Gotta goooo!', sfx: 'oops' },
    { backdrop: 'city', cue: 'robot-shock', speaker: 'robot', text: "He's escaped! And he's heading for a… RESTAURANT!", voice: true },
    { backdrop: 'restaurant', cue: 'waiter-special', speaker: 'waiter', text: "Welcome! Today's special: the MEGA BEAN BUCKET." },
    { backdrop: 'restaurant', cue: 'kid-restaurant', speaker: 'kid', text: "I'll take TWO!" },
    { backdrop: 'restaurant', cue: 'robot-hope', speaker: 'robot', text: 'MEGA farts incoming! Smiles still work — and a SURPRISED face throws the windows open!' },
  ],
  finale: [
    { backdrop: 'city', cue: 'city-saved', speaker: 'robot', text: 'CONGRATULATIONS! YOU SAVED THE CITY!', sfx: 'cheer', voice: true },
    { backdrop: 'city', cue: 'kid-sorry', speaker: 'kid', text: "Sorry everyone… I'll switch to salad.", voice: true },
    { backdrop: 'city', cue: 'robot-cheer', speaker: 'robot', text: '…He says that every time. Thank you, Stink Control Hero!' },
  ],
};

/** Story scene that plays after winning a level (before the next one). */
export const SCENE_AFTER: Record<number, SceneId> = { 1: 'after1', 2: 'after2', 3: 'finale' };

/** FRESHBOT's in-game one-liners, picked by event. */
export const QUIPS = {
  start: ['Ready when you are, hero!', 'Noses up! Here we go!'],
  fart: ['Incoming!', 'Was that a trumpet?!', 'Oh no, not again…', 'Category 3 toot!'],
  mega: ['MEGA FART! Brace yourselves!', 'That one hit the Richter scale!', 'Windows! WINDOWS!'],
  spray: ['Fresh mountain breeze!', 'Ahh, lavender!', 'Spritz spritz!', 'Nice smile!'],
  windows: ['WHOOSH! Fresh air!', 'Great surprised face!', 'Open sesame!'],
  warn: ['Teacher is turning! Poker face!', 'Uh-oh — eyes front!'],
  caught: ['BUSTED! Spray confiscated!', "You laughed! The teacher saw!", 'Detention for my nozzle!'],
  customer: ['Table four is leaving!', "There goes a customer… and their tip.", 'Customers are fleeing!'],
  danger: ['The stink is critical!', "I can't feel my sensors!", 'Code red! Code GREEN!'],
  win: ['Smells like victory!', 'Spotless!'],
  lose: ['That was… a lot of stink.', 'My circuits are melting. Try again?'],
} as const;

export type QuipKind = keyof typeof QUIPS;

/** Bean Kid's spoken in-game excuses (varied so the same catchphrase never repeats back-to-back). */
export const KID_EXCUSES: readonly string[] = ["Wasn't me!", 'It was the dog!', 'Who, me?!', "That wasn't even mine!"];

/** Pick from a list but never the same thing as last time (when there is a choice). rand is injectable for tests. */
export function pickDifferent<T>(list: readonly T[], last: T | undefined, rand: () => number = Math.random): T {
  const pool = list.length > 1 ? list.filter((x) => x !== last) : list;
  return pool[Math.floor(rand() * pool.length)];
}
