// Pixel art grids ported from the v6 prototype.
// Each row is a string; each char maps to a color in the palette.
// '.' = transparent.

export interface SpriteDef {
  pal: Record<string, string>
  rows: string[]
}

export const PX = 5 // pixels per grid cell

// ── Hero base (12×14) ────────────────────────────────────────────────────────
export const HERO_SPRITE: SpriteDef = {
  pal: { R:'#d04848',H:'#9aa8bd',D:'#5b6678',S:'#e8b890',E:'#1c2030',
         A:'#7d8ca3',B:'#3e4a5e',L:'#4a3b2a',G:'#c8b04a' },
  rows: [
    '....RR......','...HHHH.....','..HHHHHH....','..HSSSSH....',
    '..HSESES....','...SSSS.....','..AAAAAA....','.AAAAAAAA...',
    '.A.AAAA.A...','.B.AAAA.B...','...AAAA.....','...LLLL.....',
    '..LL..LL....','..BB..BB....',
  ],
}

// ── Enemies ──────────────────────────────────────────────────────────────────
export const SLIME_SPRITE: SpriteDef = {
  pal: { G:'#5ec05e',g:'#3f8f43',W:'#ffffff',B:'#1c2030' },
  rows: [
    '............','...GGGGG....','..GGGGGGG...','.GGWGGGWGG..',
    '.GGBGGGBGG..','GGGGGGGGGGG.','GGGGGgGGGGG.','gGGGGGGGGGg.',
    '.ggGGGGGgg..','..ggggggg...',
  ],
}

export const BAT_SPRITE: SpriteDef = {
  pal: { P:'#8c5fc0',p:'#5d3f86',W:'#ffd34d',B:'#1c2030',F:'#e8e8e8' },
  rows: [
    '.P..........P.','.PP........PP.','.PPP.pppp.PPP.','.PPPpppppPPPP.',
    '..PPpWppWpPP..','...ppBppBpp...','....pppppp....','....pF..Fp....',
    '.....p..p.....',
  ],
}

export const SKELETON_SPRITE: SpriteDef = {
  pal: { W:'#e6e2d0',w:'#b8b29a',B:'#1c2030',R:'#c03a3a' },
  rows: [
    '...WWWW.....','..WWWWWW....','..WBWWBW....','..WWWWWW....',
    '...WwwW.....','....WW......','..WWWWWW..R.','.W.WWWW.W.R.',
    'w..WWWW..wR.','...WwwW...R.','...W..W.....','...W..W.....',
    '..WW..WW....',
  ],
}

export const BOSS_SPRITE: SpriteDef = {
  pal: { D:'#7a2030',d:'#561522',H:'#e6e2d0',Y:'#ffd34d',R:'#ff5a4d',B:'#1c2030' },
  rows: [
    '.H..........H.','.HH........HH.','..DDDDDDDDDD..','.DDDDDDDDDDDD.',
    '.DDYDDDDDDYDD.','.DDDDDDDDDDDD.','..DdRRRRRRdD..','..DDDDDDDDDD..',
    '.DDDDDDDDDDDD.','DDDDDDDDDDDDDD','DDdDDDDDDDDdDD','...DDDDDDDD...',
    '...DDD..DDD...','..DDD....DDD..',
  ],
}

// ── Equipment overlays (12×14, aligned to hero) ───────────────────────────────
// Ring and Amulet have no visual overlay.

export const OVERLAYS: Partial<Record<string, SpriteDef>> = {
  // Weapons
  'Iron Sword': {
    pal: { B:'#c8ccd4',G:'#8a6a3a',H:'#5a3a22' },
    rows: [
      '............','............','..........B.','..........B.',
      '..........B.','..........B.','..........B.','..........B.',
      '.........GBG','..........H.','............','............',
      '............','............',
    ],
  },
  "Soldier's Sword": {
    pal: { B:'#d4d9e0',G:'#5ec05e',H:'#5a3a22' },
    rows: [
      '............','............','..........B.','..........B.',
      '..........B.','..........B.','..........B.','..........B.',
      '.........GBG','..........H.','............','............',
      '............','............',
    ],
  },
  'Crypt Blade': {
    pal: { B:'#b06aff',W:'#e8d0ff',G:'#3a3144',H:'#241c2e' },
    rows: [
      '............','............','..........W.','..........B.',
      '..........B.','..........B.','..........B.','..........B.',
      '.........GBG','..........H.','............','............',
      '............','............',
    ],
  },
  'Profane Axe': {
    pal: { R:'#a03a3a',r:'#6e2020',B:'#3a3144',H:'#241c2e' },
    rows: [
      '............','........RR..','.......RRRB.','........rRB.',
      '..........B.','..........B.','..........B.','..........B.',
      '..........B.','..........H.','............','............',
      '............','............',
    ],
  },
  // Helmets
  "Scout's Helm": {
    pal: { F:'#7a8a5a',f:'#5a6a42' },
    rows: [
      '....FF......','...FFFF.....','..FFFFFF....','..F....F....',
      '............','............','............','............',
      '............','............','............','............',
      '............','............',
    ],
  },
  "Watcher's Helm": {
    pal: { F:'#4d7ea8',f:'#35597a' },
    rows: [
      '....FF......','...FFFF.....','..FFFFFF....','..Ff..fF....',
      '............','............','............','............',
      '............','............','............','............',
      '............','............',
    ],
  },
  'Crown of Bones': {
    pal: { W:'#e6e2d0',Y:'#ffd34d' },
    rows: [
      '..W.YY.W....','..WWWWWW....','............','............',
      '............','............','............','............',
      '............','............','............','............',
      '............','............',
    ],
  },
  // Chest
  'Leather Chestplate': {
    pal: { C:'#7a5a36',c:'#5a4226' },
    rows: [
      '............','............','............','............',
      '............','............','..CCCCCC....','.CCCcCCCC...',
      '.C.CCCC.C...','...CCCC.....','...CcCC.....','............',
      '............','............',
    ],
  },
  "Crypt Lord's Mantle": {
    pal: { D:'#7a2030',d:'#561522',G:'#ffd34d' },
    rows: [
      '............','............','............','............',
      '............','............','.DDDDDDDD...','.DDDGGDDD...',
      '.D.DDDD.D...','...DDDD.....','...DdDD.....','............',
      '............','............',
    ],
  },
  // Boots
  'Leather Boots': {
    pal: { C:'#7a5a36' },
    rows: [
      '............','............','............','............',
      '............','............','............','............',
      '............','............','............','............',
      '............','..CC..CC....',
    ],
  },
  'Silent Boots': {
    pal: { P:'#5d3f86',p:'#3e2a5c' },
    rows: [
      '............','............','............','............',
      '............','............','............','............',
      '............','............','............','............',
      '..PP..PP....','..pp..pp....',
    ],
  },
}

// Maps slot name → which overlay key to use for a given item name
export function overlayKey(itemName: string): string | null {
  return OVERLAYS[itemName] ? itemName : null
}

// Slots that have visual overlays (Ring and Amulet are stat-only)
export const VISUAL_SLOTS = ['Weapon', 'Helmet', 'Armor', 'Boots'] as const
export type VisualSlot = typeof VISUAL_SLOTS[number]

export const ALL_SPRITES = {
  hero:     HERO_SPRITE,
  slime:    SLIME_SPRITE,
  bat:      BAT_SPRITE,
  skeleton: SKELETON_SPRITE,
  boss:     BOSS_SPRITE,
}
