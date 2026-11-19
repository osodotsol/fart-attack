// Game/cutscene backdrops and the living stink cloud. Presentational only.
import type { ReactNode } from 'react';
import type { TeacherPhase } from '../../game/engine';
import { BeanKid, FreshBot, Seated, Teacher, Waiter, type KidMood, type SeatedMood } from './characters';

export const GasDefs = () => (
  <defs>
    <radialGradient id="gas" cx="0.45" cy="0.4" r="0.6">
      <stop offset="0" stopColor="#c6f06b" />
      <stop offset="1" stopColor="#6fa82b" />
    </radialGradient>
    <radialGradient id="megagas" cx="0.45" cy="0.4" r="0.6">
      <stop offset="0" stopColor="#d7ff5c" />
      <stop offset="1" stopColor="#4f8a12" />
    </radialGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#7fd1ff" />
      <stop offset="1" stopColor="#d8f3ff" />
    </linearGradient>
  </defs>
);

const PUFFS = [
  [0, 0, 70], [-70, 20, 55], [70, 15, 60], [-35, -45, 55], [40, -40, 58], [-95, -20, 40], [100, -25, 42], [0, 50, 50],
] as const;

export function Cloud({ stink, x, y }: { stink: number; x: number; y: number }) {
  const scale = 0.3 + (stink / 100) * 2.1;
  return (
    <g className="cloud" style={{ transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: stink < 1 ? 0 : 0.45 + stink * 0.004 }}>
      <g className="cloud-wobble">
        {PUFFS.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="url(#gas)" stroke="#5c8f22" strokeWidth={3 / scale} />
        ))}
        {stink > 55 && (
          <g className="stink-lines" stroke="#4d7a1a" strokeWidth={4 / scale} fill="none" strokeLinecap="round">
            <path d="M-60 -90 q10 -20 0 -40 q-10 -20 0 -40" />
            <path d="M0 -100 q10 -20 0 -40 q-10 -20 0 -40" />
            <path d="M60 -90 q10 -20 0 -40 q-10 -20 0 -40" />
          </g>
        )}
      </g>
    </g>
  );
}

const PFFT = ['PFFRRT!', 'BRAAP!', 'TOOT!', 'FRRRP!', 'PARP!', 'THBBT!'];

export function FartPuff({ fartKey, x, y, mega }: { fartKey: number; x: number; y: number; mega?: boolean }) {
  if (fartKey <= 0) return null;
  const s = mega ? 1.8 : 1;
  return (
    <g key={fartKey} transform={`translate(${x} ${y})`}>
      <g className="fart-puff" style={{ ['--s' as string]: s }}>
        <circle r="22" fill={mega ? 'url(#megagas)' : 'url(#gas)'} />
        <circle cx="24" cy="-8" r="16" fill={mega ? 'url(#megagas)' : 'url(#gas)'} />
        <circle cx="-18" cy="-12" r="14" fill={mega ? 'url(#megagas)' : 'url(#gas)'} />
        <text x="30" y="-36" className={mega ? 'pfft mega' : 'pfft'}>{mega ? 'MEGA BRAAAP!' : PFFT[fartKey % PFFT.length]}</text>
      </g>
    </g>
  );
}

function Window({ x, y, open, windowsKey, w = 180, h = 160 }: { x: number; y: number; open: boolean; windowsKey: number; w?: number; h?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-10" y="-10" width={w + 20} height={h + 20} rx="8" fill="#7d4a2a" />
      <rect width={w} height={h} fill="url(#sky)" />
      <circle cx={w - 40} cy="40" r="18" fill="#ffe066" />
      {open && (
        <g key={windowsKey} className="wind">
          <path d="M20 50 q30 -15 60 0 t60 0" />
          <path d="M10 90 q30 -15 60 0 t60 0" />
          <path d="M30 130 q30 -15 60 0 t60 0" />
        </g>
      )}
      <g className={`pane pane-left ${open ? 'open' : ''}`}>
        <rect width={w / 2} height={h} fill="#d9f1ff" fillOpacity="0.5" stroke="#7d4a2a" strokeWidth="6" />
      </g>
      <g className={`pane pane-right ${open ? 'open' : ''}`}>
        <rect x={w / 2} width={w / 2} height={h} fill="#d9f1ff" fillOpacity="0.5" stroke="#7d4a2a" strokeWidth="6" />
      </g>
    </g>
  );
}

/** FRESHBOT hovering in the corner; sprays a stream toward the cloud while active. */
function Bot({ spraying, stink }: { spraying: boolean; stink: number }) {
  return (
    <g transform="translate(110 150) scale(0.85)">
      <FreshBot mood={spraying ? 'happy' : stink > 75 ? 'alarm' : 'talk'} spraying={spraying} />
      {spraying && (
        <g className="spray-stream">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <circle key={i} cx={100} cy={-46} r={10 + i * 3} style={{ animationDelay: `${i * 0.13}s` }} />)}
        </g>
      )}
    </g>
  );
}

export interface SceneProps {
  theme: 'living' | 'classroom' | 'restaurant';
  stink: number;
  spraying: boolean;
  windowsOpen: boolean;
  windowsKey: number;
  fartKey: number;
  fartSource: number;
  mega: boolean;
  teacherPhase?: TeacherPhase | null;
  customers?: number | null;
  customersStart?: number;
  leftKey?: number;
  /** FRESHBOT's current one-liner (drawn next to the robot). */
  quip?: string | null;
  quipKey?: number;
}

const kidMood = (stink: number): KidMood => (stink < 35 ? 'smug' : stink < 70 ? 'worried' : 'gag');
const crowdMood = (stink: number, laughing: boolean): SeatedMood => (stink > 75 ? 'gag' : laughing ? 'laugh' : 'normal');

export function GameScene(p: SceneProps) {
  return (
    <svg className={`room ${p.mega && p.fartKey ? 'shake-' + (p.fartKey % 2) : ''}`} viewBox="0 0 800 500" role="img" aria-label={`Stink level ${Math.round(p.stink)} percent`}>
      <GasDefs />
      {p.theme === 'living' && <LivingRoom {...p} />}
      {p.theme === 'classroom' && <Classroom {...p} />}
      {p.theme === 'restaurant' && <Restaurant {...p} />}
      <Bot spraying={p.spraying} stink={p.stink} />
      {p.quip && (
        <g key={p.quipKey} className="quip-svg" transform="translate(196 52)">
          <rect x="0" y="-26" width={p.quip.length * 10.5 + 28} height="40" rx="14" fill="#fff" stroke="#24908b" strokeWidth="3" />
          <path d="M2 4 L-16 22 L18 10 Z" fill="#fff" stroke="#24908b" strokeWidth="3" strokeLinejoin="round" />
          <rect x="3" y="-2" width="20" height="12" fill="#fff" />
          <text x="14" y="0" className="quip-text">{p.quip}</text>
        </g>
      )}
    </svg>
  );
}

function LivingRoomBackdrop({ children }: { children?: ReactNode }) {
  return (
    <>
      <rect width="800" height="500" fill="#ffe2a8" />
      <rect y="372" width="800" height="128" fill="#a8693f" />
      <rect y="364" width="800" height="12" fill="#7d4a2a" />
      {Array.from({ length: 24 }, (_, i) => <circle key={i} cx={40 + (i % 8) * 100} cy={50 + Math.floor(i / 8) * 100} r="5" fill="#f0bf74" />)}
      <rect x="250" y="70" width="120" height="90" rx="6" fill="#7d4a2a" />
      <rect x="260" y="80" width="100" height="70" fill="#9fd3f5" />
      <path d="M260 150 L295 110 L320 135 L340 115 L360 150 Z" fill="#5fae5a" />
      {/* couch */}
      <rect x="230" y="270" width="300" height="70" rx="22" fill="#5b6ee1" />
      <rect x="215" y="300" width="330" height="70" rx="20" fill="#4a5bd0" />
      <rect x="205" y="285" width="40" height="85" rx="16" fill="#3f4fbf" />
      <rect x="515" y="285" width="40" height="85" rx="16" fill="#3f4fbf" />
      {/* coffee table with bean plate */}
      <ellipse cx="620" cy="420" rx="80" ry="14" fill="#6b3d22" />
      <rect x="560" y="420" width="10" height="40" fill="#6b3d22" />
      <rect x="670" y="420" width="10" height="40" fill="#6b3d22" />
      <ellipse cx="620" cy="410" rx="40" ry="9" fill="#fff" />
      <ellipse cx="620" cy="406" rx="28" ry="6" fill="#b5651d" />
      {children}
    </>
  );
}

function LivingRoom(p: SceneProps) {
  return (
    <LivingRoomBackdrop>
      <Window x={560} y={60} open={p.windowsOpen} windowsKey={p.windowsKey} w={170} h={140} />
      <g transform="translate(380 400) scale(0.85)"><BeanKid mood={kidMood(p.stink)} /></g>
      <FartPuff fartKey={p.fartKey} x={420} y={360} mega={p.mega} />
      <Cloud stink={p.stink} x={400} y={290} />
    </LivingRoomBackdrop>
  );
}

const DESK_X = [150, 320, 490, 660];

function ClassroomBackdrop({ children }: { children?: ReactNode }) {
  return (
    <>
      <rect width="800" height="500" fill="#cfe8d5" />
      <rect y="390" width="800" height="110" fill="#c9a26b" />
      {Array.from({ length: 9 }, (_, i) => <rect key={i} x={i * 100} y="390" width="2" height="110" fill="#b08550" />)}
      {/* chalkboard */}
      <rect x="170" y="40" width="460" height="170" rx="8" fill="#7d4a2a" />
      <rect x="182" y="52" width="436" height="146" fill="#2f5d46" />
      <text x="400" y="110" textAnchor="middle" className="chalk">NO GIGGLING!</text>
      <text x="400" y="160" textAnchor="middle" className="chalk small">2 + 2 = 💨 ?</text>
      <rect x="560" y="200" width="60" height="8" fill="#eee" />
      {/* clock */}
      <circle cx="90" cy="70" r="30" fill="#fff" stroke="#555" strokeWidth="5" />
      <path d="M90 70 V50 M90 70 H104" stroke="#333" strokeWidth="4" strokeLinecap="round" />
      {children}
    </>
  );
}

function Classroom(p: SceneProps) {
  const watching = p.teacherPhase === 'watching';
  const warning = p.teacherPhase === 'warning';
  return (
    <ClassroomBackdrop>
      <g transform="translate(560 360) scale(0.82)"><Teacher facing={watching ? 'class' : 'board'} warning={warning} /></g>
      {DESK_X.map((x, i) => (
        <g key={i}>
          <g transform={`translate(${x} 430)`}>
            {i === 1 ? (
              <g transform="translate(0 0) scale(0.55)"><g transform="translate(0 60)"><BeanKid mood={p.stink > 70 ? 'gag' : watching ? 'worried' : 'smug'} /></g></g>
            ) : (
              <Seated mood={crowdMood(p.stink, (watching && p.stink > 40) || (p.fartSource === i && p.fartKey > 0 && p.stink > 30))} hue={i} />
            )}
          </g>
          <rect x={x - 60} y="430" width="120" height="16" rx="3" fill="#8b5a2b" />
          <rect x={x - 52} y="446" width="104" height="40" fill="#7a4e24" />
        </g>
      ))}
      <FartPuff fartKey={p.fartKey} x={DESK_X[p.fartSource] ?? 400} y={410} mega={p.mega} />
      <Cloud stink={p.stink} x={400} y={330} />
      {watching && <rect className="watch-vignette" width="800" height="500" fill="none" stroke="#ff3b3b" strokeWidth="16" />}
    </ClassroomBackdrop>
  );
}

const TABLE_X = [170, 400, 630];

function RestaurantBackdrop({ children }: { children?: ReactNode }) {
  return (
    <>
      <rect width="800" height="500" fill="#7a1f2b" />
      {Array.from({ length: 16 }, (_, i) => <rect key={i} x={i * 50} y="0" width="25" height="380" fill="#6a1a25" />)}
      <rect y="380" width="800" height="120" fill="#2b2b2b" />
      {Array.from({ length: 16 }, (_, i) => <rect key={i} x={i * 50 + (i % 2) * 0} y={380 + (i % 2) * 30} width="50" height="30" fill="#f2f2f2" opacity={i % 2 ? 0.9 : 0.15} />)}
      {/* exit door */}
      <rect x="20" y="210" width="90" height="170" fill="#4a2c1a" />
      <rect x="30" y="185" width="70" height="22" rx="3" fill="#1e7d32" />
      <text x="65" y="202" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="900">EXIT</text>
      {/* sign */}
      <text x="560" y="50" textAnchor="middle" className="neon">BEAN BISTRO</text>
      {children}
    </>
  );
}

function Restaurant(p: SceneProps) {
  const start = p.customersStart ?? 12;
  // 5 customer seats (seat 2 is Bean Kid); show as many as the remaining-customer ratio allows.
  const customerSeats = [0, 1, 3, 4, 5];
  const visible = Math.round(((p.customers ?? start) / start) * customerSeats.length);
  const seatShown = (seat: number) => customerSeats.indexOf(seat) < visible;
  return (
    <RestaurantBackdrop>
      <Window x={570} y={80} open={p.windowsOpen} windowsKey={p.windowsKey} w={190} h={140} />
      <Window x={180} y={80} open={p.windowsOpen} windowsKey={p.windowsKey} w={150} h={140} />
      <g transform="translate(730 470) scale(0.75)"><Waiter /></g>
      {TABLE_X.map((x, t) => (
        <g key={t}>
          {[-40, 40].map((dx, k) => {
            const seat = t * 2 + k;
            if (t === 1 && k === 0) return <g key={k} transform={`translate(${x + dx} 420) scale(0.5)`}><g transform="translate(0 60)"><BeanKid mood={p.stink > 70 ? 'gag' : 'eat'} /></g></g>;
            return seatShown(seat) ? (
              <g key={k} transform={`translate(${x + dx} 420)`}><Seated mood={p.stink > 70 ? 'gag' : p.stink > 45 ? 'normal' : 'eat'} hue={seat} /></g>
            ) : null;
          })}
          <ellipse cx={x} cy="425" rx="90" ry="16" fill="#fff" />
          <rect x={x - 6} y="425" width="12" height="55" fill="#ccc" />
          <ellipse cx={x} cy="418" rx="22" ry="6" fill="#b5651d" />
        </g>
      ))}
      {(p.leftKey ?? 0) > 0 && (
        <g key={p.leftKey} className="runner">
          <g transform="scale(0.7)"><Seated mood="gag" hue={p.leftKey} /></g>
          <text x="10" y="-70" fontSize="22">💨😱</text>
        </g>
      )}
      <FartPuff fartKey={p.fartKey} x={TABLE_X[p.fartSource] ?? 400} y={400} mega={p.mega} />
      <Cloud stink={p.stink} x={400} y={300} />
    </RestaurantBackdrop>
  );
}

function CityBackdrop({ children }: { children?: ReactNode }) {
  return (
    <>
      <rect width="800" height="500" fill="url(#sky)" />
      {[[40, 180, 90], [150, 120, 70], [240, 200, 110], [370, 90, 80], [470, 160, 100], [590, 110, 70], [680, 190, 110]].map(([x, h, w], i) => (
        <g key={i}>
          <rect x={x} y={380 - h} width={w} height={h} fill={['#5b6ee1', '#8e44ad', '#2a9d8f', '#e76f51'][i % 4]} />
          {Array.from({ length: Math.floor(h / 30) }, (_, r) => <rect key={r} x={x + 12} y={390 - h + r * 30} width={w - 24} height="10" fill="#ffe9a8" opacity="0.7" />)}
        </g>
      ))}
      <rect y="380" width="800" height="120" fill="#5fae5a" />
      <rect y="420" width="800" height="40" fill="#555" />
      {children}
    </>
  );
}

/** Static backdrop for cutscenes. */
export function Backdrop({ kind, children }: { kind: 'living' | 'classroom' | 'restaurant' | 'city'; children?: ReactNode }) {
  if (kind === 'living') return <LivingRoomBackdrop>{children}</LivingRoomBackdrop>;
  if (kind === 'classroom') return <ClassroomBackdrop>{children}</ClassroomBackdrop>;
  if (kind === 'restaurant') return <RestaurantBackdrop>{children}</RestaurantBackdrop>;
  return <CityBackdrop>{children}</CityBackdrop>;
}
