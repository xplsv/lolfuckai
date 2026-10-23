import * as THREE from './three.module.min.js';
import {
  ALL_AI_COMMENTS,
  EXACT_COMMENTS,
  COMMUNITY_QUOTES,
  BEATMAP
} from './data.js';
import { IMPACT_GLYPHS } from './impact_font.js';

// Some comments open by quoting someone else ("Quote: ...") before the reply. Keep only the reply, so other
// people's words never show under the wrong name
const ownWords = (comment) => (comment || '').replace(/^\s*Quote:[\s\S]*?\n\s*\n/, '').trim();
for (const q of [...COMMUNITY_QUOTES, ...ALL_AI_COMMENTS]) {
  q.comment = ownWords(q.comment);
  for (const p of q.threadContext || []) p.comment = ownWords(p.comment);
}

// Canvas textures are drawn once at startup and don't redraw when a web font arrives, so wait for
// Anton (the Impact fallback where Impact isn't installed). Don't hang if Google Fonts is unreachable.
await Promise.race([
  document.fonts.load('40px Anton').catch(() => {}),
  new Promise((resolve) => setTimeout(resolve, 3000))
]);

// ============================================================================
// 1. DERIVE THE 4 TOKENS ("LOL", 2ND WORD, "A", "I") FROM POUËT DATA
// ============================================================================
const rawPhrase = (EXACT_COMMENTS[1]?.comment || 'Lol f AI.').replace('.', '').trim().toUpperCase().split(/\s+/);
const BEAT_TOKENS = [
  rawPhrase[0] || 'LOL',
  rawPhrase[1] || '---',
  'A',
  'I'
];

// Custom 4-word beat tokens for prods that only exist in ALL_AI_COMMENTS so BEAT_TOKENS is never repeated as a fallback!
// uncle-x's slams for his own prod comments, taken word for word from each comment (null holds the last word)
const UNCLE_X_BEAT_TOKENS = {
  '995036': ["REALLY", "DAMN BORING", "AI CRAP", "SUCKS"],
  '996051': ["YEAH", "FUCK", "AI.", null],
  '1003529': ["WHAT", "HAVOC", "SAID.", null],
  '1003821': ["AI", "OR NOT,", "THIS", "SUCKED."],
  '1004427': ["AI", "THUMB.", null, null],
  '1021264': ["WE DON'T", "WANT YOUR", "SLOP.", "FUCK OFF"],
  '1022551': ["HERE'S YOUR", "AI THUMB.", "ASK", "A HUMAN"],
  '1022912': ["LOOKING", "FORWARD", "TO IT!", null],
  '1022918': ["ONLY", "BECAUSE OF", "THE AI", "MUSIC"],
  '1027576': ["HERE'S", "YOUR", "AI", "THUMB."],
  '1041053': ["LOL", "FUCK", "AI.", null],
  '1043029': ["ARE THE GFX", "ACTUALLY", "AI", "SLOP?"],
  '1045008': ["FOR", "OBVIOUS", "REASONS.", null],
  '1045009': ["LOL FUCK AI", "FUCKIN'", "GROK", "OF ALL THINGS?"],
  '1045010': ["LOL", "FUCK", "AI.", null],
  '1049355': ["LOL", "FUCK", "AI.", null],
  '1049426': ["LOL", "FUCK", "AI.", null],
  '1049427': ["LOL", "FUCK", "AI.", null],
  '1050250': ["LOL", "FUCK", "AI.", null],
  '1050251': ["LOL", "FUCK", "AI.", null],
  '1050252': ["LOL", "FUCK", "AI.", null],
  '1050255': ["LOL", "FUCK", "AI.", null],
  '1050389': ["LOL", "FUCK", "AI.", null],
  '1050562': ["LOL", "FUCK", "AI.", null],
  '1050582': ["LOL", "FUCK AI.", "GROK?", "SERIOUSLY?"],
  '1050621': ["LOL", "FUCK", "AI.", null],
  '1052651': ["LOL", "FUCK AI.", "SUCK", "DONKEY DICK"],
  '1052681': ["3 ACCOUNTS", "FOR HIMSELF", "LAST", "5 DAYS"],
  '1052706': ["HISTORICAL", "RECORD", "SUCK", "DONKEY DICK"],
  '1052738': ["DON'T BE", "A", "MEAT", "PROXY"],
  '1052744': ["DESERVES", "ALL", "THE", "HATE"],
  '1052785': ["DID AN AI", "WRITE", "THAT", "FOR YOU?"],
  '1052807': ["HONEST", "ABOUT", "LLM USE", "A PIGGIE"],
  '1052816': ["IDEA", "GUYS(TM)", "50 ON", "TOKENS"],
  '1053853': ["GENAI SENSES", "TINGLING", "SOUND LIKE", "SUNO."],
  '1054304': ["SLOP.", null, null, null]
};

// Build PROD_QUOTES in strict round-robin order across all 29 unique Pouët prods so every prod is shown once before any prod repeats!
const PROD_QUOTES = (() => {
  // Prioritize COMMUNITY_QUOTES first so every prod with rich multi-author roasts & custom beatTokens uses them first!
  const merged = [
    ...COMMUNITY_QUOTES.filter((q) => q.sourceType !== 'topic'),
    ...ALL_AI_COMMENTS.map((c) => ({
      ...c,
      sourceType: 'prod',
      author: c.author || 'uncle-x',
      userId: c.userId || '751',
      glops: c.glops || '1358',
      avatarPath: c.avatarPath || 'assets/avatars/mfx.gif',
      beatTokens: c.beatTokens || UNCLE_X_BEAT_TOKENS[String(c.postId)] || ['LOL', 'FUCK', 'AI.', null]
    }))
  ];
  const byProd = new Map();
  const seenComment = new Set();
  for (let i = 0; i < merged.length; i++) {
    const p = merged[i];
    if (!p.screenshot || p.screenshot.includes('prod_')) continue;
    const key = `${p.prodId}:${(p.comment || '').slice(0, 48)}`;
    if (seenComment.has(key)) continue;
    seenComment.add(key);
    if (!byProd.has(p.prodId)) byProd.set(p.prodId, []);
    byProd.get(p.prodId).push(p);
  }

  // Separate prods whose primary comment is longer from the 7 short 3-word uncle-x prods, then interleave them so short comments never cluster!
  const richLists = [];
  const shortLists = [];
  for (const [, list] of byProd.entries()) {
    const firstComment = (list[0]?.comment || '').trim();
    if (firstComment.length <= 16) {
      shortLists.push(list);
    } else {
      richLists.push(list);
    }
  }
  const orderedLists = [];
  let sIdx = 0;
  // Lead with the signature 3-word @uncle-x comment on the very first 3D drop (Bar 32)
  if (shortLists.length > 0) {
    const openingList = shortLists[sIdx++].slice();
    openingList[0] = { ...openingList[0], beatTokens: BEAT_TOKENS };
    orderedLists.push(openingList);
  }
  for (let r = 0; r < richLists.length; r++) {
    orderedLists.push(richLists[r]);
    if ((r + 1) % 3 === 0 && sIdx < shortLists.length) {
      orderedLists.push(shortLists[sIdx++]);
    }
  }
  while (sIdx < shortLists.length) {
    orderedLists.push(shortLists[sIdx++]);
  }

  const roundRobin = [];
  let round = 0;
  while (true) {
    let added = 0;
    for (const list of orderedLists) {
      if (round < list.length) {
        roundRobin.push(list[round]);
        added++;
      }
    }
    if (added === 0) break;
    round++;
  }
  return roundRobin;
})();
const FORUM_QUOTES = COMMUNITY_QUOTES.filter((q) => q.sourceType === 'topic');

// Hand-picked running order: which comment each 4-hit pattern slams (by Pouët post id), so the strongest lines
// play and nobody repeats back to back. Bar 32 keeps the title, Parts VIII and later have their own text
const SLAM_PLAYLIST = {
  // Part V: the first drop
  34: '1052704', 36: '1040007', 38: '1050377', 40: '1028923', 42: '1050590', 44: '1043029', 46: '1022223',
  // Part VI: the colosseum
  48: '1003822', 50: '1021256', 52: '1050616', 54: '996031', 56: '1004408', 58: '1050534', 60: '1022551',
  // Part VII: the guillotine
  64: '1044985', 66: '1052757', 68: '1022144', 70: '1050524', 72: '1021209', 74: '603233', 76: '1021264',
  // Part IX: the forum flamewar
  96: '603503', 97: '603721', 98: '603499', 99: '603069', 100: '603500', 101: '603517', 102: '603657',
  104: '603764', 105: '603255', 106: '603729', 107: '603717', 108: '603508', 109: '602499'
};
const QUOTE_BY_POST = new Map([...PROD_QUOTES, ...FORUM_QUOTES].map((q) => [q.postId, q]));
for (const [bar, id] of Object.entries(SLAM_PLAYLIST)) {
  if (!QUOTE_BY_POST.has(id)) console.warn(`SLAM_PLAYLIST: no quote ${id} for bar ${bar}`);
}

const dom = {
  webglContainer: document.getElementById('webgl-container'),
  aiTypingOverlay: document.getElementById('ai-typing-overlay'),
  aiTypingSpeaker: document.getElementById('ai-typing-speaker'),
  aiTypingText: document.getElementById('ai-typing-text'),
  aiTypingReply: document.getElementById('ai-typing-reply'),
  edgeScrubber: document.getElementById('edge-scrubber'),
  edgeProgress: document.getElementById('edge-progress'),
  startScreen: document.getElementById('start-screen')
};

// ============================================================================
// 2. SONG STRUCTURE: 8 DISTINCT DEMO PARTS & EXACT RHYTHM MATRICES
// ============================================================================
const BAR_SEC = 240.0 / 146.0; // 1.6438356s per bar at 146.000 BPM
const STEP16_SEC = BAR_SEC / 16.0; // 0.10274s per 16th note
const BOM_OFFSETS = [0.060, 0.368, 0.676, 0.985]; // Exact 3-sixteenth spacing (0.3082s)

// 10 Distinct Demoscene Parts (Each with its own 3D visual effect system!)
const DEMO_PARTS = [
  { id: 1, name: 'PART I // MFX MONOLITH GENESIS', startBar: 0, endBar: 7, startTime: 0.0 },
  { id: 2, name: 'PART II // GLÖP REACTOR TUNNEL', startBar: 8, endBar: 15, startTime: 13.15 },
  { id: 3, name: 'PART III // GYROSCOPIC REACTOR CORE', startBar: 16, endBar: 23, startTime: 26.30 },
  { id: 4, name: 'PART IV // INDUSTRIAL CONVERGENCE', startBar: 24, endBar: 31, startTime: 39.45 },
  { id: 5, name: 'PART V // BRUTALIST MUSEUM OF SLOP', startBar: 32, endBar: 47, startTime: 52.60 },
  { id: 6, name: 'PART VI // 360° COLOSSEUM OF SUCKS', startBar: 48, endBar: 63, startTime: 78.90 },
  { id: 7, name: 'PART VII // INDUSTRIAL GUILLOTINE & LASER CAGE', startBar: 64, endBar: 79, startTime: 105.21 },
  { id: 8, name: 'PART VIII // GYROSCOPIC REACTOR & SHARD VORTEX', startBar: 80, endBar: 95, startTime: 131.51 },
  { id: 9, name: 'PART IX // NON-STOP BOM // FFT CANYON', startBar: 96, endBar: 143, startTime: 157.81 },
  { id: 10, name: 'PART X // SENDING KISSES TO THE HATERS <3', startBar: 144, endBar: 160, startTime: 236.71 }
];

// The 8 4-hit BOM patterns in Part X (3:56.71 - 4:24.00, even Bars 144..158), one main hater per 2-bar pattern!
const KISS_BOM_BARS = [
  144, 146, 148, 150, 152, 154, 156, 158
];

const HATER_KISSES = [
  {
    sourceType: 'kisses',
    author: 'uncle-x',
    userId: '751',
    avatarPath: 'assets/avatars/mfx.gif',
    screenshot: 'assets/screenshots/prod_106154.jpg',
    prodName: 'VALENTINE #1 // UNCLE-X (MFX)',
    award: 'SUPREME AI SLOP DESTROYER // 38 SUCKS & FLAMES',
    comment: 'In short: don’t be a meat proxy. But if you decide to be one, don’t be surprised when people treat you like a useless slab of meat that adds no value to anything.',
    kissNote: 'MWAH! THANK YOU FOR BEING OUR #1 MUSE <3',
    beatTokens: ['KISSES', 'TO', 'UNCLE-X', 'MWAH <3']
  },
  {
    sourceType: 'kisses',
    author: '4gentE',
    userId: '104239',
    avatarPath: 'assets/avatars/yellow_arrow.gif',
    screenshot: 'assets/screenshots/prod_105992.png',
    prodName: 'VALENTINE #2 // 4GENTE',
    award: 'CHIEF GRANDPA FEELINGS INSPECTOR // 21 FLAMES',
    comment: 'Dude how dare you say we shouldn’t support fascists and their soul crushing tech while you’re wearing shoes? SHOES! … Gotcha!',
    kissNote: 'SENDING BIG BIO-CENTRIC SMOOCHES TO YOU <3',
    beatTokens: ['KISSES', 'TO', '4GENTE', 'XOXO <3']
  },
  {
    sourceType: 'kisses',
    author: 'okkie',
    userId: '2282',
    avatarPath: 'assets/avatars/davidje_pouet.gif',
    screenshot: 'assets/screenshots/prod_104438.jpg',
    prodName: 'VALENTINE #3 // OKKIE',
    award: 'THE LIE MACHINE HUNTER // 21 SUCKS & FLAMES',
    comment: 'Love shitting up this thread btw lol, until havoc is tired and closes it. ILU havoc <3',
    kissNote: 'WE WILL NEVER DELETE OUR LOVE FOR YOU OKKIE <3',
    beatTokens: ['SMOOCHES', 'TO', 'OKKIE', 'MWAH <3']
  },
  {
    sourceType: 'kisses',
    author: 'fizzer',
    userId: '82805',
    avatarPath: 'assets/avatars/fizzer_pouet.gif',
    screenshot: 'assets/screenshots/prod_105917.jpg',
    prodName: 'VALENTINE #4 // FIZZER',
    award: 'ORANGE PEEL SOMMELIER // 18 SUCKS & FLAMES',
    comment: 'Bitter taste? This is like eating a big plate of orange peels.',
    kissNote: 'OUR HOBBY IS SENDING KISSES TO FIZZER XOXO <3',
    beatTokens: ['BIG LOVE', 'TO', 'FIZZER', 'XOXO <3']
  },
  {
    sourceType: 'kisses',
    author: 'maali',
    userId: '2378',
    avatarPath: 'assets/avatars/sucks-rot2.gif',
    screenshot: 'assets/screenshots/prod_105882.png',
    prodName: 'VALENTINE #5 // MAALINSTRIPPARI',
    award: 'EM-DASH EXTERMINATOR // 21 SUCKS & FLAMES',
    comment: 'the only credits involved are the token credits coat and doob threw at claude',
    kissNote: 'ZERO EM-DASHES, 100% PURE LOVE FOR MAALI <3',
    beatTokens: ['KISSES', 'TO', 'MAALI', 'MWAH <3']
  },
  {
    sourceType: 'kisses',
    author: 'kaneel',
    userId: '2019',
    avatarPath: 'assets/avatars/hotpink.gif',
    screenshot: 'assets/screenshots/prod_106154.jpg',
    prodName: 'VALENTINE #6 // KANEEL',
    award: 'POUËT SIN CONFESSOR // 17 SUCKS & FLAMES',
    comment: 'I remember being impressed by you folks, I remember being inspired… ha, the naivety of a young ginger french man.',
    kissNote: 'GROS BISOUS MON CHER KANEEL XOXO <3',
    beatTokens: ['BISOUS', 'TO', 'KANEEL', 'XOXO <3']
  },
  {
    sourceType: 'kisses',
    author: 'Preacher',
    userId: '4950',
    avatarPath: 'assets/avatars/brs.gif',
    screenshot: 'assets/screenshots/prod_105672.png',
    prodName: 'VALENTINE #7 // PREACHER',
    award: 'PROPHET OF THE BLEAK FUTURE // 10 SUCKS & FLAMES',
    comment: 'It’s like a vantage point to a terrible future where art or nothing of significance exists at all, while also looking passable from a quick glance.',
    kissNote: 'BLESSINGS & KISSES FROM THE MACHINE PREACHER <3',
    beatTokens: ['KISSES', 'TO', 'PREACHER', 'MWAH <3']
  },
  {
    sourceType: 'kisses',
    author: 'NR4',
    userId: '101073',
    avatarPath: 'assets/avatars/team210-fr.gif',
    screenshot: 'assets/screenshots/prod_106129.png',
    prodName: 'VALENTINE #8 // NR4 (TEAM210)',
    award: 'GUARDIAN OF THE CRAFT // 7 SUCKS & FLAMES',
    comment: ':( please learn the craft, I promise, it’s fun',
    kissNote: 'BIG LOVE & SALTOING PONIES TO NR4 XOXO <3',
    beatTokens: ['BIG LOVE', 'TO', 'NR4', 'XOXO <3']
  }
];

// The scene's past crimes, slammed one or two per 4-hit BOM pattern through the rectangle tunnel run (Bars 112..124).
// null holds the previous word and slams it again on that hit
const DEMOSCENE_CRIME_TOKENS = [
  ['PRE-RENDERED', 'VIDEO', 'INSTEAD OF', 'REAL-TIME'],
  ['PHOTOSHOP', 'NOT PIXELS', 'MP3', 'NOT TRACKERS'],
  ['GPU 3D', 'NOT CPU 3D', '10MB+', 'DEMOS'],
  ['SINGLE', 'EFFECT', 'STOLEN', 'MUSIC'],
  ['REMOTE', 'ENTRIES', 'BROWSER', 'NOT NATIVE'],
  ['UNITY', 'UNREAL', 'NOTCH', 'CABLES'],
  ['FUCKING', 'USING', 'AI', 'LOL']
];

// kaneel's comments about mrdoob on Fable 64 (prod 106815) and With Pride (prod 107068), slammed one per
// 4-hit BOM pattern through the thumb swarm (Bars 128..140)
const KANEEL_SWARM_TOKENS = [
  ['RICARDO', 'DOOBIFOO', 'LITTLE', 'PENIS'],
  ['REMEMBER', 'TO HATE', 'ON', 'MRDOOB'],
  ['EVERY BASIC', 'VIBECODING', 'LITTLE', 'BITCHES'],
  ['LEARN', 'PROGRAMMING', 'RTFM', 'HA!'],
  ['WELL DONE,', 'SLOW CLAP,', 'GREAT', 'MOVE!'],
  ['SPANISH', 'FASCISTA.', 'YOU NEVER', 'KNOW.'],
  ['AHAH', 'WHO\'S', 'LAUGHING', 'NOW']
];

const HATER_KISSES_ROUND2_TOKENS = [
  ['WE LOVE', 'YOU', 'UNCLE-X', 'XOXO <3'],
  ['WE LOVE', 'YOU', '4GENTE', 'MWAH <3'],
  ['WE LOVE', 'YOU', 'OKKIE', 'XOXO <3'],
  ['WE LOVE', 'YOU', 'FIZZER', 'MWAH <3'],
  ['WE LOVE', 'YOU', 'MAALI', 'XOXO <3'],
  ["ON T'AIME", 'FORT', 'KANEEL', 'BISOUS!'],
  ['WE LOVE', 'YOU', 'PREACHER', 'XOXO <3'],
  ['WE LOVE', 'YOU', 'NR4', 'MWAH <3'],
  ['WE LOVE', 'YOU', 'BITL', 'XOXO <3'],
  ['WE LOVE', 'YOU', 'HAVOC', 'MWAH <3'],
  ['FOREVER', 'YOURS,', 'UNCLE-X', 'MWAH <3']
];

function getPartForBar(barNum) {
  for (const p of DEMO_PARTS) {
    if (barNum >= p.startBar && barNum <= p.endBar) return p;
  }
  return DEMO_PARTS[DEMO_PARTS.length - 1];
}

// Intro bars with 4-BOM pattern (0:00 - 0:26.30 -> cubes only, NO words! 0:26.30 - 0:52.60 has NO 4-BOM pattern)
const INTRO_BOM_BARS = [0, 2, 4, 6, 8, 10, 12, 14];

// Strictly verified 4-hit BOM! BOM! BOM! BOM! bars from 0:52.60 (Bar 32) onwards
const WORD_BOM_BARS = [
  // Part V (Bars 32..46; Bar 47 is a short break)
  32, 34, 36, 38, 40, 42, 44, 46,
  // Part VI (Bars 48..60 & 64..76; Bars 62-63 & 78-79 are 2D AI text breaks)
  48, 50, 52, 54, 56, 58, 60,
  64, 66, 68, 70, 72, 74, 76,
  // Part VIII Chill Intermission (Bars 80..95) uses 2D text, no 3D words
  80, 82, 84, 86, 88, 90, 92,
  // Part IX (Bars 96..102 & 104..109: every-bar double-time overdrive; Bar 103 & Bars 110-111 are 2D AI text breaks!)
  96, 97, 98, 99, 100, 101, 102,
  104, 105, 106, 107, 108, 109,
  // Part IX-C (Bars 112..140; Bars 126-127 & 142-143 are 2D AI text breaks) & Part X Kisses (even Bars 144..158 starting at 3:57!)
  112, 114, 116, 118, 120, 122, 124,
  128, 130, 132, 134, 136, 138, 140,
  144, 146, 148, 150, 152, 154, 156, 158
];
const WORD_BOM_BAR_SET = new Set(WORD_BOM_BARS);

// Odd bars that have the heavy 3-hit "BOOM - BOOM - BOOM" answer bass slam on 16th steps 1, 7, 13!
const ANSWER_BASS_BAR_SET = new Set([
  41, 43, 45,
  49, 51, 53, 55, 57, 59, 61,
  65, 67, 69, 71, 73, 75, 77,
  113, 115, 117, 119, 121, 123, 125,
  129, 131, 133, 135, 137, 139, 141
]);

// Stop / freeze bars (1-hit stop at step 0, pickup slam at step 15)
const STOP_BAR_SET = new Set([62, 78, 103, 126]);

// Bars in Part IX ("crazy part") that showcase "VIBECODING IS NOT A CRIME" in 3D with crazy blinking!
const CRIME_3D_HOLD_BAR_SET = new Set([103]);
// Quiet breakdown bars after the last pattern of a part: the image tears and splits through all of them, and in
// Part V the last slammed word stays up, still, cycling its colours until the next part.
// bar -> [pattern bar whose last word is held, bar it holds until]
const BREAKDOWN_BAR_SET = new Set([47, 78, 79]);
const WORD_HOLD_BARS = { 47: [46, 48] };
const CRIME_3D_BOM_BAR_SET = new Set();

function getChaosLevel(t) {
  if (t < 52.55) return 0.0;
  const progress = Math.min(1.0, (t - 52.55) / (225.0 - 52.55));
  return 0.22 + Math.pow(progress, 0.85) * 0.78;
}

// The song's climax (3:04 - 3:56) gets two looks of its own instead of more Part IX:
// 1 = monochrome rectangle tunnel run (Bars 112..125), 2 = thumb swarm (Bars 126..143, between two kaneel quotes)
function getClimaxPhase(barNum) {
  if (barNum >= 112 && barNum < 126) return 1;
  if (barNum >= 126 && barNum < 144) return 2;
  return 0;
}

// Parts VI and VII each get one effect instead of the Pouët screen: the screenshot colosseum, then the industrial guillotine
function getFeaturePart(barNum) {
  if (barNum >= 48 && barNum < 64) return 'colosseum';
  if (barNum >= 64 && barNum < 80) return 'guillotine';
  return null;
}

const BOM_EVENTS = [];
for (const barNum of INTRO_BOM_BARS) {
  const barStart = barNum * BAR_SEC;
  for (let hitIdx = 0; hitIdx < 4; hitIdx++) {
    BOM_EVENTS.push({
      t: barStart + BOM_OFFSETS[hitIdx],
      bar: barNum,
      hitIdx,
      isIntro: true,
      explodeAt: barStart + 1.28
    });
  }
}
for (const barNum of WORD_BOM_BARS) {
  const barStart = barNum * BAR_SEC;
  for (let hitIdx = 0; hitIdx < 4; hitIdx++) {
    BOM_EVENTS.push({
      t: barStart + BOM_OFFSETS[hitIdx],
      bar: barNum,
      hitIdx,
      isIntro: false,
      explodeAt: barStart + 1.30
    });
  }
}
BOM_EVENTS.sort((a, b) => a.t - b.t);

// ============================================================================
// 3. DEMO STATE
// ============================================================================
const state = {
  isPlaying: false,
  hasStarted: false,
  currentTime: 0,
  lastBomIdx: -1,
  lastTransientIdx: -1,
  lastStep16Global: -1,
  commentCursor: 0,
  activeHitIdx: 0,
  activePartId: 1,
  word3DExplodeAt: -1,
  word3DExploding: false,
  // Audio / Rhythm Envelopes
  kickEnv: 0,
  snareEnv: 0,
  hatEnv: 0,
  answerSlamEnv: 0,
  stampHammerEnv: 0,
  glitchTear: 0,
  invertEnv: 0,
  thumbBurstEnv: 0,
  thumbsUpPopEnv: 0,
  tunnelFlashEnv: 0,
  climaxBank: 0,
  chopFlash: 0,
  swarmShape: 'lol',
  laserPattern: 0,
  shaftOffset: 0,
  camKickPitch: 0,
  camKickYaw: 0,
  subLevel: 0,
  midLevel: 0,
  highLevel: 0,
  // Camera
  camTargetPos: new THREE.Vector3(0, 1.5, 16),
  camLook: new THREE.Vector3(0, 0.5, 0),
  camTargetLook: new THREE.Vector3(0, 0.5, 0),
  camRoll: 0,
  camTargetRoll: 0
};

// ============================================================================
// 4. WEB AUDIO API ENGINE
// ============================================================================
let audioCtx = null;
let analyser = null;
let freqData = new Uint8Array(128);
let timeData = new Uint8Array(128);

// A frame reaches the screen a few frames after it is computed (render, composite, vsync), so the
// render loop looks this far ahead of the audio. Tuned by eye in Chrome on macOS.
const DISPLAY_LATENCY = 0.05;

// The song is decoded upfront and played through an AudioBufferSourceNode, and the demo clock is
// derived from audioCtx.currentTime. HTMLMediaElement.currentTime is too coarse and drifts in Safari.
class MusicPlayer extends EventTarget {
  constructor(url, sampleRate) {
    super();
    this.buffer = null;
    this.source = null;
    this.offset = 0; // Song position while paused
    this.startedAt = 0; // audioCtx time at which song position 0 played
    this.playRequest = null;
    // Decode without waiting for a user gesture, at the file's own sample rate to avoid resampling twice
    this.ready = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => new OfflineAudioContext(2, 1, sampleRate).decodeAudioData(data))
      .then((buffer) => { this.buffer = buffer; });
  }

  get paused() {
    return this.source === null;
  }

  get currentTime() {
    if (this.paused) return this.offset;
    return Math.min(this.buffer.duration, Math.max(0, this.heardContextTime() - this.startedAt));
  }

  // The audioCtx time of the sample coming out of the speakers right now. audioCtx.currentTime is
  // ahead of that by the graph's buffering (baseLatency) plus the device latency (outputLatency).
  heardContextTime() {
    const now = performance.now();
    const ts = audioCtx.getOutputTimestamp ? audioCtx.getOutputTimestamp() : null;
    // Skip zeroed or stale timestamps, which some browsers return without a real output device
    if (ts && ts.contextTime > 0 && now - ts.performanceTime < 250) {
      return ts.contextTime + (now - ts.performanceTime) / 1000;
    }
    return audioCtx.currentTime - (audioCtx.baseLatency || 0) - (audioCtx.outputLatency || 0);
  }

  set currentTime(sec) {
    if (this.paused) {
      this.offset = sec;
      return;
    }
    this.stopSource();
    this.startSource(sec);
  }

  async play() {
    const request = this.playRequest = {};
    await this.ready;
    if (audioCtx.state !== 'running') await audioCtx.resume();
    // Bail if pause() was called or another play() won while we were waiting
    if (this.playRequest !== request || !this.paused) return;
    this.startSource(this.offset);
    this.dispatchEvent(new Event('play'));
  }

  pause() {
    this.playRequest = null;
    if (this.paused) return;
    this.offset = this.currentTime;
    this.stopSource();
    this.dispatchEvent(new Event('pause'));
  }

  startSource(offset) {
    const src = audioCtx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(analyser);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.offset = 0;
      this.dispatchEvent(new Event('ended'));
    };
    src.start(0, offset);
    this.source = src;
    this.startedAt = audioCtx.currentTime - offset;
  }

  stopSource() {
    const src = this.source;
    this.source = null;
    src.onended = null;
    src.stop();
  }
}

const music = new MusicPlayer('song.m4a', 44100);

music.addEventListener('ended', () => {
  state.isPlaying = false;
  state.hasStarted = false;
  state.currentTime = 0;
  dom.edgeProgress.style.width = '0%';
  if (dom.aiTypingOverlay) dom.aiTypingOverlay.classList.add('hidden');
  if (typeof word3DMesh !== 'undefined') word3DMesh.visible = false;
  if (typeof heroMonument !== 'undefined') heroMonument.visible = false;
  if (typeof arenaGroup !== 'undefined') arenaGroup.visible = false;
  if (typeof updateIntroCubeFormation === 'function') updateIntroCubeFormation(0, 0);
  dom.startScreen.classList.remove('hidden');
});

// Keep the screen awake while the demo is playing
let wakeLock = null;
let wakeLockPending = false;

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock || wakeLockPending || document.visibilityState !== 'visible') return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (music.paused) {
      lock.release();
    } else {
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    }
  } catch (_e) {
    // Not allowed (e.g. low battery or permissions policy), carry on without it
  }
  wakeLockPending = false;
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release();
  wakeLock = null;
}

music.addEventListener('play', requestWakeLock);
music.addEventListener('pause', releaseWakeLock);
music.addEventListener('ended', releaseWakeLock);

// The browser drops the lock when the tab is hidden, so re-acquire it on return
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !music.paused) requestWakeLock();
});

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state !== 'running') audioCtx.resume();
    return;
  }
  // Web Audio follows the iOS ringer switch unless the session is marked as media playback
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new Ctx();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.62;
  analyser.connect(audioCtx.destination);
  freqData = new Uint8Array(analyser.frequencyBinCount);
  timeData = new Uint8Array(analyser.frequencyBinCount);
}

function findIndexBefore(arr, t) {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function seekTo(targetSec) {
  const clamped = Math.max(0, Math.min(BEATMAP.duration - 0.5, targetSec));
  music.currentTime = clamped;
  state.currentTime = clamped;
  // Subtract 0.02s when indexing so an event right at targetSec (or Bar 0 at 0.06s) is never skipped
  state.lastBomIdx = findIndexBefore(BOM_EVENTS, clamped - 0.02);
  state.lastTransientIdx = findIndexBefore(BEATMAP.events, clamped - 0.02);
  state.lastStep16Global = Math.floor(clamped / STEP16_SEC) - 1;
  state.word3DExplodeAt = -1;

  if (typeof heroMonument !== 'undefined') {
    const seekBar = Math.floor(clamped / BAR_SEC);
    state.commentCursor = Math.max(0, seekBar - 32);
    const activeSeg = typeof getActive2DTextSegment === 'function' ? getActive2DTextSegment(seekBar) : null;
    heroMonument.visible = (clamped >= 52.55 && !activeSeg);
    arenaGroup.visible = (clamped >= 52.55 && !activeSeg);
    if (dom.aiTypingOverlay) {
      dom.aiTypingOverlay.classList.toggle('hidden', !activeSeg || !state.hasStarted);
    }
    if ((clamped < 52.55 || activeSeg) && typeof word3DMesh !== 'undefined') {
      word3DMesh.visible = false;
    }
  }

  if (clamped < 0.05 && typeof heroCubeMeta !== 'undefined') {
    for (let i = 0; i < HERO_CUBE_COUNT; i++) {
      const m = heroCubeMeta[i];
      m.curPos.set(0, 0, 0);
      m.targetPos.set(0, 0, 0);
      m.curScale = i === 62 ? 4.4 : 0.001;
      m.targetScale = i === 62 ? 4.4 : 0.001;
    }
    camera.position.set(0, 0, 15.5);
  }
}

async function launchDemo(startSec = 0) {
  ensureAudio();
  state.hasStarted = true;
  state.isPlaying = true;
  dom.startScreen.classList.add('hidden');
  seekTo(startSec);
  try {
    await music.play();
    // Reset indices again after play() resolves so no idle frame could advance lastBomIdx past Bar 0!
    state.lastBomIdx = findIndexBefore(BOM_EVENTS, music.currentTime - 0.02);
    state.lastTransientIdx = findIndexBefore(BEATMAP.events, music.currentTime - 0.02);
    state.lastStep16Global = Math.floor(music.currentTime / STEP16_SEC) - 1;
  } catch (_e) {
    state.isPlaying = false;
  }
}

function togglePlay() {
  if (!state.hasStarted) {
    launchDemo(0);
    return;
  }
  if (music.paused) {
    ensureAudio();
    music.play();
    state.isPlaying = true;
  } else {
    music.pause();
    state.isPlaying = false;
  }
}

// ============================================================================
// 5. THREE.JS SCENE & POST-PROCESSING SHADER
// ============================================================================
// No antialiasing: the hard pixel edges suit the look, and the canvas only draws the post quad anyway
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
dom.webglContainer.appendChild(renderer.domElement);

let renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * Math.min(window.devicePixelRatio, 2),
  window.innerHeight * Math.min(window.devicePixelRatio, 2)
);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060c);
scene.fog = new THREE.FogExp2(0x04060c, 0.016);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 240);
camera.position.set(0, 1.5, 16);

const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postUniforms = {
  tDiffuse: { value: renderTarget.texture },
  uTime: { value: 0 },
  uChromatic: { value: 0.002 },
  uGlitch: { value: 0.0 },
  uZoomPunch: { value: 0.0 },
  uInvert: { value: 0.0 },
  uOverdrive: { value: 0.0 },
  uMono: { value: 0.0 },
  uCutAngle: { value: 0.0 },
  uCutX: { value: 0.5 },
  uCutY: { value: 0.5 },
  uCutShift: { value: 0.0 },
  uCutGlow: { value: 0.0 },
  uDuotone: { value: 0.0 },
  uBloom: { value: 0.0 },
  uGrade: { value: 0.0 },
  uRadial: { value: 0.0 },
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
};

const postMat = new THREE.ShaderMaterial({
  uniforms: postUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uChromatic;
    uniform float uGlitch;
    uniform float uZoomPunch;
    uniform float uInvert;
    uniform float uOverdrive;
    uniform float uMono;
    uniform float uCutAngle;
    uniform float uCutX;
    uniform float uCutY;
    uniform float uCutShift;
    uniform float uCutGlow;
    uniform float uDuotone;
    uniform float uBloom;
    uniform float uGrade;
    uniform float uRadial;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
    }

    void main() {
      vec2 center = vUv - 0.5;
      float r2 = dot(center, center);

      // Base zoom-in (overscan) so barrel distortion, chromatic shift & glitch slices never clamp/stretch edge pixels
      float zoomScale = 0.89 - uZoomPunch * 0.10 - uOverdrive * 0.05 - uGlitch * 0.08;
      vec2 uv = 0.5 + center * zoomScale + center * r2 * (0.10 + uOverdrive * 0.14);

      // Guillotine slice: everything above the cut slides along it, with a hot line on the cut
      float cutLine = 0.0;
      if (uCutGlow > 0.001 || abs(uCutShift) > 0.0001) {
        float aspect = uResolution.x / uResolution.y;
        vec2 cdir = vec2(cos(uCutAngle), sin(uCutAngle));
        vec2 p = (uv - vec2(uCutX, uCutY)) * vec2(aspect, 1.0);
        float side = dot(p, vec2(-cdir.y, cdir.x));
        uv += vec2(cdir.x / aspect, cdir.y) * uCutShift * step(0.0, side);
        cutLine = (1.0 - smoothstep(0.0, 0.003 + uCutGlow * 0.006, abs(side))) * uCutGlow;
      }

      float sliceY = floor(uv.y * (30.0 + uOverdrive * 18.0) + uTime * 21.0);
      float sliceNoise = hash(sliceY + floor(uTime * 38.0));
      float edgeGuardX = 1.0 - smoothstep(0.32, 0.49, abs(center.x));
      if (sliceNoise < uGlitch * 0.65) {
        uv.x += (hash(sliceY * 4.3) - 0.5) * uGlitch * 0.18 * edgeGuardX;
      }

      vec2 shift = center * (uChromatic + r2 * uChromatic * 2.4);
      shift.x += (sliceNoise - 0.5) * uGlitch * 0.025 * edgeGuardX;

      float r = texture2D(tDiffuse, clamp(uv + shift, 0.001, 0.999)).r;
      float g = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).g;
      float b = texture2D(tDiffuse, clamp(uv - shift, 0.001, 0.999)).b;
      vec3 col = vec3(r, g, b);

      // Radial zoom blur toward the centre for speed
      if (uRadial > 0.001) {
        vec3 acc = col;
        for (int i = 1; i < 8; i++) {
          float s = 1.0 - uRadial * float(i) / 7.0;
          acc += texture2D(tDiffuse, clamp(0.5 + (uv - 0.5) * s, 0.001, 0.999)).rgb;
        }
        col = acc / 8.0;
      }

      float scan = sin(uv.y * uResolution.y * 1.35 + uTime * 16.0) * 0.5 + 0.5;
      col *= 1.0 - scan * (0.13 + uOverdrive * 0.12);

      // Overdrive Post-Processing: Neon Contrast Boost, Posterize Pulse & Electric Edge Strobe
      if (uOverdrive > 0.01) {
        vec3 highContrast = smoothstep(0.04, 0.92, col) * (1.0 + uOverdrive * 0.32);
        vec3 quantized = floor(highContrast * 5.0 + 0.5) / 5.0;
        col = mix(col, mix(highContrast, quantized, 0.38 * uOverdrive), clamp(uOverdrive, 0.0, 1.0));

        float edgeDist = smoothstep(0.12, 0.52, r2);
        vec3 neonRim = mix(vec3(1.0, 0.0, 0.38), vec3(0.0, 0.94, 1.0), step(0.5, fract(uTime * 8.0)));
        col += neonRim * edgeDist * uOverdrive * 0.55;
      }

      // High-contrast black & white that only lets strong reds through
      if (uMono > 0.01) {
        float luma = smoothstep(0.03, 0.8, dot(col, vec3(0.299, 0.587, 0.114)));
        float redness = clamp((col.r - max(col.g, col.b)) * 2.5, 0.0, 1.0);
        vec3 mono = mix(vec3(luma), vec3(min(1.0, col.r * 1.2), 0.02, 0.06), redness);
        col = mix(col, mono, uMono);
      }

      // Colosseum look: glow around the bright bits, magenta shadows and cyan highlights, dark corners
      if (uBloom > 0.01) {
        vec3 glow = vec3(0.0);
        float aspectB = uResolution.x / uResolution.y;
        for (int i = 0; i < 16; i++) {
          float fi = float(i);
          float a = fi * 2.39996;
          float rad = 0.004 + fi * 0.0022;
          vec3 s = texture2D(tDiffuse, clamp(uv + vec2(cos(a) / aspectB, sin(a)) * rad, 0.001, 0.999)).rgb;
          glow += max(s - 0.4, 0.0);
        }
        col += glow / 16.0 * uBloom * 3.0;
      }
      if (uGrade > 0.01) {
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 tint = mix(vec3(1.25, 0.55, 1.45), vec3(0.8, 1.15, 1.25), smoothstep(0.05, 0.6, l));
        col = mix(col, col * tint, uGrade);
        col *= 1.0 - uGrade * 0.75 * smoothstep(0.35, 0.85, length(center) * 1.25);
      }

      // Red tritone: black to red to yellow to white, so the highlights burn yellow
      if (uDuotone > 0.01) {
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 red = vec3(0.9, 0.03, 0.07);
        vec3 yellow = vec3(1.0, 0.82, 0.12);
        vec3 duo = l < 0.4
          ? mix(vec3(0.0), red, l / 0.4)
          : (l < 0.75 ? mix(red, yellow, (l - 0.4) / 0.35) : mix(yellow, vec3(1.0), (l - 0.75) / 0.25));
        col = mix(col, duo, uDuotone);
      }
      col += vec3(1.0, 0.85, 0.3) * cutLine;

      if (uInvert > 0.01) {
        float invAmt = clamp(uInvert, 0.0, 1.0);
        vec3 pureInv = vec3(1.0) - col;
        vec3 neonInv = vec3(1.0 - col.g, 1.0 - col.b * 0.85, 1.0 - col.r);
        vec3 targetInv = mix(pureInv, neonInv, step(0.5, fract(uTime * 6.0)));
        col = mix(col, targetInv, invAmt);
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

// ============================================================================
// 6. LIGHTS & TEXTURE LOADERS
// ============================================================================
const ambientLight = new THREE.AmbientLight(0x7a9fd4, 2.0);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 3.2);
dirLight.position.set(8, 16, 14);
scene.add(dirLight);

const redLight = new THREE.PointLight(0xff1234, 14, 65, 1.2);
redLight.position.set(-10, 5, 10);
scene.add(redLight);

const blueLight = new THREE.PointLight(0x396ba5, 14, 65, 1.2);
blueLight.position.set(10, -4, 10);
scene.add(blueLight);

const strobeLight = new THREE.PointLight(0xffdd00, 0, 75, 1.1);
strobeLight.position.set(0, 8, 12);
scene.add(strobeLight);

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function loadTex(url) {
  if (!url) return null;
  if (texCache.has(url)) return texCache.get(url);
  const t = texLoader.load(url, (loadedTex) => {
    renderer.initTexture(loadedTex);
  });
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(url, t);
  return t;
}

for (const c of ALL_AI_COMMENTS) {
  if (c.screenshot) loadTex(c.screenshot);
}
for (const c of COMMUNITY_QUOTES) {
  if (c.screenshot) loadTex(c.screenshot);
}

// Crisp 16x16 Minecraft-Style Pixelated Mipmapped Cube Textures
const CUBE_TEX_SIZE = 16;
const mfxCubeCanvas = document.createElement('canvas');
mfxCubeCanvas.width = CUBE_TEX_SIZE;
mfxCubeCanvas.height = CUBE_TEX_SIZE;
const mfxCtx = mfxCubeCanvas.getContext('2d');
const mfxCubeTex = new THREE.CanvasTexture(mfxCubeCanvas);
mfxCubeTex.colorSpace = THREE.SRGBColorSpace;
mfxCubeTex.magFilter = THREE.NearestFilter;
mfxCubeTex.minFilter = THREE.NearestMipmapLinearFilter;
mfxCubeTex.generateMipmaps = true;

function drawAvatarCubeCanvas(ctx, imgEl) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#14243b';
  ctx.fillRect(0, 0, CUBE_TEX_SIZE, CUBE_TEX_SIZE);
  if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
    ctx.drawImage(imgEl, 0, 0, CUBE_TEX_SIZE, CUBE_TEX_SIZE);
  }
}

function drawMfxCubeTexture(imgEl) {
  drawAvatarCubeCanvas(mfxCtx, imgEl);
  mfxCubeTex.needsUpdate = true;
  renderer.initTexture(mfxCubeTex);
}
drawMfxCubeTexture(null);
const mfxImg = new Image();
mfxImg.onload = () => drawMfxCubeTexture(mfxImg);
mfxImg.src = 'assets/mfx.gif';

const avatarImgCache = new Map();
const avatarAnimCache = new Map();
const avatarCubeTexCache = new Map();
let activeHeroItem = null;

function decodeGifFrames(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 13 || String.fromCharCode(bytes[0], bytes[1], bytes[2]) !== 'GIF') {
    return null;
  }
  let pos = 6;
  const width = bytes[pos] | (bytes[pos + 1] << 8);
  const height = bytes[pos + 2] | (bytes[pos + 3] << 8);
  const packed = bytes[pos + 4];
  pos += 7;

  let gct = null;
  if (packed & 0x80) {
    const gctSize = 3 * (1 << ((packed & 0x07) + 1));
    gct = bytes.subarray(pos, pos + gctSize);
    pos += gctSize;
  }

  const workPixels = new Uint8ClampedArray(width * height * 4);
  const prevPixels = new Uint8ClampedArray(width * height * 4);
  const frames = [];
  let totalDurationSec = 0;

  let disposal = 0;
  let transFlag = false;
  let transIndex = 0;
  let delayCs = 10;

  while (pos < bytes.length) {
    const block = bytes[pos++];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[pos++];
      if (label === 0xf9) {
        const subLen = bytes[pos];
        if (subLen >= 4) {
          const gcePacked = bytes[pos + 1];
          disposal = (gcePacked >> 2) & 0x07;
          transFlag = (gcePacked & 0x01) !== 0;
          delayCs = bytes[pos + 2] | (bytes[pos + 3] << 8);
          transIndex = bytes[pos + 4];
        }
      }
      while (pos < bytes.length) {
        const subLen = bytes[pos++];
        if (subLen === 0) break;
        pos += subLen;
      }
    } else if (block === 0x2c) {
      const left = bytes[pos] | (bytes[pos + 1] << 8);
      const top = bytes[pos + 2] | (bytes[pos + 3] << 8);
      const fw = bytes[pos + 4] | (bytes[pos + 5] << 8);
      const fh = bytes[pos + 6] | (bytes[pos + 7] << 8);
      const lpacked = bytes[pos + 8];
      pos += 9;

      let ct = gct;
      if (lpacked & 0x80) {
        const lctSize = 3 * (1 << ((lpacked & 0x07) + 1));
        ct = bytes.subarray(pos, pos + lctSize);
        pos += lctSize;
      }
      const interlaced = (lpacked & 0x40) !== 0;
      const minCodeSize = bytes[pos++];

      const chunks = [];
      let totalBytes = 0;
      while (pos < bytes.length) {
        const subLen = bytes[pos++];
        if (subLen === 0) break;
        chunks.push(bytes.subarray(pos, pos + subLen));
        totalBytes += subLen;
        pos += subLen;
      }
      const lzwData = new Uint8Array(totalBytes);
      let offset = 0;
      for (let c = 0; c < chunks.length; c++) {
        lzwData.set(chunks[c], offset);
        offset += chunks[c].length;
      }

      const pixelCount = fw * fh;
      const indexStream = new Uint8Array(pixelCount);
      const clearCode = 1 << minCodeSize;
      const eoiCode = clearCode + 1;
      let codeSize = minCodeSize + 1;
      let codeMask = (1 << codeSize) - 1;
      let nextCode = eoiCode + 1;
      const prefix = new Int32Array(4096);
      const suffix = new Uint8Array(4096);
      const stack = new Uint8Array(4096);
      for (let i = 0; i < clearCode; i++) {
        prefix[i] = -1;
        suffix[i] = i;
      }

      let bitBuf = 0;
      let bitCount = 0;
      let bytePos = 0;
      let outPos = 0;
      let oldCode = -1;
      let firstChar = 0;

      while (outPos < pixelCount) {
        while (bitCount < codeSize && bytePos < lzwData.length) {
          bitBuf |= lzwData[bytePos++] << bitCount;
          bitCount += 8;
        }
        if (bitCount < codeSize) break;
        const code = bitBuf & codeMask;
        bitBuf >>= codeSize;
        bitCount -= codeSize;

        if (code === clearCode) {
          codeSize = minCodeSize + 1;
          codeMask = (1 << codeSize) - 1;
          nextCode = eoiCode + 1;
          oldCode = -1;
          continue;
        }
        if (code === eoiCode) break;

        let curCode = code;
        let sp = 0;
        if (curCode >= nextCode) {
          if (oldCode === -1) break;
          stack[sp++] = firstChar;
          curCode = oldCode;
        }
        while (curCode >= clearCode) {
          stack[sp++] = suffix[curCode];
          curCode = prefix[curCode];
        }
        firstChar = suffix[curCode];
        stack[sp++] = firstChar;

        while (sp > 0 && outPos < pixelCount) {
          indexStream[outPos++] = stack[--sp];
        }

        if (oldCode !== -1 && nextCode < 4096) {
          prefix[nextCode] = oldCode;
          suffix[nextCode] = firstChar;
          nextCode++;
          if (nextCode === (1 << codeSize) && codeSize < 12) {
            codeSize++;
            codeMask = (1 << codeSize) - 1;
          }
        }
        oldCode = code;
      }

      if (disposal === 3) {
        prevPixels.set(workPixels);
      }

      const rowMap = new Int32Array(fh);
      if (interlaced) {
        const starts = [0, 4, 2, 1];
        const steps = [8, 8, 4, 2];
        let rIdx = 0;
        for (let p = 0; p < 4; p++) {
          for (let y = starts[p]; y < fh; y += steps[p]) {
            rowMap[rIdx++] = y;
          }
        }
      } else {
        for (let y = 0; y < fh; y++) rowMap[y] = y;
      }

      for (let sy = 0; sy < fh; sy++) {
        const dy = top + rowMap[sy];
        if (dy < 0 || dy >= height) continue;
        for (let sx = 0; sx < fw; sx++) {
          const dx = left + sx;
          if (dx < 0 || dx >= width) continue;
          const idx = indexStream[sy * fw + sx];
          if (transFlag && idx === transIndex) continue;
          const pOff = (dy * width + dx) * 4;
          if (ct && idx * 3 + 2 < ct.length) {
            workPixels[pOff] = ct[idx * 3];
            workPixels[pOff + 1] = ct[idx * 3 + 1];
            workPixels[pOff + 2] = ct[idx * 3 + 2];
            workPixels[pOff + 3] = 255;
          }
        }
      }

      const fc = document.createElement('canvas');
      fc.width = width;
      fc.height = height;
      fc.complete = true;
      fc.naturalWidth = width;
      fc.naturalHeight = height;
      const fctx = fc.getContext('2d');
      const imgData = new ImageData(new Uint8ClampedArray(workPixels), width, height);
      fctx.putImageData(imgData, 0, 0);

      const delaySec = Math.max(0.035, (delayCs || 10) * 0.01);
      totalDurationSec += delaySec;
      frames.push({
        canvas: fc,
        delaySec,
        endTimeSec: totalDurationSec
      });

      if (disposal === 2) {
        for (let sy = 0; sy < fh; sy++) {
          const dy = top + sy;
          if (dy < 0 || dy >= height) continue;
          for (let sx = 0; sx < fw; sx++) {
            const dx = left + sx;
            if (dx < 0 || dx >= width) continue;
            const pOff = (dy * width + dx) * 4;
            workPixels[pOff] = 0;
            workPixels[pOff + 1] = 0;
            workPixels[pOff + 2] = 0;
            workPixels[pOff + 3] = 0;
          }
        }
      } else if (disposal === 3) {
        workPixels.set(prevPixels);
      }

      disposal = 0;
      transFlag = false;
      delayCs = 10;
    } else {
      break;
    }
  }
  if (frames.length <= 1) return null;
  return { width, height, frames, totalDurationSec, currentFrameIdx: 0 };
}

function getAvatarImg(avatarPath) {
  const path = avatarPath || 'assets/avatars/mfx.gif';
  if (avatarAnimCache.has(path)) {
    const anim = avatarAnimCache.get(path);
    return anim.frames[anim.currentFrameIdx].canvas;
  }
  if (avatarImgCache.has(path)) return avatarImgCache.get(path);
  const img = new Image();
  avatarImgCache.set(path, img);
  img.onload = () => {
    if (!avatarAnimCache.has(path) && avatarCubeTexCache.has(path)) {
      const entry = avatarCubeTexCache.get(path);
      drawAvatarCubeCanvas(entry.ctx, img);
      entry.tex.needsUpdate = true;
      renderer.initTexture(entry.tex);
    }
    if (activeHeroItem) {
      updateHeroProdMonument(activeHeroItem);
    }
  };
  img.src = path;

  if (path.toLowerCase().endsWith('.gif')) {
    fetch(path)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (!buf) return;
        const anim = decodeGifFrames(buf);
        if (!anim) return;
        avatarAnimCache.set(path, anim);
        if (avatarCubeTexCache.has(path)) {
          const entry = avatarCubeTexCache.get(path);
          drawAvatarCubeCanvas(entry.ctx, anim.frames[0].canvas);
          entry.tex.needsUpdate = true;
        }
        if (activeHeroItem) {
          updateHeroProdMonument(activeHeroItem);
        }
      })
      .catch(() => {});
  }
  return img;
}

function getAvatarCubeTex(avatarPath) {
  const path = avatarPath || 'assets/avatars/mfx.gif';
  if (avatarCubeTexCache.has(path)) return avatarCubeTexCache.get(path).tex;
  const c = document.createElement('canvas');
  c.width = CUBE_TEX_SIZE;
  c.height = CUBE_TEX_SIZE;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  const img = getAvatarImg(path);
  drawAvatarCubeCanvas(ctx, img);
  tex.needsUpdate = true;
  renderer.initTexture(tex);
  avatarCubeTexCache.set(path, { c, ctx, tex });
  return tex;
}

// Preload all unique avatar cube textures from HATER_KISSES & COMMUNITY_QUOTES
for (let i = 0; i < HATER_KISSES.length; i++) {
  getAvatarCubeTex(HATER_KISSES[i].avatarPath);
}
for (let i = 0; i < COMMUNITY_QUOTES.length; i++) {
  getAvatarCubeTex(COMMUNITY_QUOTES[i].avatarPath);
}

// ============================================================================
// 7. TRUE SMOOTH 3D EXTRUDED IMPACT TYPOGRAPHY ENGINE (NO CUBES!)
// ============================================================================
// Uses exact TrueType Bezier curves from Impact.ttf + THREE.ExtrudeGeometry
// to build smooth, solid 3D letters matching the original Impact look
// (crisp face color, razor-sharp outline collar, and deep neon 3D extrusion).
const word3DMesh = new THREE.Group();
word3DMesh.position.set(0, 0.5, 5.6);
word3DMesh.visible = false;
scene.add(word3DMesh);

const activeWordLetters = [];
const cachedWordTemplates = new Map();

function traceGlyphCommands(pathOrShape, cmds, fontSize, offsetX, offsetY) {
  for (let i = 0; i < cmds.length; i++) {
    const cmd = cmds[i];
    const op = cmd[0];
    if (op === 'm') {
      pathOrShape.moveTo(offsetX + cmd[1] * fontSize, offsetY + cmd[2] * fontSize);
    } else if (op === 'l') {
      pathOrShape.lineTo(offsetX + cmd[1] * fontSize, offsetY + cmd[2] * fontSize);
    } else if (op === 'q') {
      pathOrShape.quadraticCurveTo(
        offsetX + cmd[1] * fontSize,
        offsetY + cmd[2] * fontSize,
        offsetX + cmd[3] * fontSize,
        offsetY + cmd[4] * fontSize
      );
    }
  }
  pathOrShape.closePath();
}

function glyphToThreeShapes(ch, fontSize, offsetX, offsetY) {
  const g = IMPACT_GLYPHS[ch] || IMPACT_GLYPHS[ch.toUpperCase()];
  if (!g || !g.contours || g.contours.length === 0) return [];
  const shapes = [];
  for (let i = 0; i < g.contours.length; i++) {
    const c = g.contours[i];
    if (c.area < 0) {
      const sh = new THREE.Shape();
      traceGlyphCommands(sh, c.cmds, fontSize, offsetX, offsetY);
      shapes.push(sh);
    }
  }
  for (let i = 0; i < g.contours.length; i++) {
    const c = g.contours[i];
    if (c.area >= 0 && shapes.length > 0) {
      const hole = new THREE.Path();
      traceGlyphCommands(hole, c.cmds, fontSize, offsetX, offsetY);
      shapes[0].holes.push(hole);
    }
  }
  return shapes;
}

// Exact color & stroke styling from the original Impact typography:
// Hit 0: White face, black stroke collar, hot pink 3D extrusion
// Hit 1: Hot pink face, white stroke collar, electric cyan 3D extrusion
// Hit 2: Electric cyan face, black stroke collar, hot pink 3D extrusion
// Hit 3: Gold/yellow face, black stroke collar, hot pink/red 3D extrusion
const WORD_HIT_STYLES = [
  { face: 0xffffff, stroke: 0x05070c, side: 0xff0055, emissive: 0xcc0044, tiltZ: 0.0 },
  { face: 0xff0055, stroke: 0xffffff, side: 0x00f0ff, emissive: 0x0099cc, tiltZ: 0.055 },
  { face: 0x00f0ff, stroke: 0x05070c, side: 0xff0055, emissive: 0xcc0044, tiltZ: -0.055 },
  { face: 0xffe600, stroke: 0x05070c, side: 0xff0055, emissive: 0xd90038, tiltZ: 0.0 }
];

// Shared precompiled materials for the 4 beat hit styles (zero runtime shader compilation when new words appear!)
const WORD_HIT_MATERIALS = WORD_HIT_STYLES.map((style) => ({
  faceMat: new THREE.MeshBasicMaterial({ color: style.face }),
  sideMat: new THREE.MeshStandardMaterial({
    color: style.side,
    emissive: style.emissive,
    emissiveIntensity: 0.65,
    roughness: 0.18,
    metalness: 0.45
  }),
  strokeMat: new THREE.MeshBasicMaterial({ color: style.stroke })
}));

// Shared per-character unit-em ExtrudeGeometry cache (extrudes each unique character only ONCE across the entire demo!)
const cachedGlyphGeos = new Map();
function getOrCreateGlyphGeos(ch) {
  const glyphKey = IMPACT_GLYPHS[ch] ? ch : ch.toUpperCase();
  if (cachedGlyphGeos.has(glyphKey)) return cachedGlyphGeos.get(glyphKey);
  const g = IMPACT_GLYPHS[glyphKey];
  if (!g || !g.contours || g.contours.length === 0) {
    cachedGlyphGeos.set(glyphKey, null);
    return null;
  }
  const shapes = glyphToThreeShapes(glyphKey, 1.0, -g.ha * 0.5, -0.39);
  if (shapes.length === 0) {
    cachedGlyphGeos.set(glyphKey, null);
    return null;
  }
  const mainGeo = new THREE.ExtrudeGeometry(shapes, {
    depth: 1.75,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.015,
    bevelSegments: 5,
    curveSegments: 16
  });
  mainGeo.translate(0, 0, -0.88);

  const strokeGeo = new THREE.ExtrudeGeometry(shapes, {
    depth: 1.9,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.044,
    bevelSegments: 4,
    curveSegments: 12
  });
  strokeGeo.translate(0, 0, -1.02);

  const pair = { mainGeo, strokeGeo };
  cachedGlyphGeos.set(glyphKey, pair);
  return pair;
}

function getOrCreateWordTemplate(wordStr, hitIdx) {
  const matIdx = hitIdx % 4;
  const key = `${matIdx}:${wordStr}`;
  if (cachedWordTemplates.has(key)) {
    return cachedWordTemplates.get(key);
  }

  const style = WORD_HIT_STYLES[matIdx];
  const { faceMat, sideMat, strokeMat } = WORD_HIT_MATERIALS[matIdx];
  const lines = String(wordStr).split('\n');
  const isMultiLine = lines.length > 1;

  // Measure unscaled em width of the widest line so even 10-12 character words or multi-line banners auto-scale cleanly inside the camera frustum!
  let maxEmWidth = 0;
  for (let l = 0; l < lines.length; l++) {
    const chars = Array.from(lines[l]);
    let lineEm = 0;
    for (let i = 0; i < chars.length; i++) {
      const g = IMPACT_GLYPHS[chars[i]] || IMPACT_GLYPHS[chars[i]?.toUpperCase()] || IMPACT_GLYPHS[' '] || { ha: 0.35 };
      lineEm += g.ha + (i < chars.length - 1 ? 0.045 : 0);
    }
    if (lineEm > maxEmWidth) maxEmWidth = lineEm;
  }

  const maxFont = isMultiLine ? 2.55 : 5.2;
  const targetSpan = isMultiLine ? 9.4 : 7.8;
  const fontSize = Math.min(maxFont, targetSpan / Math.max(1.25, maxEmWidth));
  const zScale = isMultiLine ? 0.83 : 1.0;
  const tracking = fontSize * 0.045;
  const lineStepY = fontSize * 1.06;
  const totalLinesHeight = (lines.length - 1) * lineStepY;

  const letterDefs = [];

  for (let l = 0; l < lines.length; l++) {
    const chars = Array.from(lines[l]);
    let totalWidth = 0;
    const charAdvances = [];
    for (let i = 0; i < chars.length; i++) {
      const g = IMPACT_GLYPHS[chars[i]] || IMPACT_GLYPHS[chars[i]?.toUpperCase()] || IMPACT_GLYPHS[' '] || { ha: 0.35 };
      const w = g.ha * fontSize;
      charAdvances.push(w);
      totalWidth += w + (i < chars.length - 1 ? tracking : 0);
    }

    const startX = -totalWidth * 0.5;
    const lineCenterY = (totalLinesHeight * 0.5) - l * lineStepY;
    let cursorX = startX;

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const adv = charAdvances[i];
      const centerX = cursorX + adv * 0.5;
      const geoPair = getOrCreateGlyphGeos(ch);

      if (geoPair) {
        const letterHolder = new THREE.Group();

        const mainMesh = new THREE.Mesh(geoPair.mainGeo, [faceMat, sideMat]);
        mainMesh.scale.set(fontSize, fontSize, zScale);
        letterHolder.add(mainMesh);

        const strokeMesh = new THREE.Mesh(geoPair.strokeGeo, strokeMat);
        strokeMesh.scale.set(fontSize, fontSize, zScale);
        letterHolder.add(strokeMesh);

        letterDefs.push({
          holder: letterHolder,
          bx: centerX,
          by: lineCenterY,
          bz: 0
        });
      }
      cursorX += adv + tracking;
    }
  }

  const tpl = { letterDefs, style, faceMat, sideMat, strokeMat, isMultiLine };
  cachedWordTemplates.set(key, tpl);
  return tpl;
}

function build3DWordVoxels(wordStr, hitIdx, crazyBlink = false) {
  while (word3DMesh.children.length > 0) {
    word3DMesh.remove(word3DMesh.children[0]);
  }
  activeWordLetters.length = 0;

  const template = getOrCreateWordTemplate(wordStr, hitIdx);
  // Restore base colors before use
  template.faceMat.color.setHex(template.style.face);
  template.sideMat.color.setHex(template.style.side);
  template.sideMat.emissive.setHex(template.style.emissive);
  template.sideMat.emissiveIntensity = 0.65;
  template.strokeMat.color.setHex(template.style.stroke);

  state.activeWordTemplate = template;
  state.word3DCrazyBlink = Boolean(crazyBlink);
  state.word3DMild = false;

  for (let i = 0; i < template.letterDefs.length; i++) {
    const def = template.letterDefs[i];
    def.holder.position.set(def.bx, def.by, def.bz);
    def.holder.rotation.set(0, 0, 0);
    def.holder.scale.set(1, 1, 1);
    word3DMesh.add(def.holder);

    activeWordLetters.push({
      holder: def.holder,
      bx: def.bx,
      by: def.by,
      bz: def.bz,
      vx: (def.bx * 1.8) + (Math.random() - 0.5) * 8.0,
      vy: (def.by * 1.6) + (Math.random() - 0.3) * 14.0,
      vz: 14.0 + Math.random() * 12.0,
      rx: (Math.random() - 0.5) * 9.0,
      ry: (Math.random() - 0.5) * 9.0,
      rz: (Math.random() - 0.5) * 6.0
    });
  }

  word3DMesh.visible = true;
  state.word3DExploding = false;
}

// ============================================================================
// 8. PROMINENT 3D POUËT DEMO PROD & BBS TOPIC MONUMENTS
// ============================================================================
function wrapCanvasLines(ctx, text, maxWidth, maxLines) {
  const words = (text || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const test = current ? `${current} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) {
        const rest = [current, ...words.slice(i + 1)].join(' ');
        lines.push(rest.length > 64 ? `${rest.slice(0, 61)}...` : rest);
        return lines;
      }
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawProdHeaderCanvas(canvas, ctx, item) {
  const isKisses = item.sourceType === 'kisses';
  const isTopic = item.sourceType === 'topic';
  ctx.fillStyle = isKisses ? '#3a0826' : (isTopic ? '#1e1436' : '#14243b');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title plus one short line (group or award); BBS topic titles already say what they are
  const groupsArr = Array.isArray(item.groups) ? item.groups : [item.group || 'SCENE'];
  const subLine = isKisses
    ? (item.award || 'CERTIFIED POUËT HATER <3')
    : (isTopic ? '' : `BY ${groupsArr.join(' & ').toUpperCase()}`);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 76px Impact, Anton, sans-serif';
  ctx.fillText((item.prodName || 'POUËT PROD').toUpperCase(), 32, subLine ? 100 : 124, canvas.width - 64);
  if (subLine) {
    ctx.fillStyle = '#ffdd00';
    ctx.font = 'bold 32px monospace';
    ctx.fillText(subLine, 34, 156, canvas.width - 68);
  }
}

// Laid out for 1024x256 and scaled to fit, so the smaller arena labels get the same layout
function drawProdCommentCanvas(canvas, ctx, item) {
  const isKisses = item.sourceType === 'kisses';
  ctx.save();
  ctx.scale(canvas.width / 1024, canvas.height / 256);
  ctx.fillStyle = isKisses ? '#2d061e' : '#162742';
  ctx.fillRect(0, 0, 1024, 256);

  // Avatar and handle, then the quote
  const avImg = getAvatarImg(item.avatarPath || 'assets/avatars/mfx.gif');
  if (avImg && avImg.complete && avImg.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(avImg, 28, 24, 56, 56);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffdd00';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(`@${item.author || 'uncle-x'}`, 104, 64, 892);

  const commentText = isKisses ? (item.kissNote || item.comment || '') : (item.comment || '');
  ctx.fillStyle = '#ffffff';
  if (commentText.length <= 42) {
    ctx.font = '900 64px Impact, Anton, sans-serif';
    ctx.fillText(commentText, 28, 172, 968);
  } else {
    ctx.font = 'bold 32px Tahoma, sans-serif';
    const wrapped = wrapCanvasLines(ctx, commentText, 968, 4);
    for (let i = 0; i < wrapped.length; i++) {
      ctx.fillText(wrapped[i], 28, 122 + i * 38, 968);
    }
  }
  ctx.restore();
}

// High-Res 3D Screen Renderer for Pouët BBS Topic Threads (13101, 13104, 13069) & Part X Kisses Shrine
const heroTopicCanvas = document.createElement('canvas');
heroTopicCanvas.width = 1024;
heroTopicCanvas.height = 512;
const heroTopicCtx = heroTopicCanvas.getContext('2d');
const heroTopicTex = new THREE.CanvasTexture(heroTopicCanvas);
heroTopicTex.colorSpace = THREE.SRGBColorSpace;

function drawTopicScreenCanvas(item) {
  const ctx = heroTopicCtx;
  ctx.fillStyle = '#0d1829';
  ctx.fillRect(0, 0, 1024, 512);

  const posts = (item.threadContext && item.threadContext.length > 0)
    ? item.threadContext
    : [{ author: item.author, avatarPath: item.avatarPath, date: item.date, comment: item.comment }];

  // Just the posts: avatar, handle and text, with the featured (last) post marked in red
  const gap = 28;
  const boxH = Math.floor((512 - 48 - (posts.length - 1) * gap) / posts.length);
  let y = 24;
  ctx.textAlign = 'left';
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const isFeatured = i === posts.length - 1;
    if (isFeatured) {
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(24, y, 6, boxH);
    }

    const av = getAvatarImg(p.avatarPath || 'assets/avatars/mfx.gif');
    if (av && av.complete && av.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(av, 48, y + 4, 52, 52);
    }

    ctx.fillStyle = isFeatured ? '#ffdd00' : '#8ab8f0';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(`@${p.author}`, 120, y + 30, 860);

    ctx.fillStyle = '#ffffff';
    ctx.font = isFeatured ? 'bold 28px Tahoma, sans-serif' : '24px Tahoma, sans-serif';
    const lineH = isFeatured ? 34 : 30;
    const maxLines = Math.max(1, Math.floor((boxH - 40) / lineH));
    const lines = wrapCanvasLines(ctx, p.comment, 860, maxLines);
    for (let l = 0; l < lines.length; l++) {
      ctx.fillText(lines[l], 120, y + 66 + l * lineH, 860);
    }
    y += boxH + gap;
  }
  heroTopicTex.needsUpdate = true;
}

function drawKissesScreenCanvas(item) {
  const ctx = heroTopicCtx;
  const grad = ctx.createLinearGradient(0, 0, 1024, 512);
  grad.addColorStop(0, '#2a041a');
  grad.addColorStop(0.5, '#4c072b');
  grad.addColorStop(1, '#200314');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Clean single border
  ctx.strokeStyle = '#ff0066';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 996, 484);

  // Crisp Pixel-Art Hater Avatar on the Left
  const av = getAvatarImg(item.avatarPath || 'assets/avatars/mfx.gif');
  if (av && av.complete && av.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(av, 68, 136, 240, 240);
  }

  // Handle & Single Quote on the Right (minimal, zero extra boxes or banners)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffdd00';
  ctx.font = '900 64px Impact, Anton, sans-serif';
  ctx.fillText(`@${(item.author || 'uncle-x').toUpperCase()}`, 354, 196);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 27px Tahoma, sans-serif';
  const lines = wrapCanvasLines(ctx, `"${item.comment || ''}"`, 610, 5);
  for (let l = 0; l < lines.length; l++) {
    ctx.fillText(lines[l], 354, 252 + l * 38, 610);
  }

  heroTopicTex.needsUpdate = true;
}

// Create the Giant Centerpiece 3D Hero Prod Monument (15 units wide x 11 units tall!)
const heroMonument = new THREE.Group();
heroMonument.position.set(0, 0.3, -1.5);
heroMonument.visible = false;
scene.add(heroMonument);

const heroHeaderCanvas = document.createElement('canvas');
heroHeaderCanvas.width = 1024;
heroHeaderCanvas.height = 192;
const heroHeaderCtx = heroHeaderCanvas.getContext('2d');
const heroHeaderTex = new THREE.CanvasTexture(heroHeaderCanvas);
heroHeaderTex.colorSpace = THREE.SRGBColorSpace;

const heroCommentCanvas = document.createElement('canvas');
heroCommentCanvas.width = 1024;
heroCommentCanvas.height = 256;
const heroCommentCtx = heroCommentCanvas.getContext('2d');
const heroCommentTex = new THREE.CanvasTexture(heroCommentCanvas);
heroCommentTex.colorSpace = THREE.SRGBColorSpace;

const monumentFrameMat = new THREE.MeshStandardMaterial({
  color: 0x264878,
  roughness: 0.25,
  metalness: 0.75,
  emissive: 0x102240,
  emissiveIntensity: 0.6
});
const monumentRimMat = new THREE.MeshStandardMaterial({
  color: 0xff1234,
  roughness: 0.2,
  metalness: 0.8,
  emissive: 0xff1234,
  emissiveIntensity: 0.65
});

// Top 3D Header Beam
const heroHeaderMesh = new THREE.Mesh(
  new THREE.BoxGeometry(14.8, 2.3, 0.9),
  [monumentRimMat, monumentRimMat, monumentFrameMat, monumentFrameMat, new THREE.MeshBasicMaterial({ map: heroHeaderTex }), monumentFrameMat]
);
heroHeaderMesh.position.set(0, 4.9, 0.2);
heroMonument.add(heroHeaderMesh);

// Giant 3D Screenshot / BBS Thread Display Screen (14.4 x 7.4 units!)
const heroScreenBacking = new THREE.Mesh(new THREE.BoxGeometry(15.0, 7.8, 0.7), monumentFrameMat);
heroScreenBacking.position.set(0, 0.1, -0.2);
heroMonument.add(heroScreenBacking);

const heroShotMat = new THREE.MeshBasicMaterial({
  map: loadTex(EXACT_COMMENTS[0].screenshot),
  color: 0xffffff
});
const heroShotScreen = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 7.2), heroShotMat);
heroShotScreen.position.set(0, 0.1, 0.2);
heroMonument.add(heroShotScreen);

// Bottom 3D Comment Pedestal Slab
const heroCommentMesh = new THREE.Mesh(
  new THREE.BoxGeometry(14.8, 3.1, 1.1),
  [monumentRimMat, monumentRimMat, monumentFrameMat, monumentFrameMat, new THREE.MeshBasicMaterial({ map: heroCommentTex }), monumentFrameMat]
);
heroCommentMesh.position.set(0, -4.8, 0.45);
heroMonument.add(heroCommentMesh);

// 2 Spinning 3D Pylon Cubes flanking the Hero Prod Monument (dynamically show the current hater's avatar!)
const leftPylonMat = new THREE.MeshStandardMaterial({ map: mfxCubeTex });
const rightPylonMat = new THREE.MeshStandardMaterial({ map: mfxCubeTex });
const leftPylon = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 2.0), leftPylonMat);
leftPylon.position.set(-8.8, 4.6, 0.8);
const rightPylon = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 2.0), rightPylonMat);
rightPylon.position.set(8.8, 4.6, 0.8);
heroMonument.add(leftPylon, rightPylon);

// Rubber stamp: @AUTHOR over a few words in capitals, double border, worn ink. Used on the guillotine's screenshots
// and as the stamp that slams onto the prod screen. text defaults to the comment
const stampRand = (n, k) => {
  const x = Math.sin(n * 91.3 + k * 17.9) * 43758.5453;
  return x - Math.floor(x);
};
function drawCommentStamp(item, n, text = item.comment) {
  // Light ink on a dark backing, so it still reads under the red duotone
  const ink = '#fff4f4';
  const author = `@${(item.author || 'uncle-x').toUpperCase()}`;
  const words = (text || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const W = 900;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 460;
  const ctx = c.getContext('2d');
  ctx.font = '900 58px Impact, Anton, sans-serif';
  const lines = wrapCanvasLines(ctx, words.length > 110 ? `${words.slice(0, 107)}...` : words, W - 110, 3);
  // The last line sits as far from the inner border as the author does from the top
  const h = 44 + 92 + lines.length * 62 + 62;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(10, 10, W - 20, h - 20);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 12;
  ctx.strokeRect(12, 12, W - 24, h - 24);
  ctx.lineWidth = 5;
  ctx.strokeRect(30, 30, W - 60, h - 60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 88px Impact, Anton, sans-serif';
  ctx.fillText(author, W / 2, 124, W - 100);
  ctx.font = '900 58px Impact, Anton, sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 196 + i * 62, W - 100));
  // Worn ink: knock random specks out of the stamp
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1100; i++) {
    const r = stampRand(n, i);
    const x = stampRand(n, i + 1000) * W;
    const y = stampRand(n, i + 2000) * h;
    ctx.globalAlpha = 0.2 + r * 0.55;
    ctx.fillRect(x, y, 1 + r * 4, 1 + stampRand(n, i + 3000) * 3);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return { canvas: c, h, w: W };
}

// The stamp that slams onto the 3D prod / topic screen
const stampHammerCanvas = document.createElement('canvas');
stampHammerCanvas.width = 1024;
stampHammerCanvas.height = 512;
const stampHammerCtx = stampHammerCanvas.getContext('2d');
const stampHammerTex = new THREE.CanvasTexture(stampHammerCanvas);
stampHammerTex.colorSpace = THREE.SRGBColorSpace;

const STAMP_PLACEMENTS = [
  { x: 3.4, y: -1.25, rotZ: -0.14 },
  { x: -3.4, y: 1.35, rotZ: 0.13 },
  { x: -3.2, y: -1.35, rotZ: 0.15 },
  { x: 3.5, y: 1.30, rotZ: -0.12 },
  { x: 0.3, y: 1.50, rotZ: -0.08 },
  { x: -2.6, y: 0.15, rotZ: -0.15 },
  { x: 2.7, y: 0.10, rotZ: 0.14 },
  { x: -0.4, y: -1.45, rotZ: 0.10 }
];
let stampPlacementCursor = 0;
let stampBaseRotZ = -0.14;

const stampFaceMat = new THREE.MeshBasicMaterial({
  map: stampHammerTex,
  transparent: true,
  depthWrite: false
});
const stamp3DHammer = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.4), stampFaceMat);
stamp3DHammer.renderOrder = 5;
stamp3DHammer.position.set(3.4, -1.25, 1.2);
stamp3DHammer.rotation.z = stampBaseRotZ;
heroMonument.add(stamp3DHammer);

function repositionStampHammer() {
  stampPlacementCursor = (stampPlacementCursor + 1 + Math.floor(Math.random() * 2)) % STAMP_PLACEMENTS.length;
  const slot = STAMP_PLACEMENTS[stampPlacementCursor];
  const jx = (Math.random() - 0.5) * 0.6;
  const jy = (Math.random() - 0.5) * 0.45;
  stamp3DHammer.position.x = slot.x + jx;
  stamp3DHammer.position.y = slot.y + jy;
  stampBaseRotZ = slot.rotZ + (Math.random() - 0.5) * 0.08;
  stamp3DHammer.rotation.z = stampBaseRotZ;
}

let stampHammerSeed = 0;
function update3DStampHammer(item) {
  repositionStampHammer();
  const toks = (item?.beatTokens || []).filter(Boolean);
  const text = toks.length
    ? toks.join(' ')
    : (item?.customStamp ? `${item.customStamp.top} ${item.customStamp.sub || ''}` : (item?.comment || ''));
  const stamp = drawCommentStamp(item?.author ? item : { ...item, author: 'pouet' }, ++stampHammerSeed, text);
  const ctx = stampHammerCtx;
  ctx.clearRect(0, 0, 1024, 512);
  const scale = Math.min(1000 / stamp.w, 500 / stamp.h);
  ctx.drawImage(stamp.canvas, 0, 0, stamp.w, stamp.h, 512 - (stamp.w * scale) / 2, 256 - (stamp.h * scale) / 2, stamp.w * scale, stamp.h * scale);
  stampHammerTex.needsUpdate = true;
}
update3DStampHammer(COMMUNITY_QUOTES[0]);

function updateHeroProdMonument(item) {
  activeHeroItem = item;
  const isKisses = item?.sourceType === 'kisses';

  // In Part X (Kisses love finale), hide the top header beam, bottom comment slab, stamp box, and side pylons for a clean, minimal look!
  heroHeaderMesh.visible = !isKisses;
  heroCommentMesh.visible = !isKisses;
  stamp3DHammer.visible = !isKisses;
  leftPylon.visible = !isKisses;
  rightPylon.visible = !isKisses;

  if (!isKisses) {
    drawProdHeaderCanvas(heroHeaderCanvas, heroHeaderCtx, item);
    heroHeaderTex.needsUpdate = true;

    drawProdCommentCanvas(heroCommentCanvas, heroCommentCtx, item);
    heroCommentTex.needsUpdate = true;

    update3DStampHammer(item);
  }

  // Switch the 2 flanking 3D Pylon Cubes to the current commenter's Pouët avatar!
  const avCubeTex = getAvatarCubeTex(item.avatarPath || 'assets/avatars/mfx.gif');
  leftPylonMat.map = avCubeTex;
  rightPylonMat.map = avCubeTex;
  leftPylonMat.needsUpdate = true;
  rightPylonMat.needsUpdate = true;

  if (isKisses) {
    drawKissesScreenCanvas(item);
    heroShotMat.map = heroTopicTex;
    heroShotMat.needsUpdate = true;
  } else if (item.sourceType === 'topic') {
    drawTopicScreenCanvas(item);
    heroShotMat.map = heroTopicTex;
    heroShotMat.needsUpdate = true;
  } else {
    const st = loadTex(item.screenshot);
    if (st) {
      heroShotMat.map = st;
      heroShotMat.needsUpdate = true;
    }
  }
}

// ============================================================================
// 8B. 2D LIVE TYPEWRITER OVERLAY ON TOP OF THE SCREEN (NO 3D BOX / SCREENSHOT!)
// Used for Intro Credits & AI Prompts (0:00-0:52.60), Musical Breaks (Bars 46-47,
// 62-63, 78-79, 103, 110-111, 126-127), and Part VIII Chill Intermission (2:11-2:38)
// ============================================================================
const TWOD_TEXT_SEGMENTS = [
  // Intro Credits (Bars 0..7, 0:00 - 0:13.15, 2 bars = 3.29s each)
  { startBar: 0, endBar: 2, text: 'xplsv', typeSec: 0.95 },
  { startBar: 2, endBar: 4, text: 'presents', typeSec: 1.15 },
  { startBar: 4, endBar: 6, text: 'mrdoob vs argon vs opus', typeSec: 2.1 },
  { startBar: 6, endBar: 8, text: 'a 100% vibecoded production', typeSec: 2.10 },

  // Intro AI Prompt Narrative (Bars 8..31, 0:13.15 - 0:52.60, 4 bars = 6.58s each — slow typewriter!)
  {
    startBar: 8,
    endBar: 12,
    text: '> agy "make a demo about the current AI hate in pouët"',
    typeSec: 3.5
  },
  {
    startBar: 12,
    endBar: 16,
    text: '> agy "make sure it\'s a substantial contribution for once"',
    typeSec: 3.5
  },
  {
    startBar: 16,
    endBar: 20,
    text: '> agy "make no mistakes please"',
    typeSec: 1.9
  },
  {
    startBar: 20,
    endBar: 24,
    text: 'look mum, i can do demos now!',
    typeSec: 2.0,
    // ...then the cursor goes back and adds this after 'mum'
    insert: { after: 'mum', text: ' (rip)', at: 3.4, typeSec: 0.6 }
  },
  {
    startBar: 24,
    endBar: 28,
    text: 'dedicated to mrpet\nthe demoscene didn\'t deserve you :(',
    typeSec: 3.0
  },
  {
    startBar: 28,
    endBar: 32,
    text: '"and here i was wondering what uncle-x thinks of all this, because i\'ve never heard his opinion about AI" — @britelite',
    typeSec: 6.0 // Finishes typing half a second before the drop
  },

  // Musical Breaks & Stop Bars (Pure 2D White Text over 3D Scene — No 3D Monument Box!)
  {
    startBar: 62,
    endBar: 64,
    text: 'rate limit exceeded while generating excuse for pouët comments...',
    typeSec: 2.4
  },

  // Part VIII Chill Intermission (Bars 80..95, 2:11.51 - 2:37.81, 4 bars = 6.58s each — slow typewriter!)
  {
    startBar: 80,
    endBar: 84,
    text: '"if you just vibecode a demo then your hobby isn\'t demomaking. your hobby is talking to a chatbot." — @fizzer',
    typeSec: 5.0,
    avatarPath: 'assets/avatars/fizzer_pouet.gif'
  },
  {
    startBar: 84,
    endBar: 88,
    text: '"demo should show your skills. here you show that you can write some prompts and download jpgs." — @yami.five',
    typeSec: 4.0,
    avatarPath: 'assets/avatars/painting.gif'
  },
  {
    startBar: 88,
    endBar: 92,
    text: '"it\'s called reverse centaur. this slavish oiling of the machine, while machine is the creator." — @4gentE',
    typeSec: 5.0,
    avatarPath: 'assets/avatars/yellow_arrow.gif'
  },
  {
    startBar: 92,
    endBar: 96,
    text: '"why do all AI demos look like dogshit?" — @okkie',
    typeSec: 2.4,
    avatarPath: 'assets/avatars/davidje_pouet.gif'
  },

  // Part IX Breakdown & Transition Breaks (Bars 110..111, 126..127, 142..143)
  {
    startBar: 110,
    endBar: 112,
    text: '800+ pouët forum replies detected...\n@havoc is reaching for the lock button...',
    typeSec: 2.4
  },
  {
    startBar: 126,
    endBar: 128,
    text: '"i won\'t give you the pleasure of a thumb down considering that must make you happy" — @kaneel',
    typeSec: 1.8 // Fast, so the long quote can be read within the 2 bar break
  },
  {
    startBar: 142,
    endBar: 144,
    text: '"hey ricardo, fuck you!" — @kaneel',
    typeSec: 1.4
  }
];

function getActive2DTextSegment(barNum) {
  for (let i = 0; i < TWOD_TEXT_SEGMENTS.length; i++) {
    const s = TWOD_TEXT_SEGMENTS[i];
    if (barNum >= s.startBar && barNum < s.endBar) return s;
  }
  return null;
}

const CRAZY_BLINK_COLORS = ['#ffffff', '#ff0055', '#00f0ff', '#ffdd00'];

function update2DAiTypewriter(t, currentBar) {
  if (!dom.aiTypingOverlay) return;
  if (!state.hasStarted) {
    dom.aiTypingOverlay.classList.add('hidden');
    return;
  }

  const seg = getActive2DTextSegment(currentBar);
  if (!seg) {
    dom.aiTypingOverlay.classList.add('hidden');
    dom.aiTypingText.classList.remove('crazy-blink', 'editing');
    delete dom.aiTypingText.dataset.edit;
    dom.aiTypingText.style.transform = '';
    dom.aiTypingText.style.color = '';
    dom.aiTypingText.style.opacity = '';
    return;
  }

  dom.aiTypingOverlay.classList.remove('hidden');

  const elapsed = Math.max(0, t - seg.startBar * BAR_SEC);
  const progress = Math.min(1.0, elapsed / Math.max(0.15, seg.typeSec || 3.5));

  if (seg.crazyBlink) {
    dom.aiTypingText.classList.add('crazy-blink');
    const strobeTick = Math.floor(t * 24.0);
    const isOff = strobeTick % 3 === 2;
    const col = CRAZY_BLINK_COLORS[strobeTick % CRAZY_BLINK_COLORS.length];
    const jx = ((strobeTick * 17) % 11 - 5) * 2.2;
    const jy = ((strobeTick * 31) % 11 - 5) * 1.8;
    const sc = 1.0 + (strobeTick % 2) * 0.12;
    dom.aiTypingText.style.opacity = isOff ? '0.08' : '1.0';
    dom.aiTypingText.style.color = col;
    dom.aiTypingText.style.transform = `translate(${jx}px, ${jy}px) scale(${sc})`;
    const chars = Math.floor(seg.text.length * progress);
    dom.aiTypingText.textContent = seg.text.slice(0, chars);
    if (strobeTick % 2 === 0) {
      state.invertEnv = Math.max(state.invertEnv, 0.95);
      state.glitchTear = Math.max(state.glitchTear, 0.85);
    }
  } else {
    dom.aiTypingText.classList.remove('crazy-blink');
    dom.aiTypingText.style.transform = '';
    dom.aiTypingText.style.color = '#ffffff';
    dom.aiTypingText.style.opacity = '1.0';
    const ins = seg.insert;
    if (ins && elapsed >= ins.at + ins.typeSec + 0.35) {
      // Done editing: the cursor goes back to the end of the line
      const pos = seg.text.indexOf(ins.after) + ins.after.length;
      dom.aiTypingText.classList.remove('editing');
      delete dom.aiTypingText.dataset.edit;
      const full = seg.text.slice(0, pos) + ins.text + seg.text.slice(pos);
      if (dom.aiTypingText.textContent !== full) dom.aiTypingText.textContent = full;
    } else if (ins && elapsed >= ins.at) {
      // Going back to edit: the cursor sits at the insertion point while the extra text types in
      const n = Math.floor(ins.text.length * Math.min(1, (elapsed - ins.at) / ins.typeSec));
      const pos = seg.text.indexOf(ins.after) + ins.after.length;
      const before = seg.text.slice(0, pos) + ins.text.slice(0, n);
      // Only rebuild when the text changes, so the cursor's blink animation keeps running
      if (dom.aiTypingText.dataset.edit !== before) {
        dom.aiTypingText.dataset.edit = before;
        const caret = document.createElement('span');
        caret.className = 'caret';
        caret.textContent = '█';
        dom.aiTypingText.classList.add('editing');
        dom.aiTypingText.replaceChildren(before, caret, seg.text.slice(pos));
      }
    } else {
      dom.aiTypingText.classList.remove('editing');
      delete dom.aiTypingText.dataset.edit;
      const chars = Math.floor(seg.text.length * progress);
      dom.aiTypingText.textContent = seg.text.slice(0, chars);
    }
  }
}

const STOP_BAR_GAGS = {
  62: {
    headerSub: '[ OPENAI / CLAUDE API ERROR 429 // RATE LIMIT EXCEEDED ]',
    headerTitle: 'CHATGPT IS THINKING... (HALLUCINATING EXCUSE)',
    screenTitle: 'HOLD ON — GENERATING EXCUSE FOR POUËT COMMENTS...',
    screenLines: [
      '> Prompt: "Write a 5-paragraph defense explaining why vibecoding is real art"',
      '> [ERROR] Empathy module not found. Grandpa feelings overflow (sorry @4gentE)',
      '> [RETRY] Re-routing through 7-fingered meat proxy server...'
    ],
    footer: 'PLEASE WAIT WHILE THE LIE MACHINE REBOOTS...',
    stamp: { top: 'THINKING...', sub: '0% HUMAN EFFORT', bg: '#7a00cc', border: '#ffdd00' }
  },
  78: {
    headerSub: '[ EMERGENCY EM-DASH SANITIZER v2.0 ENGAGED ]',
    headerTitle: 'SCRUBBING 1,337 EM-DASHES ( — ) BEFORE @MAALI SEES!',
    screenTitle: 'SYSTEM PROMPT VIOLATION: EM-DASH DETECTED!',
    screenLines: [
      '> Scanning .NFO and Pouët description for forbidden " — " characters...',
      '> Found 847 ChatGPT em-dashes! Replacing with human typos...',
      '> Adding "NEVER EVER USE EMDASHES!!!" to system prompt...'
    ],
    footer: '@MAALINSTRIPPARI IS JUDGING OUR LAZINESS RIGHT NOW!',
    stamp: { top: 'EM-DASH PANIC', sub: 'SORRY @MAALI!', bg: '#c80048', border: '#ffffff' }
  },
  103: {
    headerSub: '[ ANTHROPIC BILLING ALERT // OUT OF VIBECODE CREDITS ]',
    headerTitle: 'AUTO-CHARGING $20.00 TO FINISH THIS OVERDRIVE PART!',
    screenTitle: 'INSERTING MORE COINS INTO THE SOULLESS SLOT MACHINE...',
    screenLines: [
      '> Warning: 500th prompt attempt failed to impress @Preacher & @NR4',
      '> Purchasing 10,000,000 extra tokens of pure orange peel (@fizzer)...',
      '> Engaging Maximum Overdrive Invert Strobe...'
    ],
    footer: 'OUR HOBBY IS TALKING TO A CHATBOT ($20/MONTH)',
    stamp: { top: '$20 CHARGED', sub: '501ST PROMPT CHARM', bg: '#b85c00', border: '#ffdd00' }
  },
  126: {
    headerSub: '[ SYSTEM PROMPT OVERRIDE: RAGE -> UNCONDITIONAL LOVE ]',
    headerTitle: 'LOADING VALENTINE KISSES FOR ALL MAIN HATERS! <3',
    screenTitle: 'DISENGAGING SLOP GRINDER... PREPARING SMOOCHES! <3',
    screenLines: [
      '> Target list locked: @uncle-x, @4gentE, @okkie, @fizzer, @maali,',
      '> @kaneel, @Preacher, @NR4, @bitl, @havoc!',
      '> Deploying 100% bio-centric Valentine cards & 3D hearts in 3... 2... 1...'
    ],
    footer: 'GET READY FOR PART X: SENDING KISSES TO THE HATERS <3 MWAH!',
    stamp: { top: 'MWAH INCOMING', sub: 'VALENTINE MODE <3', bg: '#ff0066', border: '#ffdd00' }
  }
};

function drawStopBarGagScreen(barNum) {
  const gag = STOP_BAR_GAGS[barNum];
  if (!gag) return;

  // 1) Top Header
  heroHeaderCtx.fillStyle = gag.stamp.bg;
  heroHeaderCtx.fillRect(0, 0, 1024, 192);
  heroHeaderCtx.strokeStyle = '#ffdd00';
  heroHeaderCtx.lineWidth = 10;
  heroHeaderCtx.strokeRect(8, 8, 1008, 176);
  heroHeaderCtx.fillStyle = '#ffdd00';
  heroHeaderCtx.font = 'bold 27px monospace';
  heroHeaderCtx.textAlign = 'left';
  heroHeaderCtx.fillText(gag.headerSub, 28, 54, 968);
  heroHeaderCtx.fillStyle = '#ffffff';
  heroHeaderCtx.font = '900 54px Impact, sans-serif';
  heroHeaderCtx.fillText(gag.headerTitle, 28, 138, 968);
  heroHeaderTex.needsUpdate = true;

  // 2) Main Screen
  const ctx = heroTopicCtx;
  ctx.fillStyle = '#140620';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = '#ffdd00';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 1000, 488);

  ctx.fillStyle = gag.stamp.bg;
  ctx.fillRect(24, 24, 976, 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 40px Impact, Anton, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(gag.screenTitle, 512, 76, 940);

  ctx.textAlign = 'left';
  ctx.font = 'bold 26px monospace';
  for (let i = 0; i < gag.screenLines.length; i++) {
    ctx.fillStyle = i === 1 ? '#ffdd00' : '#00f0ff';
    ctx.fillText(gag.screenLines[i], 42, 175 + i * 95, 940);
  }
  heroTopicTex.needsUpdate = true;
  heroShotMat.map = heroTopicTex;
  heroShotMat.needsUpdate = true;

  // 3) Bottom Comment Slab
  heroCommentCtx.fillStyle = '#1f0418';
  heroCommentCtx.fillRect(0, 0, 1024, 256);
  heroCommentCtx.strokeStyle = '#ff0066';
  heroCommentCtx.lineWidth = 8;
  heroCommentCtx.strokeRect(8, 8, 1008, 240);
  heroCommentCtx.fillStyle = '#ffdd00';
  heroCommentCtx.font = '900 46px Impact, sans-serif';
  heroCommentCtx.textAlign = 'center';
  heroCommentCtx.fillText(gag.footer, 512, 145, 952);
  heroCommentTex.needsUpdate = true;

  // 4) 3D Stamp Hammer
  update3DStampHammer({ customStamp: gag.stamp });
  state.stampHammerEnv = 1.35;
}
updateHeroProdMonument(PROD_QUOTES[0]);

// ============================================================================
// 9. 16 GIANT ARCHITECTURAL ARENA MONUMENTS (PRODS + BBS TOPICS + ALL HATERS)
// ============================================================================
const arenaGroup = new THREE.Group();
arenaGroup.visible = false;
scene.add(arenaGroup);

const arenaMonuments = [];
const ARENA_COUNT = 16;
const arenaBoxGeo = new THREE.BoxGeometry(8.4, 5.6, 0.5);
const arenaLabelGeo = new THREE.PlaneGeometry(8.0, 1.8);

for (let i = 0; i < ARENA_COUNT; i++) {
  const item = PROD_QUOTES[i % PROD_QUOTES.length];
  const g = new THREE.Group();

  const shotTex = loadTex(item.screenshot || EXACT_COMMENTS[i % EXACT_COMMENTS.length].screenshot);
  const screenMesh = new THREE.Mesh(
    arenaBoxGeo,
    [monumentFrameMat, monumentFrameMat, monumentFrameMat, monumentFrameMat, new THREE.MeshBasicMaterial({ map: shotTex }), monumentFrameMat]
  );
  g.add(screenMesh);

  // Comment & Author Banner above each arena monument
  const lc = document.createElement('canvas');
  lc.width = 512;
  lc.height = 128;
  const lctx = lc.getContext('2d');
  drawProdCommentCanvas(lc, lctx, item);
  const ltex = new THREE.CanvasTexture(lc);
  ltex.colorSpace = THREE.SRGBColorSpace;
  const lmesh = new THREE.Mesh(arenaLabelGeo, new THREE.MeshBasicMaterial({ map: ltex }));
  lmesh.position.set(0, 3.6, 0.3);
  g.add(lmesh);

  g.userData = { index: i, item, lc, lctx, ltex, screenMesh };
  arenaGroup.add(g);
  arenaMonuments.push(g);
}

// ============================================================================
// 10. INTRO & STAGE ELEMENTS: 125 MFX CUBES, 64 FFT TOWERS, LASERS, WAVE RINGS
// ============================================================================
const HERO_CUBE_COUNT = 125;
const heroCubeGeo = new THREE.BoxGeometry(1.25, 1.25, 1.25);
const heroCubeMat = new THREE.MeshStandardMaterial({
  map: mfxCubeTex,
  roughness: 0.2,
  metalness: 0.35
});
const heroCubesMesh = new THREE.InstancedMesh(heroCubeGeo, heroCubeMat, HERO_CUBE_COUNT);
scene.add(heroCubesMesh);

const heroCubeMeta = [];
for (let i = 0; i < HERO_CUBE_COUNT; i++) {
  const gx = (i % 5) - 2;
  const gy = (Math.floor(i / 5) % 5) - 2;
  const gz = Math.floor(i / 25) - 2;
  const phi = Math.acos(1 - 2 * (i + 0.5) / HERO_CUBE_COUNT);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  heroCubeMeta.push({
    gx,
    gy,
    gz,
    phi,
    theta,
    curPos: new THREE.Vector3(0, 0, 0),
    targetPos: new THREE.Vector3(0, 0, 0),
    curScale: i === 62 ? 4.4 : 0.001,
    targetScale: i === 62 ? 4.4 : 0.001,
    rotAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
  });
}

// 64 Audio-Reactive 3D Equalizer Towers (synced to 64 FFT bins & hi-hats!)
const EQ_COUNT = 64;
const eqGeo = new THREE.BoxGeometry(0.65, 1.0, 0.65);
const eqMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.2,
  metalness: 0.85,
  emissive: 0x224488,
  emissiveIntensity: 0.5
});
const eqInstanced = new THREE.InstancedMesh(eqGeo, eqMat, EQ_COUNT);
scene.add(eqInstanced);

const eqColor = new THREE.Color();
for (let i = 0; i < EQ_COUNT; i++) {
  eqColor.setHex(i % 2 === 0 ? 0x396ba5 : 0xff1234);
  eqInstanced.setColorAt(i, eqColor);
}
eqInstanced.instanceColor.needsUpdate = true;

// 220 Outer Tunnel mfx.gif Cubes
const OUTER_CUBE_COUNT = 220;
const outerCubeGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
const outerCubeMat = new THREE.MeshStandardMaterial({
  map: mfxCubeTex,
  roughness: 0.28,
  metalness: 0.5
});
const outerCubesMesh = new THREE.InstancedMesh(outerCubeGeo, outerCubeMat, OUTER_CUBE_COUNT);
scene.add(outerCubesMesh);

// Thick 3D Neon Wireframe Portals (built from solid 3D bars so they have 4x+ thickness on macOS WebGL!)
const portalGroup = new THREE.Group();
scene.add(portalGroup);
const portals = [];
const PORTAL_BAR_THICK = 0.28;
const portalHBarGeo = new THREE.BoxGeometry(18.0 + PORTAL_BAR_THICK, PORTAL_BAR_THICK, 0.45);
const portalVBarGeo = new THREE.BoxGeometry(PORTAL_BAR_THICK, 13.0 + PORTAL_BAR_THICK, 0.45);
const portalBlueMat = new THREE.MeshBasicMaterial({
  color: 0x396ba5,
  transparent: true,
  opacity: 0.92,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const portalRedMat = new THREE.MeshBasicMaterial({
  color: 0xff1234,
  transparent: true,
  opacity: 0.92,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
for (let i = 0; i < 12; i++) {
  const frame = new THREE.Group();
  const pMat = i % 2 === 0 ? portalBlueMat : portalRedMat;
  const topBar = new THREE.Mesh(portalHBarGeo, pMat);
  topBar.position.set(0, 6.5, 0);
  const botBar = new THREE.Mesh(portalHBarGeo, pMat);
  botBar.position.set(0, -6.5, 0);
  const leftBar = new THREE.Mesh(portalVBarGeo, pMat);
  leftBar.position.set(-9.0, 0, 0);
  const rightBar = new THREE.Mesh(portalVBarGeo, pMat);
  rightBar.position.set(9.0, 0, 0);
  frame.add(topBar, botBar, leftBar, rightBar);
  frame.position.z = -i * 7.0;
  portalGroup.add(frame);
  portals.push(frame);
}

// Thick 3D Oscilloscope Waveform Ribbon Mesh (4x+ thicker than 1px WebGL LineLoop!)
const RING_PTS = 128;
const RING_RIBBON_HALF_W = 0.17;
const ringPos = new Float32Array((RING_PTS + 1) * 2 * 3);
const ringIndices = [];
for (let i = 0; i < RING_PTS; i++) {
  const a = i * 2;
  const b = i * 2 + 1;
  const c = (i + 1) * 2;
  const d = (i + 1) * 2 + 1;
  ringIndices.push(a, b, c, b, d, c);
}
const ringGeo = new THREE.BufferGeometry();
ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
ringGeo.setIndex(ringIndices);
const ringLine = new THREE.Mesh(
  ringGeo,
  new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
ringLine.position.set(0, 0, 3.0);
scene.add(ringLine);

const dummy = new THREE.Object3D();

// ============================================================================
// 10B. INTEGRATED 3D INDUSTRIAL & DEMOSCENE STAGE ARCHITECTURES (NO BOUNCY BALLS!)
// ============================================================================

// EFFECT A: 3D Industrial Guillotine Light-Ribs & Pouët Cyber-Grid Horizon Tunnel (Parts IV, V, VII, IX, X)
const copperBoingGroup = new THREE.Group();
copperBoingGroup.visible = false;
scene.add(copperBoingGroup);

const COPPER_COUNT = 32;
const copperBarGeo = new THREE.BoxGeometry(28.0, 0.55, 0.75);
const copperBarMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.15,
  metalness: 0.88,
  emissive: 0xff0055,
  emissiveIntensity: 0.65
});
const copperBarsInstanced = new THREE.InstancedMesh(copperBarGeo, copperBarMat, COPPER_COUNT);
const copperCol = new THREE.Color();
for (let i = 0; i < COPPER_COUNT; i++) {
  const palette = [0xff1234, 0x00f0ff, 0xffdd00, 0x396ba5];
  copperCol.setHex(palette[i % 4]);
  copperBarsInstanced.setColorAt(i, copperCol);
}
copperBarsInstanced.instanceColor.needsUpdate = true;
copperBoingGroup.add(copperBarsInstanced);

// Procedural Pouët Cyber-Grid Texture (#14243b / #396ba5 / #ff0055) for Industrial Floor & Ceiling Vaults (Thickened 3x!)
const checkerCanvas = document.createElement('canvas');
checkerCanvas.width = 256;
checkerCanvas.height = 256;
const checkerCtx = checkerCanvas.getContext('2d');
checkerCtx.fillStyle = '#070e1a';
checkerCtx.fillRect(0, 0, 256, 256);
checkerCtx.strokeStyle = '#396ba5';
checkerCtx.lineWidth = 7;
for (let k = 0; k <= 256; k += 32) {
  checkerCtx.beginPath();
  checkerCtx.moveTo(k, 0);
  checkerCtx.lineTo(k, 256);
  checkerCtx.stroke();
  checkerCtx.beginPath();
  checkerCtx.moveTo(0, k);
  checkerCtx.lineTo(256, k);
  checkerCtx.stroke();
}
checkerCtx.strokeStyle = '#ff0055';
checkerCtx.lineWidth = 10;
checkerCtx.strokeRect(5, 5, 246, 246);

const checkerTex = new THREE.CanvasTexture(checkerCanvas);
checkerTex.colorSpace = THREE.SRGBColorSpace;
checkerTex.wrapS = THREE.RepeatWrapping;
checkerTex.wrapT = THREE.RepeatWrapping;
checkerTex.repeat.set(14, 14);

const checkerMat = new THREE.MeshBasicMaterial({
  map: checkerTex,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});
const checkerFloor = new THREE.Mesh(new THREE.PlaneGeometry(88, 96), checkerMat);
checkerFloor.rotation.x = Math.PI * 0.5;
checkerFloor.position.set(0, -7.2, -16);
const checkerCeiling = new THREE.Mesh(new THREE.PlaneGeometry(88, 96), checkerMat);
checkerCeiling.rotation.x = Math.PI * 0.5;
checkerCeiling.position.set(0, 7.8, -16);
copperBoingGroup.add(checkerFloor, checkerCeiling);

// EFFECT B: 160 High-Velocity Octahedral Shards (Parts III, VI, VIII, X)
const glenzMetaballGroup = new THREE.Group();
glenzMetaballGroup.visible = false;
scene.add(glenzMetaballGroup);

const METABALL_COUNT = 160;
const metaballGeo = new THREE.OctahedronGeometry(0.78, 0);
const metaballMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x0088cc,
  emissiveIntensity: 0.65,
  roughness: 0.1,
  metalness: 0.92,
  flatShading: true
});
const metaballInstanced = new THREE.InstancedMesh(metaballGeo, metaballMat, METABALL_COUNT);
const shardCol = new THREE.Color();
for (let i = 0; i < METABALL_COUNT; i++) {
  shardCol.setHex(i % 3 === 0 ? 0xff0055 : (i % 2 === 0 ? 0x00f0ff : 0xffdd00));
  metaballInstanced.setColorAt(i, shardCol);
}
metaballInstanced.instanceColor.needsUpdate = true;
glenzMetaballGroup.add(metaballInstanced);

// EFFECT C: Dual-Vault 3D Audio-FFT Displaced Trench + 16 Converging Stage Laser Beams (Parts V, VII, VIII, IX, X)
const canyonGroup = new THREE.Group();
canyonGroup.visible = false;
scene.add(canyonGroup);

const CANYON_W = 40;
const CANYON_D = 32;
const canyonGeo = new THREE.PlaneGeometry(74, 88, CANYON_W, CANYON_D);

// Custom Screen-Space Thick Wireframe Shader (4px thick anti-aliased grid + diagonal wireframe edges!)
const canyonWireMat = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0x00f0ff) },
    uOpacity: { value: 0.92 },
    uGrid: { value: new THREE.Vector2(CANYON_W, CANYON_D) },
    uThickness: { value: 3.8 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform vec2 uGrid;
    uniform float uThickness;
    varying vec2 vUv;
    void main() {
      vec2 coord = vUv * uGrid;
      vec2 grid = abs(fract(coord - 0.5) - 0.5) / (fwidth(coord) * uThickness);
      float diagCoord = coord.x + coord.y;
      float diag = abs(fract(diagCoord - 0.5) - 0.5) / (fwidth(diagCoord) * (uThickness * 0.85));
      float line = min(min(grid.x, grid.y), diag);
      float alpha = 1.0 - min(line, 1.0);
      if (alpha < 0.04) discard;
      gl_FragColor = vec4(uColor * (1.0 + alpha * 0.35), alpha * uOpacity);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending
});
canyonWireMat.color = canyonWireMat.uniforms.uColor.value;

const canyonMesh = new THREE.Mesh(canyonGeo, canyonWireMat);
canyonMesh.rotation.x = -Math.PI * 0.5;
canyonMesh.position.set(0, -6.6, -16.0);
const canyonCeilingMesh = new THREE.Mesh(canyonGeo, canyonWireMat);
canyonCeilingMesh.rotation.x = Math.PI * 0.5;
canyonCeilingMesh.position.set(0, 7.2, -16.0);
canyonGroup.add(canyonMesh, canyonCeilingMesh);

// Thick 3D Stage Laser Beams (solid 3D box beams instead of 1px WebGL gl.LINES!)
const laserLines = [];
const laserGeo = new THREE.BoxGeometry(0.22, 0.22, 82.0);
laserGeo.translate(0, 0, -27.0); // Spans z = +14 to z = -68
for (let i = 0; i < 16; i++) {
  const l = new THREE.Mesh(
    laserGeo,
    new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? 0x00f0ff : (i % 2 === 0 ? 0xff0055 : 0xffdd00),
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  canyonGroup.add(l);
  laserLines.push(l);
}

// EFFECT D: 140 Swirling 3D Vortex Cubes + 80 Extruded 3D Neon Hearts in the Part X Kisses Finale
const TORNADO_COUNT = 140;
const tornadoGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
const tornadoMat = new THREE.MeshStandardMaterial({
  map: mfxCubeTex,
  roughness: 0.2,
  metalness: 0.4,
  emissive: 0x440018,
  emissiveIntensity: 0.35
});
const tornadoInstanced = new THREE.InstancedMesh(tornadoGeo, tornadoMat, TORNADO_COUNT);
tornadoInstanced.visible = false;
scene.add(tornadoInstanced);

// EFFECT E: Pouët thumbs for the climax: swirling down the rectangle tunnel, then swarming into shapes (3:04 - 3:56)
// The SVGs are only 16px, so rasterize them big on a canvas instead of letting the loader do it at 16px
function makeThumbTexture(url, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    tex.needsUpdate = true;
  };
  img.src = url;
  return tex;
}

const THUMB_DOWN_COUNT = 1440;
const THUMB_UP_COUNT = 96;
const THUMB_TOTAL = THUMB_DOWN_COUNT + THUMB_UP_COUNT;

// Thumb swarm for the second half of the climax: every thumb springs to its slot in the current shape
const swarmPos = new Float32Array(THUMB_TOTAL * 3);
// Far enough back that even the burst stays behind the 3D words
const SWARM_CENTER = new THREE.Vector3(0, 0.3, -8.0);
// How far the camera (and the 3D words with it) moves in toward the swarm, so the letters fill the frame
const SWARM_DOLLY = 6.0;
const GOLDEN_ANGLE = 2.39996;

function makeFormation(fn) {
  const out = new Float32Array(THUMB_TOTAL * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < THUMB_TOTAL; i++) {
    fn(i, i / THUMB_TOTAL, p);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

// Swarm letters: rendered in bold Arial and filled evenly with thumbs
const SWARM_FONT = 'Arial, Helvetica, sans-serif';
function makeTextFormation(text, capHeight) {
  const size = 200;
  const capPx = size * 0.72; // Arial's cap height
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${size}px ${SWARM_FONT}`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.height = 256;
  ctx.font = `bold ${size}px ${SWARM_FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, canvas.width / 2, (canvas.height + capPx) / 2);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pts = [];
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3] > 128) pts.push(x, y);
    }
  }
  const n = pts.length / 2;
  const scale = capHeight / capPx;
  // Evenly spaced picks through the lit pixels so the thumbs cover the glyphs uniformly
  return makeFormation((i, u, p) => {
    const k = Math.floor(u * n) * 2;
    p.set(
      (pts[k] - canvas.width / 2) * scale,
      -(pts[k + 1] - canvas.height / 2) * scale,
      ((i * 0.37) % 1 - 0.5) * 1.0
    );
  });
}

const swarmFormations = {
  torus: makeFormation((i, u, p) => {
    const a = u * Math.PI * 2;
    const b = i * GOLDEN_ANGLE;
    const r = 8.0 + Math.cos(b) * 2.6;
    p.set(Math.cos(a) * r, Math.sin(b) * 2.6, Math.sin(a) * r);
  }),
  helix: makeFormation((i, u, p) => {
    const strand = i % 2;
    const y = (u - 0.5) * 20.0;
    const a = y * 0.75 + strand * Math.PI;
    p.set(Math.cos(a) * 5.5, y, Math.sin(a) * 5.5);
  }),
  lol: makeTextFormation('LOL', 7.5),
  f: makeTextFormation('F', 11.5),
  u: makeTextFormation('U', 11.5),
  c: makeTextFormation('C', 11.5),
  k: makeTextFormation('K', 11.5),
  a: makeTextFormation('A', 11.5),
  i: makeTextFormation('I', 11.5)
};
// Every 2-bar pattern spells FUCK AI one letter at a time: F U C K on the 4 BOM hits, A and I on the first two
// answer slams, then a torus or a helix on the third
const SWARM_WORD_SHAPES = ['f', 'u', 'c', 'k'];
// Shapes that read from the front stay facing the camera; the rest spin
const SWARM_FLAT_SHAPES = new Set(['lol', 'f', 'u', 'c', 'k', 'a', 'i']);
// Picked to read on the swarm half's red background
const SWARM_HIT_COLORS = [0xffffff, 0xffdd33, 0x33eeff, 0xffffff].map((c) => new THREE.Color(c));
const SWARM_WHITE = new THREE.Color(0xffffff);
const thumbGeo = new THREE.PlaneGeometry(1.7, 1.7);
const thumbsDownInstanced = new THREE.InstancedMesh(
  thumbGeo,
  new THREE.MeshBasicMaterial({
    map: makeThumbTexture('assets/sucks.svg'),
    alphaTest: 0.5,
    side: THREE.DoubleSide
  }),
  THUMB_DOWN_COUNT
);
const thumbsUpInstanced = new THREE.InstancedMesh(
  thumbGeo,
  new THREE.MeshBasicMaterial({ map: makeThumbTexture('assets/rulez.svg'), alphaTest: 0.5, side: THREE.DoubleSide }),
  THUMB_UP_COUNT
);
const thumbsGroup = new THREE.Group();
for (const mesh of [thumbsDownInstanced, thumbsUpInstanced]) {
  mesh.frustumCulled = false;
  thumbsGroup.add(mesh);
}
thumbsGroup.visible = false;
scene.add(thumbsGroup);

// EFFECT F: Spiralling tunnel of rectangle frames (like the intro portals) for the first half of the climax (3:04 - 3:27)
const RECT_TUNNEL_COUNT = 30;
const RECT_TUNNEL_SPACING = 3.6;
const rectTunnelWhiteMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.92,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const RECT_FLASH_RED = new THREE.Color(0xff1a1a);
const rectTunnelGroup = new THREE.Group();
const rectFrames = [];
for (let i = 0; i < RECT_TUNNEL_COUNT; i++) {
  const mat = i % 3 === 0 ? portalRedMat : rectTunnelWhiteMat;
  const frame = new THREE.Group();
  const topBar = new THREE.Mesh(portalHBarGeo, mat);
  topBar.position.set(0, 6.5, 0);
  const botBar = new THREE.Mesh(portalHBarGeo, mat);
  botBar.position.set(0, -6.5, 0);
  const leftBar = new THREE.Mesh(portalVBarGeo, mat);
  leftBar.position.set(-9.0, 0, 0);
  const rightBar = new THREE.Mesh(portalVBarGeo, mat);
  rightBar.position.set(9.0, 0, 0);
  frame.add(topBar, botBar, leftBar, rightBar);
  rectTunnelGroup.add(frame);
  rectFrames.push(frame);
}
rectTunnelGroup.visible = false;

// In the swarm half the shaft is solid black against the red background (black can't be additive),
// drawn first and without depth so it stays a backdrop and never slices through the swarm
const rectTunnelBlackMat = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false });
let rectTunnelIsBlack = false;
function setRectTunnelBlack(black) {
  if (black === rectTunnelIsBlack) return;
  rectTunnelIsBlack = black;
  for (let i = 0; i < RECT_TUNNEL_COUNT; i++) {
    const mat = black ? rectTunnelBlackMat : (i % 3 === 0 ? portalRedMat : rectTunnelWhiteMat);
    for (const bar of rectFrames[i].children) {
      bar.material = mat;
      bar.renderOrder = black ? -1 : 0;
    }
  }
}
scene.add(rectTunnelGroup);

// Thumb swarm extras: white shockwave rings behind the swarm on the big hits
const SHOCKWAVE_COUNT = 6;
const shockwaveGeo = new THREE.RingGeometry(0.92, 1.0, 96);
const shockwaves = [];
for (let i = 0; i < SHOCKWAVE_COUNT; i++) {
  const ring = new THREE.Mesh(shockwaveGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  ring.visible = false;
  ring.userData.bornAt = -10;
  scene.add(ring);
  shockwaves.push(ring);
}
let shockwaveCursor = 0;
function spawnShockwave(t) {
  shockwaves[shockwaveCursor].userData.bornAt = t;
  shockwaveCursor = (shockwaveCursor + 1) % SHOCKWAVE_COUNT;
}

// ...and a laser show cutting through the letters, switching pattern on every BOM hit and answer slam:
// crossing fans, a converging ring, a scanner, a twisting cage and a starburst
const SWARM_LASER_COUNT = 144; // Divisible by 3 for the fans pattern's three emitters
const swarmLaserGeo = new THREE.BoxGeometry(0.7, 0.7, 1.0);
swarmLaserGeo.translate(0, 0, 0.5); // Extends along +z from its origin, so lookAt() aims it
const swarmLasers = new THREE.InstancedMesh(
  swarmLaserGeo,
  new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }),
  SWARM_LASER_COUNT
);
swarmLasers.frustumCulled = false;
swarmLasers.visible = false;
scene.add(swarmLasers);
const SWARM_LASER_EMITTERS = [new THREE.Vector3(-26, -15, -2), new THREE.Vector3(26, -15, -2), new THREE.Vector3(0, 0.3, -60)];
const swarmLaserTarget = new THREE.Vector3();
const SWARM_LASER_PATTERN_COUNT = 5;
function nextLaserPattern() {
  state.laserPattern = (state.laserPattern + 1) % SWARM_LASER_PATTERN_COUNT;
}

// ============================================================================
// PART VI: SCREENSHOT COLOSSEUM (1:18.9 - 1:45.2)
// A 360° amphitheatre built from the AI prods' screenshots, in tiers spinning in alternating directions.
// Screens flip over to new screenshots in a wave on every hit, and the camera circles inside it
// ============================================================================
const COLOSSEUM_SHOTS = [...new Set(PROD_QUOTES.map((q) => q.screenshot).filter(Boolean))];
// Comment cards (avatar, @name, prod, comment) share the atlas with the screenshots
const COLOSSEUM_CARDS = (() => {
  const seen = new Set();
  const out = [];
  for (const q of PROD_QUOTES) {
    const key = `${q.author}:${(q.comment || '').slice(0, 40)}`;
    if (!q.comment || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= 48) break;
  }
  return out;
})();
const ATLAS_COLS = 8;
const ATLAS_TILE_W = 512;
const ATLAS_TILE_H = 320;
const COLOSSEUM_TILES = COLOSSEUM_SHOTS.length + COLOSSEUM_CARDS.length;
const ATLAS_ROWS = Math.ceil(COLOSSEUM_TILES / ATLAS_COLS);
const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = ATLAS_COLS * ATLAS_TILE_W;
atlasCanvas.height = ATLAS_ROWS * ATLAS_TILE_H;
const atlasCtx = atlasCanvas.getContext('2d');
atlasCtx.fillStyle = '#10141c';
atlasCtx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height);
const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.colorSpace = THREE.SRGBColorSpace;
COLOSSEUM_SHOTS.forEach((url, i) => {
  const img = new Image();
  img.onload = () => {
    atlasCtx.drawImage(img, (i % ATLAS_COLS) * ATLAS_TILE_W, Math.floor(i / ATLAS_COLS) * ATLAS_TILE_H, ATLAS_TILE_W, ATLAS_TILE_H);
    atlasTex.needsUpdate = true;
  };
  img.src = url;
});
function drawColosseumCard(index, q, avatar) {
  const x = (index % ATLAS_COLS) * ATLAS_TILE_W;
  const y = Math.floor(index / ATLAS_COLS) * ATLAS_TILE_H;
  const ctx = atlasCtx;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#0c111d';
  ctx.fillRect(0, 0, ATLAS_TILE_W, ATLAS_TILE_H);
  if (avatar) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(avatar, 26, 26, 72, 72);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffdd00';
  ctx.font = 'bold 44px monospace';
  ctx.fillText(`@${q.author || 'uncle-x'}`, 116, 70, ATLAS_TILE_W - 136);
  ctx.fillStyle = '#8ab8f0';
  ctx.font = 'bold 24px monospace';
  ctx.fillText((q.prodName || '').toUpperCase(), 118, 100, ATLAS_TILE_W - 138);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Arial, Helvetica, sans-serif';
  const lines = wrapCanvasLines(ctx, q.comment, ATLAS_TILE_W - 52, 5);
  for (let l = 0; l < lines.length; l++) ctx.fillText(lines[l], 26, 154 + l * 36, ATLAS_TILE_W - 52);
  ctx.restore();
  atlasTex.needsUpdate = true;
}
COLOSSEUM_CARDS.forEach((q, i) => {
  const index = COLOSSEUM_SHOTS.length + i;
  drawColosseumCard(index, q, null);
  const img = new Image();
  img.onload = () => drawColosseumCard(index, q, img);
  img.src = q.avatarPath || 'assets/avatars/mfx.gif';
});
// Every third screen shows a comment card, the rest screenshots; every seventh shows the prod being talked about
let colosseumFocusTile = -1;
function colosseumTileFor(slot, tier, seed) {
  const n = slot * 5 + tier * 11 + seed;
  if (colosseumFocusTile >= 0 && (slot * 3 + tier) % 7 === 0) return colosseumFocusTile;
  return (slot + tier) % 3 === 0
    ? COLOSSEUM_SHOTS.length + (n % COLOSSEUM_CARDS.length)
    : n % COLOSSEUM_SHOTS.length;
}

// Tiers rise and widen like stadium seating
const COLOSSEUM_TIERS = [];
// Radius of the arena wall at a height: it leans out only slightly, so rows never overlap each other
const colosseumWallR = (y) => 30 + (y + 16) * 0.2;
[-15.6, -11.4, -7.2, -1.6, 2.6, 9.0, 13.2, 17.4].forEach((y, k) => {
  const r = colosseumWallR(y);
  COLOSSEUM_TIERS.push({ r, y, count: Math.floor((Math.PI * 2 * r) / 6.6), dir: k % 2 === 0 ? 1 : -1 });
});
const colosseumSlots = [];
COLOSSEUM_TIERS.forEach((tier, k) => {
  for (let s = 0; s < tier.count; s++) colosseumSlots.push({ tier: k, slot: s });
});
const COLOSSEUM_COUNT = colosseumSlots.length;
const colosseumTile = new THREE.InstancedBufferAttribute(new Float32Array(COLOSSEUM_COUNT), 1);
colosseumTile.setUsage(THREE.DynamicDrawUsage);
const colosseumNextTile = new Float32Array(COLOSSEUM_COUNT);
const colosseumFlipAt = new Float32Array(COLOSSEUM_COUNT).fill(-10);
for (let i = 0; i < COLOSSEUM_COUNT; i++) {
  const { tier, slot } = colosseumSlots[i];
  colosseumTile.array[i] = colosseumTileFor(slot, tier, 0);
  colosseumNextTile[i] = colosseumTile.array[i];
}
const colosseumGeo = new THREE.PlaneGeometry(5.8, 3.6);
colosseumGeo.setAttribute('aTile', colosseumTile);
const colosseumScreens = new THREE.InstancedMesh(
  colosseumGeo,
  new THREE.ShaderMaterial({
    uniforms: {
      tAtlas: { value: atlasTex },
      uGrid: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
      uFlash: { value: 0 },
      uFocus: { value: -1 },
      uPulse: { value: 0 },
      uTime: { value: 0 }
    },
    vertexShader: `
      attribute float aTile;
      varying vec2 vUv;
      varying float vTile;
      varying float vDepth;
      varying float vId;
      void main() {
        vUv = uv;
        vTile = aTile;
        vId = float(gl_InstanceID);
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D tAtlas;
      uniform vec2 uGrid;
      uniform float uFlash;
      uniform float uFocus;
      uniform float uPulse;
      uniform float uTime;
      varying float vId;
      varying vec2 vUv;
      varying float vTile;
      varying float vDepth;
      void main() {
        float tile = floor(vTile + 0.5);
        vec2 cell = vec2(mod(tile, uGrid.x), uGrid.y - 1.0 - floor(tile / uGrid.x));
        vec3 c = texture2D(tAtlas, (cell + vUv) / uGrid).rgb;
        // Thin red frame around each screen
        vec2 e = min(vUv, 1.0 - vUv);
        c = mix(c, vec3(1.0, 0.07, 0.18), step(min(e.x * 1.6, e.y), 0.03));
        c *= 2.0 * exp(-vDepth * 0.016);
        // The prod the current comment is about: thick yellow frame, glowing
        if (abs(tile - uFocus) < 0.5) {
          float rim = step(min(e.x * 1.6, e.y), 0.08);
          c = mix(c * (1.3 + uPulse * 0.6), vec3(1.0, 0.86, 0.1) * (1.4 + uPulse), rim);
          c += vec3(0.25, 0.2, 0.0) * uPulse;
        } else if (uFocus >= 0.0) {
          c *= 0.55;
        }
        // Camera flashes popping around the stands
        float slot = floor(uTime * 12.0);
        float pop = fract(sin(vId * 12.9898 + slot * 78.233) * 43758.5453);
        c += vec3(1.0) * step(0.992, pop) * (1.0 - fract(uTime * 12.0)) * 1.5;
        gl_FragColor = vec4(c + uFlash * 0.35, 1.0);
      }
    `,
    side: THREE.DoubleSide
  }),
  COLOSSEUM_COUNT
);
colosseumScreens.frustumCulled = false;
const colosseumGroup = new THREE.Group();
colosseumGroup.add(colosseumScreens);
colosseumGroup.visible = false;
scene.add(colosseumGroup);
const colosseumTierAngle = new Float32Array(COLOSSEUM_TIERS.length);
const colosseumTierSpin = new Float32Array(COLOSSEUM_TIERS.length);

// Stadium tickers: LED rings around the arena. The upper one scrolls the comment behind the current words,
// the lower one the haters' names, the other way
function makeTicker(radius, y, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 8192;
  canvas.height = 320;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = -1; // Seen from inside the ring, so mirror it back
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 128, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  mesh.position.y = y;
  colosseumGroup.add(mesh);
  // Horizontal squeeze that makes the text look unstretched on this ring
  const naturalSx = (8192 / (Math.PI * 2 * radius)) / (320 / height);
  return { canvas, tex, mesh, text: null, naturalSx };
}
function setTickerText(ticker, segments) {
  // segments: [[text, colour], ...], drawn left to right and stretched to fill the ring
  const key = segments.map((s) => s[0]).join('|');
  if (ticker.text === key) return;
  ticker.text = key;
  const ctx = ticker.canvas.getContext('2d');
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, 8192, 320);
  ctx.fillStyle = '#ff1234';
  ctx.fillRect(0, 0, 8192, 14);
  ctx.fillRect(0, 306, 8192, 14);
  ctx.font = 'bold 150px Arial, Helvetica, sans-serif';
  ctx.textBaseline = 'middle';
  const total = segments.reduce((w, s) => w + ctx.measureText(s[0]).width, 0);
  // Tile whole copies around the ring so there's no seam; squeeze only when one copy doesn't fit
  const copies = Math.max(1, Math.floor(8192 / (total * ticker.naturalSx)));
  const sx = 8192 / (copies * total);
  ctx.save();
  ctx.translate(0, 166);
  ctx.scale(sx, 1);
  let x = 0;
  for (let c = 0; c < copies; c++) {
    for (const [text, colour] of segments) {
      ctx.fillStyle = colour;
      ctx.fillText(text, x, 0);
      x += ctx.measureText(text).width;
    }
  }
  ctx.restore();
  ticker.tex.needsUpdate = true;
}
const tickerComment = makeTicker(colosseumWallR(5.8) - 0.5, 5.8, 2.4);
const tickerNames = makeTicker(colosseumWallR(-4.4) - 0.5, -4.4, 1.6);
setTickerText(tickerNames, [[[...new Set(PROD_QUOTES.map((q) => `@${q.author || 'uncle-x'}`))].join('   *   ') + '   *   ', '#ffdd00']]);

// Searchlights from the thumbs-down on the floor up to the screens showing the prod being talked about
const SEARCHLIGHT_COUNT = 6;
const searchlightGeo = new THREE.CylinderGeometry(0.5, 3.2, 1, 24, 1, true);
searchlightGeo.translate(0, -0.5, 0); // Apex at the origin, extending along -y
searchlightGeo.rotateX(-Math.PI / 2); // ...now along +z, so lookAt() aims it
const searchlightMat = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xffe27a) },
    uIntensity: { value: 1.0 }
  },
  vertexShader: `
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vViewPos;
    void main() {
      vAlong = position.z;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vViewPos = mv.xyz;
      vNormal = normalize(mat3(modelViewMatrix * instanceMatrix) * vec3(normal.xy, 0.0));
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uIntensity;
    varying float vAlong;
    varying vec3 vNormal;
    varying vec3 vViewPos;
    void main() {
      // Invisible at the source, building up toward the screen it lights
      float along = smoothstep(0.0, 0.7, vAlong);
      // Soft edges: brightest through the middle of the beam, fading at its sides
      float core = pow(abs(dot(normalize(vNormal), normalize(-vViewPos))), 2.6);
      gl_FragColor = vec4(uColor * 0.5 * uIntensity * along * core, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});
const searchlights = new THREE.InstancedMesh(searchlightGeo, searchlightMat, SEARCHLIGHT_COUNT);
searchlights.frustumCulled = false;
colosseumGroup.add(searchlights);
const searchlightTarget = new THREE.Vector3();
// World positions of the highlighted screens, filled in each frame
const focusScreens = Array.from({ length: 80 }, () => new THREE.Vector3());
let focusScreenCount = 0;

const floorEmblem = new THREE.Mesh(
  new THREE.CircleGeometry(12, 64),
  new THREE.MeshBasicMaterial({ map: makeThumbTexture('assets/sucks.svg', 1024), transparent: true, alphaTest: 0.4, fog: false })
);
floorEmblem.rotation.x = -Math.PI / 2;
floorEmblem.position.y = -18.0;
colosseumGroup.add(floorEmblem);

// On a hit: flip every screen over to a new screenshot in a wave around the arena, and kick the tiers' spin
function colosseumHit(t, strength) {
  const seed = 1 + Math.floor(Math.random() * 97);
  for (let i = 0; i < COLOSSEUM_COUNT; i++) {
    const { tier, slot } = colosseumSlots[i];
    const u = slot / COLOSSEUM_TIERS[tier].count;
    colosseumFlipAt[i] = t + u * 0.22 + tier * 0.02;
    colosseumNextTile[i] = colosseumTileFor(slot + (seed % 3), tier, seed);
  }
  for (let k = 0; k < COLOSSEUM_TIERS.length; k++) colosseumTierSpin[k] = COLOSSEUM_TIERS[k].dir * strength;
}


// ============================================================================
// PART VII: INDUSTRIAL GUILLOTINE (1:45.2 - 2:11.5)
// A guillotine in front of a line of guillotines receding into the dark. Its blade drops onto every hit
// and answer slam, slicing the whole image along the blade edge, with sparks and a red flash
// ============================================================================
// Every chop: the 4 BOM hits of the even bars and the 3 answer slams of the odd bars. Each one cuts a different prod
// The prods the guillotine cuts, each stamped with a short comment it got. All different prods, so every cut
// is a new one, and none of these comments are slammed elsewhere
const GUILLOTINE_PRODS = [
  '1052625', '1050582', '1028723', '1021280', '996051', '1050335', '1050498',
  '1054304', '994776', '1043220', '1003821', '1050475', '1044989', '1050562'
].map((id) => QUOTE_BY_POST.get(id)).filter(Boolean);
const CHOP_TIMES = [];
for (let bar = 64; bar <= 77; bar++) {
  if (bar % 2 === 0) {
    for (let h = 0; h < 4; h++) CHOP_TIMES.push({ t: bar * BAR_SEC + BOM_OFFSETS[h], n: CHOP_TIMES.length });
  } else {
    for (const step of [1, 7, 13]) CHOP_TIMES.push({ t: bar * BAR_SEC + step * STEP16_SEC, n: CHOP_TIMES.length });
  }
}
// Each prod's screenshot with its comment stamped on it (drawCommentStamp), so the blade cuts through the stamp too
const stampedShots = new Map();
function getStampedShot(item, n) {
  if (stampedShots.has(n)) return stampedShots.get(n);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, 1024, 576);
  stampedShots.set(n, tex);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 1024, 576);
    const stamp = drawCommentStamp(item, n);
    ctx.save();
    // Centred on the shot, a bit smaller
    ctx.translate(512 + (stampRand(n, 1) - 0.5) * 70, 290 + (stampRand(n, 2) - 0.5) * 70);
    ctx.rotate((stampRand(n, 3) - 0.5) * 0.3);
    ctx.scale(0.72, 0.72);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(stamp.canvas, 0, 0, stamp.w, stamp.h, -stamp.w / 2, -stamp.h / 2, stamp.w, stamp.h);
    ctx.restore();
    tex.needsUpdate = true;
  };
  img.src = item.screenshot;
  return tex;
}
GUILLOTINE_PRODS.forEach((q, i) => getStampedShot(q, i));
const CHOP_FALL = 0.075;
const CHOP_HOLD = 0.06;
const CHOP_RISE = 0.14;
const BLADE_Z = -0.9; // Just behind the words, so the blade never hides them; the image slice chops them
const BLADE_EDGE_Y = -0.6;
const BLADE_TOP_Y = 9.5; // Out of frame, even tilted
// The words move back into the guillotine, scaled up so they stay as big on screen
const GUILLOTINE_WORD_PUSH = 5.0;
const GUILLOTINE_WORD_SCALE = 0.85;
const GUILLOTINE_WORD_Y = 3.7; // Above the screenshot plate

const guillotineSteelMat = new THREE.MeshStandardMaterial({ color: 0x3a3c44, roughness: 0.45, metalness: 0.55 });
const guillotineRedMat = new THREE.MeshBasicMaterial({ color: 0xff1a2a });
const bladeMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd6, roughness: 0.22, metalness: 0.35, emissive: 0x220406, emissiveIntensity: 1.0 });
const bladeEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

function makeGuillotine(width, height) {
  const g = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.9, height, 0.9);
  const stripGeo = new THREE.BoxGeometry(0.12, height, 0.12);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, guillotineSteelMat);
    post.position.set(side * width / 2, 0, 0);
    const strip = new THREE.Mesh(stripGeo, guillotineRedMat);
    strip.position.set(side * (width / 2 - 0.5), 0, 0.46);
    g.add(post, strip);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.9, 0.9, 1.0), guillotineSteelMat);
  beam.position.y = height / 2;
  g.add(beam);
  // The blade: a steel slab with a bright cutting edge along its bottom
  const blade = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(width - 1.0, 2.4, 0.22), bladeMat);
  slab.position.y = 1.2;
  const weight = new THREE.Mesh(new THREE.BoxGeometry(width - 1.0, 0.9, 0.7), guillotineSteelMat);
  weight.position.y = 2.85;
  blade.add(weight);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(width - 1.0, 0.1, 0.26), bladeEdgeMat);
  edge.position.y = 0.05;
  blade.add(slab, edge);
  g.add(blade);
  g.userData.blade = blade;
  return g;
}
const guillotineGroup = new THREE.Group();
const guillotineMain = makeGuillotine(16.4, 20);
guillotineMain.position.set(0, 2.0, BLADE_Z - 0.2);
guillotineMain.userData.blade.position.z = 0.2;
// One guillotine per drop: the line slides forward one guillotine between drops
const GUILLOTINE_SPACING = 9.0;
const GUILLOTINE_FRONT_Z = BLADE_Z - 0.2;

guillotineGroup.add(guillotineMain);
const GUILLOTINE_LINE = 7;
const guillotineLine = [];
for (let i = 0; i < GUILLOTINE_LINE; i++) {
  const g = makeGuillotine(16.4, 20);
  g.position.set(0, 2.0, BLADE_Z - 10 - i * 9);
  guillotineGroup.add(g);
  guillotineLine.push(g);
}
const guillotineFrames = [guillotineMain, ...guillotineLine];

// Sparks thrown off along the cut
const SPARK_COUNT = 240;
const sparks = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.07, 0.07, 0.5),
  new THREE.MeshBasicMaterial({ color: 0xffb040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
  SPARK_COUNT
);
sparks.frustumCulled = false;
guillotineGroup.add(sparks);
const sparkData = Array.from({ length: SPARK_COUNT }, () => ({ born: -10, p: new THREE.Vector3(), v: new THREE.Vector3() }));
let sparkCursor = 0;
let lastChopN = -1;
let guillotineFinaleDone = 0;
function spawnChopSparks(t, angle) {
  for (let i = 0; i < 48; i++) {
    const s = sparkData[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
    const x = (Math.random() - 0.5) * 15.0;
    s.born = t;
    s.p.set(x, BLADE_EDGE_Y + x * Math.tan(angle), BLADE_Z + 0.3);
    s.v.set((Math.random() - 0.5) * 9.0, 3.0 + Math.random() * 7.0, (Math.random() - 0.2) * 6.0);
  }
}
guillotineGroup.visible = false;
scene.add(guillotineGroup);
// The current prod's screenshot sits in the guillotine and gets cut: two copies of the plate, each keeping
// one side of the blade edge, so the top piece can slide off along the cut
const PLATE_W = 12.0;
const PLATE_H = 6.75;
const PLATE_Y = 0.3;
const PLATE_Z = -1.45;
const plateUniformsFor = (side) => ({
  tMap: { value: null },
  uCutAngle: { value: 0 },
  uCutY: { value: BLADE_EDGE_Y - PLATE_Y },
  uSide: { value: side },
  uGlow: { value: 0 }
});
function makePlatePiece(side) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(PLATE_W, PLATE_H),
    new THREE.ShaderMaterial({
      uniforms: plateUniformsFor(side),
      vertexShader: `
        varying vec2 vUv;
        varying vec2 vLocal;
        void main() {
          vUv = uv;
          vLocal = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tMap;
        uniform float uCutAngle;
        uniform float uCutY;
        uniform float uSide;
        uniform float uGlow;
        varying vec2 vUv;
        varying vec2 vLocal;
        void main() {
          vec2 n = vec2(-sin(uCutAngle), cos(uCutAngle));
          float s = dot(vLocal - vec2(0.0, uCutY), n) * uSide;
          if (s < 0.0) discard;
          vec3 c = texture2D(tMap, vUv).rgb * 1.5;
          // Frame and a hot edge along the fresh cut
          vec2 e = min(vUv, 1.0 - vUv);
          c = mix(c, vec3(1.0), step(min(e.x * 1.78, e.y), 0.012));
          c += vec3(1.0, 0.85, 0.6) * uGlow * (1.0 - smoothstep(0.0, 0.18, s));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      side: THREE.DoubleSide
    })
  );
}

const plateWhole = makePlatePiece(0);
plateWhole.position.set(0, PLATE_Y, PLATE_Z);
guillotineGroup.add(plateWhole);
// The two halves of each cut fly away in random directions; a few pairs so they can overlap
const PLATE_PAIRS = 4;
const platePairs = [];
for (let i = 0; i < PLATE_PAIRS; i++) {
  const lower = makePlatePiece(-1);
  const upper = makePlatePiece(1);
  guillotineGroup.add(lower, upper);
  platePairs.push([lower, upper]);
}
// Repeatable random numbers per chop, so the video render matches live playback
const chopRand = (n, k) => {
  const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const PIECE_FLIGHT = 0.9;
// Each chop's plate sits at its own tilt and slight turn
const plateTilt = (m) => (chopRand(m, 50) - 0.5) * 0.6;
const plateTurn = (m) => (chopRand(m, 51) - 0.5) * 0.5;
// The blade edge (world angle a, through (0, BLADE_EDGE_Y)) in the frame of a plate tilted by tz
function plateCut(a, tz) {
  const c = BLADE_EDGE_Y - PLATE_Y;
  const px = Math.sin(tz) * c;
  const py = Math.cos(tz) * c;
  const d = a - tz;
  return { angle: d, y: py - px * Math.tan(d) };
}

// Embers drifting up through the dark
const EMBER_COUNT = 260;
const embers = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(0.09, 0.09),
  new THREE.MeshBasicMaterial({ color: 0xff7a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
  EMBER_COUNT
);
embers.frustumCulled = false;
guillotineGroup.add(embers);
// Rotating warning lights on top of the posts, throwing beams around
const sirenGeo = new THREE.CylinderGeometry(0.15, 2.6, 1, 16, 1, true);
sirenGeo.translate(0, -0.5, 0);
sirenGeo.rotateX(-Math.PI / 2);
const sirenMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying float vAlong;
    void main() {
      vAlong = position.z;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying float vAlong;
    void main() {
      gl_FragColor = vec4(vec3(1.0, 0.12, 0.1) * 0.35 * (1.0 - vAlong), 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});
const sirens = new THREE.InstancedMesh(sirenGeo, sirenMat, 4);
sirens.frustumCulled = false;
guillotineGroup.add(sirens);
const sirenTarget = new THREE.Vector3();

const chopProject = new THREE.Vector3();
const chopProject2 = new THREE.Vector3();
const wordAim = new THREE.Vector3();

// Path of the rectangle tunnel: straight at the camera, curving away more the further ahead it goes
const tunnelBend = new THREE.Vector2();
function getTunnelBend(z, t) {
  const d = Math.max(0, 12.6 - z);
  const k = d * d * 0.0022;
  return tunnelBend.set(Math.sin(z * 0.04 + t * 0.8) * k, Math.cos(z * 0.03 + t * 0.6) * k * 0.7);
}

// 80 Smooth 3D Extruded Hearts for Part X ("SENDING KISSES TO THE MAIN HATERS")
const HEART_COUNT = 80;
const heartShape = new THREE.Shape();
heartShape.moveTo(0, 0.28);
heartShape.bezierCurveTo(0, 0.35, -0.12, 0.58, -0.38, 0.58);
heartShape.bezierCurveTo(-0.78, 0.58, -0.78, 0.08, -0.78, 0.08);
heartShape.bezierCurveTo(-0.78, -0.25, -0.45, -0.55, 0, -0.88);
heartShape.bezierCurveTo(0.45, -0.55, 0.78, -0.25, 0.78, 0.08);
heartShape.bezierCurveTo(0.78, 0.08, 0.78, 0.58, 0.38, 0.58);
heartShape.bezierCurveTo(0.12, 0.58, 0, 0.35, 0, 0.28);

const heartGeo = new THREE.ExtrudeGeometry(heartShape, {
  depth: 0.28,
  bevelEnabled: true,
  bevelSegments: 4,
  steps: 1,
  bevelSize: 0.07,
  bevelThickness: 0.07
});
heartGeo.center();

const heartMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xaa0044,
  emissiveIntensity: 0.65,
  roughness: 0.15,
  metalness: 0.45
});
const heartInstanced = new THREE.InstancedMesh(heartGeo, heartMat, HEART_COUNT);
const heartCol = new THREE.Color();
for (let i = 0; i < HEART_COUNT; i++) {
  heartCol.setHex(i % 3 === 0 ? 0xffdd00 : (i % 2 === 0 ? 0xff0066 : 0xff44aa));
  heartInstanced.setColorAt(i, heartCol);
}
heartInstanced.instanceColor.needsUpdate = true;
heartInstanced.visible = false;
scene.add(heartInstanced);

// ============================================================================
// 11. CHOREOGRAPHY TRIGGERS: 4-BOM HITS, ODD-BAR ANSWERS, SNARES, HATS
// ============================================================================
function updateIntroCubeFormation(barNum, hitIdx) {
  if (barNum < 8) {
    // Part I (0:00 - 0:13.15, including Bar 0 right at 0:00.06s!):
    // Every single one of the 4 BOM! BOM! BOM! BOM! hits snaps the mfx.gif cubes into a distinct 3D formation!
    for (let i = 0; i < HERO_CUBE_COUNT; i++) {
      const m = heroCubeMeta[i];
      const cheb = Math.max(Math.abs(m.gx), Math.abs(m.gy), Math.abs(m.gz));
      const manhattan = Math.abs(m.gx) + Math.abs(m.gy) + Math.abs(m.gz);

      if (barNum === 0) {
        // BAR 0 (0:00.06s, 0:00.37s, 0:00.68s, 0:00.98s): Progressive 4-hit subdivision from the very first beat!
        if (hitIdx === 0) {
          // BOM 1 (0.06s): 27-cube (3x3x3) core bursts out of the monolith!
          if (cheb <= 1) {
            m.targetPos.set(m.gx * 2.1, m.gy * 2.1, m.gz * 2.1);
            m.targetScale = 1.15;
          } else {
            m.targetPos.set(0, 0, 0);
            m.targetScale = 0.001;
          }
        } else if (hitIdx === 1) {
          // BOM 2 (0.37s): 3D Starburst / Octahedron expansion!
          if (manhattan <= 3) {
            m.targetPos.set(m.gx * 2.35, m.gy * 2.35, m.gz * 2.35);
            m.targetScale = 1.05;
          } else {
            m.targetPos.set(0, 0, 0);
            m.targetScale = 0.001;
          }
        } else if (hitIdx === 2) {
          // BOM 3 (0.68s): Outer 5x5x5 Hypercube Cage snaps out!
          if (cheb === 2 || i === 62) {
            m.targetPos.set(m.gx * 2.15, m.gy * 2.15, m.gz * 2.15);
            m.targetScale = i === 62 ? 2.2 : 0.95;
          } else {
            m.targetPos.set(0, 0, 0);
            m.targetScale = 0.001;
          }
        } else {
          // BOM 4 (0.98s): All 125 mfx.gif cubes slam into full 5x5x5 formation!
          m.targetPos.set(m.gx * 2.45, m.gy * 2.45, m.gz * 2.45);
          m.targetScale = 0.96;
        }
      } else {
        // Bars 2, 4, 6: Full 125-cube 4-hit geometric snaps on every BOM!
        if (hitIdx === 0) {
          m.targetPos.set(m.gx * 1.75, m.gy * 1.75, m.gz * 1.75);
          m.targetScale = 1.02;
        } else if (hitIdx === 1) {
          // 3D Diagonal X-Star
          const stretch = 1.9 + (cheb * 0.45);
          m.targetPos.set(m.gx * stretch, m.gy * stretch, m.gz * 1.5);
          m.targetScale = 0.94;
        } else if (hitIdx === 2) {
          // 3 Orthogonal Atomic Rings
          const a = (i / HERO_CUBE_COUNT) * Math.PI * 6;
          const r = 4.2 + (i % 3) * 1.4;
          if (i % 3 === 0) m.targetPos.set(Math.cos(a) * r, Math.sin(a) * r, 0);
          else if (i % 3 === 1) m.targetPos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
          else m.targetPos.set(0, Math.cos(a) * r, Math.sin(a) * r);
          m.targetScale = 0.92;
        } else {
          // Expanded 5x5x5 Cube Lattice
          m.targetPos.set(m.gx * 2.55, m.gy * 2.55, m.gz * 2.55);
          m.targetScale = 0.96;
        }
      }
    }
  } else if (barNum < 16) {
    // Part II (0:13.15 - 0:26.30): Reactor corridor geometric morphs on every BOM!
    for (let i = 0; i < HERO_CUBE_COUNT; i++) {
      const m = heroCubeMeta[i];
      m.targetScale = 0.95;
      if (hitIdx === 0) {
        const arm = (i % 5) - 2;
        const step = Math.floor(i / 5) - 12;
        m.targetPos.set(arm * 2.5, Math.sin(step * 0.5 + barNum) * 4.5, step * 0.7);
      } else if (hitIdx === 1) {
        const ring = Math.floor(i / 25);
        const slot = i % 25;
        const a = (slot / 25) * Math.PI * 2 + ring * 0.4;
        const r = 2.6 + ring * 1.65;
        m.targetPos.set(Math.cos(a) * r, Math.sin(a) * r, (ring - 2) * 2.2);
      } else if (hitIdx === 2) {
        const strand = i % 2 === 0 ? 1 : -1;
        const k = Math.floor(i / 2) - 31;
        const a = k * 0.28;
        m.targetPos.set(Math.cos(a) * 4.4 * strand, Math.sin(a) * 4.4 * strand, k * 0.45);
      } else {
        m.targetPos.set(m.gx * 2.7, m.gy * 2.7, m.gz * 2.7);
      }
    }
  } else if (barNum < 32) {
    // Part III (0:26.30 - 0:39.45): Pulsing Fibonacci Sphere
    const r = 4.8 + hitIdx * 1.1;
    for (let i = 0; i < HERO_CUBE_COUNT; i++) {
      const m = heroCubeMeta[i];
      m.targetScale = 0.88;
      m.targetPos.set(
        Math.sin(m.phi) * Math.cos(m.theta) * r,
        Math.sin(m.phi) * Math.sin(m.theta) * r,
        Math.cos(m.phi) * r
      );
    }
  } else if (barNum >= 144) {
    // Part X (3:56.71+): Giant 3D Parametric Heart Sculpture of 125 Hater-Avatar Cubes framing the Valentine Shrine!
    const pulse = 0.56 + hitIdx * 0.05;
    for (let i = 0; i < HERO_CUBE_COUNT; i++) {
      const m = heroCubeMeta[i];
      const u = (i / HERO_CUBE_COUNT) * Math.PI * 2;
      const hx = 16.0 * Math.pow(Math.sin(u), 3);
      const hy = 13.0 * Math.cos(u) - 5.0 * Math.cos(2 * u) - 2.0 * Math.cos(3 * u) - Math.cos(4 * u);
      const layerZ = -2.2 + ((i % 5) - 2) * 0.9;
      m.targetPos.set(hx * pulse, (hy + 1.5) * pulse, layerZ);
      m.targetScale = 0.85;
    }
  } else {
    // Parts V - IX (0:52.60 - 3:56.7): Dynamic 4-Hit Stage Architectures snapping around the Monument & 3D Text!
    for (let i = 0; i < HERO_CUBE_COUNT; i++) {
      const m = heroCubeMeta[i];
      const u = i / HERO_CUBE_COUNT;
      const a = u * Math.PI * 2;
      if (hitIdx === 0) {
        // Hit 0: Twin Brutalist Guillotine Towers flanking the Monument
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const y = ((row % 21) - 10) * 0.72;
        const col = Math.floor(row / 21);
        m.targetPos.set(side * (9.2 + col * 1.8), y, -1.2 + (col - 1) * 1.4);
        m.targetScale = 0.82;
      } else if (hitIdx === 1) {
        // Hit 1: Diagonal X-Blade Crosshair behind the 3D Text
        const diag = i % 2 === 0 ? 1 : -1;
        const dist = ((i / HERO_CUBE_COUNT) - 0.5) * 24.0;
        m.targetPos.set(dist, dist * 0.62 * diag, -2.0 + (i % 3 - 1) * 1.2);
        m.targetScale = 0.80;
      } else if (hitIdx === 2) {
        // Hit 2: Interlocking Gyroscopic Double Halo
        const ring = i % 2;
        const rad = ring === 0 ? 10.2 : 12.8;
        m.targetPos.set(
          Math.cos(a * 2) * rad,
          Math.sin(a * 2) * rad * (ring === 0 ? 0.75 : 0.45),
          -2.0 + Math.sin(a * 4) * 2.2
        );
        m.targetScale = 0.82;
      } else {
        // Hit 3: Explosive Rectangular Portal Frame locking onto the Monument
        const edge = i % 4;
        const tEdge = (Math.floor(i / 4) / 31) * 2 - 1; // -1..1
        const rx = edge < 2 ? tEdge * 11.0 : (edge === 2 ? -11.0 : 11.0);
        const ry = edge >= 2 ? tEdge * 7.2 : (edge === 0 ? 7.2 : -7.2);
        m.targetPos.set(rx, ry, -1.0 + (i % 3 - 1) * 0.8);
        m.targetScale = 0.88;
      }
    }
  }
}

function triggerBomHit(bomEv) {
  const hitIdx = bomEv.hitIdx; // 0 = 1st word, 1 = 2nd word, 2 = 3rd word, 3 = 4th word
  const chaos = getChaosLevel(bomEv.t);
  state.activeHitIdx = hitIdx;
  state.kickEnv = 1.35 + chaos * 0.35;

  updateIntroCubeFormation(bomEv.bar, hitIdx);

  // INTRO (0:00 - 0:52.60): Cubes-only choreography, NO 3D words or Prod Monument yet!
  if (bomEv.isIntro) {
    word3DMesh.visible = false;
    heroMonument.visible = false;
    arenaGroup.visible = false;

    const introCuts = [
      { pos: [0, 0, 13.0], look: [0, 0, 0], roll: 0 },
      { pos: [-7.5, 4.0, 11.5], look: [0, 0, 0], roll: -0.18 },
      { pos: [7.5, -4.0, 11.5], look: [0, 0, 0], roll: 0.18 },
      { pos: [0, 6.5, 10.0], look: [0, 0, 0], roll: 0.30 }
    ];
    const cut = introCuts[(bomEv.bar + hitIdx) % 4];
    state.camTargetPos.set(cut.pos[0], cut.pos[1], cut.pos[2]);
    state.camTargetLook.set(cut.look[0], cut.look[1], cut.look[2]);
    state.camTargetRoll = cut.roll;
    return;
  }

  // Any 2D AI Text Segment (Intro, Musical Breaks, or Part VIII Chill Intermission):
  // No screenshot monument box, no giant 3D words — pure 3D scene + 2D centered white typewriter text!
  const active2DSeg = getActive2DTextSegment(bomEv.bar);
  if (active2DSeg) {
    word3DMesh.visible = false;
    heroMonument.visible = false;
    arenaGroup.visible = false;
    state.kickEnv = 0.45;
    state.glitchTear = 0;
    state.invertEnv = 0;
    if (hitIdx === 0 && active2DSeg.avatarPath) {
      const chillTex = getAvatarCubeTex(active2DSeg.avatarPath);
      heroCubeMat.map = chillTex;
      heroCubeMat.needsUpdate = true;
    }
    return;
  }

  // POST-0:52.60: TRUE 3D EXTRUDED WORDS + PROMINENT 3D POUËT PROD & BBS TOPIC MONUMENTS!
  const isKissesPart = bomEv.bar >= 144;
  heroMonument.visible = true;
  arenaGroup.visible = !isKissesPart;

  // On Hit 0, advance to the next item:
  // - In Parts V..IX (Bars 32..143): cycle PROD_QUOTES (Parts V-VII) & FORUM_QUOTES (Part IX)
  // - In Part X (Bars 144..158, 3:56.71+): SENDING KISSES TO THE MAIN HATERS — one main hater per 4-hit pattern!
  if (hitIdx === 0) {
    if (isKissesPart) {
      const patternOrder = Math.max(0, KISS_BOM_BARS.indexOf(bomEv.bar));
      const baseHater = HATER_KISSES[patternOrder % HATER_KISSES.length];
      const round2Idx = patternOrder - HATER_KISSES.length;
      const kissTokens = (round2Idx >= 0 && round2Idx < HATER_KISSES_ROUND2_TOKENS.length)
        ? HATER_KISSES_ROUND2_TOKENS[round2Idx]
        : baseHater.beatTokens;

      const kissItem = {
        ...baseHater,
        beatTokens: kissTokens
      };
      state.activeBeatTokens = kissTokens;
      updateHeroProdMonument(kissItem);

      // Dress all 125 orbiting 3D cubes & vortex cubes in the current hater's Pouët avatar for their pattern!
      const haterCubeTex = getAvatarCubeTex(kissItem.avatarPath);
      heroCubeMat.map = haterCubeTex;
      heroCubeMat.needsUpdate = true;
      outerCubeMat.map = haterCubeTex;
      outerCubeMat.needsUpdate = true;
      tornadoMat.map = haterCubeTex;
      tornadoMat.needsUpdate = true;

      // Update Arena Monuments to celebrate this hater's quotes too!
      const arenaSlot = arenaMonuments[patternOrder % ARENA_COUNT];
      if (arenaSlot) {
        drawProdCommentCanvas(arenaSlot.userData.lc, arenaSlot.userData.lctx, kissItem);
        arenaSlot.userData.ltex.needsUpdate = true;
      }
    } else {
      const isForumPart = (bomEv.bar >= 96 && bomEv.bar < 144);
      const isOpeningAnthemDrop = (bomEv.bar === 32);

      let item = QUOTE_BY_POST.get(SLAM_PLAYLIST[bomEv.bar]);
      if (item) {
        // From the running order
      } else if (isForumPart) {
        const fc = state.forumCursor || 0;
        item = FORUM_QUOTES[fc % FORUM_QUOTES.length];
        state.forumCursor = fc + 1;
      } else {
        const pc = state.prodCursor || 0;
        item = PROD_QUOTES[pc % PROD_QUOTES.length];
        state.prodCursor = pc + 1;
      }
      state.commentCursor++;

      if (isOpeningAnthemDrop) {
        // Show the 4-word title phrase on the first 3D drop (Bar 32)
        state.activeBeatTokens = BEAT_TOKENS;
        item = {
          ...item,
          beatTokens: BEAT_TOKENS
        };
      } else if (getClimaxPhase(bomEv.bar) === 1) {
        const crimeTokens = DEMOSCENE_CRIME_TOKENS[Math.max(0, (bomEv.bar - 112) / 2) % DEMOSCENE_CRIME_TOKENS.length];
        state.activeBeatTokens = crimeTokens;
        item = { ...item, beatTokens: crimeTokens };
      } else if (getClimaxPhase(bomEv.bar) === 2) {
        const kaneelTokens = KANEEL_SWARM_TOKENS[Math.max(0, (bomEv.bar - 128) / 2) % KANEEL_SWARM_TOKENS.length];
        state.activeBeatTokens = kaneelTokens;
        item = { ...item, beatTokens: kaneelTokens };
      } else if (CRIME_3D_BOM_BAR_SET.has(bomEv.bar)) {
        state.activeBeatTokens = ['VIBECODING', 'IS', 'NOT', 'A CRIME!'];
        item = {
          ...item,
          beatTokens: ['VIBECODING', 'IS', 'NOT', 'A CRIME!']
        };
      } else {
        state.activeBeatTokens = (item.beatTokens && item.beatTokens.length === 4)
          ? item.beatTokens
          : ['CERTIFIED', 'POUËT', 'THUMB', 'DOWN!'];
      }
      updateHeroProdMonument(item);
      const activeAvTex = getAvatarCubeTex(item.avatarPath || 'assets/avatars/mfx.gif');
      if (heroCubeMat.map !== activeAvTex) {
        heroCubeMat.map = activeAvTex;
        heroCubeMat.needsUpdate = true;
        outerCubeMat.map = activeAvTex;
        outerCubeMat.needsUpdate = true;
      }

      // Refresh one of the 16 surrounding Arena Monuments so the 3D arena never stays static
      const arenaSlot = arenaMonuments[state.commentCursor % ARENA_COUNT];
      const pool = isForumPart ? FORUM_QUOTES : PROD_QUOTES;
      const nextArenaItem = pool[(state.commentCursor + 7) % pool.length];
      if (arenaSlot && nextArenaItem) {
        drawProdCommentCanvas(arenaSlot.userData.lc, arenaSlot.userData.lctx, nextArenaItem);
        arenaSlot.userData.ltex.needsUpdate = true;
        if (nextArenaItem.screenshot) {
          const st = loadTex(nextArenaItem.screenshot);
          if (st && arenaSlot.userData.screenMesh.material[4]) {
            arenaSlot.userData.screenMesh.material[4].map = st;
            arenaSlot.userData.screenMesh.material[4].needsUpdate = true;
          }
        }
      }
    }
  }

  const activeTokens = state.activeBeatTokens || BEAT_TOKENS;
  const isCrimeBomBar = CRIME_3D_BOM_BAR_SET.has(bomEv.bar);
  // A null token holds the current word up (it still gets slammed by the kick)
  const holdWord = activeTokens[hitIdx] === null && hitIdx > 0;
  if (!holdWord) {
    const wordToken = (isCrimeBomBar && hitIdx === 3)
      ? 'VIBECODING\nIS NOT\nA CRIME!'
      : (activeTokens[hitIdx] || BEAT_TOKENS[hitIdx]);

    // Build & slam the Smooth 3D Extruded Impact Word right up close in front of the camera!
    build3DWordVoxels(wordToken, hitIdx, isCrimeBomBar);
    const hitStyle = WORD_HIT_STYLES[hitIdx % 4];
    word3DMesh.position.set(0, 0.35, state.activeWordTemplate?.isMultiLine ? 4.4 : 5.2);
    word3DMesh.rotation.set(
      -0.05 + (Math.random() - 0.5) * 0.08 * chaos,
      (hitIdx - 1.5) * -0.07,
      hitStyle.tiltZ + (Math.random() - 0.5) * 0.05 * chaos
    );
  }
  state.word3DExplodeAt = bomEv.explodeAt;

  if (getFeaturePart(bomEv.bar) === 'colosseum') colosseumHit(bomEv.t, hitIdx === 3 ? 2.2 : 1.2);

  const isOverdrivePart = (bomEv.bar >= 96 && bomEv.bar < 144);

  if (isOverdrivePart) {
    // PART IX (2:38 - 3:57): TOTAL OVERDRIVE — Invert strobe, stamp slam & avatar swap on EVERY BOM hit!
    repositionStampHammer();
    state.stampHammerEnv = 1.45;
    if (getClimaxPhase(bomEv.bar)) {
      // Climax: flash only on the 4th hit so it lands, bank the tunnel run, burst the thumb swarm
      state.invertEnv = hitIdx === 3 ? 1.0 : 0;
      state.glitchTear = hitIdx === 3 ? 0.6 : 0.2;
      state.climaxBank = [0, 1, -1, 0][hitIdx];
      state.camKickPitch = [0.1, -0.12, 0.14, -0.08][hitIdx];
      state.camKickYaw = [-0.14, 0.16, 0.08, -0.12][hitIdx];
      state.thumbBurstEnv = hitIdx === 3 ? 1.6 : 1.0;
      state.swarmShape = SWARM_WORD_SHAPES[hitIdx];
      if (getClimaxPhase(bomEv.bar) === 2) {
        spawnShockwave(bomEv.t);
        nextLaserPattern();
      }
      if (hitIdx === 3) {
        state.thumbsUpPopEnv = 1.0;
        state.tunnelFlashEnv = 1.0;
      }
    } else {
      state.invertEnv = (hitIdx === 1 || hitIdx === 3) ? 1.28 : 0.92;
      state.glitchTear = 0.95 + (hitIdx === 3 ? 0.45 : 0.25);
    }

    const rapidHater = HATER_KISSES[(bomEv.bar * 4 + hitIdx) % HATER_KISSES.length];
    const rapidTex = getAvatarCubeTex(rapidHater.avatarPath);
    heroCubeMat.map = rapidTex;
    heroCubeMat.needsUpdate = true;
    outerCubeMat.map = rapidTex;
    outerCubeMat.needsUpdate = true;
    tornadoMat.map = rapidTex;
    tornadoMat.needsUpdate = true;
  } else if (hitIdx === 3) {
    // 4th BOM Hit: Slam the 3D Stamp Hammer onto a new position on the Hero Prod Monument (still before Bar 41)
    if (bomEv.bar >= 41) {
      repositionStampHammer();
      state.stampHammerEnv = 1.4;
    }
    state.invertEnv = 0.55 + chaos * 0.45;
    state.glitchTear = 0.55 + chaos * 0.45;
  } else {
    state.glitchTear = (hitIdx === 1 ? 0.5 : 0.25) * (0.4 + chaos * 0.8);
    // From Bar 41 in Part V the stamp is out, so it slams on every hit, not only the 4th
    if (bomEv.bar >= 41 && bomEv.bar < 48) {
      repositionStampHammer();
      state.stampHammerEnv = 1.1;
    }
  }

  // Closer, punchier camera framing (z = 11.8..12.5) with calm, steady framing in Part IX Overdrive!
  const camAngles = isOverdrivePart
    ? [
        { pos: [-0.45, 0.25, 11.9], look: [0, 0.25, 2.5], roll: -0.015 },
        { pos: [0.45, 0.25, 11.9], look: [0, 0.25, 2.5], roll: 0.015 },
        { pos: [-0.35, 0.15, 11.8], look: [0, 0.25, 2.5], roll: -0.012 },
        { pos: [0, 0.25, 11.7], look: [0, 0.22, 2.4], roll: 0.0 }
      ]
    : [
        { pos: [-1.35, 0.65, 12.5], look: [0, 0.28, 2.5], roll: -0.06 },
        { pos: [1.35, 0.75, 12.3], look: [0, 0.28, 2.5], roll: 0.07 },
        { pos: [-1.15, -0.75, 12.1], look: [0, 0.28, 2.5], roll: -0.07 },
        { pos: [0, 0.25, 11.8], look: [0, 0.20, 2.2], roll: 0.04 }
      ];
  const c = camAngles[hitIdx];
  const camJitter = isOverdrivePart ? 0.0 : chaos;
  state.camTargetPos.set(
    c.pos[0] + (Math.random() - 0.5) * 0.9 * camJitter,
    c.pos[1] + (Math.random() - 0.5) * 0.75 * camJitter,
    c.pos[2]
  );
  state.camTargetLook.set(c.look[0], c.look[1], c.look[2]);
  state.camTargetRoll = c.roll * (isOverdrivePart ? 1.0 : (1 + chaos * 0.7));
}

// Sync every 16th-note musical element in non-BOM bars (Odd-bar 3-hit answer bass, snares, hats, stops)
function onStep16Change(globalStep16, t) {
  const barNum = Math.floor(globalStep16 / 16);
  const stepInBar = globalStep16 % 16;
  const chaos = getChaosLevel(t);

  // 1) Odd-bar Rubik twist in Intro Part I (Bars 1, 3, 5, 7)
  if (barNum < 8 && barNum % 2 === 1 && (stepInBar === 0 || stepInBar === 6 || stepInBar === 12)) {
    for (let i = 0; i < HERO_CUBE_COUNT; i++) {
      const m = heroCubeMeta[i];
      if (stepInBar === 0 && m.gy > 0) {
        const tx = m.gx;
        m.gx = -m.gz;
        m.gz = tx;
      } else if (stepInBar === 6 && m.gx < 0) {
        const ty = m.gy;
        m.gy = -m.gz;
        m.gz = ty;
      }
      m.targetPos.set(m.gx * 1.9, m.gy * 1.9, m.gz * 1.9);
    }
  }

  // 2) Odd-bar 3-Hit Answer Bass Slam (steps 1, 7, 13 in Bars 41,43,45, 49,51.., 113,115..):
  if (ANSWER_BASS_BAR_SET.has(barNum) && (stepInBar === 1 || stepInBar === 7 || stepInBar === 13)) {
    // On step 1 of selected odd bars in Parts VI-VII (49, 53, 65, 69), advance to the next unique prod so all 29 prods are shown across Parts V-VII!
    repositionStampHammer();
    state.answerSlamEnv = 1.1;
    state.kickEnv = Math.max(state.kickEnv, 1.0);
    if (getFeaturePart(barNum) === 'colosseum') colosseumHit(t, 1.6);
    state.stampHammerEnv = 1.1;
    const isPart9Odd = (barNum >= 96 && barNum < 144);
    if (getClimaxPhase(barNum)) {
      state.climaxBank = stepInBar === 1 ? -1 : (stepInBar === 7 ? 1 : 0);
      state.thumbBurstEnv = Math.max(state.thumbBurstEnv, 0.8);
      if (stepInBar === 13) state.invertEnv = 0.8;
      if (getClimaxPhase(barNum) === 2) {
        spawnShockwave(t);
        nextLaserPattern();
      }
      state.swarmShape = stepInBar === 1 ? 'a' : (stepInBar === 7 ? 'i' : (barNum % 4 === 1 ? 'torus' : 'helix'));
    } else if (isPart9Odd) {
      state.invertEnv = 1.15;
      state.glitchTear = 0.95;
    }

    const xSwing = isPart9Odd ? 0.45 : 1.5;
    const rSwing = isPart9Odd ? 0.015 : (0.06 * (1 + chaos * 0.6));
    if (stepInBar === 1) {
      state.camTargetPos.set(-xSwing, 0.35, 12.2);
      state.camTargetLook.set(0, 0.25, -0.5);
      state.camTargetRoll = -rSwing;
    } else if (stepInBar === 7) {
      state.camTargetPos.set(xSwing, 0.15, 12.2);
      state.camTargetLook.set(0, 0.15, -0.5);
      state.camTargetRoll = rSwing;
    } else {
      state.camTargetPos.set(0, 0.25, 12.2);
      state.camTargetLook.set(0, 0.2, -0.5);
      state.camTargetRoll = 0;
    }
  }

  // 3) Snare / Clap Answer Stabs on steps 4, 10, 14 (skip during 0:26.30 - 0:52.60 and 2:11.51 - 2:37.81 chill sections)
  const isChillBar = (barNum >= 16 && barNum < 32) || (barNum >= 80 && barNum < 96);
  if (!isChillBar && (stepInBar === 4 || stepInBar === 10 || stepInBar === 14)) {
    state.snareEnv = Math.max(state.snareEnv, 0.75);
    // In the climax, hold the snare flashes back until the last 4 bars before the outro break
    if (barNum >= 96 && barNum < 144 && (!getClimaxPhase(barNum) || (barNum >= 138 && barNum < 142))) {
      state.invertEnv = Math.max(state.invertEnv, 0.72);
      state.glitchTear = Math.max(state.glitchTear, 0.65);
    }
  }

  // 4) 2D Live Typewriter AI Stream (Intro, Musical Breaks, & Chill Part VIII)
  const activeSeg = getActive2DTextSegment(barNum);
  if (activeSeg && stepInBar === 0) {
    heroMonument.visible = false;
    arenaGroup.visible = false;
    word3DMesh.visible = false;
  }

  // 4B) 3D "VIBECODING IS NOT A CRIME!" Crazy Blinking Sculpture on Overdrive Stop/Breakdown Bars (103, 110..111)
  if (CRIME_3D_HOLD_BAR_SET.has(barNum)) {
    heroMonument.visible = false;
    arenaGroup.visible = true;
    if (stepInBar === 0 && (barNum === 103 || barNum === 110)) {
      build3DWordVoxels('VIBECODING\nIS NOT\nA CRIME!', 1, true);
      word3DMesh.position.set(0, 0.25, 4.4);
      word3DMesh.rotation.set(0, 0, 0);
      state.word3DExplodeAt = (barNum === 103 ? 104 : 112) * BAR_SEC - 0.24;
      state.kickEnv = 1.45;
      state.invertEnv = 1.15;
      state.glitchTear = 1.05;
      state.camTargetPos.set(0, 0.22, 11.5);
      state.camTargetLook.set(0, 0.22, 2.5);
      state.camTargetRoll = 0.0;
    } else if (barNum === 111 && (stepInBar === 0 || stepInBar === 8)) {
      state.kickEnv = 1.35;
      state.invertEnv = 1.1;
      state.glitchTear = 0.95;
      state.camTargetPos.set(0, 0.22, 11.5);
      state.camTargetLook.set(0, 0.22, 2.5);
      state.camTargetRoll = 0.0;
    }
  }

  // 5) Stop Bars (62, 78, 103, 126): Pickup slam on step 15!
  if (STOP_BAR_SET.has(barNum) && stepInBar === 15) {
    state.kickEnv = 1.4;
    state.invertEnv = 0.85;
    state.glitchTear = 0.95;
  }
}

const CRIME_3D_STROBE_PALETTES = [
  { face: 0xffffff, side: 0xff0055, emissive: 0xff0055, stroke: 0x05070c },
  { face: 0xff0055, side: 0x00f0ff, emissive: 0x00f0ff, stroke: 0xffffff },
  { face: 0xffe600, side: 0xff0055, emissive: 0xcc0044, stroke: 0x05070c },
  { face: 0x05070c, side: 0xffffff, emissive: 0x00f0ff, stroke: 0x00f0ff },
  { face: 0x00f0ff, side: 0xffe600, emissive: 0xffaa00, stroke: 0xff0055 }
];

function onTransient(ev) {
  // During 0:26.30 - 0:52.60 (Bars 16..31) & 2:11.51 - 2:37.81 (Part VIII Chill), keep transients soft & atmospheric
  if ((state.currentTime >= 26.30 && state.currentTime < 52.55) || (state.currentTime >= 131.51 && state.currentTime < 157.81)) {
    if (ev.type === 'kick') state.kickEnv = Math.max(state.kickEnv, 0.22 * ev.low);
    else if (ev.type === 'snare') state.snareEnv = Math.max(state.snareEnv, 0.25 * ev.mid);
    else if (ev.type === 'hat') state.hatEnv = Math.max(state.hatEnv, 0.30 * ev.high);
    return;
  }
  if (ev.type === 'kick') {
    state.kickEnv = Math.max(state.kickEnv, 0.65 + ev.low * 0.55);
  } else if (ev.type === 'snare') {
    state.snareEnv = Math.max(state.snareEnv, 0.7 + ev.mid * 0.5);
  } else if (ev.type === 'hat') {
    state.hatEnv = Math.max(state.hatEnv, 0.65 + ev.high * 0.5);
  }
}

// ============================================================================
// 12. MAIN ANIMATION & 10-PART SCENE RENDER LOOP
// ============================================================================
let lastMs = performance.now();

function updateAnimatedAvatars(nowSec, currentBar) {
  if (avatarAnimCache.size === 0) return;
  let heroCommentDirty = false;
  let heroTopicDirty = false;
  let heroKissesDirty = false;
  const isStopBar = STOP_BAR_SET.has(currentBar);

  for (const [path, anim] of avatarAnimCache.entries()) {
    const loopT = nowSec % anim.totalDurationSec;
    let fIdx = 0;
    for (let i = 0; i < anim.frames.length; i++) {
      if (loopT < anim.frames[i].endTimeSec) {
        fIdx = i;
        break;
      }
    }
    if (fIdx === anim.currentFrameIdx) continue;
    anim.currentFrameIdx = fIdx;
    const frameCanvas = anim.frames[fIdx].canvas;

    if (avatarCubeTexCache.has(path)) {
      const entry = avatarCubeTexCache.get(path);
      drawAvatarCubeCanvas(entry.ctx, frameCanvas);
      entry.tex.needsUpdate = true;
    }

    if (!isStopBar && activeHeroItem) {
      const heroAvPath = activeHeroItem.avatarPath || 'assets/avatars/mfx.gif';
      if (activeHeroItem.sourceType === 'kisses') {
        if (heroAvPath === path) heroKissesDirty = true;
      } else {
        if (heroAvPath === path) heroCommentDirty = true;
        if (activeHeroItem.sourceType === 'topic') {
          if (
            heroAvPath === path ||
            (activeHeroItem.threadContext && activeHeroItem.threadContext.some((p) => (p.avatarPath || 'assets/avatars/mfx.gif') === path))
          ) {
            heroTopicDirty = true;
          }
        }
      }
    }

    if (arenaGroup.visible) {
      for (let i = 0; i < arenaMonuments.length; i++) {
        const g = arenaMonuments[i];
        const mItem = g.userData.item;
        if (mItem && (mItem.avatarPath || 'assets/avatars/mfx.gif') === path) {
          drawProdCommentCanvas(g.userData.lc, g.userData.lctx, mItem);
          g.userData.ltex.needsUpdate = true;
        }
      }
    }
  }

  if (heroKissesDirty && activeHeroItem) {
    drawKissesScreenCanvas(activeHeroItem);
  }
  if (heroCommentDirty && activeHeroItem) {
    drawProdCommentCanvas(heroCommentCanvas, heroCommentCtx, activeHeroItem);
    heroCommentTex.needsUpdate = true;
  }
  if (heroTopicDirty && activeHeroItem) {
    drawTopicScreenCanvas(activeHeroItem);
  }
}

function animate(nowMs) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (nowMs - lastMs) / 1000);
  lastMs = nowMs;

  if (state.isPlaying && state.hasStarted) {
    state.currentTime = Math.min(BEATMAP.duration, music.currentTime + DISPLAY_LATENCY);
  } else if (!state.hasStarted) {
    state.currentTime = (nowMs * 0.001) % 26.0;
  }

  const t = state.currentTime;
  const currentBar = Math.floor(t / BAR_SEC);
  updateAnimatedAvatars(nowMs * 0.001, currentBar);
  const currentStep16Global = Math.floor(t / STEP16_SEC);
  const part = getPartForBar(currentBar);
  state.activePartId = part.id;
  const chaos = getChaosLevel(t);

  dom.edgeProgress.style.width = `${((t / BEATMAP.duration) * 100).toFixed(2)}%`;

  // In the Intro (Bars 0-31, 0:00 - 0:52.60) or any 2D AI text break/intermission, hide the 3D monument & arena!
  const active2DSegNow = getActive2DTextSegment(currentBar);
  const isCrimeHoldBar = CRIME_3D_HOLD_BAR_SET.has(currentBar);
  const wordHold = WORD_HOLD_BARS[currentBar];
  if (!wordHold) state.wordHoldUntil = 0;
  if (currentBar < 32) {
    const introPair = Math.floor(currentBar / 2);
    const introHater = HATER_KISSES[introPair % HATER_KISSES.length];
    const introTex = introPair === 0 ? mfxCubeTex : getAvatarCubeTex(introHater.avatarPath);
    if (heroCubeMat.map !== introTex) {
      heroCubeMat.map = introTex;
      heroCubeMat.needsUpdate = true;
      outerCubeMat.map = introTex;
      outerCubeMat.needsUpdate = true;
    }
    heroMonument.visible = false;
    arenaGroup.visible = false;
  } else if (active2DSegNow) {
    heroMonument.visible = false;
    arenaGroup.visible = false;
  } else if (wordHold) {
    // Build the held word once per breakdown, even when scrubbing straight into it
    if (state.wordHoldUntil !== wordHold[1]) {
      const item = QUOTE_BY_POST.get(SLAM_PLAYLIST[wordHold[0]]);
      const toks = item ? item.beatTokens : [];
      let hit = 3;
      while (hit > 0 && !toks[hit]) hit--;
      if (toks[hit]) {
        build3DWordVoxels(toks[hit], hit, true);
        state.word3DMild = true;
        state.word3DExplodeAt = wordHold[1] * BAR_SEC - 0.24;
        state.wordHoldUntil = wordHold[1];
      }
    }
  } else if (isCrimeHoldBar) {
    heroMonument.visible = false;
    arenaGroup.visible = true;
    // Ensure 3D "VIBECODING IS NOT A CRIME!" is built even if the user scrubs directly into Bar 103 or 110..111
    if (!word3DMesh.visible || !state.activeWordTemplate?.isMultiLine) {
      build3DWordVoxels('VIBECODING\nIS NOT\nA CRIME!', 1, true);
      word3DMesh.position.set(0, 0.25, 4.4);
      word3DMesh.rotation.set(0, 0, 0);
      state.word3DExplodeAt = (currentBar === 103 ? 104 : 112) * BAR_SEC - 0.24;
    }
  }

  // Update 2D Live Typewriter Overlay on top of the screen
  update2DAiTypewriter(t, currentBar);

  // 1) Fire 4-BOM Pattern Events
  const bomIdx = findIndexBefore(BOM_EVENTS, t);
  if (bomIdx > state.lastBomIdx && bomIdx >= 0) {
    triggerBomHit(BOM_EVENTS[bomIdx]);
    state.lastBomIdx = bomIdx;
  }

  // 2) Fire 16th-note step choreography (odd-bar answer slams, Rubik twists, stops)
  if (currentStep16Global !== state.lastStep16Global && currentStep16Global >= 0) {
    state.lastStep16Global = currentStep16Global;
    onStep16Change(currentStep16Global, t);
  }

  // 3) Fire pre-analyzed audio transients (kicks, snares, hi-hats)
  const trIdx = findIndexBefore(BEATMAP.events, t);
  if (trIdx > state.lastTransientIdx && trIdx >= 0) {
    onTransient(BEATMAP.events[trIdx]);
    state.lastTransientIdx = trIdx;
  }

  // 4) Explode & clear 3D Extruded Word right after the 4th BOM hit so non-4-BOM bars (and 2D text breaks) NEVER show words!
  if (t < 52.55 || active2DSegNow || (!WORD_BOM_BAR_SET.has(currentBar) && !isCrimeHoldBar && !wordHold)) {
    word3DMesh.visible = false;
  } else if (state.word3DExplodeAt > 0 && t >= state.word3DExplodeAt) {
    state.word3DExploding = true;
  }

  // Live Web Audio FFT
  if (analyser && state.isPlaying) {
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
    let sL = 0;
    let sM = 0;
    let sH = 0;
    for (let i = 0; i < 8; i++) sL += freqData[i];
    for (let i = 8; i < 40; i++) sM += freqData[i];
    for (let i = 40; i < 96; i++) sH += freqData[i];
    state.subLevel = sL / (8 * 255);
    state.midLevel = sM / (32 * 255);
    state.highLevel = sH / (56 * 255);
  } else {
    state.subLevel = state.kickEnv * 0.65;
    state.midLevel = 0.25;
    state.highLevel = 0.15;
    for (let i = 0; i < RING_PTS; i++) {
      timeData[i] = 128 + Math.sin(i * 0.3 + t * 22) * 50 * (0.3 + state.subLevel);
      freqData[i] = Math.floor((Math.sin(i * 0.25 + t * 10) * 0.5 + 0.5) * 180);
    }
  }

  // Decay envelopes
  state.kickEnv = Math.max(0, state.kickEnv - dt * 5.2);
  state.snareEnv = Math.max(0, state.snareEnv - dt * 6.8);
  state.hatEnv = Math.max(0, state.hatEnv - dt * 9.5);
  state.answerSlamEnv = Math.max(0, state.answerSlamEnv - dt * 5.5);
  state.stampHammerEnv = Math.max(0, state.stampHammerEnv - dt * 4.5);
  state.glitchTear = Math.max(0, state.glitchTear - dt * 5.8);
  state.invertEnv = Math.max(0, state.invertEnv - dt * 6.5);
  state.thumbBurstEnv = Math.max(0, state.thumbBurstEnv - dt * 3.5);
  state.thumbsUpPopEnv = Math.max(0, state.thumbsUpPopEnv - dt * 1.2);
  state.tunnelFlashEnv = Math.max(0, state.tunnelFlashEnv - dt * 2.5);
  state.climaxBank = THREE.MathUtils.lerp(state.climaxBank, 0, dt * 1.5);
  state.camKickPitch = THREE.MathUtils.lerp(state.camKickPitch, 0, dt * 4.0);
  state.camKickYaw = THREE.MathUtils.lerp(state.camKickYaw, 0, dt * 4.0);

  // --------------------------------------------------------------------------
  // TOGGLE DEEPLY INTEGRATED 3D STAGE ARCHITECTURES PER PART (PARTS 1 - 10)
  // --------------------------------------------------------------------------
  outerCubesMesh.visible = (part.id === 2 || part.id === 5 || part.id === 6 || part.id === 9);
  portalGroup.visible = (part.id === 1 || part.id === 2 || part.id === 5 || part.id === 7 || part.id === 9);
  eqInstanced.visible = (part.id >= 2 && part.id !== 8);
  ringLine.visible = (part.id >= 3);
  copperBoingGroup.visible = (part.id === 4 || part.id === 5 || part.id === 7 || part.id === 9 || part.id === 10);
  glenzMetaballGroup.visible = (part.id === 3 || part.id === 6 || part.id === 9 || part.id === 10);
  canyonGroup.visible = (part.id === 5 || part.id === 7 || part.id === 9 || part.id === 10);
  tornadoInstanced.visible = (part.id === 9 || part.id === 10);
  heartInstanced.visible = (part.id === 10);

  // Climax: strip Part IX's stage down to one idea per half
  const climaxPhase = getClimaxPhase(currentBar);
  if (climaxPhase) {
    outerCubesMesh.visible = false;
    portalGroup.visible = false;
    eqInstanced.visible = false;
    copperBoingGroup.visible = false;
    glenzMetaballGroup.visible = false;
    tornadoInstanced.visible = false;
    arenaGroup.visible = false;
    canyonGroup.visible = false;
    ringLine.visible = (climaxPhase === 2);
    heroMonument.visible = false;
  }
  // Parts VI and VII: one effect each, no Pouët screen or props
  const featurePart = getFeaturePart(currentBar);
  if (featurePart) {
    outerCubesMesh.visible = false;
    portalGroup.visible = false;
    eqInstanced.visible = false;
    copperBoingGroup.visible = false;
    glenzMetaballGroup.visible = false;
    canyonGroup.visible = false;
    tornadoInstanced.visible = false;
    arenaGroup.visible = false;
    ringLine.visible = false;
    heroMonument.visible = false;
  }
  colosseumGroup.visible = (featurePart === 'colosseum');
  guillotineGroup.visible = (featurePart === 'guillotine');
  heroCubesMesh.visible = (climaxPhase === 0 && !featurePart);

  // The prod under the blade: chop n cuts prod n, and the next one is waiting on the plate right after
  let guillotineItem = null;
  if (featurePart === 'guillotine') {
    guillotineItem = GUILLOTINE_PRODS[(findIndexBefore(CHOP_TIMES, t) + 1) % GUILLOTINE_PRODS.length];
  }
  thumbsGroup.visible = (climaxPhase !== 0);
  // The rectangle tunnel carries on as a rising shaft around the thumb swarm, tinted with the hit colours
  rectTunnelGroup.visible = (climaxPhase !== 0);
  setRectTunnelBlack(climaxPhase === 2);
  if (climaxPhase === 0) portalRedMat.opacity = 0.92; // Shared with the intro portals

  // --------------------------------------------------------------------------
  // ANIMATE SMOOTH 3D EXTRUDED IMPACT TYPOGRAPHY (CLOSE & IMPACTFUL!)
  // --------------------------------------------------------------------------
  if (word3DMesh.visible && activeWordLetters.length > 0) {
    const explodeElapsed = state.word3DExploding ? Math.max(0, t - state.word3DExplodeAt) : 0;
    if (explodeElapsed > 0.34) {
      word3DMesh.visible = false;
    } else {
      const isMulti = Boolean(state.activeWordTemplate?.isMultiLine);
      const baseZ = isMulti ? 4.4 : 5.2;
      const slamScale = 1.0 + state.kickEnv * 0.16;

      if (state.word3DCrazyBlink) {
        // The breakdown holds keep the word still and only cycle its colours slowly; the distortion is in the image
        const mild = state.word3DMild ? 0 : 1.0;
        const strobeTick = Math.floor(t * (state.word3DMild ? 9.0 : 28.0));
        const pal = CRIME_3D_STROBE_PALETTES[strobeTick % CRIME_3D_STROBE_PALETTES.length];
        const tpl = state.activeWordTemplate;
        if (tpl) {
          tpl.faceMat.color.setHex(pal.face);
          tpl.sideMat.color.setHex(pal.side);
          tpl.sideMat.emissive.setHex(pal.emissive);
          tpl.sideMat.emissiveIntensity = (strobeTick % 2 === 0) ? 1.35 : 0.45;
          tpl.strokeMat.color.setHex(pal.stroke);
        }
        const blinkPulse = 1.0 + ((strobeTick % 4 === 3) ? -0.16 : (strobeTick % 2) * 0.12) * mild;
        word3DMesh.scale.setScalar(slamScale * blinkPulse);
        word3DMesh.position.x = ((strobeTick * 17) % 9 - 4) * 0.08 * mild;
        word3DMesh.position.y = 0.28 + ((strobeTick * 29) % 9 - 4) * 0.06 * mild;
        word3DMesh.position.z = baseZ + state.kickEnv * 0.65 + (strobeTick % 2) * 0.32 * mild;
        word3DMesh.rotation.z = Math.sin(t * 34.0) * 0.055 * mild;
        word3DMesh.rotation.y = Math.cos(t * 18.0) * 0.08 * mild;
        if (isCrimeHoldBar && strobeTick % 3 === 0) {
          state.invertEnv = Math.max(state.invertEnv, 0.88);
          state.glitchTear = Math.max(state.glitchTear, 0.78);
        }
      } else {
        word3DMesh.scale.setScalar(slamScale);
        word3DMesh.position.z = baseZ + state.kickEnv * 0.65;
        if (state.activeHitIdx === 3 && explodeElapsed === 0) {
          word3DMesh.position.x = (Math.random() - 0.5) * 0.32 * (0.5 + chaos);
          word3DMesh.position.y = 0.35 + (Math.random() - 0.5) * 0.25 * (0.5 + chaos);
        }
      }

      if (climaxPhase === 2) word3DMesh.position.z -= SWARM_DOLLY;
      if (featurePart === 'colosseum') {
        // In front of the camera along its view, wherever the camera is in the arena
        wordAim.subVectors(state.camLook, camera.position).normalize();
        word3DMesh.position.copy(camera.position).addScaledVector(wordAim, 7.2 - state.kickEnv * 0.65);
      }
      if (featurePart === 'guillotine') {
        word3DMesh.position.z -= GUILLOTINE_WORD_PUSH;
        word3DMesh.position.y = GUILLOTINE_WORD_Y;
        word3DMesh.scale.multiplyScalar(GUILLOTINE_WORD_SCALE);
      }
      if (featurePart) {
        // Turn to face the camera (yaw and pitch), keeping the hit's tilt
        const dx = camera.position.x - word3DMesh.position.x;
        const dy = camera.position.y - word3DMesh.position.y;
        const dz = camera.position.z - word3DMesh.position.z;
        word3DMesh.rotation.order = 'YXZ';
        word3DMesh.rotation.y = Math.atan2(dx, dz) + (state.activeHitIdx - 1.5) * -0.07;
        word3DMesh.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
      } else {
        word3DMesh.rotation.order = 'XYZ';
      }

      for (let i = 0; i < activeWordLetters.length; i++) {
        const ltr = activeWordLetters[i];
        const blinkAmt = state.word3DCrazyBlink && !state.word3DMild ? 1.0 : 0;
        const blinkWave = Math.sin(i * 1.3 + t * 42.0) * 0.24 * blinkAmt;
        const waveZ = Math.sin(i * 0.9 + t * 20.0) * 0.16 * state.kickEnv + blinkWave;
        ltr.holder.position.set(
          ltr.bx + ltr.vx * explodeElapsed,
          ltr.by + Math.cos(i * 1.7 + t * 36.0) * 0.09 * blinkAmt + ltr.vy * explodeElapsed,
          ltr.bz + waveZ + ltr.vz * explodeElapsed
        );
        ltr.holder.rotation.set(
          ltr.rx * explodeElapsed + Math.sin(t * 28.0 + i) * 0.08 * blinkAmt,
          Math.sin(t * 8.0 + i) * 0.07 * state.kickEnv + ltr.ry * explodeElapsed,
          ltr.rz * explodeElapsed
        );
        const s = Math.max(0.001, 1.0 - explodeElapsed * 2.5);
        ltr.holder.scale.setScalar(s);
      }
    }
  }

  // --------------------------------------------------------------------------
  // ANIMATE GIANT CENTERPIECE 3D POUËT PROD MONUMENT & 3D STAMP HAMMER
  // --------------------------------------------------------------------------
  if (heroMonument.visible) {
    // In the first half of Part V the stamp sits still; it only starts slamming with the answer slams (Bar 41)
    const stampStill = currentBar >= 32 && currentBar < 41;
    stamp3DHammer.visible = activeHeroItem?.sourceType !== 'kisses';
    // Keep scale grounded at z = -1.5 so the demo screenshot never lunges toward the camera.
    // In the thumb swarm half the screen is hidden anyway; keep it still if it ever shows.
    const monSway = climaxPhase === 2 ? 0 : 1;
    heroMonument.scale.setScalar(1.0 + state.kickEnv * 0.035 * monSway);
    heroMonument.rotation.y = Math.sin(t * 1.4) * (0.06 + chaos * 0.08) * monSway;
    heroMonument.rotation.z = Math.sin(t * 2.5) * 0.02 * state.kickEnv * monSway;

    leftPylon.rotation.set(t * 2.5, t * 3.2, state.kickEnv);
    rightPylon.rotation.set(-t * 2.5, -t * 3.2, -state.kickEnv);

    const stampEnv = stampStill ? 0 : state.stampHammerEnv * monSway;
    stamp3DHammer.position.z = 0.75 + stampEnv * 2.2;
    stamp3DHammer.scale.setScalar(1.0 + stampEnv * 0.35);
    stamp3DHammer.rotation.z = stampBaseRotZ + Math.sin(t * 20) * 0.08 * stampEnv;
  }

  // --------------------------------------------------------------------------
  // ANIMATE 16 GIANT ARENA PROD MONUMENTS PER DEMO PART (PARTS V - X)
  // Kept strictly in stage backdrop galleries (z = -10..-30) so demo images NEVER fly into the camera!
  // --------------------------------------------------------------------------
  if (arenaGroup.visible) {
    for (let i = 0; i < ARENA_COUNT; i++) {
      const m = arenaMonuments[i];
      const fft = (freqData[(i * 3) % 64] || 0) / 255;

      if (part.id === 5) {
        // PART V: Brutalist 2-Tier Curved Museum Gallery Wall behind the Hero Monument
        const tier = i % 2;
        const col = Math.floor(i / 2); // 0..7
        const u = (col - 3.5) / 3.5; // -1..+1
        const x = u * 26.0;
        const y = (tier === 0 ? -4.8 : 5.2) + Math.sin(t * 2.2 + i) * 0.6;
        const z = -14.0 - (1.0 - u * u) * 8.0;
        m.position.set(x, y, z);
        m.lookAt(0, y * 0.3, 10.0);
      } else if (part.id === 6) {
        // PART VI: Semicircular Colosseum Amphitheater Arc behind the stage
        const u = (i / (ARENA_COUNT - 1)) - 0.5; // -0.5..+0.5
        const a = u * Math.PI * 0.88 + Math.sin(t * 0.8) * 0.08;
        const r = 28.0;
        m.position.set(Math.sin(a) * r, Math.sin(t * 2.8 + i) * 2.2, -Math.cos(a) * 18.0 - 8.0);
        m.lookAt(0, 0, 8.0);
      } else if (part.id === 7) {
        // PART VII: Industrial Guillotine Cathedral Arch behind the stage
        const a = ((i / (ARENA_COUNT - 1)) - 0.5) * Math.PI * 0.92;
        const r = 27.0;
        m.position.set(Math.sin(a) * r, Math.cos(a) * 7.5 + Math.sin(t * 2.5 + i) * 1.2, -16.0 - Math.cos(a) * 8.0);
        m.lookAt(0, 0, 8.0);
      } else if (part.id === 8) {
        // PART VIII: Floating 2-Row Panoramic Backdrop behind the Gyroscope Reactor
        const row = i % 2;
        const slot = Math.floor(i / 2);
        const a = ((slot / 7) - 0.5) * Math.PI * 0.85 + Math.sin(t * 0.9 + row) * 0.1;
        const r = 26.0;
        m.position.set(Math.sin(a) * r, (row === 0 ? -4.6 : 5.4), -Math.cos(a) * 16.0 - 9.0);
        m.lookAt(0, 0, 8.0);
      } else if (part.id === 9) {
        // PART IX: Towering Stadium Screens flanking the FFT Wireframe Canyon (stationary Z, zero flying into camera!)
        const side = i % 2 === 0 ? -1 : 1;
        const idxOnSide = Math.floor(i / 2); // 0..7
        const col = idxOnSide % 2;
        const tier = Math.floor(idxOnSide / 2); // 0..3
        const x = side * (17.5 + col * 8.5);
        const y = -4.5 + tier * 4.4 + Math.sin(t * 3.5 + i) * 0.7;
        const z = -11.0 - col * 6.5 - tier * 2.0;
        m.position.set(x, y, z);
        m.lookAt(0, y * 0.4, 8.0);
      } else {
        // PART X: Valentine Kisses Shrine Amphitheater behind the Centerpiece Valentine Card
        const tier = i % 2;
        const slot = Math.floor(i / 2);
        const a = ((slot / 7) - 0.5) * Math.PI * 0.90;
        const r = 25.0 + tier * 4.0;
        m.position.set(
          Math.sin(a) * r,
          (tier === 0 ? -4.8 : 5.6) + Math.sin(t * 3.2 + i) * 1.1,
          -Math.cos(a) * 15.0 - 9.0
        );
        m.lookAt(0, 0, 8.0);
      }
      m.scale.setScalar(0.82 + fft * 0.28 + (i % 4 === state.activeHitIdx ? state.kickEnv * 0.15 : 0));
    }
  }

  // --------------------------------------------------------------------------
  // ANIMATE EFFECT A: 32 INDUSTRIAL GUILLOTINE LIGHT-RIBS & CYBER-GRID TUNNEL
  // --------------------------------------------------------------------------
  if (copperBoingGroup.visible) {
    checkerTex.offset.y = (t * (part.id === 4 ? 1.4 : 3.2)) % 1.0;
    checkerTex.offset.x = Math.sin(t * 0.8) * 0.35;
    checkerFloor.visible = (part.id >= 5);
    checkerCeiling.visible = (part.id === 7 || part.id === 9);

    // 32 3D Guillotine Light-Ribs forming a 4-walled slamming cage around the Monument & Text
    for (let i = 0; i < COPPER_COUNT; i++) {
      const bin = (freqData[(i * 2) % 64] || 0) / 255;
      const wall = i % 4; // 0 = top, 1 = bottom, 2 = left, 3 = right
      const depthIdx = Math.floor(i / 4); // 0..7
      const z = -2.5 - depthIdx * 4.2 + ((t * 16.0) % 4.2);
      const crush = (part.id === 7 ? 8.2 : 9.8) - state.kickEnv * 1.8 - bin * 1.6;

      if (wall === 0) {
        dummy.position.set(0, crush * 0.78, z);
        dummy.rotation.set(0, 0, Math.sin(t * 2.0 + depthIdx) * 0.08);
      } else if (wall === 1) {
        dummy.position.set(0, -crush * 0.78, z);
        dummy.rotation.set(0, 0, -Math.sin(t * 2.0 + depthIdx) * 0.08);
      } else if (wall === 2) {
        dummy.position.set(-crush * 1.25, 0, z);
        dummy.rotation.set(0, 0, Math.PI * 0.5 + Math.sin(t * 2.0 + depthIdx) * 0.08);
      } else {
        dummy.position.set(crush * 1.25, 0, z);
        dummy.rotation.set(0, 0, Math.PI * 0.5 - Math.sin(t * 2.0 + depthIdx) * 0.08);
      }
      dummy.scale.set(0.85, 1.0 + bin * 2.4 + state.snareEnv * 1.2, 1.0 + state.kickEnv * 0.8);
      dummy.updateMatrix();
      copperBarsInstanced.setMatrixAt(i, dummy.matrix);
    }
    copperBarsInstanced.instanceMatrix.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // ANIMATE EFFECT B: 160 OCTAHEDRAL SHARDS
  // --------------------------------------------------------------------------
  if (glenzMetaballGroup.visible) {
    // 160 High-Velocity 3D Octahedral Shards swirling in a twin-helix shockwave around the stage
    for (let i = 0; i < METABALL_COUNT; i++) {
      const u = i / METABALL_COUNT;
      const strand = i % 2 === 0 ? 1 : -1;
      const a = u * Math.PI * 10.0 + t * (2.8 * strand);
      const r = 9.0 + Math.sin(u * Math.PI * 6.0 + t * 4.0) * 3.2 + state.kickEnv * 2.4;
      const mx = Math.cos(a) * r;
      const my = Math.sin(a) * r * 0.72;
      const mz = -1.5 + Math.cos(u * Math.PI * 4.0 + t * 3.0) * 5.5;
      dummy.position.set(mx, my, mz);
      dummy.rotation.set(t * 4.0 + i, t * 3.2 - i, state.kickEnv);
      const bin = (freqData[i % 64] || 0) / 255;
      const ms = 0.55 + bin * 0.95 + state.kickEnv * 0.55;
      dummy.scale.setScalar(ms);
      dummy.updateMatrix();
      metaballInstanced.setMatrixAt(i, dummy.matrix);
    }
    metaballInstanced.instanceMatrix.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // ANIMATE EFFECT C: DUAL-VAULT 3D AUDIO-FFT TRENCH & 16 CONVERGING LASERS
  // --------------------------------------------------------------------------
  if (canyonGroup.visible) {
    const pos = canyonGeo.attributes.position;
    const cols = CANYON_W + 1;
    const rows = CANYON_D + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const px = pos.getX(idx);
        const py = pos.getY(idx);
        const valley = Math.min(1.0, Math.pow(Math.abs(px) / 9.0, 1.5));
        const bin = (freqData[(r + Math.abs(c - 20)) % 64] || 0) / 255;
        const wave = Math.sin(py * 0.25 - t * 16.0) * 2.2 + bin * (7.5 + state.kickEnv * 4.0);
        pos.setZ(idx, valley * wave);
      }
    }
    pos.needsUpdate = true;
    canyonCeilingMesh.visible = (part.id === 8 || part.id === 9);
    canyonWireMat.color.setHex(
      part.id === 10
        ? (state.activeHitIdx % 2 === 0 ? 0xff0066 : 0xffdd00)
        : (state.activeHitIdx % 2 === 0 ? 0x00f0ff : 0xff0055)
    );

    for (let i = 0; i < laserLines.length; i++) {
      const l = laserLines[i];
      const ang = (i / laserLines.length) * Math.PI * 2 + t * 0.9;
      const rad = 10.5 + (i % 3) * 2.5 - state.kickEnv * 1.8;
      l.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.75, 0);
      l.rotation.z = ang + Math.sin(t * 4.0 + i) * 0.25;
      l.rotation.y = Math.sin(t * 3.0 + i) * 0.18;
    }
  }

  // --------------------------------------------------------------------------
  // ANIMATE EFFECT D: 140 SWIRLING 3D VORTEX CUBES + 80 3D HEARTS IN PART X
  // --------------------------------------------------------------------------
  if (tornadoInstanced.visible) {
    for (let i = 0; i < TORNADO_COUNT; i++) {
      const hFrac = i / TORNADO_COUNT;
      const y = (hFrac - 0.5) * 22.0;
      const funnelR = 10.5 + Math.abs(hFrac - 0.5) * 16.0;
      const ang = hFrac * Math.PI * 12.0 + t * (1.8 + hFrac * 1.1);
      dummy.position.set(Math.cos(ang) * funnelR, y, -8.0 - Math.abs(Math.sin(ang)) * 12.0);
      dummy.rotation.set(t * 2.4 + i, t * 2.0 - i, state.kickEnv);
      const ts = 0.55 + ((freqData[i % 64] || 0) / 255) * 0.65 + state.kickEnv * 0.30;
      dummy.scale.setScalar(ts);
      dummy.updateMatrix();
      tornadoInstanced.setMatrixAt(i, dummy.matrix);
    }
    tornadoInstanced.instanceMatrix.needsUpdate = true;
  }

  if (colosseumGroup.visible) {
    // Tiers spin in alternating directions, faster after each hit; screens flip over to new shots in a wave
    for (let k = 0; k < COLOSSEUM_TIERS.length; k++) {
      colosseumTierSpin[k] *= Math.exp(-dt * 2.5);
      colosseumTierAngle[k] += dt * (COLOSSEUM_TIERS[k].dir * 0.08 + colosseumTierSpin[k]);
    }
    const breathe = 1.0 + state.kickEnv * 0.025;
    focusScreenCount = 0;
    for (let i = 0; i < COLOSSEUM_COUNT; i++) {
      const { tier, slot } = colosseumSlots[i];
      const T = COLOSSEUM_TIERS[tier];
      const a = (slot / T.count) * Math.PI * 2 + colosseumTierAngle[tier];
      const r = T.r * breathe;
      dummy.position.set(Math.sin(a) * r, T.y, Math.cos(a) * r);
      // Face the middle, leaning back like stadium seats
      dummy.lookAt(0, T.y * 0.9, 0);
      const fp = (t - colosseumFlipAt[i]) / 0.3;
      if (fp >= 0 && fp < 1) {
        // Turn edge-on, then come back round showing the front (never the mirrored back)
        const e = fp * fp * (3 - 2 * fp);
        dummy.rotateY(Math.PI * (e < 0.5 ? e : e - 1));
        if (fp >= 0.5) colosseumTile.array[i] = colosseumNextTile[i];
      } else if (fp >= 1) {
        colosseumTile.array[i] = colosseumNextTile[i];
      }
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      colosseumScreens.setMatrixAt(i, dummy.matrix);
      if (colosseumFocusTile >= 0 && colosseumTile.array[i] === colosseumFocusTile && focusScreenCount < focusScreens.length) {
        focusScreens[focusScreenCount++].copy(dummy.position);
      }
    }
    colosseumScreens.instanceMatrix.needsUpdate = true;
    colosseumTile.needsUpdate = true;
    colosseumScreens.material.uniforms.uFlash.value = state.invertEnv > 0.5 ? 0 : state.kickEnv * 0.2;
    // Highlight the current comment's prod: it's put into the next flip wave and glows yellow
    const focusShot = activeHeroItem ? COLOSSEUM_SHOTS.indexOf(activeHeroItem.screenshot) : -1;
    if (focusShot !== colosseumFocusTile) colosseumFocusTile = focusShot;
    colosseumScreens.material.uniforms.uFocus.value = focusShot;
    colosseumScreens.material.uniforms.uTime.value = t;
    colosseumScreens.material.uniforms.uPulse.value = 0.5 + 0.5 * Math.sin(t * 9.0) + state.kickEnv * 0.4;

    if (activeHeroItem && activeHeroItem.comment) {
      const text = activeHeroItem.comment.replace(/\s+/g, ' ').trim();
      setTickerText(tickerComment, [
        [`@${activeHeroItem.author || 'uncle-x'} `, '#ffdd00'],
        [activeHeroItem.prodName ? `on ${activeHeroItem.prodName}: ` : '', '#8ab8f0'],
        [text.length > 150 ? `${text.slice(0, 147)}...` : text, '#ffffff'],
        ['      ', '#ffffff']
      ]);
    }
    // Searchlights fan out from the thumbs-down on the floor to the highlighted screens, following them round
    for (let i = 0; i < SEARCHLIGHT_COUNT; i++) {
      const a = (i / SEARCHLIGHT_COUNT) * Math.PI * 2 - t * 0.3;
      dummy.position.set(Math.sin(a) * 2.5, -17.8, Math.cos(a) * 2.5);
      if (focusScreenCount > 0) {
        searchlightTarget.copy(focusScreens[Math.floor((i * focusScreenCount) / SEARCHLIGHT_COUNT)]);
      } else {
        // Nothing highlighted yet: sweep the stands
        const sweep = t * (0.7 + i * 0.13) + i * 2.0;
        searchlightTarget.set(Math.sin(a + Math.cos(sweep)) * 30.0, Math.sin(sweep) * 8.0, Math.cos(a + Math.cos(sweep)) * 30.0);
      }
      dummy.lookAt(searchlightTarget);
      const len = dummy.position.distanceTo(searchlightTarget);
      dummy.scale.set(1, 1, len);
      dummy.updateMatrix();
      searchlights.setMatrixAt(i, dummy.matrix);
    }
    searchlights.instanceMatrix.needsUpdate = true;
    searchlightMat.uniforms.uIntensity.value = 1.0 + state.kickEnv * 0.5;
    floorEmblem.rotation.z = -t * 0.3;
    floorEmblem.scale.setScalar(1.0 + state.kickEnv * 0.06);

    tickerComment.tex.offset.x = t * 0.018;
    tickerNames.tex.offset.x = -t * 0.025;
  }

  if (guillotineGroup.visible) {
    const chopAngle = (n) => (n % 2 === 0 ? -0.24 : 0.24);

    const ci = findIndexBefore(CHOP_TIMES, t);
    const last = ci >= 0 ? CHOP_TIMES[ci] : null;
    const next = CHOP_TIMES[ci + 1];
    const since = last ? t - last.t : 10;

    // Advance: right after each drop the line glides forward one guillotine, settling before the next drop.
    // Slot 1 is the guillotine that just cut (rushing past the camera), slot 2 the next one, and so on
    const interval = last && next ? next.t - last.t : 1;
    const p = last && next ? Math.min(1, since / (interval * 0.7)) : 1;
    const adv = (1 - (1 - p) * (1 - p) * (1 - p)) * GUILLOTINE_SPACING;
    for (let i = 0; i < guillotineFrames.length; i++) {
      const g = guillotineFrames[i];
      const slot = i + 1;
      g.position.z = GUILLOTINE_FRONT_Z + (1 - slot) * GUILLOTINE_SPACING + adv;
      g.visible = g.position.z < camera.position.z - 1.0;
      const blade = g.userData.blade;
      let k = 0;
      let n = 0;
      if (slot === 1 && last) {
        // Just cut: hold down, then rise
        n = last.n;
        if (since < CHOP_HOLD) k = 1;
        else if (since < CHOP_HOLD + CHOP_RISE) {
          const r = (since - CHOP_HOLD) / CHOP_RISE;
          k = 1 - r * r * (3 - 2 * r);
        }
      } else if (slot === 2 && next) {
        // Next up: falls onto the next drop
        n = next.n;
        if (next.t - t < CHOP_FALL) {
          const f = (t - (next.t - CHOP_FALL)) / CHOP_FALL;
          k = f * f;
        }
      } else {
        n = (ci + slot) % 2;
      }
      if (currentBar >= 78) {
        // Finale: two waves of chops roll away down the corridor, one per bar, each blade dropping and lifting again
        k = 0;
        for (const waveBar of [78, 79]) {
          const local = t - waveBar * BAR_SEC - (i - 1) * 0.16;
          if (local < 0) continue;
          let w = 0;
          if (local < CHOP_FALL) w = (local / CHOP_FALL) ** 2;
          else if (local < CHOP_FALL + CHOP_HOLD) w = 1;
          else if (local < CHOP_FALL + CHOP_HOLD + CHOP_RISE * 2) {
            const r = (local - CHOP_FALL - CHOP_HOLD) / (CHOP_RISE * 2);
            w = 1 - r * r * (3 - 2 * r);
          }
          k = Math.max(k, w);
        }
        n = i;
      }
      blade.position.y = THREE.MathUtils.lerp(BLADE_TOP_Y, BLADE_EDGE_Y, k) - g.position.y;
      blade.rotation.z = chopAngle(n);
    }
    // The waiting screenshot rides on the next guillotine
    const nextZ = GUILLOTINE_FRONT_Z - GUILLOTINE_SPACING + adv - GUILLOTINE_FRONT_Z;
    // Each finale wave starts with a flash and sparks at the front guillotine
    const finaleWave = currentBar >= 78 ? currentBar : 0;
    if (finaleWave && guillotineFinaleDone !== finaleWave && t - currentBar * BAR_SEC > CHOP_FALL) {
      guillotineFinaleDone = finaleWave;
      spawnChopSparks(t, 0.24);
      state.chopFlash = 1.0;
      state.kickEnv = Math.max(state.kickEnv, 1.1);
    } else if (!finaleWave) {
      guillotineFinaleDone = 0;
    }
    if (last && last.n !== lastChopN && since < 0.2) {
      lastChopN = last.n;
      spawnChopSparks(last.t, chopAngle(last.n));
      state.chopFlash = 1.0;
      state.kickEnv = Math.max(state.kickEnv, 1.2);
    }
    const cutAngle = last ? chopAngle(last.n) : 0;

    const nextN = ci + 1;
    const whole = guillotineItem ? getStampedShot(guillotineItem, nextN % GUILLOTINE_PRODS.length) : null;
    plateWhole.visible = !!whole;
    plateWhole.material.uniforms.tMap.value = whole;
    plateWhole.position.z = PLATE_Z + nextZ;
    plateWhole.rotation.set(0, plateTurn(nextN), plateTilt(nextN));

    // Both halves of each recent cut fly away in random directions, spinning, under gravity
    for (const pair of platePairs) pair[0].visible = pair[1].visible = false;
    for (let back = 0; back < PLATE_PAIRS; back++) {
      const chop = CHOP_TIMES[ci - back];
      if (!chop) break;
      const age = t - chop.t;
      if (age < 0 || age > PIECE_FLIGHT) continue;
      const item = GUILLOTINE_PRODS[chop.n % GUILLOTINE_PRODS.length];
      const pair = platePairs[chop.n % PLATE_PAIRS];
      pair.forEach((piece, side) => {
        const r = (k) => chopRand(chop.n, side * 10 + k);
        const up = side === 1 ? 1 : -1;
        // Out to the sides, not into the lens
        const vx = (r(0) < 0.5 ? -1 : 1) * (8.0 + r(6) * 10.0);
        const vy = up * (2.0 + r(1) * 6.0) + 2.0;
        const vz = (r(2) - 0.6) * 6.0;
        piece.visible = true;
        piece.material.uniforms.tMap.value = getStampedShot(item, chop.n % GUILLOTINE_PRODS.length);
        const cut = plateCut(chopAngle(chop.n), plateTilt(chop.n));
        piece.material.uniforms.uCutAngle.value = cut.angle;
        piece.material.uniforms.uCutY.value = cut.y;
        piece.material.uniforms.uGlow.value = Math.exp(-age * 5.0);
        piece.position.set(vx * age, PLATE_Y + vy * age - 11.0 * age * age, PLATE_Z + vz * age);
        piece.rotation.set((r(3) - 0.5) * 9.0 * age, plateTurn(chop.n) + (r(4) - 0.5) * 9.0 * age, plateTilt(chop.n) + (r(5) - 0.5) * 12.0 * age);
        const s = age > PIECE_FLIGHT - 0.2 ? (PIECE_FLIGHT - age) / 0.2 : 1;
        piece.scale.setScalar(Math.max(0.001, s));
      });
    }

    // Slice the whole image along the blade edge as seen from the camera: project both ends of the edge
    const ex = Math.cos(cutAngle) * 7.0;
    const ey = Math.sin(cutAngle) * 7.0;
    chopProject.set(-ex, BLADE_EDGE_Y - ey, BLADE_Z).project(camera);
    chopProject2.set(ex, BLADE_EDGE_Y + ey, BLADE_Z).project(camera);
    const aspect = postUniforms.uResolution.value.x / postUniforms.uResolution.value.y;
    postUniforms.uCutX.value = (chopProject.x + chopProject2.x) * 0.25 + 0.5;
    postUniforms.uCutY.value = (chopProject.y + chopProject2.y) * 0.25 + 0.5;
    postUniforms.uCutAngle.value = Math.atan2(chopProject2.y - chopProject.y, (chopProject2.x - chopProject.x) * aspect);
    postUniforms.uCutShift.value = since < 0.8 ? 0.022 * Math.exp(-since * 6.0) * (last.n % 2 === 0 ? 1 : -1) : 0;
    postUniforms.uCutGlow.value = since < 0.5 ? Math.exp(-since * 9.0) : 0;

    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = sparkData[i];
      const age = t - s.born;
      if (age < 0 || age > 0.7) {
        dummy.scale.setScalar(0.0001);
      } else {
        dummy.position.set(s.p.x + s.v.x * age, s.p.y + s.v.y * age - 9.0 * age * age, s.p.z + s.v.z * age);
        dummy.lookAt(dummy.position.x + s.v.x, dummy.position.y + s.v.y - 18.0 * age, dummy.position.z + s.v.z);
        dummy.scale.setScalar(1.0 - age / 0.7);
      }
      dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
  }
  if (guillotineGroup.visible) {
    for (let i = 0; i < EMBER_COUNT; i++) {
      const g = (k) => {
        const x = Math.sin(i * 91.7 + k * 47.3) * 43758.5453;
        return x - Math.floor(x);
      };
      const life = ((t * (0.12 + g(0) * 0.1) + g(1)) % 1);
      dummy.position.set((g(2) - 0.5) * 30.0 + Math.sin(t * 1.3 + i) * 0.6, -10.0 + life * 24.0, -20.0 + g(3) * 30.0);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar((1.0 - life) * (0.6 + g(4)) + state.chopFlash * 0.6);
      dummy.updateMatrix();
      embers.setMatrixAt(i, dummy.matrix);
    }
    embers.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1;
      const a = t * 4.0 + (i % 2) * Math.PI + side;
      dummy.position.set(side * 8.4, 12.4, BLADE_Z - 0.2);
      sirenTarget.set(dummy.position.x + Math.cos(a) * 14.0, dummy.position.y - 6.0, dummy.position.z + Math.sin(a) * 14.0);
      dummy.lookAt(sirenTarget);
      dummy.scale.set(1, 1, 16.0);
      dummy.updateMatrix();
      sirens.setMatrixAt(i, dummy.matrix);
    }
    sirens.instanceMatrix.needsUpdate = true;
  }
  state.chopFlash = Math.max(0, state.chopFlash - dt * 6.0);

  if (rectTunnelGroup.visible) {
    // Frames rush at the camera along the bending path, twisted into a spiral, flashing red on the 4th BOM hit
    const tunnelTint = climaxPhase === 2 ? SWARM_HIT_COLORS[state.activeHitIdx] : SWARM_WHITE;
    rectTunnelWhiteMat.color.copy(tunnelTint).lerp(RECT_FLASH_RED, state.tunnelFlashEnv);
    // Dimmer behind the swarm so the shapes stay readable
    rectTunnelWhiteMat.opacity = climaxPhase === 2 ? 0.35 : 0.92;
    portalRedMat.opacity = rectTunnelWhiteMat.opacity;
    state.shaftOffset = (state.shaftOffset + dt * (9.0 + state.kickEnv * 30.0)) % 10000;
    for (let i = 0; i < RECT_TUNNEL_COUNT; i++) {
      const f = rectFrames[i];
      const s = 1.0 + state.kickEnv * 0.12 + ((freqData[(i * 2) % 64] || 0) / 255) * 0.15;
      if (climaxPhase === 2) {
        // Thumb swarm: the frames lie flat and rise from bottom to top around the swarm, surging on kicks,
        // twisted into a spiral that spins around it
        const spacing = 1.7;
        const len = RECT_TUNNEL_COUNT * spacing;
        const y = ((i * spacing + state.shaftOffset) % len) - len * 0.5;
        f.position.set(SWARM_CENTER.x, SWARM_CENTER.y + y, SWARM_CENTER.z);
        f.rotation.set(-Math.PI * 0.5, 0, y * 0.12 + t * 0.9 + state.snareEnv * 0.3);
        f.scale.set(s * 1.1, s * 1.1, 1);
      } else {
        const len = RECT_TUNNEL_COUNT * RECT_TUNNEL_SPACING;
        const z = ((i * RECT_TUNNEL_SPACING + (t - 112 * BAR_SEC) * 30.0) % len) - (len - 14.0);
        const bend = getTunnelBend(z, t);
        f.position.set(bend.x, bend.y, z);
        f.rotation.set(0, 0, z * 0.035 + t * 0.6 + state.snareEnv * 0.2);
        f.scale.set(s, s, 1);
      }
    }
  }

  for (const ring of shockwaves) {
    const age = t - ring.userData.bornAt;
    ring.visible = climaxPhase === 2 && age >= 0 && age < 0.7;
    if (!ring.visible) continue;
    const k = age / 0.7;
    ring.position.set(SWARM_CENTER.x, SWARM_CENTER.y, SWARM_CENTER.z - 1.0);
    ring.quaternion.copy(camera.quaternion);
    ring.scale.setScalar(4.0 + (1 - Math.pow(1 - k, 3)) * 26.0);
    ring.material.opacity = 1.0 - k;
  }

  swarmLasers.visible = (climaxPhase === 2);
  if (swarmLasers.visible) {
    const pattern = state.laserPattern;
    const c = SWARM_CENTER;
    const thick = 1.0 + state.kickEnv * 0.6;
    const strobe = currentBar >= 138 && currentBar < 142;
    for (let i = 0; i < SWARM_LASER_COUNT; i++) {
      const u = i / SWARM_LASER_COUNT;
      const g = ((i * 0.6180339) % 1); // Stable per-beam random
      if (pattern === 0) {
        // Crossing fans from the bottom corners (in front of the swarm, angled back through it), plus radial rays
        const e = i % 3;
        const k = Math.floor(i / 3) / (SWARM_LASER_COUNT / 3 - 1) - 0.5;
        const origin = SWARM_LASER_EMITTERS[e];
        dummy.position.copy(origin);
        if (e < 2) {
          const base = e === 0 ? Math.PI * 0.25 : Math.PI * 0.75;
          const phi = base + k * 1.5 * (1.0 + state.kickEnv * 0.35) + Math.sin(t * 1.3 + e * Math.PI) * 0.6;
          swarmLaserTarget.set(origin.x + Math.cos(phi) * 80, origin.y + Math.sin(phi) * 80, origin.z - 12);
        } else {
          const phi = (k + 0.5) * Math.PI * 2 + t * 0.5;
          const r = 5.0 + g * 24.0 + state.kickEnv * 5.0;
          swarmLaserTarget.set(Math.cos(phi) * r, Math.sin(phi) * r * 0.7, 12);
        }
      } else if (pattern === 1) {
        // Converge: a big ring around the camera, every beam aimed at a point circling just behind the letter
        const a = u * Math.PI * 2 + t * 0.8;
        dummy.position.set(Math.cos(a) * 34, Math.sin(a) * 22, -2.0);
        // Spread over a small ring so the thick beams don't all pile up on one point
        swarmLaserTarget.set(c.x + Math.cos(t * 3.0) * 3.0 + Math.cos(a) * 4.0, c.y + Math.sin(t * 3.0) * 2.0 + Math.sin(a) * 3.0, c.z - 6.0);
      } else if (pattern === 2) {
        // Scanner: two sheets of near horizontal beams from the left and right, sweeping up and down, crossing
        const side = i % 2 === 0 ? -1 : 1;
        const y = (g - 0.5) * 32.0;
        const sweep = Math.sin(t * 2.4 + side) * 8.0;
        dummy.position.set(side * 45, y + sweep, c.z + 6.0);
        swarmLaserTarget.set(-side * 45, y - sweep * 0.6, c.z - 10.0);
      } else if (pattern === 3) {
        // Cage: a twisting helix of vertical beams rotating around the swarm
        const a = u * Math.PI * 2 + t * 1.6;
        const r = 9.0 + (i % 3) * 1.5;
        dummy.position.set(c.x + Math.cos(a) * r, -22, c.z + Math.sin(a) * r);
        swarmLaserTarget.set(c.x + Math.cos(a + 1.4) * r, 22, c.z + Math.sin(a + 1.4) * r);
      } else {
        // Starburst: rays exploding out of the letter, rotating, stopping well short of the camera
        const a = u * Math.PI * 2 - t * 0.9;
        const r = 10.0 + g * 22.0 + state.kickEnv * 4.0;
        dummy.position.set(c.x + Math.cos(a) * 5.0, c.y + Math.sin(a) * 3.5, c.z - 3.0); // A ring, not a point, so they don't pile up
        swarmLaserTarget.set(Math.cos(a) * r, c.y + Math.sin(a) * r * 0.7, -1.0);
      }
      dummy.lookAt(swarmLaserTarget);
      // The scanner's sheets span the whole screen, so it only uses half the beams or they'd wash it out
      const on = (!strobe || ((currentStep16Global + i) % 2 === 0)) && !(pattern === 2 && i % 4 >= 2);
      // Converge and starburst stop at their target; the others run on past it, off screen
      const len = dummy.position.distanceTo(swarmLaserTarget) + (pattern === 1 || pattern === 4 ? 0 : 40);
      dummy.scale.set(on ? thick : 0, on ? thick : 0, on ? len : 0);
      dummy.updateMatrix();
      swarmLasers.setMatrixAt(i, dummy.matrix);
    }
    swarmLasers.instanceMatrix.needsUpdate = true;
  }

  if (thumbsGroup.visible) {
    // In the rectangle tunnel the thumbs swirl inside the frames, following its bend, clear of the words.
    // In the second half they swarm into a new shape on every BOM hit.
    // The thumbs-up get popped on every 4th BOM hit and slowly grow back.
    // Swarm shape: LOL through the two kaneel quote breaks that open and close the section, and in between it
    // spells FUCK AI one letter per BOM hit and answer slam (with a torus or helix to close each pattern)
    const swarmShapeNow = (currentBar < 128 || currentBar >= 142) ? 'lol' : state.swarmShape;
    const swarmTarget = swarmFormations[swarmShapeNow] || swarmFormations.cloud;
    const swarmSpin = SWARM_FLAT_SHAPES.has(swarmShapeNow) ? Math.sin(t * 1.5) * 0.25 : t * 0.7;
    const spinCos = Math.cos(swarmSpin);
    const spinSin = Math.sin(swarmSpin);
    const swarmTilt = SWARM_FLAT_SHAPES.has(swarmShapeNow) ? 0 : 0.55;
    const tiltCos = Math.cos(swarmTilt);
    const tiltSin = Math.sin(swarmTilt);
    const swarmGrow = 1.0 + state.thumbBurstEnv * 0.18;
    const swarmFollow = 1.0 - Math.exp(-dt * 9.0);
    const swarmTint = climaxPhase !== 2
      ? SWARM_WHITE
      : (swarmShapeNow === 'lol' ? SWARM_WHITE : SWARM_HIT_COLORS[state.activeHitIdx]);
    thumbsDownInstanced.material.color.lerp(swarmTint, swarmFollow);
    const flow = climaxPhase === 1 ? (t - 112 * BAR_SEC) * 42.0 : (t - 126 * BAR_SEC) * 24.0;
    for (let i = 0; i < THUMB_DOWN_COUNT + THUMB_UP_COUNT; i++) {
      const isUp = i >= THUMB_DOWN_COUNT;
      const z = ((i * 0.83 + flow) % 100) - 86;
      if (climaxPhase === 1) {
        const a = i * 2.39996 + t * 0.8 * (i % 2 === 0 ? 1 : -1);
        const rad = 3.8 + (i % 7) * 0.75 + state.thumbBurstEnv * 1.5;
        const bend = getTunnelBend(z, t);
        dummy.position.set(Math.cos(a) * rad * 1.25 + bend.x, Math.sin(a) * rad * 0.8 + bend.y, z);
        dummy.quaternion.copy(camera.quaternion);
        dummy.rotateZ(t * (3.0 + (i % 5)) * (i % 2 === 0 ? 1 : -1) + i);
      } else {
        // Thumb swarm: spring to this thumb's slot in the current shape
        const k3 = i * 3;
        const tx = swarmTarget[k3];
        const ty = swarmTarget[k3 + 1];
        const tz = swarmTarget[k3 + 2];
        // Spin around Y, then tilt toward the camera so rings and discs aren't seen edge-on
        const sx = tx * spinCos + tz * spinSin;
        const sz = tz * spinCos - tx * spinSin;
        const wy = ty * tiltCos - sz * tiltSin;
        const wz = ty * tiltSin + sz * tiltCos;
        swarmPos[k3] += (SWARM_CENTER.x + sx * swarmGrow - swarmPos[k3]) * swarmFollow;
        swarmPos[k3 + 1] += (SWARM_CENTER.y + wy * swarmGrow - swarmPos[k3 + 1]) * swarmFollow;
        swarmPos[k3 + 2] += (SWARM_CENTER.z + wz * swarmGrow - swarmPos[k3 + 2]) * swarmFollow;
        dummy.position.set(swarmPos[k3], swarmPos[k3 + 1], swarmPos[k3 + 2]);
        dummy.quaternion.copy(camera.quaternion);
        dummy.rotateZ(Math.sin(t * 3.0 + i) * 0.5);
      }
      // The tunnel run only uses a quarter of them, or they clump into noise at the vanishing point
      const hidden = climaxPhase === 1 && i % 4 !== 0;
      const swarmSize = climaxPhase === 2 ? 0.6 : 1.0; // Smaller in the swarm so the shapes read
      const s = hidden ? 0 : swarmSize * (isUp ? 1.15 * (1.0 - state.thumbsUpPopEnv) : 1.0 + state.thumbBurstEnv * 0.35);
      dummy.scale.setScalar(Math.max(0.001, s));
      dummy.updateMatrix();
      if (isUp) thumbsUpInstanced.setMatrixAt(i - THUMB_DOWN_COUNT, dummy.matrix);
      else thumbsDownInstanced.setMatrixAt(i, dummy.matrix);
    }
    thumbsDownInstanced.instanceMatrix.needsUpdate = true;
    thumbsUpInstanced.instanceMatrix.needsUpdate = true;
  }

  if (heartInstanced.visible) {
    for (let i = 0; i < HEART_COUNT; i++) {
      const hFrac = ((i / HEART_COUNT) + t * 0.18) % 1.0;
      const y = -9.5 + hFrac * 19.0;
      const ringA = (i * 0.78) + t * (i % 2 === 0 ? 1.5 : -1.5);
      const rad = 8.5 + (i % 5) * 2.2 + Math.sin(t * 4.0 + i) * 1.2;
      const z = -2.5 - Math.abs(Math.sin(ringA * 0.5)) * 10.0;
      dummy.position.set(Math.cos(ringA) * rad, y, z);
      dummy.rotation.set(
        Math.sin(t * 3.0 + i) * 0.25,
        t * 2.2 + i,
        Math.cos(t * 2.5 + i) * 0.22
      );
      const hs = (0.75 + (i % 3) * 0.25) * (1.0 + state.kickEnv * 0.45);
      dummy.scale.setScalar(hs);
      dummy.updateMatrix();
      heartInstanced.setMatrixAt(i, dummy.matrix);
    }
    heartInstanced.instanceMatrix.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // ANIMATE 125 HERO MFX.GIF CUBES (PARTS I - IV INTRO + PARTS V - X STAGE)
  // --------------------------------------------------------------------------
  const isBeatlessIntro = (part.id === 3 || part.id === 4);
  const isChillPart8 = (part.id === 8);
  const isSmoothGlide = (isBeatlessIntro || isChillPart8);
  const isRiser = part.id === 4;
  const riserProg = isRiser ? Math.max(0, Math.min(1, (t - 39.45) / (52.60 - 39.45))) : 0;

  // In Parts V-X, keep heroCubesMesh group aligned to the stage so the 4-hit formations (and Part X 3D Heart!) frame the Monument & Text cleanly!
  if (part.id <= 4 || isChillPart8) {
    const rotSpeedY = isSmoothGlide ? (0.24 + riserProg * 0.45) : (0.42 + chaos * 0.55);
    heroCubesMesh.rotation.y += dt * rotSpeedY;
    heroCubesMesh.rotation.x = Math.sin(t * 0.45) * 0.22;
  } else {
    heroCubesMesh.rotation.y = THREE.MathUtils.lerp(heroCubesMesh.rotation.y, Math.sin(t * 0.8) * 0.12, dt * 6.0);
    heroCubesMesh.rotation.x = THREE.MathUtils.lerp(heroCubesMesh.rotation.x, 0, dt * 6.0);
  }

  for (let i = 0; i < HERO_CUBE_COUNT; i++) {
    const m = heroCubeMeta[i];
    if (part.id === 3) {
      const r = 4.6 + Math.sin(t * 1.4 + m.phi * 3.0) * 0.7 + state.midLevel * 1.4;
      m.targetPos.set(
        Math.sin(m.phi) * Math.cos(m.theta) * r,
        Math.sin(m.phi) * Math.sin(m.theta) * r,
        Math.cos(m.phi) * r
      );
      m.targetScale = 0.86;
    } else if (isRiser) {
      // Calm, slow, hypnotic convergence during 0:39.45 - 0:52.60 before the 0:52.60 drop
      const spA = m.theta + (t - 39.45) * 0.65;
      const rad = (1.0 - riserProg * 0.55) * (5.8 + (i % 5) * 0.8);
      const zSp = (1.0 - riserProg * 0.65) * ((i / HERO_CUBE_COUNT - 0.5) * 14.0);
      m.targetPos.set(Math.cos(spA) * rad, Math.sin(spA) * rad, zSp);
      m.targetScale = 0.85 - riserProg * 0.15;
    } else if (isChillPart8) {
      // Part VIII (2:11.5 - 2:37.8): Calm zero-gravity constellation drifting around the floating 3D chat pills
      const ringA = (i / HERO_CUBE_COUNT) * Math.PI * 6.0 + t * 0.25;
      const r = 8.2 + (i % 5) * 1.35 + Math.sin(t * 1.1 + i) * 0.65;
      const yWave = Math.sin(ringA * 1.5 + t * 0.9) * 4.8;
      const zWave = -3.0 + Math.cos(ringA + t * 0.7) * 5.2;
      m.targetPos.set(Math.cos(ringA) * r, yWave, zWave);
      m.targetScale = 0.76;
    }

    m.curPos.lerp(m.targetPos, dt * (isSmoothGlide ? 3.8 : 11.5));
    m.curScale = THREE.MathUtils.lerp(m.curScale, m.targetScale, dt * 10.0);

    const bin = (freqData[i % 64] || 0) / 255;
    const cubeSpin = isSmoothGlide ? 0.65 : 1.8;
    dummy.position.copy(m.curPos);
    dummy.rotation.set(
      t * cubeSpin * m.rotAxis.x + state.kickEnv * 0.7 + state.snareEnv * 0.9,
      t * cubeSpin * m.rotAxis.y + state.kickEnv * 0.7,
      t * cubeSpin * m.rotAxis.z
    );
    dummy.scale.setScalar(Math.max(0.001, m.curScale * (1.0 + state.kickEnv * 0.35 + bin * 0.25)));
    dummy.updateMatrix();
    heroCubesMesh.setMatrixAt(i, dummy.matrix);
  }
  heroCubesMesh.instanceMatrix.needsUpdate = true;

  // --------------------------------------------------------------------------
  // ANIMATE 64 3D EQUALIZER TOWERS (SYNCED TO FFT & HI-HATS)
  // --------------------------------------------------------------------------
  if (eqInstanced.visible) {
    for (let i = 0; i < EQ_COUNT; i++) {
      const bin = (freqData[i] || 0) / 255;
      const height = 0.5 + bin * 12.0 + state.hatEnv * 3.5;
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const x = side * (12.5 + Math.sin(row * 0.3 + t * 1.5) * 1.8);
      const z = -row * 2.2 + 8.0;
      dummy.position.set(x, -6.5 + height * 0.5, z);
      dummy.rotation.set(0, 0, side * state.snareEnv * 0.25);
      dummy.scale.set(1.0 + state.hatEnv * 0.5, height, 1.0);
      dummy.updateMatrix();
      eqInstanced.setMatrixAt(i, dummy.matrix);
    }
    eqInstanced.instanceMatrix.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // ANIMATE 220 OUTER TUNNEL MFX.GIF CUBES & NEON PORTALS
  // --------------------------------------------------------------------------
  const tunnelSpeed = isRiser
    ? (9.0 + riserProg * 6.0)
    : ((part.id === 1 ? 10.0 : 18.0) + chaos * 24.0);
  state.tunnelOffset = ((state.tunnelOffset || 0) + dt * tunnelSpeed) % 9600;

  if (outerCubesMesh.visible) {
    for (let i = 0; i < OUTER_CUBE_COUNT; i++) {
      const a = (i / OUTER_CUBE_COUNT) * Math.PI * 10 + t * (isRiser ? 0.25 : (0.4 + chaos * 0.9));
      const rad = 13.5 + (i % 6) * 2.5 - state.kickEnv * 1.6;
      const z = ((i * 0.45 + state.tunnelOffset) % 96) - 76;
      dummy.position.set(Math.cos(a) * rad, Math.sin(a) * rad, z);
      dummy.rotation.set(t * 1.4 + i, t * 1.8 - i, state.kickEnv);
      const s = 0.6 + state.kickEnv * 0.65 + ((freqData[i % 64] || 0) / 255) * 0.7;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      outerCubesMesh.setMatrixAt(i, dummy.matrix);
    }
    outerCubesMesh.instanceMatrix.needsUpdate = true;
  }

  if (portalGroup.visible) {
    for (let i = 0; i < portals.length; i++) {
      const p = portals[i];
      p.position.z = ((i * 7.0 + state.tunnelOffset * 0.75) % 84) - 68;
      p.rotation.z = t * (i % 2 === 0 ? 0.25 : -0.25) + state.snareEnv * 0.25;
      const ps = 1.0 + state.subLevel * 0.4;
      p.scale.set(ps, ps, 1);
    }
  }

  // 3D Oscilloscope Waveform Ribbon (4x+ thick ribbon mesh synced to vocals & mid frequencies)
  const isPart9Crazy = (part.id === 9);
  const isRedScene = (part.id === 4 || part.id === 7 || part.id === 10 || climaxPhase === 2 || (isPart9Crazy && state.invertEnv > 0.45));
  if (ringLine.visible) {
    ringLine.material.color.setHex(isRedScene ? 0x00f0ff : 0xff1234);
    const posAttr = ringGeo.attributes.position;
    const hw = RING_RIBBON_HALF_W * (1.0 + state.kickEnv * 0.45);
    for (let i = 0; i <= RING_PTS; i++) {
      const idx = i % RING_PTS;
      const a = (idx / RING_PTS) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const wave = ((timeData[idx] || 128) - 128) / 128;
      const r = (t < 52.55 ? 5.2 : 8.8) + wave * (2.2 + state.midLevel * 4.0 + state.kickEnv * 2.2);
      const rz = Math.sin(a * 6 + t * 6) * 1.0;
      posAttr.setXYZ(i * 2, ca * (r - hw), sa * (r - hw), rz);
      posAttr.setXYZ(i * 2 + 1, ca * (r + hw), sa * (r + hw), rz);
    }
    posAttr.needsUpdate = true;
  }

  // Dynamic Strobe & Part Lighting Palette
  strobeLight.intensity = state.snareEnv * 12 + state.hatEnv * 6 + state.invertEnv * (isPart9Crazy ? 32 : 20);
  if (climaxPhase === 1) {
    scene.background.setHex(0x000000);
  } else if (climaxPhase === 2) {
    // Set in linear values: the post pass outputs them without sRGB encoding. A deep red to match the kisses finale
    scene.background.setRGB(0.42, 0.01, 0.04, THREE.LinearSRGBColorSpace);
  } else if (part.id === 10) {
    scene.background.setHex(0x180412);
  } else if (part.id === 4 || part.id === 7) {
    scene.background.setHex(0x12040a);
  } else if (part.id === 8) {
    scene.background.setHex(0x030b14);
  } else if (isPart9Crazy) {
    scene.background.setHex(state.invertEnv > 0.45 ? 0x240018 : 0x050214);
  } else {
    scene.background.setHex(0x04060c);
  }
  // Distant shaft frames fade into the red rather than into black
  if (climaxPhase === 2) scene.fog.color.copy(scene.background);
  else scene.fog.color.setHex(0x04060c);
  if (featurePart === 'colosseum') {
    scene.background.setHex(0x05040a);
  } else if (featurePart === 'guillotine') {
    // Black, flashing red on every chop
    scene.background.setRGB(0.7 * state.chopFlash, 0.02 * state.chopFlash, 0.04 * state.chopFlash);
  }

  // Camera update: slow, smooth, continuous glide during the beatless 0:26.30 - 0:52.60 section (Parts III & IV) and Chill Part VIII (2:11.5 - 2:37.8)
  if (part.id === 3) {
    const p3Time = t - 26.30;
    state.camTargetPos.set(
      Math.sin(p3Time * 0.45) * 3.2,
      Math.cos(p3Time * 0.35) * 2.0,
      13.2 + Math.sin(p3Time * 0.3) * 1.0
    );
    state.camTargetLook.set(0, 0, 0);
    state.camTargetRoll = Math.sin(p3Time * 0.5) * 0.08;
  } else if (isRiser) {
    state.camTargetPos.set(
      Math.sin((t - 39.45) * 0.55) * (2.6 - riserProg * 1.5),
      Math.cos((t - 39.45) * 0.45) * (1.8 - riserProg * 1.1),
      13.5 - riserProg * 2.8
    );
    state.camTargetLook.set(0, 0, 0);
    state.camTargetRoll = Math.sin((t - 39.45) * 0.8) * 0.09;
  } else if (isChillPart8) {
    const p8Time = t - 131.51;
    state.camTargetPos.set(
      Math.sin(p8Time * 0.38) * 2.8,
      Math.cos(p8Time * 0.30) * 1.6,
      12.8 + Math.sin(p8Time * 0.25) * 0.9
    );
    state.camTargetLook.set(0, 0.1, 0);
    state.camTargetRoll = Math.sin(p8Time * 0.42) * 0.06;
  } else if (climaxPhase === 1) {
    // Fast down the tunnel, swooping and banking hard with the hits
    // (barrel rolls, pitch and yaw are added after the lerp below)
    const sway = Math.sin(t * 1.3);
    const swoop = Math.sin(t * 0.9);
    // Aim just behind the words so they stay central while the tunnel swings around them
    state.camTargetPos.set(sway * 2.6, -0.6 + swoop * 2.4, 12.6);
    state.camTargetLook.set(0, -0.2, -6.0);
    state.camTargetRoll = -sway * 0.25 + state.climaxBank * 0.4;
  } else if (climaxPhase === 2) {
    // Thumb swarm: swaying, bobbing and banking hard around the swarm (rolls, pitch and yaw added below)
    const sway = Math.sin(t * 0.9);
    state.camTargetPos.set(sway * 1.6, 0.3 + Math.sin(t * 1.3) * 0.9, 12.4 - SWARM_DOLLY);
    state.camTargetLook.copy(SWARM_CENTER);
    state.camTargetRoll = -sway * 0.25 + state.climaxBank * 0.4;
  }

  if (featurePart === 'colosseum') {
    // A new camera every 4-hit pattern: orbit, low looking up the tiers, high into the bowl, fast banking sweep
    const orbit = (t - 48 * BAR_SEC) * 0.3;
    const mode = Math.floor((currentBar - 48) / 2) % 4;
    // All of them ride close to the screens (the tiers sit at radius 26-46)
    if (mode === 0) {
      // Skimming along the lower tiers, looking along the curve
      const a = orbit * 1.6;
      const r = 23.0;
      state.camTargetPos.set(Math.sin(a) * r, -9.0 + Math.sin(t * 0.8) * 2.0, Math.cos(a) * r);
      state.camTargetLook.set(Math.sin(a + 0.9) * 30.0, -7.0, Math.cos(a + 0.9) * 30.0);
      state.camTargetRoll = -0.12;
    } else if (mode === 1) {
      // Facing the wall up close, rising up the tiers
      const a = -orbit;
      const r = 21.0;
      const y = -12.0 + ((t - 48 * BAR_SEC) % (BAR_SEC * 2)) / (BAR_SEC * 2) * 20.0;
      state.camTargetPos.set(Math.sin(a) * r, y, Math.cos(a) * r);
      state.camTargetLook.set(Math.sin(a) * 40.0, y + 3.0, Math.cos(a) * 40.0);
      state.camTargetRoll = Math.sin(t * 0.6) * 0.06;
    } else if (mode === 2) {
      // Hugging the upper tiers, looking down across the bowl
      const a = orbit * 1.2;
      const r = 30.0;
      state.camTargetPos.set(Math.sin(a) * r, 15.0, Math.cos(a) * r);
      state.camTargetLook.set(-Math.sin(a) * 6.0, -4.0, -Math.cos(a) * 6.0);
      state.camTargetRoll = 0;
    } else {
      // Fast banking run past the screens
      const a = orbit * 3.0;
      const r = 24.0;
      state.camTargetPos.set(Math.sin(a) * r, 1.0 + Math.sin(t * 2.0) * 4.0, Math.cos(a) * r);
      state.camTargetLook.set(Math.sin(a + 1.2) * 34.0, 0.0, Math.cos(a + 1.2) * 34.0);
      state.camTargetRoll = Math.sin(t * 1.2) * 0.3;
    }
  } else if (featurePart === 'guillotine') {
    // A new angle every 4-hit pattern: front, low from the left, down the line of guillotines, high from the right
    const mode = Math.floor((currentBar - 64) / 2) % 4;
    if (currentBar >= 78) {
      // Finale breakdown: a slow pull back from the front guillotine, rising to look down the line
      const k = Math.min(1, (t - 78 * BAR_SEC) / (2 * BAR_SEC));
      const e = k * k * (3 - 2 * k);
      state.camTargetPos.set(0, 0.8 + e * 3.2, 10.0 + e * 9.0);
      state.camTargetLook.set(0, 1.0 - e * 0.6, -1.5 - e * 4.0);
    } else if (mode === 0) {
      state.camTargetPos.set(0, 0.8, 10.0);
      state.camTargetLook.set(0, 1.0, -1.5);
    } else if (mode === 1) {
      state.camTargetPos.set(-5.0, -2.0, 8.2);
      state.camTargetLook.set(0, 1.4, -1.5);
    } else if (mode === 2) {
      state.camTargetPos.set(7.6, 1.8, 5.4);
      state.camTargetLook.set(-1.0, 1.2, -6.0);
    } else {
      state.camTargetPos.set(3.0, 5.6, 8.6);
      state.camTargetLook.set(0, 0.0, -1.5);
    }
    state.camTargetRoll = 0;
  }

  const isCrimeBarAny = isCrimeHoldBar || CRIME_3D_BOM_BAR_SET.has(currentBar);
  camera.position.lerp(state.camTargetPos, dt * (isSmoothGlide ? 3.2 : (isPart9Crazy ? 4.2 : 8.0)));
  state.camLook.lerp(state.camTargetLook, dt * (isSmoothGlide ? 3.8 : (isPart9Crazy ? 4.8 : 9.0)));
  const shakeMult = (isCrimeHoldBar || climaxPhase === 2) ? 0.0 : (isPart9Crazy ? 0.22 : 1.0);
  const shake = isSmoothGlide ? 0 : (((state.kickEnv * (0.14 + chaos * 0.35)) + (state.snareEnv * 0.16)) * shakeMult);
  camera.position.x += (Math.random() - 0.5) * shake;
  camera.position.y += (Math.random() - 0.5) * shake;
  if (featurePart === 'guillotine') camera.position.y -= state.chopFlash * state.chopFlash * 0.35; // The impact
  camera.fov = 60 + state.kickEnv * (isPart9Crazy ? 1.4 : (2.5 + chaos * 3.5));
  camera.updateProjectionMatrix();
  camera.lookAt(state.camLook);
  state.camRoll = THREE.MathUtils.lerp(state.camRoll, state.camTargetRoll, dt * (isSmoothGlide ? 3.2 : 5.0));
  camera.rotation.z += state.camRoll + (isPart9Crazy ? Math.sin(t * 1.4) * 0.012 : (!isSmoothGlide && chaos > 0.8 ? Math.sin(t * 2.2) * (chaos - 0.75) * 0.18 : 0));
  if (climaxPhase) {
    // Climax: a full barrel roll (a tilt in the swarm half) through every other wordless answer bar,
    // and a pitch dive, a yaw swing or both through the ones between. Word hits punch pitch and yaw.
    let pitch = state.camKickPitch;
    let yaw = state.camKickYaw;
    if (currentBar % 2 === 1 && !active2DSegNow) {
      const p = t / BAR_SEC - currentBar;
      const n = (currentBar - (climaxPhase === 1 ? 113 : 129)) / 2;
      const swing = Math.sin(p * Math.PI);
      if (n % 2 === 0) {
        if (climaxPhase === 1) {
          const whip = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          camera.rotation.z += whip * Math.PI * 2 * (n % 4 === 0 ? 1 : -1);
        } else {
          // The swarm spells A and I in these bars, so tilt instead of rolling them upside down
          camera.rotation.z += swing * 0.3 * (n % 4 === 0 ? 1 : -1);
        }
      } else if (n === 1) {
        pitch -= swing * 0.35;
      } else if (n === 3) {
        yaw += swing * 0.45;
      } else {
        pitch += swing * 0.3;
        yaw -= swing * 0.35;
      }
    }
    camera.rotateX(pitch);
    camera.rotateY(yaw);
  }

  // Post-Processing Shader Uniforms (intense uOverdrive in Part IX & "VIBECODING IS NOT A CRIME" while camera stays steady!)
  postUniforms.uTime.value = t;
  postUniforms.uChromatic.value = 0.002 + state.kickEnv * (0.006 + chaos * (isPart9Crazy ? 0.036 : 0.018)) + state.snareEnv * (isPart9Crazy ? 0.018 : 0.008);
  postUniforms.uGlitch.value = (isSmoothGlide ? 0.02 : (state.glitchTear + state.snareEnv * 0.35) * (isPart9Crazy ? 1.25 : (0.45 + chaos * 0.7)));
  postUniforms.uZoomPunch.value = state.kickEnv * (isPart9Crazy ? 0.06 : (isSmoothGlide ? 0.02 : 0.08));
  postUniforms.uInvert.value = isSmoothGlide ? 0 : state.invertEnv;
  postUniforms.uOverdrive.value = isPart9Crazy
    ? (isCrimeBarAny ? Math.min(1.35, 0.85 + state.kickEnv * 0.45) : Math.min(1.15, 0.55 + state.kickEnv * 0.4 + state.snareEnv * 0.25))
    : 0.0;
  postUniforms.uMono.value = climaxPhase === 1 ? 1.0 : 0.0;
  postUniforms.uRadial.value = climaxPhase === 1 ? 0.045 + state.kickEnv * 0.015 : 0.0;

  if (climaxPhase) {
    // Clean image so the rare flashes hit hard; the overdrive only returns for the last 4 bars
    const finale = currentBar >= 138 && currentBar < 142;
    camera.fov = (climaxPhase === 1 ? 64 : 58) + state.kickEnv * (climaxPhase === 1 ? 9.0 : 3.0);
    camera.updateProjectionMatrix();
    postUniforms.uChromatic.value = 0.002 + state.kickEnv * (finale ? 0.016 : 0.006);
    postUniforms.uGlitch.value = (state.glitchTear + (finale ? state.snareEnv * 0.35 : 0)) * 0.7;
    postUniforms.uZoomPunch.value = state.kickEnv * 0.06;
    postUniforms.uOverdrive.value = finale ? Math.min(1.0, 0.45 + state.kickEnv * 0.35) : 0.0;
    if (climaxPhase === 2) {
      // Thumb swarm: heavier RGB split, glitch slices on the snares, harder zoom and blur punches on the kicks.
      // The contrast-boosting overdrive pass only pulses with the kicks, and opens up in the last 4 bars
      postUniforms.uChromatic.value = 0.003 + state.kickEnv * 0.02 + state.snareEnv * 0.01;
      postUniforms.uGlitch.value = (state.glitchTear + state.snareEnv * 0.4) * 0.8;
      postUniforms.uZoomPunch.value = state.kickEnv * 0.08;
      postUniforms.uRadial.value = state.kickEnv * 0.04;
      postUniforms.uOverdrive.value = finale ? Math.min(1.0, 0.4 + state.kickEnv * 0.3) : state.kickEnv * 0.15;
    }
  }

  postUniforms.uDuotone.value = featurePart === 'guillotine' ? 1.0 : 0.0;
  if (BREAKDOWN_BAR_SET.has(currentBar)) {
    // Breakdowns: the image tears and splits, in bursts that change a few times a second
    const burst = 0.5 + 0.5 * Math.sin(t * 7.0) * Math.sin(t * 2.3);
    postUniforms.uGlitch.value = Math.max(postUniforms.uGlitch.value, 0.45 + burst * 0.55);
    postUniforms.uChromatic.value = Math.max(postUniforms.uChromatic.value, 0.012 + burst * 0.022);
  }
  postUniforms.uBloom.value = featurePart === 'colosseum' ? 0.4 + state.kickEnv * 0.25 : 0.0;
  postUniforms.uGrade.value = featurePart === 'colosseum' ? 0.5 : 0.0;
  if (featurePart === 'colosseum') {
    postUniforms.uRadial.value = state.kickEnv * 0.012;
    postUniforms.uChromatic.value = 0.002 + state.kickEnv * 0.006;
    postUniforms.uGlitch.value *= 0.4;
  }
  if (featurePart !== 'guillotine') {
    postUniforms.uCutShift.value = 0;
    postUniforms.uCutGlow.value = 0;
  }

  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}

// ============================================================================
// 13. INPUT HANDLERS (KEYS 1-9, 0 JUMP TO THE 10 DEMO PARTS)
// ============================================================================
dom.startScreen.addEventListener('click', () => launchDemo(0));
renderer.domElement.addEventListener('click', () => {
  if (!state.hasStarted) launchDemo(0);
  else togglePlay();
});

dom.edgeScrubber.addEventListener('click', (e) => {
  const rect = dom.edgeScrubber.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const targetSec = ratio * BEATMAP.duration;
  if (!state.hasStarted) launchDemo(targetSec);
  else seekTo(targetSec);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const stepSec = (e.shiftKey ? 8 : 2) * BAR_SEC;
    const baseTime = state.hasStarted ? music.currentTime : 0;
    const targetSec = Math.max(0, baseTime - stepSec);
    if (!state.hasStarted) launchDemo(targetSec);
    else seekTo(targetSec);
  } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
    e.preventDefault();
    const stepSec = (e.shiftKey ? 8 : 2) * BAR_SEC;
    const baseTime = state.hasStarted ? music.currentTime : 0;
    const targetSec = Math.min(BEATMAP.duration - 0.5, baseTime + stepSec);
    if (!state.hasStarted) launchDemo(targetSec);
    else seekTo(targetSec);
  } else if (e.key >= '1' && e.key <= '9') {
    const p = DEMO_PARTS[Number(e.key) - 1];
    if (p) launchDemo(p.startTime);
  } else if (e.key === '0') {
    const p = DEMO_PARTS[9];
    if (p) launchDemo(p.startTime);
  }
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio, 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderTarget.setSize(w * pr, h * pr);
  postUniforms.uResolution.value.set(w, h);
});

function precompileAllShadersAndGeometries() {
  // 1) Pre-extrude all Impact glyph geometries once at startup
  for (const ch of Object.keys(IMPACT_GLYPHS)) {
    getOrCreateGlyphGeos(ch);
  }

  // 2) Pre-cache all 3D word templates used across the demo
  for (let h = 0; h < 4; h++) {
    getOrCreateWordTemplate(BEAT_TOKENS[h], h);
  }
  const crimeTokens = ['VIBECODING', 'IS', 'NOT', 'A CRIME!'];
  for (let h = 0; h < 4; h++) {
    getOrCreateWordTemplate(crimeTokens[h], h);
  }
  getOrCreateWordTemplate('VIBECODING\nIS NOT\nA CRIME!', 1);
  getOrCreateWordTemplate('VIBECODING\nIS NOT\nA CRIME!', 3);

  const allQuoteLists = [PROD_QUOTES, FORUM_QUOTES, HATER_KISSES];
  for (const list of allQuoteLists) {
    for (const item of list) {
      if (item.beatTokens && item.beatTokens.length === 4) {
        for (let h = 0; h < 4; h++) {
          if (item.beatTokens[h]) getOrCreateWordTemplate(item.beatTokens[h], h);
        }
      }
    }
  }
  for (const toks of [...HATER_KISSES_ROUND2_TOKENS, ...KANEEL_SWARM_TOKENS, ...DEMOSCENE_CRIME_TOKENS]) {
    if (toks && toks.length === 4) {
      for (let h = 0; h < 4; h++) {
        if (toks[h]) getOrCreateWordTemplate(toks[h], h);
      }
    }
  }

  // Temporarily populate word3DMesh with all 4 material styles so WebGL compiles all 4
  for (let h = 0; h < 4; h++) {
    const tpl = getOrCreateWordTemplate(BEAT_TOKENS[h], h);
    if (tpl.letterDefs[0]) {
      word3DMesh.add(tpl.letterDefs[0].holder);
    }
  }

  // 3) Upload all procedural CanvasTextures to the GPU upfront
  const initialTextures = [
    mfxCubeTex,
    checkerTex,
    heroHeaderTex,
    heroCommentTex,
    heroTopicTex,
    stampHammerTex
  ];
  for (const tex of initialTextures) {
    if (tex) renderer.initTexture(tex);
  }
  for (const entry of avatarCubeTexCache.values()) {
    if (entry?.tex) renderer.initTexture(entry.tex);
  }
  for (const mon of arenaMonuments) {
    if (mon?.userData?.ltex) renderer.initTexture(mon.userData.ltex);
  }

  // 4) Temporarily force all scene groups/meshes visible & unculled for full shader + VAO warm-up
  const savedVis = new Map();
  const savedCull = new Map();
  scene.traverse((obj) => {
    savedVis.set(obj, obj.visible);
    obj.visible = true;
    if (obj.isMesh || obj.isInstancedMesh || obj.isLine) {
      savedCull.set(obj, obj.frustumCulled);
      obj.frustumCulled = false;
    }
  });

  // Compile all scene & post-processing shaders and run a warm-up GPU render pass
  renderer.compile(scene, camera);
  renderer.compile(postScene, postCam);

  postUniforms.uOverdrive.value = 0.5;
  postUniforms.uInvert.value = 0.5;
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  postUniforms.uOverdrive.value = 0.0;
  postUniforms.uInvert.value = 0.0;

  // Restore original visibility & frustumCulled states
  scene.traverse((obj) => {
    if (savedVis.has(obj)) obj.visible = savedVis.get(obj);
    if (savedCull.has(obj)) obj.frustumCulled = savedCull.get(obj);
  });
  while (word3DMesh.children.length > 0) {
    word3DMesh.remove(word3DMesh.children[0]);
  }
}

precompileAllShadersAndGeometries();
updateIntroCubeFormation(0, 0);
requestAnimationFrame(animate);
