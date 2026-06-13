// Pixel art grids ported from the v6 prototype.
// Each row is a string; each char maps to a color in the palette.
// '.' = transparent.

export interface SpriteDef {
  pal: Record<string, string>
  rows: string[]
}

export const PX = 5 // pixels per grid cell

// ── Hero base sprites (12×14) ─────────────────────────────────────────────────

// WARRIOR — darker steel, crimson hair, red belt accent
export const WARRIOR_SPRITE: SpriteDef = {
  pal: { R:'#cc1a1a', H:'#6a7c90', D:'#3e5060', S:'#c08858', E:'#1c2030',
         A:'#546478', B:'#283848', L:'#3a1a0a', G:'#a82020' },
  rows: [
    '....RR......','...HHHH.....','..HHHHHH....','..HSSSSH....',
    '..HSESES....','...SSSS.....','..AAAAAA....','.AAAAAAAA...',
    '.A.AAAA.A...','..B.AAAA.B..','...GAAG.....','...BBBB.....',
    '..BB..BB....','..LL..LL....',
  ],
}

// MAGE — violet hair, purple robe, robe hem instead of separate legs

export const MAGE_SPRITE: SpriteDef = {
  pal: { R:'#a070c8', H:'#8878b8', D:'#5848a0', S:'#e8c8a0', E:'#1c2030',
         A:'#6855a8', B:'#4838a0', L:'#3028a0', G:'#c0a0ff' },
  rows: [
    '....RR......','...HHHH.....','..HHHHHH....','..HSSSSH....',
    '..HSESES....','...SSSS.....','..AAAAAA....','.AAAAAAAA...',
    '.A.AAAA.A...','..AAAAAA....','...GAAG.....','..AAAAAA....',
    '..AAAAAA....','..LL..LL....',
  ],
}

// PALADIN — golden hair, silver plate, gold belt & greaves
export const PALADIN_SPRITE: SpriteDef = {
  pal: { R:'#d4b020', H:'#b8c8d8', D:'#7890a8', S:'#d4a888', E:'#1c2030',
         A:'#a8b8c8', B:'#587898', L:'#c8a020', G:'#ffd34d' },
  rows: [
    '....RR......','...HHHH.....','..HHHHHH....','..HSSSSH....',
    '..HSESES....','...SSSS.....','..GAAAAG....','.AAAAAAAA...',
    '.A.AAAA.A...','..B.AAAA.B..','...GGGG.....','...LLLL.....',
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
  'Wooden Staff': {
    pal: { B:'#c8a060', b:'#8a6030', T:'#70c8d8' },
    rows: [
      '..........BT','..........B.','..........B.','..........B.',
      '..........B.','..........B.','..........B.','..........B.',
      '..........B.','..........b.','..........b.','..........b.',
      '..........b.','............',
    ],
  },
  'Bone Staff': {
    pal: { W:'#e6e2d0', w:'#b8b09a', G:'#ffd34d' },
    rows: [
      '.........GWG','..........W.','..........W.','..........W.',
      '..........W.','..........W.','..........W.','..........W.',
      '..........W.','..........w.','..........w.','..........w.',
      '..........w.','............',
    ],
  },
  'Forsaken Staff': {
    pal: { P:'#b06aff', p:'#8040cc', G:'#ffd34d', W:'#e8d0ff' },
    rows: [
      '.........PGP','..........P.','..........P.','..........P.',
      '..........P.','..........P.','..........P.','..........p.',
      '..........p.','..........p.','..........p.','..........p.',
      '..........p.','............',
    ],
  },
  'Holy Mace': {
    pal: { G:'#ffd34d', S:'#d0d8e4', W:'#ffffff' },
    rows: [
      '..........GG','.........GSG','.........GWG','..........S.',
      '..........S.','..........S.','..........S.','..........S.',
      '.........GSG','..........S.','..........S.','..........S.',
      '............','............',
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
  hero_warrior: WARRIOR_SPRITE,
  hero_mage:    MAGE_SPRITE,
  hero_paladin: PALADIN_SPRITE,
  slime:    SLIME_SPRITE,
  bat:      BAT_SPRITE,
  skeleton: SKELETON_SPRITE,
  boss:     BOSS_SPRITE,
}
