// Original cartoon cast, drawn as SVG groups. Each is positioned by the caller with transform={`translate(x y) scale(s)`}.
// Origins: BeanKid/Teacher/Waiter at feet centre; FreshBot at body centre; Student/Customer at the table edge.

export type KidMood = 'happy' | 'eat' | 'smug' | 'worried' | 'gag' | 'shock' | 'run';

export function BeanKid({ mood = 'happy' }: { mood?: KidMood }) {
  const gag = mood === 'gag';
  const skin = gag ? '#b9dd8f' : '#f6c69a';
  return (
    <g className={`kid kid-${mood}`}>
      {/* legs */}
      {mood === 'run' ? (
        <>
          <path d="M-12 -40 L-34 -8" stroke="#2f4fa8" strokeWidth="14" strokeLinecap="round" />
          <path d="M12 -40 L30 -6" stroke="#2f4fa8" strokeWidth="14" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect x="-20" y="-44" width="14" height="40" rx="6" fill="#2f4fa8" />
          <rect x="6" y="-44" width="14" height="40" rx="6" fill="#2f4fa8" />
        </>
      )}
      <ellipse cx="-14" cy="-3" rx="13" ry="6" fill="#222" />
      <ellipse cx="14" cy="-3" rx="13" ry="6" fill="#222" />
      {/* body: yellow shirt with bean logo */}
      <path d="M-34 -50 Q-36 -100 0 -104 Q36 -100 34 -50 Z" fill="#ffcf3f" />
      <ellipse cx="0" cy="-76" rx="9" ry="13" fill="#b5651d" transform="rotate(20 0 -76)" />
      {/* arms */}
      {mood === 'eat' ? (
        <>
          <path d="M-30 -92 Q-48 -70 -20 -64" stroke={skin} strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d="M30 -92 Q44 -110 22 -122" stroke={skin} strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d="M22 -122 L14 -132" stroke="#999" strokeWidth="4" />
          <ellipse cx="12" cy="-134" rx="6" ry="4" fill="#b5651d" />
        </>
      ) : mood === 'gag' || mood === 'worried' ? (
        <>
          <path d="M-30 -92 Q-40 -120 -12 -128" stroke={skin} strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d="M30 -92 Q44 -76 40 -60" stroke={skin} strokeWidth="11" fill="none" strokeLinecap="round" />
        </>
      ) : mood === 'shock' || mood === 'run' ? (
        <>
          <path d="M-30 -92 L-58 -128" stroke={skin} strokeWidth="11" strokeLinecap="round" />
          <path d="M30 -92 L58 -128" stroke={skin} strokeWidth="11" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M-30 -92 Q-46 -74 -40 -58" stroke={skin} strokeWidth="11" fill="none" strokeLinecap="round" />
          <path d="M30 -92 Q46 -74 40 -58" stroke={skin} strokeWidth="11" fill="none" strokeLinecap="round" />
        </>
      )}
      {/* head */}
      <circle cx="0" cy="-140" r="36" fill={skin} />
      {/* spiky red hair + backwards green cap */}
      <path d="M-34 -150 L-40 -170 L-24 -162 L-22 -184 L-8 -168 L2 -190 L10 -168 L26 -182 L24 -160 L40 -166 L34 -148 Q0 -172 -34 -150" fill="#e0482c" />
      <path d="M-30 -158 Q0 -186 30 -158 Q0 -166 -30 -158" fill="#2fae5a" />
      <rect x="-40" y="-162" width="16" height="7" rx="3" fill="#25904a" />
      {/* face */}
      <Face mood={mood} />
      <circle cx="-24" cy="-128" r="6" fill="#ff8c8c" opacity="0.45" />
      <circle cx="24" cy="-128" r="6" fill="#ff8c8c" opacity="0.45" />
    </g>
  );
}

function Face({ mood }: { mood: KidMood }) {
  switch (mood) {
    case 'eat':
      return (
        <>
          <path d="M-18 -146 q6 -6 12 0 M6 -146 q6 -6 12 0" stroke="#222" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <ellipse cx="0" cy="-122" rx="10" ry="8" fill="#5a1f1f" />
          <circle cx="-3" cy="-124" r="3" fill="#b5651d" />
        </>
      );
    case 'smug':
      return (
        <>
          <path d="M-20 -144 h12 M8 -144 h12" stroke="#222" strokeWidth="4" strokeLinecap="round" />
          <path d="M-12 -122 q14 8 24 -6" stroke="#222" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      );
    case 'worried':
      return (
        <>
          <circle cx="-13" cy="-144" r="6" fill="#fff" stroke="#222" strokeWidth="2" />
          <circle cx="13" cy="-144" r="6" fill="#fff" stroke="#222" strokeWidth="2" />
          <circle cx="-13" cy="-143" r="2.5" fill="#222" />
          <circle cx="13" cy="-143" r="2.5" fill="#222" />
          <path d="M-10 -120 q10 -7 20 0" stroke="#222" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M30 -160 q6 10 0 16 q-6 -6 0 -16" fill="#6cc4ff" />
        </>
      );
    case 'gag':
      return (
        <>
          <path d="M-20 -150 l10 8 M-20 -142 l10 -8 M10 -150 l10 8 M10 -142 l10 -8" stroke="#222" strokeWidth="3.5" strokeLinecap="round" />
          <ellipse cx="0" cy="-121" rx="11" ry="8" fill="#5a1f1f" />
          <path d="M-5 -117 q5 9 10 0" fill="#ff7b9c" />
        </>
      );
    case 'shock':
    case 'run':
      return (
        <>
          <circle cx="-13" cy="-146" r="8" fill="#fff" stroke="#222" strokeWidth="2" />
          <circle cx="13" cy="-146" r="8" fill="#fff" stroke="#222" strokeWidth="2" />
          <circle cx="-13" cy="-146" r="3" fill="#222" />
          <circle cx="13" cy="-146" r="3" fill="#222" />
          <ellipse cx="0" cy="-120" rx="8" ry="11" fill="#5a1f1f" />
        </>
      );
    default:
      return (
        <>
          <circle cx="-13" cy="-144" r="4.5" fill="#222" />
          <circle cx="13" cy="-144" r="4.5" fill="#222" />
          <path d="M-14 -126 q14 14 28 0" stroke="#222" strokeWidth="4" fill="#fff" strokeLinecap="round" />
        </>
      );
  }
}

export type BotMood = 'happy' | 'alarm' | 'shock' | 'scan' | 'talk' | 'sad';

export function FreshBot({ mood = 'happy', spraying = false }: { mood?: BotMood; spraying?: boolean }) {
  const eye = mood === 'alarm' ? '#ff4d5a' : '#7dffcf';
  return (
    <g className={`bot bot-${mood}`}>
      <g className="bot-hover">
        {/* antenna */}
        <line x1="0" y1="-62" x2="0" y2="-84" stroke="#4a5568" strokeWidth="4" />
        <circle cx="0" cy="-88" r="7" fill={mood === 'alarm' ? '#ff4d5a' : '#ffd84d'} className={mood === 'alarm' ? 'blink' : ''} />
        {/* dome body */}
        <path d="M-50 10 Q-54 -64 0 -64 Q54 -64 50 10 Z" fill="#3ec6c0" stroke="#24908b" strokeWidth="4" />
        <rect x="-56" y="4" width="112" height="22" rx="11" fill="#24908b" />
        {/* screen face */}
        <rect x="-36" y="-50" width="72" height="44" rx="12" fill="#14202b" />
        {mood === 'happy' || mood === 'talk' ? (
          <>
            <path d="M-22 -28 q8 -10 16 0 M6 -28 q8 -10 16 0" stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
            {mood === 'talk' ? <ellipse cx="0" cy="-16" rx="7" ry="4" fill={eye} className="talk" /> : <path d="M-8 -18 q8 6 16 0" stroke={eye} strokeWidth="3" fill="none" />}
          </>
        ) : mood === 'alarm' ? (
          <>
            <text x="-15" y="-16" fill={eye} fontSize="30" fontWeight="900" textAnchor="middle">!</text>
            <text x="15" y="-16" fill={eye} fontSize="30" fontWeight="900" textAnchor="middle">!</text>
          </>
        ) : mood === 'shock' ? (
          <>
            <circle cx="-14" cy="-30" r="7" fill="none" stroke={eye} strokeWidth="3" />
            <circle cx="14" cy="-30" r="7" fill="none" stroke={eye} strokeWidth="3" />
            <ellipse cx="0" cy="-14" rx="5" ry="4" fill={eye} />
          </>
        ) : mood === 'sad' ? (
          <>
            <path d="M-22 -32 q8 6 16 0 M6 -32 q8 6 16 0" stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M-8 -14 q8 -6 16 0" stroke={eye} strokeWidth="3" fill="none" />
          </>
        ) : (
          <>
            <rect x="-28" y="-32" width="56" height="5" fill={eye} className="scanline" />
            <circle cx="-14" cy="-30" r="4" fill={eye} />
            <circle cx="14" cy="-30" r="4" fill={eye} />
          </>
        )}
        {/* spray arm */}
        <path d="M48 -14 Q70 -18 76 -36" stroke="#4a5568" strokeWidth="7" fill="none" strokeLinecap="round" />
        <rect x="68" y="-52" width="18" height="18" rx="4" fill="#ff6fa8" />
        {spraying && (
          <g className="bot-spray">
            {[0, 1, 2, 3].map((i) => <circle key={i} cx={92} cy={-46} r={5 + i * 2} style={{ animationDelay: `${i * 0.12}s` }} />)}
          </g>
        )}
        {/* little jet */}
        <path d="M-18 26 L-10 46 L-2 26 M2 26 L10 46 L18 26" fill="#ffb347" className="jet" />
      </g>
    </g>
  );
}

export function Teacher({ facing, warning }: { facing: 'board' | 'class'; warning?: boolean }) {
  return (
    <g className="teacher">
      <rect x="-22" y="-60" width="16" height="58" rx="6" fill="#3d3d5c" />
      <rect x="6" y="-60" width="16" height="58" rx="6" fill="#3d3d5c" />
      <path d="M-40 -60 Q-42 -140 0 -144 Q42 -140 40 -60 Z" fill="#8e44ad" />
      <circle cx="0" cy="-176" r="32" fill="#e8b48a" />
      {facing === 'board' ? (
        <>
          {/* back of head: bun */}
          <path d="M-32 -180 Q0 -220 32 -180 Q34 -150 0 -146 Q-34 -150 -32 -180" fill="#5b3a29" />
          <circle cx="0" cy="-206" r="14" fill="#5b3a29" />
          <path d="M40 -120 L64 -150" stroke="#e8b48a" strokeWidth="10" strokeLinecap="round" />
          <rect x="60" y="-160" width="6" height="14" fill="#fff" />
        </>
      ) : (
        <>
          <path d="M-32 -184 Q0 -224 32 -184 Q20 -200 0 -200 Q-20 -200 -32 -184" fill="#5b3a29" />
          <circle cx="0" cy="-212" r="14" fill="#5b3a29" />
          {/* suspicious glasses */}
          <circle cx="-12" cy="-178" r="9" fill="#fff" stroke="#222" strokeWidth="3" />
          <circle cx="12" cy="-178" r="9" fill="#fff" stroke="#222" strokeWidth="3" />
          <line x1="-3" y1="-178" x2="3" y2="-178" stroke="#222" strokeWidth="3" />
          <path d="M-18 -186 l10 -3 M18 -186 l-10 -3" stroke="#222" strokeWidth="3" />
          <circle cx="-10" cy="-177" r="3" fill="#222" className="eyes-scan" />
          <circle cx="14" cy="-177" r="3" fill="#222" className="eyes-scan" />
          <path d="M-10 -158 h20" stroke="#222" strokeWidth="4" strokeLinecap="round" />
          <path d="M-40 -120 L-58 -96" stroke="#e8b48a" strokeWidth="10" strokeLinecap="round" />
          <path d="M40 -120 L58 -96" stroke="#e8b48a" strokeWidth="10" strokeLinecap="round" />
        </>
      )}
      {warning && (
        <g className="warn-bubble">
          <circle cx="44" cy="-226" r="20" fill="#fff" stroke="#222" strokeWidth="3" />
          <text x="44" y="-216" textAnchor="middle" fontSize="28" fontWeight="900" fill="#e63946">?!</text>
        </g>
      )}
    </g>
  );
}

export type SeatedMood = 'normal' | 'laugh' | 'gag' | 'eat';

/** Head + shoulders peeking above a desk/table. */
export function Seated({ mood = 'normal', hue = 0, hair = '#3b2a20' }: { mood?: SeatedMood; hue?: number; hair?: string }) {
  const skin = mood === 'gag' ? '#b9dd8f' : ['#f6c69a', '#c98f62', '#8d5a3b', '#f0d0b0'][hue % 4];
  const shirt = ['#e76f51', '#2a9d8f', '#e9c46a', '#6a4c93'][hue % 4];
  return (
    <g className={`seated seated-${mood}`}>
      <path d="M-26 0 Q-28 -36 0 -38 Q28 -36 26 0 Z" fill={shirt} />
      <circle cx="0" cy="-58" r="22" fill={skin} />
      <path d="M-22 -62 Q-20 -86 0 -84 Q20 -86 22 -62 Q10 -74 0 -72 Q-10 -74 -22 -62" fill={hair} />
      {mood === 'laugh' ? (
        <>
          <path d="M-12 -62 q4 -4 8 0 M4 -62 q4 -4 8 0" stroke="#222" strokeWidth="2.5" fill="none" />
          <circle cx="-14" cy="-50" r="6" fill="#ff6b6b" opacity="0.7" />
          <circle cx="14" cy="-50" r="6" fill="#ff6b6b" opacity="0.7" />
          <path d="M-6 -46 h12" stroke="#222" strokeWidth="3" strokeLinecap="round" />
        </>
      ) : mood === 'gag' ? (
        <>
          <path d="M-12 -64 l6 5 M-12 -59 l6 -5 M6 -64 l6 5 M6 -59 l6 -5" stroke="#222" strokeWidth="2.5" />
          <ellipse cx="0" cy="-46" rx="6" ry="5" fill="#5a1f1f" />
          <path d="M-22 -40 Q-8 -52 4 -52" stroke={skin} strokeWidth="7" strokeLinecap="round" fill="none" />
        </>
      ) : mood === 'eat' ? (
        <>
          <circle cx="-8" cy="-62" r="3" fill="#222" />
          <circle cx="8" cy="-62" r="3" fill="#222" />
          <ellipse cx="0" cy="-48" rx="5" ry="4" fill="#5a1f1f" />
        </>
      ) : (
        <>
          <circle cx="-8" cy="-62" r="3" fill="#222" />
          <circle cx="8" cy="-62" r="3" fill="#222" />
          <path d="M-6 -49 q6 5 12 0" stroke="#222" strokeWidth="2.5" fill="none" />
        </>
      )}
    </g>
  );
}

export function Waiter() {
  return (
    <g className="waiter">
      <rect x="-20" y="-60" width="15" height="58" rx="6" fill="#222" />
      <rect x="5" y="-60" width="15" height="58" rx="6" fill="#222" />
      <path d="M-36 -60 Q-38 -134 0 -138 Q38 -134 36 -60 Z" fill="#fff" stroke="#ccc" strokeWidth="2" />
      <path d="M-10 -132 L0 -124 L10 -132 L10 -118 L0 -124 L-10 -118 Z" fill="#c0392b" />
      <circle cx="0" cy="-168" r="30" fill="#d9a07a" />
      <path d="M-28 -176 Q0 -206 28 -176 Q0 -190 -28 -176" fill="#111" />
      <path d="M-14 -152 q-10 4 -14 -2 M14 -152 q10 4 14 -2" stroke="#111" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="-10" cy="-170" r="3.5" fill="#222" />
      <circle cx="10" cy="-170" r="3.5" fill="#222" />
      <path d="M36 -110 L66 -128" stroke="#d9a07a" strokeWidth="10" strokeLinecap="round" />
      <ellipse cx="74" cy="-132" rx="34" ry="6" fill="#bbb" />
      <path d="M50 -136 Q74 -176 98 -136 Z" fill="#b5651d" />
      <text x="74" y="-146" textAnchor="middle" fontSize="14">🫘</text>
    </g>
  );
}
