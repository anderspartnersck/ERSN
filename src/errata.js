// ER$N BENCHMARK ERRATA — THE ONE SOURCE (1127). Joe: "every card plays in both print and digital with the same assets."
//
// The Benchmark edition runs 30 core cards differently from their printed faces, and every character plays a Benchmark kit
// that is not on its INFO card (docs/FABLE-TASK1-PROPOSALS-1126.md §D). This file is where that text lives, ONCE:
//   · the game's card text (index.html cardText -> ERSN_ERRATA.cardText) reads it;
//   · the print errata (tools/build_errata.py -> pnp/out/ERSN-BENCHMARK-ERRATA.pdf) reads it through scripts/errata_dump.js;
//   · scripts/errata_check.js fails if a Benchmark-changed card has no entry here, or if print and screen disagree.
// Character kits are NOT copied here: they come from the engine's own Game.abilitiesText (src/engine.js), the function the
// on-screen character sheet already calls; kitCard() below just asks it once per table size.
//
// Every line was written by READING the code that runs the card (cited as engine.js:LINE at the time of writing, main 28e3022
// + this branch). Nothing here changes a rule: the engine never reads this file. If the code changes, change the line here.
// Where the code and the printed words could be read two ways, the line says what the CODE does and docs/ERRATA-1127.md asks Joe.
(function (global) {
  'use strict';

  // ── GROUPED RIDERS: printed ONCE as a rule card (the audit's plan), shown on screen after the printed text of each card ──
  const GROUPS = {
    NO_DEAL: {
      title: 'NO DEAL?',
      rule: 'Each card below resolves as printed. If its condition here is true when you play it, also draw 1 Asset card into your hand after it resolves.',
      lead: 'NO DEAL?',
      tail: 'draw 1 Asset card into your hand after it resolves.',
      // when = the engine's BENCH_V4 dead() test, read BEFORE the card resolves (engine.js:1289); the draw is _assetFlowDraw
      // (engine.js:750, to hand) after the card resolves (engine.js:1292, fb 'asset' -> engine.js:774).
      // 1127 card-text pass: each `when` is read as "If <when> when you play this, <tail>" (riderOf below).
      cards: {
        'Strategic Partnership MOU':       { when: 'no opponent has a face-up Clean Asset', code: 'engine.js:258' },
        'Bulls Get Rich':                  { when: 'you have fewer than 2 Assets in play', code: 'engine.js:260 (asset_count = Lineup, :542)' },
        'Bears Get Rich':                  { when: 'you have fewer than 2 face-down Assets', code: 'engine.js:261' },
        "We're Gonna Get the Stock Back!": { when: 'the Asset discard pile holds no Clean Asset', code: 'engine.js:262' },
        'Walking the Walk':                { when: 'no opponent has a face-down Asset', code: 'engine.js:263' },
        'Compliance Dividend':             { when: 'no opponent has a face-up Asset in play', code: 'engine.js:264' },
        'Pump & Ditch':                    { when: 'you have no Asset in play', code: 'engine.js:265' },
        'Mark to Mission Statement':       { when: 'you have no face-up Dirty Asset', code: 'engine.js:266' },
        'Mark to Magic':                   { when: 'you have fewer than 3 Assets in play', code: 'engine.js:267' },
      },
    },
    HEARING: {
      title: 'THE HEARING IS A TRUST CHECK',
      rule: 'Your HEARING in THE LOUNGE counts as a Trust Check. Every card below that names a Trust Check also works on a HEARING. The Safe has its own errata card.',
      lead: 'A HEARING counts as a Trust Check.',
      tail: '',
      // the hearing's judge + the failedTrustCheck window (engine.js:1763-1766); a failed hearing's Risk + SEC file (engine.js:1778-1780)
      cards: {
        'Class Ring':                 { when: 'Your HEARING passes on a roll of 2 or more, but a 1 still fails. You cannot LAWYER UP or SPIN', code: 'engine.js:1735 (fixed: no juice/hype options :1741-1743), 1763' },
        'Dual-Layered Instrument':    { when: 'You may discard this to re-roll a failed HEARING', code: 'engine.js:1765-1766 (offerReaction consumes it, :1163-1186)' },
        'Phantom Holdings Portfolio': { when: 'If you fail a HEARING, you may discard this: gain 2 Juice and take no Risk for it. The SEC still opens a file on you', code: 'engine.js:1766, 1778-1780' },
      },
    },
  };

  // ── PER-CARD ERRATA: the full Benchmark text, printed as its own errata card ──
  // why: 'tower' = a LEVELS tower rider · 'floor' = the Benchmark floor · 'v4' = the v4 rewrite (BENCH_V4) · 'hearing' = gauntlet
  // 1127 card-text pass (docs/CARD-TEXT-1127.md): WHO/WHEN first, whole sentences, "gain 1 Risk" not "+1 Risk"; THE TOWER = the
  // tiers (floorOf !== null), THE LOUNGE = the top, THE LOOP = neither (_onLoop).
  const CARDS = {
    // ---- SEC ----
    'Anonymous Board Letter': { why: 'tower', code: 'engine.js:1321',
      text: 'Every player loses 1 Juice and rolls a Trust Check. Each fail costs the usual penalty plus 2 Hype. A fail in THE TOWER also falls one tier.' },
    'Token Diversion': { why: 'tower', code: 'engine.js:1357-1360 (faithful shift = min(1, your Risk))',
      text: 'Move 1 of your Risk to another player. If they are in THE TOWER, they must pass a Trust Check or fall one tier. If you have 0 Bribes, lose 1 Trust.' },
    'Fake Receipts': { why: 'v4', code: 'engine.js:1327 + after towerLowTrust engine.js:1293',
      text: 'Each player with 0 or less Trust gains 3 Risk. Then each player in THE TOWER with 1 or less Trust falls one tier, with no check.' },
    'Mark to Misfit': { why: 'v4', code: 'engine.js:1346-1348',
      text: 'Each player with 2 or more Assets in play loses 2 Hype. Anyone this drops to 0 Hype discards an Asset in play. If nobody has 2 Assets, players on THE LOOP with 5 or more Hype lose 2 Hype.' },
    'Off-Record Testimony Emerges': { why: 'v4', code: 'engine.js:1349',
      text: 'The player on THE LOOP with the highest Trust skips their next turn. Players in THE TOWER or THE LOUNGE are safe.' },
    'Senate Hearing': { why: 'v4', code: 'engine.js:1343-1345',
      text: 'Each player with 3 or more Assets in play gains 3 Risk. If nobody has 3, each player on THE LOOP with the lowest Risk gains 2 Risk.' },
    'What the Hell Is He Building in There?': { why: 'v4', code: 'engine.js:1361 + fb towerAll engine.js:776-779',
      text: 'Gain 1 Risk for each face-up Dirty Asset in your Lineup, or 2 each if you have ever used a Bribe. If you have none, each player in THE TOWER must pass a Trust Check or fall one tier.' },
    // ---- Asset ----
    'Cloak of Moral Rectitude': { why: 'v4', code: 'engine.js:1444-1448',
      text: 'EFFECT Choose 1 opponent. They show you their hand and their face-down Assets. They gain 1 Risk for each Dirty face-down Asset, up to 2. If none is Dirty, you gain 1 Trust.' },
    'Controlled Burn': { why: 'v4', code: 'engine.js:791 (play) · 1202-1208 + offerReaction 1163-1186 (lose a Dirty: card discarded) · 798-806 (fall)',
      text: 'EFFECT When you play this, gain 1 Hype and move 1 of your Risk to an opponent. When you would lose a Dirty Asset in play, you may discard this: gain 1 Hype and give that Asset to an opponent. Its one-use effects stay used. Before the collapse, when you would fall a tier, gain 1 Hype, give this card to an opponent, and keep your tier. A BURNOUT still drops you.' },
    'Employee Recognition Suite': { why: 'v4', code: 'engine.js:2167',
      text: 'EFFECT At the end of your turn, if you have 2 or more Assets in play, gain 1 Hype.' },
    'Hostile Takeover': { why: 'v4', code: 'engine.js:792 (play) · 1149 (discard) · 811 (fall)',
      text: 'EFFECT When you play this, take up to 2 Juice from the opponent with the most Juice. Whenever another player discards a Clean Asset or falls a tier, gain 1 Juice.' },
    'Iron-Clad Purchase Agreement': { why: 'v4', code: 'engine.js:793 (play) · 1125 (targeted) · 812 (fall)',
      text: 'EFFECT When you play this, gain 1 Trust. Whenever an opponent targets you, gain 1 Juice. Whenever you fall a tier, gain 2 Juice.' },
    'Offshore Entity': { why: 'v4', code: 'engine.js:1362 + always asset engine.js:1291',
      text: 'EFFECT Gain 1 Juice. Then draw 1 Asset card into your hand.' },
    'The Safe': { why: 'v4', code: 'engine.js:1335 (target) · 2010 + 2185 (the turn it lasts) · 1735, 1763 (hearing)',
      text: 'Choose an opponent on a Golden Staircase, in THE TOWER, or in THE LOUNGE. During their next turn, their Trust Checks pass only on a 6. A HEARING counts.' },
    // ---- Market ----
    '90 Million Dollar Black Hole': { why: 'floor', code: 'engine.js:1496-1515 (blackHoleFloor)',
      text: 'Choose THE LOUNGE, the START CIRCLE, or any other space. Each opponent there discards an Asset in play of their choice. An opponent with no Asset in play drops to 0 Juice.' },
    'Juice Split Agreement': { why: 'v4', code: 'engine.js:1371',
      text: 'Choose 1 opponent. You each gain 1 Juice and draw 1 Asset card.' },
    'Pigs Get Slaughtered': { why: 'v4', code: 'engine.js:1336-1338',
      text: 'Each player with the most Assets in play (2 or more), you included, discards 1 and loses 1 Trust. A face-up Clean Asset goes first. If nobody has 2, you lose 1 Trust.' },
    'Tower Tour (by Invitation Only)': { why: 'v4', code: 'engine.js:1339-1341',
      text: 'If you are on THE LOOP, climb straight onto REGULATION with no Juice and no check. After the collapse, move to START instead. In THE TOWER or THE LOUNGE, gain 1 Trust.' },
  };

  const groupOf = name => { for (const k in GROUPS) if (GROUPS[k].cards[name]) return k; return null; };
  const riderOf = name => { const k = groupOf(name); if (!k) return null; const G = GROUPS[k], e = G.cards[name];
    return G.tail ? `${G.lead} If ${e.when} when you play this, ${G.tail}` : `${G.lead} ${e.when}.`; };

  // the Benchmark text of one card (null = the printed text stands)
  function benchText(card) {
    if (!card) return null;
    if (CARDS[card.name]) return CARDS[card.name].text;
    const r = riderOf(card.name); if (r) { const t = card.text.replace(/\s+$/, ''); return `${t}${/[.!?)]$/.test(t) ? '' : '.'} ${r}`; }
    return null;
  }
  // THE Benchmark as shipped (BENCHMARK_LOUNGE: v4 deck + LEVELS + the gauntlet) — the table this errata describes
  function applies(game) { const r = game && game.rules; return !!(game && game.edition === 'benchmark' && r && r.benchmarkDeck === 'v4' && r.levels && r.gauntlet); }

  // The ONE card-text function the screen uses (moved here from index.html 1127). Shipped Benchmark: the errata. Any other
  // Benchmark variant (?b1113=0, ?v4=0, ?assetflow — A/B lanes, not a printed edition) keeps the engine's variant tables.
  function cardText(c, game) {
    if (!c) return '';
    if (applies(game)) { const t = benchText(c); if (t) return t; if (!c.expansion) return c.text || ''; }
    const R = game && game.rules, B = game && game.edition === 'benchmark', n = c.name;
    const lv = (R && R.gauntlet && global.ERSN_LOUNGE_TEXT && global.ERSN_LOUNGE_TEXT[n])
      || (R && R.levels && global.ERSN_LEVELS_TEXT && global.ERSN_LEVELS_TEXT[n])
      || (B && R.assetFlow && global.ERSN_ASSET_FLOW_TEXT && global.ERSN_ASSET_FLOW_TEXT[n])
      || (B && R.benchmarkDeck === 'v4' && global.ERSN_V4_TEXT && global.ERSN_V4_TEXT[n])
      || (B && R.camperCards && global.ERSN_CAMPER && global.ERSN_CAMPER[n] && (R.camperCards & global.ERSN_CAMPER[n].bit) && global.ERSN_CAMPER[n].text);
    const ov = B && global.ERSN_BENCHMARK_TEXT && global.ERSN_BENCHMARK_TEXT[n];
    return lv || ov || c.text || '';
  }

  // ── CHARACTER KITS: asked of the engine's Game.abilitiesText, once per table size (some lines change with the count) ──
  const COUNTS = [2, 3, 4, 5, 6];
  function shippedGame(charDef, n) {
    const others = (global.CHARACTERS || []).filter(c => c.name !== charDef.name);
    return new global.ERSNGame({ n_players: n, expansion: false, edition: 'benchmark', characters: [charDef].concat(others).slice(0, n),
      ruleOverrides: Object.assign({}, global.ERSN_BENCHMARK_LOUNGE), seed: 1 });
  }
  function kitLines(charDef, n) { const g = shippedGame(charDef, n), p = g.players.find(q => q.name === charDef.name); return g.abilitiesText(p, charDef.abilities.slice()); }
  const countLabel = ns => ns.length === COUNTS.length ? '' : (ns.length === 1 ? `${ns[0]} players` : `${ns[0]}–${ns[ns.length - 1]} players`);
  // { name, lines: [{ printed, changed, variants: [{ counts:[..], label, text }] }] } — a line identical at every count has one variant
  function kitCard(charDef) {
    const per = COUNTS.map(n => kitLines(charDef, n));
    return { name: charDef.name, lines: charDef.abilities.map((printed, i) => {
      const variants = [];
      COUNTS.forEach((n, k) => { const t = per[k][i], last = variants[variants.length - 1];
        if (last && last.text === t && last.counts[last.counts.length - 1] === n - 1) last.counts.push(n); else variants.push({ counts: [n], text: t }); });
      variants.forEach(v => { v.label = countLabel(v.counts); });
      return { printed, changed: variants.some(v => v.text !== printed), variants };
    }) };
  }

  global.ERSN_ERRATA = { GROUPS, CARDS, COUNTS, groupOf, riderOf, benchText, applies, cardText, kitLines, kitCard };
})(typeof window !== 'undefined' ? window : globalThis);
