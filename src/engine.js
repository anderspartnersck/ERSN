/* ER$N ENGINE — async, agent-driven JS engine (v2).
   Faithful to engine.py's balance (meters, collapse, Juice/movement loop, victory + Final
   Favor) but every decision now flows through a per-player `agent`, so a human seat and the
   reaction/targeting/asset-modifier systems (P2) can pause resolution mid-turn.

   - BotAgent reproduces the headless sim's RNG behavior → bot-only games keep the validated balance.
   - HumanAgent (set by the UI) returns Promises resolved by player clicks.
   - Lineup entries are objects {card, up, dirty, mods:[]}; mods are place-on-top retags with timers.

   Runs in the browser (attaches to window) and under Node (attaches to globalThis) for the
   headless harness in scripts/. */
(function (global) {
  'use strict';

  // ---- seedable RNG (mulberry32) with a Python-random-ish surface ----
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      random: next,
      randint: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),     // inclusive
      randrange: (n) => Math.floor(next() * n),
      choice: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
      sample(arr, k) { const c = arr.slice(); this.shuffle(c); return c.slice(0, k); },
    };
  }

  const MAX_HYPE = 8;
  const BURNOUT_RISK = 8;   // "If your Risk reaches 8: … you BURN OUT" (RULES.md)

  // ---- CANONICAL BOARD TRACK ---------------------------------------------------
  // Re-scoped to the PRINTED GOLDEN board (assets/board/golden2.png) — now the canonical
  // truth. 12-position ring traced in path order from the START button (bottom-left):
  //   0-3  LEFT column bottom->top   : MARKET($) · ASSET(Ae) · SEC(shield+eye) · MARKET($)
  //   4    TOP-RIGHT "TO MARKET" door (blank gold — NOT a deck space, can't end on it)
  //   5-8  RIGHT column top->bottom  : MARKET($) · MARKET($) · SEC(shield) · MARKET($)
  //   9-11 BOTTOM inner turn R->L    : SEC(GLOBAL DECK) · ASSET · MARKET(MARKET DECK)
  // The printed MARKET/SEC/ASSET rhythm is THEME, not literal mod-3 -> EXPLICIT per-index
  // deck table (read off the tile faces). Distribution over the 11 deck tiles:
  // MARKET x6, SEC x3, ASSET x2. See docs/BOARD-SPACES.md. (Mirrors reference/engine.py.)
  const LOOP_N = 12;
  const DOOR_SPACES = new Set([4]);
  const LOUNGE_EXITS = new Set([3, 5]);   // the two tower-top tiles flanking the door — UI/board hint only
  const DECK_BY_INDEX = {
    0: 'Market', 1: 'Asset', 2: 'SEC', 3: 'Market',
    /* 4 = TO MARKET door, no deck */
    5: 'Market', 6: 'Market', 7: 'SEC', 8: 'Market',
    9: 'SEC', 10: 'Asset', 11: 'Market',
  };

  // ---- EDITIONS ----------------------------------------------------------------
  // 'classic'  = faithful to the printed product. FROZEN reference. Do not add rule changes here.
  // 'benchmark'= tunable lane for minor, reversible balance adjustments (see docs/ERRATA-EXTENDED.md §6).
  const VERSION = 'Classic 1.0';
  // Benchmark = the tunable lane. Same satire ("you can't win at fraud"), fairer fight:
  // collapse becomes self-inflicted (L2), leading carries danger by RULE (L3 rubber-band),
  // and rock-bottom gets a floor so doom-loops don't compound (L4). All reversible knobs; Classic frozen.
  const EDITIONS = {
    classic:   { shadowOnRisk: false, shadowRiskThreshold: 6, tallPoppy: false, tallPoppyAt: 8, floor: false, blackHoleFloor: false,
                 stampScoresFF: false, hypeExitFF: false, hypeExitAt: MAX_HYPE, hypeExitJuiceCap: null, cleanestSurvives: false,
                 charAwareTrust: false, faithfulCards: false },
    // PARITY KNOBS (benchmark only — the FF axis that historically locked out Mark/Vonda).
    // Final Favor decides ~99% of games but scores only doors/theft/survive-round/clean-count — never Hype,
    // and Vonda's Stamp is invisible to it. Re-baselined for the canonical 12-tile track (scripts/_parity_ab.js):
    //   • hypeExitFF NOW ON — gives Mark (the bagholder believer) his OWN Hype→Lounge Final Favor lane.
    //     The original (hype>=MAX, no Juice cap) perversely paid Danny, whose Doughmination Juice-spike is the
    //     only thing that reliably reaches MAX Hype; lowering the bar to 5 ("riding the bubble") + a Juice
    //     cap (the believer did NOT cash out) re-aims it at Mark — and as a bonus restores Vonda's modest-Juice
    //     ride. Re-baselined 4p/6p, every character lands ~13-23%. See begin_collapse for the two-guard scoping.
    //   • cleanestSurvives ON (tiebreak aligns with the "least-dirty-at-collapse" thesis).
    //   • stampScoresFF still OFF (no-op: the Stamp rarely qualifies at collapse). Flip via opts.ruleOverrides
    //     to re-experiment. Classic stays frozen (all parity knobs OFF there).
    //   • blackHoleFloor ON (L4) — the 90M Black Hole floors a 0-Asset target at 0 instead of DOUBLING a
    //     negative deficit; "$90 million disappeared" stays a joke without compounding into "$90 trillion."
    //   • charAwareTrust ON — the Lounge/eviction Trust Checks (WHY ASK?, Palace in the Sky, collapse
    //     eviction) run through the SAME machinery as every other Trust Check: the threshold honors
    //     Class Ring (pass on 2+) and The Safe (must roll 6) via effPassOn, a failed WHY ASK?/Palace can
    //     be met with the reroll / Phantom Holdings reactions, and the fail penalty picks up Raptor Leasing
    //     (+2 Risk) + the Benchmark floor. Classic keeps the frozen raw >=5/>=4 rolls (print-faithful lock).
    //   • faithfulCards ON — restores printed card clauses the engine dropped/mis-implemented (see
    //     docs/verify/FIDELITY-AUDIT-2026-07-11.md): missing riders (Mark-to-* post-collapse +2 Risk,
    //     Martyrdom +2 Hype), unpaid costs (Golden Parachute), missing conditions (What the Hell Bribe
    //     clause, Favor Squeeze tie), and over-charges (Raptor Implosion initial play). Rolled out in
    //     verified batches; Classic keeps the frozen (imperfect) behavior.
    benchmark: { shadowOnRisk: true,  shadowRiskThreshold: 6, tallPoppy: true,  tallPoppyAt: 8, floor: true, blackHoleFloor: true,
                 stampScoresFF: false, hypeExitFF: true, hypeExitAt: 5, hypeExitJuiceCap: 25, cleanestSurvives: true,
                 charAwareTrust: true, faithfulCards: true },
  };
  // Benchmark CARD OVERRIDES — same card name, sharper job (effect + on-card text). Read only when
  // edition==='benchmark'; Classic never sees these. fx swaps route through resolve_card; text feeds the UI.
  const BENCHMARK_FX = {
    'The Benchmark': 'MANUAL_BENCHMARK_RB',   // becomes a pure leader-cutdown (rubber band), not a single-target poke
  };
  const BENCHMARK_TEXT = {
    'The Benchmark': 'THE BENCHMARK — the table is measured against its loudest. The player with the most Hype is cut down to size: −3 Hype (you, if you set the bar). No bailouts.',
    '90 Million Dollar Black Hole': 'Choose the EXEC. LOUNGE, START CIRCLE, or ANY space. Any players on that space must discard an in-play Asset of their choice. If a player has 0 Assets in-play, that account goes straight to ZERO Juice. (No doubling-the-deficit spiral.)',
  };

  // ===================================================================
  //  AGENTS — answer the engine's decision requests.
  //  decide(req, game, self) -> value (sync or Promise). See Game.decide for req kinds.
  // ===================================================================
  class BotAgent {
    // Reproduces the sim's built-in random policy. Pure RNG so balance == the validated headless sim.
    decide(req, game, p) {
      const R = game.rng, others = req.others || [];
      switch (req.kind) {
        case 'bribe':       return (game.collapsed || p.juice >= 6) && (R.random() < 0.5);
        case 'steps':       return p.juice > 0 ? Math.min(p.juice, R.randint(0, 2)) : 0;
        case 'door':        return R.random() < 0.4;
        case 'enterLounge': return R.random() < 0.5;
        case 'play':        { const c = req.candidates || p.hand; return (c.length && R.random() < 0.8) ? R.choice(c) : null; }
        case 'target':      return req.candidates.length ? R.choice(req.candidates) : null;
        case 'asset':       return req.candidates.length ? R.choice(req.candidates) : null;
        case 'hand':        return req.candidates.length ? R.choice(req.candidates) : null;
        case 'choice':      return req.options.length ? R.choice(req.options) : null;
        // reactions: play a beneficial reaction most of the time (bots aren't perfectly optimal)
        case 'react':       return (R.random() < 0.7) ? req.card : null;
        case 'giveHype':    // a 3rd party deciding whether to bail out a Benchmark target
                            return R.random() < 0.25;
        case 'ability':     return req.ability === 'LeakyBucket';  // random bots only cling on; skip optional spends
        default:            return null;
      }
    }
  }

  // ===================================================================
  //  CHARACTER AI — bots play their kit, per "Sharky's Disgusting Cubicle" (the rules-sheet strategy).
  //  Sharky's creed (shared): embrace collapse, bait SEC, track who holds what, target the leader,
  //  let politicians spin out while you eat up. Each character then leans into their own escalation.
  // ===================================================================
  const MARKET_DECKS = new Set(['Market', 'AdvMarket']);
  // disruptive fx Wu favors — "break open someone else's books"
  const DISRUPT_FX = new Set(['RANK_YANK', 'WALKING_WALK', 'PULL_TAPE', 'LIMITED_HANGOUT', 'PARKING_LOT',
    'KAHLEEFORNYUH', 'SHORT_SELLER', 'EXEC_RETREAT', 'MANUAL_BRIEFCASE', 'MANUAL_WASNT_SIGNED',
    'MANUAL_RAPTOR_IMPLODE', 'MANUAL_SHADOW_MERGER', 'SHREDDED_AUDIT']);

  // per-character knobs. playScore(card) ranks hand options; the rest tune the loop decisions.
  const PERSONA = {
    'Benny Boye': {   // rush + camp the Lounge, protect the 2-Clean, force collapse on your terms
      playRate: .8, bribe: p => p.juice >= 3, steps: () => 0, door: () => false,
      enterLounge: () => true, reactRate: .7,
      playScore: c => (c.ctype === 'Clean' ? 4 : c.ctype === 'Dirty' ? -2 : 1),
    },
    'Claudia Numbers': {  // calculated long game: protect Trust, play Clean, AVOID Hype (Cooked)
      playRate: .75, bribe: p => p.juice >= 3 && p.trust < 4, steps: p => Math.min(p.juice, 1),
      door: () => false, enterLounge: p => p.trust >= 4, reactRate: .9,
      playScore: c => (c.ctype === 'Clean' ? 4 : c.ctype === 'Dirty' ? -1 : (MARKET_DECKS.has(c.deck) ? -1 : 1)),
    },
    'Vonda Vouch': {  // launder dirty as clean (the Stamp); patient exit
      playRate: .85, bribe: p => p.juice >= 4, steps: p => Math.min(p.juice, 1),
      door: g => false, enterLounge: p => (p.trust >= 4 || p.hype >= 8), reactRate: .8,
      playScore: c => (c.ctype === 'Dirty' ? 3 : c.ctype === 'Clean' ? 2 : 1),
    },
    'Danny Dough': {  // hoard/chase Juice, protect the doubling spiral — don't spend down early
      playRate: .85, bribe: p => p.juice >= 9, steps: p => Math.min(p.juice, 2),
      door: p => p.juice >= 5, enterLounge: p => (p.trust >= 4 || p.hype >= 8), reactRate: .7,
      playScore: c => (MARKET_DECKS.has(c.deck) ? 3 : c.ctype === 'Clean' ? 2 : 1),
    },
    'Wu Drainer': {   // mobile disruptor, box out, break open others' books; burns hot (not a door-farmer)
      playRate: .9, bribe: p => p.juice >= 6, steps: p => Math.max(1, Math.min(p.juice, 2)),
      door: (p, g) => g.rng.random() < 0.45, enterLounge: p => (p.trust >= 4 || p.hype >= 8), reactRate: .75,
      playScore: c => (DISRUPT_FX.has(c.fx) ? 4 : c.ctype === 'Clean' ? 2 : 1),
    },
    'Mark Markit': {  // BRANDING: pump Hype to the bubble, ride the Hype→Lounge bridge (it's on fire)
      playRate: .92, bribe: p => p.juice >= 7, steps: p => Math.min(p.juice, 2),
      door: () => false, enterLounge: p => p.hype >= 8, reactRate: .55,
      playScore: c => (MARKET_DECKS.has(c.deck) ? 4 : c.ctype === 'Clean' ? 2 : 1),
    },
  };

  // threat score for "target the leader" — closeness to a clean Lounge win dominates
  function threat(g, q) { return (q.in_lounge ? 6 : 0) + q.clean_count() * 2 + q.trust * 0.3 + q.hype * 0.12 + q.juice * 0.1 - q.risk * 0.2; }

  class CharacterAgent {
    constructor() { this.bot = new BotAgent(); }
    decide(req, game, p) {
      const R = game.rng, persona = PERSONA[p.name];
      if (!persona) return this.bot.decide(req, game, p);
      switch (req.kind) {
        case 'bribe':       return persona.bribe(p, game);
        case 'steps':       return persona.steps(p, game);
        case 'door':        return persona.door(p, game);
        case 'enterLounge': return persona.enterLounge(p, game);
        case 'react':       return (R.random() < persona.reactRate) ? req.card : null;
        case 'play': {
          const cs = req.candidates || p.hand;
          if (!cs.length || R.random() >= persona.playRate) return null;
          // weighted pick by playScore (+ jitter so bots aren't deterministic/exploitable)
          let best = null, bestW = -Infinity;
          for (const c of cs) { const w = persona.playScore(c) + R.random(); if (w > bestW) { bestW = w; best = c; } }
          return best;
        }
        case 'target': {    // Sharky: target the leader (most threatening opponent)
          const cs = req.candidates; if (!cs || !cs.length) return null;
          return cs.reduce((m, x) => threat(game, x) > threat(game, m) ? x : m);
        }
        case 'ability':     // in-character use of the printed secondary abilities
          if (req.ability === 'Unimpeachable') return p.trust < 4 && p.juice >= 7;  // only buy Trust to clear the Lounge bar, and only with spare Juice
          if (req.ability === 'Doughmination') return p.juice >= 10 && p.hype >= 2; // Danny converts a Juice surplus to a Hype spike
          if (req.ability === 'Notary') return false;                       // Vonda keeps her Assets (the Stamp wants them)
          if (req.ability === 'LeakyBucket') return true;                   // Vonda always clings to the Lounge
          return false;
        default:            return this.bot.decide(req, game, p);   // asset/hand/choice/giveHype
      }
    }
  }

  class Player {
    constructor(cd) {
      this.cd = cd; this.name = cd.name;
      this.abilityName = cd.name;   // which character's ABILITIES this seat uses (Executive Shuffling swaps it)
      this.juice = cd.juice; this.trust = cd.trust; this.hype = cd.hype;
      this.risk = 0; this.bribes = 0;
      this.hand = [];        // Card[]
      this.lineup = [];      // [{card, up, dirty, mods:[]}]
      this.pos = 'START';    // 'START' | int 0..11 | 'LOUNGE'  (canonical 12-space track; 4 = door, never a resting space)
      this.in_lounge = false;
      this._stamped = false; // faithful pre-collapse victory: books stamped via a passed Trust Check
      this.skip_next = false;
      this.lounge_streak = 0;
      this.maxhype_streak = 0;
      this.alive = true;
      this.burned = false;
      this.policy = null;
      this.sec_immunity = 0;
      this.grace_immunity = false;   // Regulatory Grace Period
      this.swap_with = null;         // Executive Shuffling (ability swap next turn)
      this.private_dance_used = false;
      this.isHuman = false;
      this.agent = new BotAgent();
      this.color = cd.color || '#c89a3c';
      // Final Favor tallies
      this.ff_bribe_used = 0; this.ff_clean_turned_dirty = 0; this.ff_burnout = 0;
      this.ff_entered_sec_willingly = 0; this.ff_survived_collapse_round = 0;
      this.ff_burned_8plus_juice = 0; this.ff_passed_to_market = 0; this.ff_stole_asset = 0;
      this.ff_hype_exit = 0;         // BENCHMARK: banked at collapse if riding MAX Hype (the believer's exit)
      this.acct_whisper = false;     // MANUAL_ACCT_WHISPER (Risk counts 0 if Shadow<6 at scoring)
    }
    // ---- lineup helpers (mods are place-on-top retags with turn timers) ----
    asset_count() { return this.lineup.length; }
    facedown_count() { return this.lineup.filter(t => !t.up).length; }
    topMod(t) { for (let i = t.mods.length - 1; i >= 0; i--) if (t.mods[i].turns !== 0) return t.mods[i]; return null; }
    effDirty(t) { const m = this.topMod(t); if (m && m.tag === 'clean') return false; if (m && m.tag === 'dirty') return true; if (m && m.tag === 'conditional') return false; return t.dirty; }
    noEffect(t) { const m = this.topMod(t); return !!(m && (m.noeffect || (m.tag === 'conditional' && !m.keepEffects))); }
    hasConstant(fx) { return this.lineup.some(t => t.card.fx === fx && t.up && !this.noEffect(t)); }
    faceup_clean() { return this.lineup.filter(t => t.up && !this.effDirty(t)); }
    faceup_dirty() { return this.lineup.filter(t => t.up && this.effDirty(t)); }
    // Does this entry count as a CLEAN Asset? Dirty never does — and neither does CONDITIONAL.
    // RULING (Joe, 2026-09-01): "conditional assets can only count as clean if a card or character
    // ability allows it." A laundering card grants that permission by pushing an explicit tag:'clean'
    // mod; character abilities fold in one level up, at victoryCleanCount(). Absent either, a
    // Conditional Asset is its own type and scores nothing — which is what makes Compliance Dividend,
    // Strategic Partnership MOU and Strategic Undervaluation actual sabotage rather than a no-op.
    effClean(t) {
      const m = this.topMod(t);
      if (m && m.tag === 'clean') return true;                        // a card explicitly allowed it
      if (m && (m.tag === 'dirty' || m.tag === 'conditional')) return false;
      return !t.dirty && t.card.ctype !== 'Conditional';
    }
    clean_count() { return this.lineup.filter(t => this.effClean(t)).length; }   // victory clean count
    final_favor() {
      let positives = this.ff_entered_sec_willingly + this.ff_survived_collapse_round +
        this.ff_burned_8plus_juice + this.ff_passed_to_market + this.ff_stole_asset;
      if (this.clean_count() === 2) positives += 1;   // exactly-2-Clean bonus
      const penalties = this.ff_bribe_used + this.ff_clean_turned_dirty + this.ff_burnout;
      return positives - penalties;   // Accounting Whisper's Risk->0 affects tie-break ordering, see Game.effRisk
    }
    tickMods(log) {
      for (const t of this.lineup) {
        for (const m of t.mods) {
          if (m.turns > 0 && m.turns !== Infinity) m.turns -= 1;
        }
        t.mods = t.mods.filter(m => m.turns === Infinity || m.turns > 0);
      }
    }
  }

  // reaction triggers -> which card fx can respond
  const REACTS = {
    playCleanAsset:   ['MANUAL_INTERCEPT', 'MANUAL_COUNTERPARTY'],
    wouldLoseTrust:   ['MANUAL_TRUSTFALL', 'MANUAL_RESTRUCTURE'],
    failedTrustCheck: ['MANUAL_REROLL', 'MANUAL_PHANTOM'],
    targeted:         ['MANUAL_TECHNICALITY', 'MANUAL_REVERSE'],
    wouldLoseDirty:   ['MANUAL_CONTROLLED_BURN'],
  };
  // reaction cards held in hand must NOT be spent by the proactive play step (they wait for a trigger).
  // Face-up/face-down reaction assets ARE played proactively (into the lineup) and react from there.
  const HOLD_IN_HAND = new Set(['MANUAL_TECHNICALITY', 'ENDGAME_STOCK_BUY']);
  function proactivelyPlayable(c) { return !(HOLD_IN_HAND.has(c.fx) && c.play === 'KeepInHand'); }

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.rng = makeRng(opts.seed);
      this.expansion = opts.expansion !== false;
      this.edition = EDITIONS[opts.edition] ? opts.edition : 'classic';
      // edition knobs; classic = print-faithful. opts.ruleOverrides lets a balance harness A/B single knobs.
      this.rules = opts.ruleOverrides ? Object.assign({}, EDITIONS[this.edition], opts.ruleOverrides) : EDITIONS[this.edition];
      this.loglines = [];
      this.events = [];          // structured events for the UI animator
      const chosenDefs = opts.characters
        ? opts.characters
        : this.rng.sample(global.CHARACTERS, opts.n_players || 4);
      this.players = chosenDefs.map(c => new Player(c));
      if (opts.humanSeats) this.players.forEach((p, i) => { p.isHuman = !!opts.humanSeats[i]; });
      // bots play their character by default ("Sharky's Cubicle" policies); 'random' keeps the old pure-RNG bot
      this.botStyle = opts.botStyle || 'character';
      if (this.botStyle === 'character') for (const p of this.players) p.agent = new CharacterAgent();
      this.global_sec = 0; this.shadow_sec = 0;
      this.collapsed = false; this.collapse_turns_left = null;
      this.consecutive_assets = 0;
      this.turn = 0; this.winner = null; this.end_reason = null;
      this.order = this.players.map((_, i) => i);
      // Rule sheet: "Each player will roll off, highest roll leads off, game continuing clockwise."
      // [BENCHMARK] deterministic per seed; Classic keeps the frozen seat order (parity-locked).
      if (this.rules.faithfulCards) {
        const rolls = this.order.map(i => ({ i, r: this.rng.randint(1, 6) }));
        rolls.sort((a, b) => b.r - a.r || a.i - b.i);   // highest leads; ties keep seat order
        this.order = rolls.map(x => x.i);
        this.log(`    Roll-off for turn order: ${this.order.map(i => this.players[i].name.split(' ')[0]).join(' -> ')}`);
      }
      this.idx = 0; this.done = false;
      this.maxTurns = opts.maxTurns || 120;
      // decks
      this.seen = new Map();   // hidden-info knowledge: playerName -> Map<card, holder>  (see knows/learn)
      this.decks = {}; this.discards = {};
      const map = { SEC: 'ShadowSEC', Asset: 'AdvAsset', Market: 'AdvMarket' };
      for (const key of ['SEC', 'Asset', 'Market']) {
        let base = (global.DECK_OF[key] || []).slice();
        if (this.expansion) base = base.concat((global.DECK_OF[map[key]] || []).slice());
        this.rng.shuffle(base);
        this.decks[key] = base; this.discards[key] = [];
      }
      for (const p of this.players) p.sec_immunity = this.expansion ? 1 : 0;
    }

    log(s) { this.loglines.push(s); }
    emit(type, data) { this.events.push(Object.assign({ type, turn: this.turn }, data || {})); }

    // route a decision to the acting player's agent (sync bot or async human)
    decide(p, req) { return Promise.resolve(p.agent.decide(req, this, p)); }

    mkEntry(card, up, dirty) { return { card, up, dirty: !!dirty, mods: [] }; }

    // ── HIDDEN INFORMATION ────────────────────────────────────────────────────────────────
    // A card is HIDDEN while it sits in a hand or face-down in a Lineup. Its holder always
    // knows it; nobody else does until a reveal effect shows it to them — and that knowledge
    // then PERSISTS. That's the digital stand-in for the table act the rules ask for
    // ("Track who holds what. Remember the reveals." — Sharky's Cubicle): at a table a human
    // remembers; here the game remembers for them.
    //
    // Knowledge is bound to the pair (card, holder), so it expires on its own the moment the
    // card moves — discarded, stolen, passed — and draw() forgets a card outright, so one that
    // cycles back through the deck comes back genuinely unknown. No call-site bookkeeping.
    //
    // This layer is a pure OBSERVER: it records, it never feeds a decision. Bot play and the
    // golden-master are untouched (it writes events, never loglines). The human UI reads it to
    // decide which cards it is allowed to draw face-up.
    _seen(obs) { let m = this.seen.get(obs.name); if (!m) this.seen.set(obs.name, m = new Map()); return m; }
    _forget(card) { if (card) for (const m of this.seen.values()) m.delete(card); }
    holderOf(card) {
      if (!card) return null;
      for (const q of this.players) { if (q.hand.indexOf(card) >= 0) return q; for (const t of q.lineup) if (t.card === card) return q; }
      return null;
    }
    /** Does `obs` know what this card is? (holders always do; others only via a reveal that still binds.) */
    knows(obs, card, holder) {
      if (!obs || !card) return false;
      const h = holder || this.holderOf(card);
      if (!h) return false;                       // in a deck/discard — not held by anyone
      return h === obs || this._seen(obs).get(card) === h;
    }
    /** Show `cards` (held by `holder`) to `obs`. Idempotent; emits 'learn' for the UI dossier. */
    learn(obs, cards, holder, src) {
      if (!obs || !holder || obs === holder) return;
      const m = this._seen(obs), got = [];
      for (const c of (Array.isArray(cards) ? cards : [cards])) if (c && m.get(c) !== holder) { m.set(c, holder); got.push(c.name); }
      if (got.length) this.emit('learn', { by: obs.name, from: holder.name, cards: got, src: src || '' });
    }
    /** A table-wide reveal — every other player sees it. */
    learnAll(cards, holder, src) { for (const q of this.players) if (q !== holder) this.learn(q, cards, holder, src); }
    /** "MUST reveal 1 card from their hand" (Hot Mic / Whispers). A rational reveal avoids a
     *  Dirty Asset, which is exactly the branch the effects below already price in. */
    revealFromHand(q, src) {
      if (!q.hand.length) return null;
      const c = q.hand.find(x => x.ctype !== 'Dirty') || q.hand[0];
      this.learnAll(c, q, src);
      this.emit('handReveal', { who: q.name, card: c.name, ctype: c.ctype, src });
      return c;
    }

    draw(key) {
      if (!this.decks[key].length) {
        this.decks[key] = this.discards[key]; this.discards[key] = [];
        this.rng.shuffle(this.decks[key]);
        if (!this.decks[key].length) return null;
      }
      const drawn = this.decks[key].pop();
      this._forget(drawn);   // fresh from the deck: nobody has seen it (kills stale knowledge after a reshuffle)
      return drawn;
    }

    raise_global_sec(amt, why) {
      amt = amt || 1;
      if (this.global_sec >= 8) return;
      this.global_sec = Math.min(8, this.global_sec + amt);
      this.log(`    [Global SEC +${amt} -> ${this.global_sec}] ${why || ''}`);
      this.emit('globalsec', { value: this.global_sec, why });
      if (this.global_sec >= 8 && !this.collapsed) this.begin_collapse('Global SEC reached 8');
    }
    raise_shadow_sec(amt, why) {
      amt = amt || 1;
      if (!this.expansion) return;
      this.shadow_sec = Math.min(8, this.shadow_sec + amt);
      this.log(`    [Shadow SEC +${amt} -> ${this.shadow_sec}] ${why || ''}`);
      this.emit('shadowsec', { value: this.shadow_sec, why });
      if (this.shadow_sec >= 8 && !this.collapsed) {
        this.begin_collapse('Shadow SEC reached 8');
        this.collapse_turns_left = 1;
      }
    }
    begin_collapse(reason) {
      if (this.collapsed) return;
      this.collapsed = true;
      // BENCHMARK "believer's exit" (L3 parity): a true believer riding the bubble when it pops got out
      // before the music stopped — bank +1 Final Favor. This is the FF line Hype never had; it gives Mark
      // (the bagholder believer) his OWN competent Final Favor lane without handing everyone Wu's doors.
      // SCOPED so it can't just feed the cynical hoarder — TWO guards (measured at scripts/_parity_ab.js):
      //   1) hype >= hypeExitAt (5, "riding the bubble") — NOT exactly MAX, which only Danny's Doughmination
      //      Juice-spike reliably hits, so a MAX bar perversely paid the hoarder, not the believer.
      //   2) juice <= hypeExitJuiceCap — the believer DIDN'T cash out. At collapse, high-Hype players split by
      //      Juice: Mark ~14 (the believer) vs Danny ~74 (bought his exit). The cap excludes Danny's war-chest
      //      exit while leaving Mark/Vonda's modest-Juice ride eligible.
      // The sole Juice leader is also excluded (belt + suspenders). Classic FF is frozen (knob OFF there).
      if (this.rules.hypeExitFF) {
        const field = this.alive_players();
        let mx = -Infinity, second = -Infinity;
        for (const q of field) { if (q.juice > mx) { second = mx; mx = q.juice; } else if (q.juice > second) second = q.juice; }
        const cap = this.rules.hypeExitJuiceCap;
        for (const q of field) {
          const soleJuiceLeader = (q.juice === mx && mx > second);   // the lone richest seat = the hoarder
          const cashedOut = (cap != null && q.juice > cap);          // sat on a Juice war chest = not a believer
          if (q.hype >= this.rules.hypeExitAt && !soleJuiceLeader && !cashedOut) q.ff_hype_exit = 1;
        }
      }
      if (this.collapse_turns_left === null) this.collapse_turns_left = 3;
      this.end_reason = `COLLAPSE: ${reason}`;
      this.log(`  *** COLLAPSE BEGINS: ${reason} ***`);
      this.emit('collapse', { reason });
    }

    // ---- Trust loss routed through the reaction window (Trust Fall / Restructuring) ----
    async lose_trust(p, amt, cause, byOpp) {
      if (amt <= 0) { p.trust -= amt; return; }
      const reacted = await this.offerReaction('wouldLoseTrust', { player: p, amount: amt, cause, byOpp });
      if (reacted) return;          // negated
      p.trust -= amt;
    }

    // Class Ring (pass on 2+) buff and The Safe (must roll 6) debuff override the threshold.
    effPassOn(p, base) {
      let v = base || 5;
      if (p._ringTurns > 0) v = Math.min(v, 2);
      if (p._forcePassOn) v = Math.max(v, p._forcePassOn);
      return v;
    }
    // Pooled Leadership Model: when a player gains Trust, opponents holding it gain +1 Juice.
    gainTrust(p, amt) {
      if (amt <= 0) { p.trust += amt; return; }
      p.trust += amt;
      for (const r of this.alive_players()) if (r !== p && r.hasConstant('CONSTANT_OPP_GAIN_TRUST_JUICE1')) r.juice += 1;
    }
    // Effective Clean count for victory, folding in character/scoring abilities.
    victoryCleanCount(p) {
      let base = p.clean_count();
      // Vonda Vouch — The Stamp: 2 face-up Dirty count as 1 Clean, IF no face-down Assets in the lineup.
      if (p.abilityName === 'Vonda Vouch' && p.facedown_count() === 0) base += Math.floor(p.faceup_dirty().length / 2);
      // Endgame Stock Buy: at scoring, a lone Clean counts as 2 if you hold the card and have <3 Risk.
      if (base === 1 && p.risk < 3 && p.hand.some(c => c.fx === 'ENDGAME_STOCK_BUY')) return 2;
      return base;
    }

    async trust_check(p, pass_on) {
      pass_on = this.effPassOn(p, pass_on || 5);
      let roll = this.rng.randint(1, 6);
      let ok = roll >= pass_on;
      if (!ok) {
        // failed-trust-check reactions (re-roll / phantom)
        const r = await this.offerReaction('failedTrustCheck', { player: p, pass_on });
        if (r === 'reroll') { roll = this.rng.randint(1, 6); ok = roll >= pass_on; if (ok) return true; }
        else if (r === 'phantom') { p.juice += 2; this.log(`    ${p.name} Phantom Holdings: +2 Juice, ignores the Risk`); return false; }
        // Benchmark floor (L4): rock-bottom (Juice ≤ 0) gets one Grace per turn so a fail can't compound you into burnout
        if (this.rules.floor && p.juice <= 0 && !p._graceUsed) { p._graceUsed = true; this.log(`    Grace Period (Benchmark): ${p.name} is already in the hole — failed check adds no Risk`); return false; }
        this.add_risk(p, 1, 'failed Trust Check');
        if (p.hasConstant('CONSTANT_FAIL_TRUSTCHECK_RISK2')) this.add_risk(p, 1, 'Toxic Asset (extra Risk on fail)');
      }
      return ok;
    }

    // Character/ability-aware Lounge & eviction Trust Check (Benchmark charAwareTrust). Mirrors trust_check's
    // roll + failure machinery — effPassOn (Class Ring pass-on-2 / The Safe roll-6), the reroll / Phantom
    // Holdings reactions, the Benchmark floor grace, and the Raptor Leasing +2 fail penalty — but leaves the
    // SUCCESS action (enter the Lounge / stay) to the caller so each site keeps its own consequence.
    // applyFailRisk=false: the caller's fail consequence is NOT a Risk hit (collapse eviction boots to START),
    // so skip the +1 Risk / Raptor / floor and just report the pass/fail of the roll (still honoring effPassOn
    // + a reroll reaction). Returns true iff the check passes.
    async charTrustResolve(p, base_pass_on, failCause, applyFailRisk = true) {
      const pass_on = this.effPassOn(p, base_pass_on);
      let roll = this.rng.randint(1, 6);
      this.emit('trustCheck', { player: p.name, roll, pass: roll >= pass_on, need: pass_on });
      if (roll >= pass_on) return true;
      const r = await this.offerReaction('failedTrustCheck', { player: p, pass_on });
      if (r === 'reroll') { roll = this.rng.randint(1, 6); if (roll >= pass_on) return true; }
      else if (r === 'phantom') { p.juice += 2; this.log(`    ${p.name} Phantom Holdings: +2 Juice, ignores the penalty`); return false; }
      if (!applyFailRisk) return false;
      if (this.rules.floor && p.juice <= 0 && !p._graceUsed) { p._graceUsed = true; this.log(`    Grace Period (Benchmark): ${p.name} is already in the hole — failed check adds no Risk`); return false; }
      this.add_risk(p, 1, failCause);
      if (p.hasConstant('CONSTANT_FAIL_TRUSTCHECK_RISK2')) this.add_risk(p, 1, 'Toxic Asset (extra Risk on fail)');
      return false;
    }

    add_risk(p, amt, why) {
      if (amt <= 0) { p.risk = Math.max(0, p.risk + amt); return; }
      p.risk += amt;
      if (p.hasConstant('CONSTANT_RISK_GIVES_HYPE')) {
        p.hype += amt;
        this.log(`    ${p.name} Toxic Merger: +${amt} Hype from risk gain`);
      }
      if (p.risk >= BURNOUT_RISK) this.burnout(p);
    }
    // Spending a Bribe ALWAYS costs the user +2 Risk (rule sheet BRIBES: "...BUT add +2 Risk"). Lore-driven:
    // even one Bribe pushes your threshold toward being "discovered," so burnout looms — the desperate /
    // lean-into-crime play. [BENCHMARK] faithfulCards; Classic keeps the frozen (risk-free) reference.
    // (Buying a Bribe for 3 Juice is Risk-free — the Risk lands when you USE it. Cards that redirect the
    // Bribe's penalty, e.g. Asset in Transit, handle their own Risk and don't route through here.)
    spendBribe(p) { p.bribes -= 1; p.ff_bribe_used += 1; if (this.rules.faithfulCards) this.add_risk(p, 2, 'used a Bribe (+2 Risk)'); }
    burnout(p) {
      if (p.burned) return;
      p.burned = true; p.ff_burnout += 1;
      p.lineup = p.lineup.filter(t => t.card.undiscardable);
      p.trust = 0; p.bribes = 0; p.risk = 5; p.juice = 1;
      this.log(`    !! BURNOUT ${p.name} -> risk 5, juice 1, assets/trust/bribes wiped (undiscardables kept)`);
      this.emit('burnout', { player: p.name });
    }

    alive_players() { return this.players.filter(p => p.alive); }
    others_of(p) { return this.alive_players().filter(x => x !== p); }
    highest_trust() { const a = this.alive_players(); if (!a.length) return null; return a.reduce((m, x) => x.trust > m.trust ? x : m); }
    highest_juice() { const a = this.alive_players(); if (!a.length) return []; const m = Math.max(...a.map(x => x.juice)); return a.filter(x => x.juice === m); }

    async pick_target(actor, others, ctx, hostileSrc) {
      if (!others.length) return null;
      const tgt = await this.decide(actor, { kind: 'target', candidates: others, others, ctx });
      if (!tgt) return null;
      // faithful: a HOSTILE targeted effect opens the 'targeted' reaction window — Friendly Audit (reverse)
      // and On a Technicality (ignore) can ward it off. Returning null wards the effect (callers guard on it).
      if (hostileSrc && this.rules.faithfulCards) {
        const res = await this.checkTargeted(tgt, hostileSrc, actor);
        if (res === 'ignored' || res === 'reversed') {
          if (res === 'reversed') this.add_risk(actor, 1, `${hostileSrc.name} reversed onto its source`);   // Friendly Audit turns it back on you
          if (res === 'ignored') await this.technicalityPrice(actor, hostileSrc);                            // On a Technicality: the source pays
          return null;
        }
      }
      // Iron-Clad Purchase Agreement: gain +1 Juice whenever targeted by an opponent's effect.
      if (tgt !== actor && tgt.hasConstant('CONSTANT_TARGETED_JUICE1')) tgt.juice += 1;
      return tgt;
    }
    /** Ask a HUMAN which Asset an effect lands on; bots keep the legacy [0] pick.
     *  Parity-safe by construction: no decide() call happens unless a human is seated, so bot games
     *  and the golden master are untouched. `actor` is whoever the printed text says chooses — which
     *  is not always the owner (Walking the Walk: "of YOUR choice" = the caster). */
    async pickOrDefault(actor, pool, ctx) {
      if (!pool.length) return null;
      if (!(this.rules.faithfulCards && actor.isHuman)) return pool[0];
      return (await this.pick_asset(actor, pool, ctx)) || pool[0];
    }
    async pick_asset(actor, candidates, ctx) {
      if (!candidates.length) return null;
      return await this.decide(actor, { kind: 'asset', candidates, ctx });
    }

    _discard_asset(q, tup) {
      const i = q.lineup.indexOf(tup);
      if (i >= 0 && !tup.card.undiscardable) {
        q.lineup.splice(i, 1);
        this.discards[this._discard_key(tup.card)].push(tup.card);
        if (!q.effDirty(tup)) {
          for (const r of this.alive_players())
            if (r !== q && r.hasConstant('CONSTANT_OPP_DISCARD_CLEAN_JUICE1')) r.juice += 1;
        }
        return true;
      }
      return false;
    }
    _discard_key(c) { return ({ AdvMarket: 'Market', AdvAsset: 'Asset', ShadowSEC: 'SEC' })[c.deck] || c.deck; }
    after_sec_draw(card) {
      if (this.expansion && card.deck === 'ShadowSEC') this.raise_shadow_sec(1, `Shadow SEC card drawn (${card.name})`);
    }

    // ============== REACTION STACK ==============
    // Offer a window to any player holding a card that responds to `trigger`. Resolve inner-first
    // (we offer in turn order from the trigger; first responder resolves, then we re-scan).
    async offerReaction(trigger, ctx) {
      const fxs = REACTS[trigger]; if (!fxs) return false;
      const order = this.alive_players();
      for (const q of order) {
        if (ctx.player === q && (trigger === 'wouldLoseTrust' || trigger === 'failedTrustCheck' || trigger === 'wouldLoseDirty')) {
          // self-reactions are valid for these
        } else if (trigger === 'targeted' && q !== ctx.player) {
          continue;  // only the targeted player may use targeted reactions
        } else if ((trigger === 'wouldLoseTrust' || trigger === 'failedTrustCheck' || trigger === 'wouldLoseDirty') && q !== ctx.player) {
          continue;  // these protect the affected player only
        }
        // find an eligible card in hand or lineup
        const fromHand = q.hand.find(c => fxs.includes(c.fx));
        const fromLine = q.lineup.find(t => fxs.includes(t.card.fx));
        const card = fromHand || (fromLine && fromLine.card);
        if (!card) continue;
        const want = await this.decide(q, { kind: 'react', card, trigger, ctx });
        if (!want) continue;
        // consume the card
        if (fromHand) q.hand.splice(q.hand.indexOf(card), 1);
        else this._discard_asset_entry_silent(q, fromLine);
        this.discards[this._discard_key(card)].push(card);
        this.log(`    ${q.name} reacts with ${card.name}`);
        this.emit('react', { player: q.name, card: card.name, trigger });
        const res = await this._applyReaction(card.fx, q, ctx);
        return res === undefined ? true : res;
      }
      return false;
    }
    _discard_asset_entry_silent(q, tup) { const i = q.lineup.indexOf(tup); if (i >= 0) q.lineup.splice(i, 1); }

    async _applyReaction(fx, q, ctx) {
      switch (fx) {
        case 'MANUAL_TRUSTFALL':       if (ctx.byOpp) { ctx.byOpp.hype = 0; this.log(`    Trust Fall: ${ctx.byOpp.name} dropped to 0 Hype`); } return true;
        case 'MANUAL_RESTRUCTURE':     { const c = this.draw('Market'); if (c) q.hand.push(c); return this.rules.faithfulCards ? false : true; }   // faithful: "SUBTRACT the Trust, draw a Market card" — the loss still happens (return false = not negated)
        case 'MANUAL_REROLL':          return 'reroll';
        case 'MANUAL_PHANTOM':         return 'phantom';
        case 'MANUAL_TECHNICALITY':    ctx.ignored = true; return true;     // effect source pays (handled by caller)
        case 'MANUAL_REVERSE':         ctx.reversed = true; return true;
        case 'MANUAL_CONTROLLED_BURN': {  // +1 Hype; the threatened Dirty leaves you and lands on an opponent
          q.hype += 1; ctx.kept = true;
          if (ctx.asset) {
            const i = q.lineup.indexOf(ctx.asset); if (i >= 0) q.lineup.splice(i, 1);
            const opps = this.others_of(q);
            if (opps.length) { const tgt = await this.pick_target(q, opps, 'controlled-burn'); tgt.lineup.push(this.mkEntry(ctx.asset.card, true, true)); }
          }
          return true;
        }
        case 'MANUAL_INTERCEPT': {  // steal the clean asset to hand, +2 Risk (Bribe shifts to opp)
          if (ctx.asset && ctx.actor) {
            const i = ctx.actor.lineup.indexOf(ctx.asset);
            if (i >= 0) ctx.actor.lineup.splice(i, 1);
            q.hand.push(ctx.asset.card); q.ff_stole_asset += 1; ctx.intercepted = true;
            if (q.bribes > 0) { q.bribes -= 1; q.ff_bribe_used += 1; this.add_risk(ctx.actor, 2, 'Asset in Transit (bribe-shifted)'); }
            else this.add_risk(q, 2, 'Asset in Transit');
          }
          return true;
        }
        case 'MANUAL_COUNTERPARTY': {  // opp discards the clean asset + draws SEC
          if (ctx.asset && ctx.actor) {
            this._discard_asset(ctx.actor, ctx.asset); ctx.intercepted = true;
            const c = this.draw('SEC'); if (c) { await this.resolve_card(c, ctx.actor, this.others_of(ctx.actor)); this.after_sec_draw(c); }
          }
          return true;
        }
        default: return true;
      }
    }

    // Discard a Dirty asset, first offering its owner the Controlled Burn reaction window.
    async loseDirtyAsset(q, t) {
      if (!t) return;
      const ctx = { player: q, asset: t };
      await this.offerReaction('wouldLoseDirty', ctx);
      if (ctx.kept) return;            // Controlled Burn rerouted it to an opponent
      this._discard_asset(q, t);
    }

    // A targeted MANUAL effect calls this first; returns 'ok' | 'ignored' | 'reversed'.
    // On a Technicality's second sentence: "If the effect was initiated by a PLAYER-CONTROLLED ASSET,
    // controlling player must discard that Asset OR gain +2 Risk." So it only bites when the effect came
    // off an Asset sitting in the actor's Lineup — a card played straight from hand isn't player-controlled
    // in play, and costs its caster nothing. The actor chooses which way to pay.
    async technicalityPrice(actor, srcCard) {
      if (!actor || !srcCard || !this.rules.faithfulCards) return;
      const entry = actor.lineup.find(t => t.card === srcCard);
      if (!entry) return;                       // not an in-play Asset — no price to pay
      if (entry.card.undiscardable) { this.add_risk(actor, 2, `${srcCard.name} ignored on a technicality`); return; }
      const pick = await this.decide(actor, { kind: 'chooseOr', title: 'On a Technicality',
        a: `Discard ${srcCard.name}`, b: 'Take +2 Risk', bCls: 'no' });
      if (pick === 'b') { this.add_risk(actor, 2, `${srcCard.name} ignored on a technicality`); }
      else { this._discard_asset(actor, entry); this.log(`    On a Technicality: ${actor.name} discards ${srcCard.name}`); }
    }

    async checkTargeted(target, srcCard, actor) {
      const ctx = { player: target, srcCard, actor };
      await this.offerReaction('targeted', ctx);
      if (ctx.ignored) { this.log(`    ${target.name} ignores ${srcCard.name} on a technicality`); return 'ignored'; }
      if (ctx.reversed) { this.log(`    ${target.name} reverses ${srcCard.name} (Friendly Audit)`); return 'reversed'; }
      return 'ok';
    }

    // ============== CARD RESOLUTION ==============
    async resolve_card(card, p, others) {
      // Benchmark edition may give a card a sharper job (Classic always uses the printed fx)
      const fx = (this.edition === 'benchmark' && BENCHMARK_FX[card.name]) || card.fx;
      const R = this.rng;
      const alive = () => this.alive_players();
      const D = (q, t) => this._discard_asset(q, t);
      const lt = (q, amt, why, by) => this.lose_trust(q, amt, why, by);
      if (fx.startsWith('MANUAL')) return await this._resolveManual(card, p, others);
      switch (fx) {
        case 'ALL_JUICE-1_TRUSTCHECK_FAILHYPE': for (const q of alive()) { q.juice -= 1; if (!(await this.trust_check(q))) q.hype -= 2; } break;
        case 'ALL_DISCARD_ELSE_RISK1': for (const q of alive()) { if (q.hand.length) q.hand.splice(R.randrange(q.hand.length), 1); else this.add_risk(q, 1, 'Audit Panic'); } break;
        case 'ROLL_SELF_OR_ALL_TRUST2': if (R.randint(1, 6) <= 3) await lt(p, 2, 'CEO Forfeits'); else for (const q of alive()) await lt(q, 2, 'CEO Forfeits'); break;
        case 'ALL_HYPE-2_DIRTY_DISCARD': for (const q of alive()) { q.hype -= 2; if (q.faceup_dirty().length) { if (this.rules.faithfulCards && q.isHuman) { const a = await this.pick_asset(q, q.lineup.slice(), 'compliance-sweep'); if (a) this._discard_asset(q, a); else await this.loseDirtyAsset(q, q.faceup_dirty()[0]); } else await this.loseDirtyAsset(q, q.faceup_dirty()[0]); } } break;   // faithful: discard an Asset of THEIR choice
        case 'ALL_REVEAL_0ASSET_RISK-1': for (const q of alive()) { this.learnAll(q.lineup.filter(t => !t.up).map(t => t.card), q, 'Counting Sheep'); if (q.asset_count() === 0) this.add_risk(q, -1); } break;   // the reveal is the card's whole first sentence
        case 'RISK3PLUS_JUICE-3': for (const q of alive()) if (q.risk >= 3) q.juice -= 3; break;
        case 'TRUST0_RISK+3': for (const q of alive()) if (q.trust <= 0) this.add_risk(q, 3, 'Fake Receipts'); break;
        case 'ALL_DISCARD_ELSE_TRUST-1': for (const q of alive()) { if (q.hand.length) q.hand.splice(R.randrange(q.hand.length), 1); else await lt(q, 1, 'Document Request'); } break;
        case 'ALL_DRAW_SEC': { let ord = alive(); if (this.rules.faithfulCards) { const b = alive(), si = b.indexOf(p); if (si > 0) ord = b.slice(si).concat(b.slice(0, si)); } for (const q of ord) { const c = this.draw('SEC'); if (c) { await this.resolve_card(c, q, alive().filter(x => x !== q)); this.after_sec_draw(c); } } break; }   // faithful: initiate with the drawer
        case 'ALL_JUICE-2': for (const q of alive()) q.juice -= 2; break;
        case 'ALL_HYPE+2': for (const q of alive()) q.hype += 2; break;
        case 'HYPE4_TRUST-2_ELSE_DISCARD_OR_RISK2': for (const q of alive()) { if (q.hype >= 4) await lt(q, 2, 'Mark to Mayhem'); else if (this.rules.faithfulCards && q.isHuman && q.lineup.length) { const pick = await this.decide(q, { kind: 'chooseOr', title: 'Mark to Mayhem', a: 'Discard an in-play Asset', b: 'Take +2 Risk', bCls: 'no' }); if (pick === 'b') this.add_risk(q, 2, 'Mark to Mayhem'); else { const a = await this.pick_asset(q, q.lineup.slice(), 'mayhem'); if (a) D(q, a); else this.add_risk(q, 2, 'Mark to Mayhem'); } } else { if (q.lineup.length) D(q, q.lineup[0]); else this.add_risk(q, 2, 'Mark to Mayhem'); } } break;
        case 'ASSET2_HYPE-2_THEN_0DISCARD': for (const q of alive()) if (q.asset_count() >= 2) { const h0 = q.hype; q.hype -= 2; const brought = this.rules.faithfulCards ? (h0 > 0 && q.hype <= 0) : (q.hype <= 0); if (brought && q.lineup.length) D(q, q.lineup[0]); } break;   // faithful: "if this loss BRINGS any player to 0 Hype" — it must CROSS, not already be there
        case 'CLEAN_DISCARD_ELSE_0ASSET_HYPE2': for (const q of alive()) { if (q.faceup_clean().length) { if (this.rules.faithfulCards && q.isHuman && q.hand.length) { const pick = await this.decide(q, { kind: 'chooseOr', title: 'Marked Livestock', a: 'Discard a card from hand', b: 'Discard an in-play Clean Asset' }); if (pick === 'b') D(q, q.faceup_clean()[0]); else { const c = q.hand.splice(0, 1)[0]; this.discards[this._discard_key(c)].push(c); } } else if (q.hand.length) q.hand.splice(R.randrange(q.hand.length), 1); else D(q, q.faceup_clean()[0]); } else if (q.asset_count() === 0) q.hype += 2; } break;
        case 'HIGHEST_TRUST_SKIP': { const t = this.highest_trust(); if (t) t.skip_next = true; break; }
        case 'ALL_RISK1_UNLESS_MARKET_DISCARD': for (const q of alive()) { const md = q.hand.filter(c => c.deck === 'Market' || c.deck === 'AdvMarket'); if (md.length) q.hand.splice(q.hand.indexOf(md[0]), 1); else this.add_risk(q, 1, 'Regulatory Blitz'); if (q.hype >= 4) this.add_risk(q, 1, 'Blitz hype'); } break;
        case 'SELF_0FACEDOWN_RISK-1': if (p.facedown_count() === 0) this.add_risk(p, -1); break;
        case 'ALL_JUICE2_RISK2': for (const q of alive()) { q.juice += 2; const bb = q.ff_burnout; this.add_risk(q, 2, 'Rolling Blackouts'); if (this.rules.faithfulCards && q.ff_burnout > bb) q.juice = 2; } break;   // faithful: if this causes BURNOUT, start with 2 Juice (not 1)
        case 'HIGHEST_TRUST_DISCARD_CLEAN_ELSE_SKIP_OTHERS_RISK-1': { const t = this.highest_trust(); if (t) { if (t.faceup_clean().length) D(t, t.faceup_clean()[0]); else t.skip_next = true; for (const q of alive()) if (q !== t) this.add_risk(q, -1); } break; }
        case 'ASSET3_RISK+3': for (const q of alive()) if (q.asset_count() >= 3) this.add_risk(q, 3, 'Senate Hearing'); break;
        case 'ALL_ROLL_DISCARD_HAND_OR_ASSET': for (const q of alive()) if (q.hand.length) { if (R.randint(1, 6) <= 4) q.hand.splice(R.randrange(q.hand.length), 1); else if (q.lineup.length) D(q, q.lineup[0]); else if (q.asset_count() === 0) this.add_risk(q, 2, 'Spreadsheet'); } break;
        case 'SHIFT_RISK_ELSE_TRUST-1': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { if (this.rules.faithfulCards) { const shift = Math.min(1, Math.max(0, p.risk)); this.add_risk(p, -shift); this.add_risk(tgt, shift, 'Token Diversion'); } else { this.add_risk(p, -1); this.add_risk(tgt, 1, 'Token Diversion'); } } } if (p.bribes === 0) await lt(p, 1, 'Token Diversion'); break;   // faithful: SHIFT risk (don't create it) + wardable
        case 'SELF_RISK_PER_DIRTY': { const per = (this.rules.faithfulCards && p.ff_bribe_used > 0) ? 2 : 1; this.add_risk(p, p.faceup_dirty().length * per, 'What the Hell'); break; }   // faithful: +2/Asset if you have used a Bribe
        case 'SELF_JUICE1': p.juice += 1; break;
        case 'GOLDEN_PARACHUTE': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { if (this.rules.faithfulCards) p.juice -= 3; tgt.juice += 3; const gone = await this.pickOrDefault(tgt, tgt.lineup.slice(), 'golden-parachute'); if (gone) D(tgt, gone); } } break;   // printed: "discard an Asset of THEIR choice"   // faithful: YOU give them the 3 Juice
        case 'JUICE_TANKER': { const roll = R.randint(1, 6); p.juice += roll; if (roll <= 2) { for (const t of p.lineup) if (t.card === card) { t.up = true; t.dirty = true; } this.log(`    Juice Tanker broke (rolled ${roll}) -> dead Dirty Asset`); } break; }
        case 'JUNK_VEHICLE': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { tgt._junk_tax_pending = true; this.log(`    Junk Vehicle Trust: ${tgt.name} pays 2 Juice/space on their next turn`); } } break;
        case 'STAKEHOLDER_SUMMIT': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { if (tgt.hype > 0) { tgt.hype -= 1; p.hype += 1; } else this.add_risk(tgt, 1, 'Stakeholder Summit'); } } break;
        case 'THE_SAFE': { const stair = others.filter(q => q.pos === 'START' || LOUNGE_EXITS.has(q.pos)); const pool = this.rules.faithfulCards ? stair : others; if (pool.length) { const tgt = await this.pick_target(p, pool, undefined, card); if (tgt) { tgt._safe_pending = 6; this.log(`    The Safe: ${tgt.name} must roll a 6 to pass any Trust Check next turn`); } } break; }   // faithful: only an opponent ON a Golden Staircase
        case 'BEARS': { if (p.facedown_count() >= 2) p.juice += 3; const cl = p.hand.filter(c => c.ctype === 'Clean'); if (cl.length) { this.add_risk(p, 2, 'Bears'); p.hand.splice(p.hand.indexOf(cl[0]), 1); } break; }
        case 'BULLS': if (p.asset_count() >= 2) { p.juice += 3; if (p.juice >= 8) { const c = this.draw('SEC'); if (c) { await this.resolve_card(c, p, others); this.after_sec_draw(c); } } } break;
        case 'EXEC_BACKPAT': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { if (tgt.trust > 0) { await lt(tgt, 1, 'Exec Back-Pat', p); this.gainTrust(p, 1); } if (tgt.hype > 0) { tgt.hype -= 1; p.hype += 1; } } } break;
        case 'JUICE_SPLIT': if (others.length) (await this.pick_target(p, others)).juice += 1; p.juice += 1; break;
        case 'LATE_DISCLOSURE': this.learnAll(p.hand, p, 'Late Disclosure'); if (p.hand.length === 0) for (const q of others) this.add_risk(q, 1, 'Late Disclosure'); break;   // you show your whole hand — that IS the card
        case 'PIGS': if (p.asset_count() >= 3) { const tgt = p.faceup_clean().length ? p.faceup_clean()[0] : p.lineup[0]; D(p, tgt); await lt(p, 1, 'Pigs Get Slaughtered'); } break;
        case 'PUMP_DITCH': if (p.lineup.length) { D(p, p.lineup[0]); p.hype += 3; } break;
        case 'SHORT_SELLER': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { tgt.juice -= 1; p.juice += 1; if (!(await this.trust_check(tgt))) this.add_risk(tgt, 2, 'Short-Seller'); } } break;
        case 'STOCK_INFLATE': p.hype *= 2; await lt(p, 1, 'Stock Inflation'); break;
        case 'TOWER_TOUR': p.pos = 'START'; p.in_lounge = false; break;
        case 'TRADING_WEATHER': if (R.randint(1, 6) >= 4) for (const q of alive()) q.juice += 2; else for (const q of alive()) this.add_risk(q, 1, 'Trading Weather'); break;
        case 'TRUST_OPTION_ROLLOVER': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { const shift = this.rules.faithfulCards ? Math.min(1, Math.max(0, p.risk)) : 1; this.add_risk(p, -shift); this.add_risk(tgt, shift, 'Rollover'); } } break;   // faithful: TRANSFER Risk, same as Token Diversion
        case 'WALKING_WALK': { const fd = others.filter(q => q.facedown_count() > 0); if (fd.length) { const tgt = await this.pick_target(p, fd, undefined, card); if (tgt) { const a = await this.pickOrDefault(p, tgt.lineup.filter(t => !t.up), 'walking-walk'); if (a) D(tgt, a); } } break; }   // "of YOUR choice" — the CASTER picks, blind unless they've seen it
        case 'STOCK_BACK': { const dpile = this.discards['Asset']; const cleans = dpile.filter(c => c.ctype === 'Clean'); if (cleans.length) { const c = cleans[cleans.length - 1]; dpile.splice(dpile.indexOf(c), 1); p.hand.push(c); this.log(`    We're Gonna Get the Stock Back! recovers ${c.name}`); } break; }
        case 'CLASS_RING': p._ringTurns = 2; this.log(`    Class Ring: your Trust Checks pass on 2+ (this turn + your next)`); break;
        case 'ENDGAME_STOCK_BUY': break;  // scoring card — stays in hand (HOLD_IN_HAND); see victoryCleanCount
        case 'COMPLIANCE_DIVIDEND': { if (this.rules.faithfulCards) { const victims = others.filter(q => q.lineup.some(t => t.up)); if (victims.length) { const tgt = await this.pick_target(p, victims, undefined, card); if (tgt) { const fu = tgt.lineup.filter(t => t.up); const a = (await this.pick_asset(p, fu, 'compliance-dividend')) || fu[0]; if (a) { a.mods.push({ tag: 'conditional', noeffect: true, turns: Infinity, src: card.name }); this.log(`    Compliance Dividend: ${tgt.name}'s Asset is now Conditional (effects off)`); } } } } else { const t = p.faceup_dirty()[0]; if (t) { t.mods.push({ tag: 'clean', noeffect: true, turns: Infinity, src: card.name }); this.log(`    Compliance Dividend: a Dirty Asset now counts Clean (effects off)`); } } break; }   // faithful: sabotage an OPPONENT'S Asset (Conditional), not launder your own; printed "CHOOSE 1 opponent-held Asset" -> the CASTER picks
        case 'BUZZ_BOMB': p.hype += 3; if (p.hype >= MAX_HYPE) { const c = this.draw('SEC'); if (c) { await this.resolve_card(c, p, others); this.after_sec_draw(c); } } break;
        case 'MOTHBALL': { p.hype += 2; if (this.rules.faithfulCards) { const pool = []; for (const q of alive()) for (const t of q.lineup) if (t.up) pool.push(t); if (pool.length) { const pick = await this.decide(p, { kind: 'asset', candidates: pool, ctx: 'mothball' }); const a = pool.includes(pick) ? pick : pool[0]; a.mods.push({ tag: 'dirty', turns: Infinity, src: card.name }); this.log(`    Int'l Moth-Ball: an Asset now counts DIRTY (effects still on)`); } } break; }   // faithful: +2 Hype AND mark any face-up Asset Dirty
        case 'FAVOR_SQUEEZE': { const t = this.highest_trust(); if (t) { if (this.rules.faithfulCards) { const top = this.alive_players().filter(q => q.trust === t.trust); for (const q of top) q.juice -= 1; if (top.length > 1) for (const q of top) q.trust -= 1; } else t.juice -= 1; } break; }   // faithful: on a tie, tied leaders ALSO lose -1 Trust
        case 'HOT_MIC': for (const q of alive()) { if (!q.hand.length) this.add_risk(q, 1, 'Hot Mic'); else if ((this.revealFromHand(q, 'Hot Mic'), this.rules.faithfulCards && q.hand.every(c => c.ctype === 'Dirty'))) { const d = q.hand[0]; q.hand.splice(0, 1); this.discards[this._discard_key(d)].push(d); this.log(`    Hot Mic: ${q.name} can only reveal a Dirty Asset -> discarded`); } } break;   // faithful: a revealed Dirty Asset must be discarded (a rational reveal avoids it unless all-Dirty)
        case 'KAHLEEFORNYUH': for (const q of alive()) { const had = q.lineup.length; let wasDirty = false; if (had) { const t = await this.pickOrDefault(q, q.lineup.slice(), 'kah-lee-for-nyuh'); wasDirty = q.effDirty(t); D(q, t); } if (this.rules.faithfulCards && (!had || wasDirty)) { const sc = this.draw('SEC'); if (sc) { await this.resolve_card(sc, q, alive().filter(x => x !== q)); this.after_sec_draw(sc); } } } break;   // faithful: discard Dirty or no Asset -> draw+resolve an SEC card
        case 'LIMITED_HANGOUT': if (p.hype >= 4 && others.length) { p.hype -= 4; const tgt = await this.pick_target(p, others, undefined, card); if (tgt) {
          const cleans = tgt.faceup_clean();
          let takeTrust = !cleans.length;
          if (cleans.length && this.rules.faithfulCards && tgt.isHuman) {
            const pick = await this.decide(tgt, { kind: 'chooseOr', title: 'Limited Hangout', a: 'Discard a Clean Asset', b: 'Lose 2 Trust', bCls: 'no' });
            takeTrust = (pick === 'b');
          }
          if (takeTrust) await lt(tgt, 2, 'Limited Hangout', p);
          else { const a = await this.pickOrDefault(tgt, cleans, 'limited-hangout'); if (a) D(tgt, a); }
        } } break;
        // printed: "They must give you a Clean Asset from their hand to yours. OR They lose -2 Trust
        // and IMMEDIATELY must draw and resolve an SEC card." The TARGET picks which fate; it was an
        // automatic branch on whether they happened to hold a Clean card.
        case 'PARKING_LOT': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) {
          const ch = tgt.hand.filter(c => c.ctype === 'Clean');
          let handOver = ch.length > 0;
          if (handOver && this.rules.faithfulCards && tgt.isHuman) {
            const pick = await this.decide(tgt, { kind: 'chooseOr', title: 'The Parking Lot Encounter',
              a: 'Hand over a Clean Asset', b: 'Lose 2 Trust + draw an SEC card', bCls: 'no' });
            handOver = (pick !== 'b');
          }
          if (handOver) { const give = ch[0]; tgt.hand.splice(tgt.hand.indexOf(give), 1); p.hand.push(give); }
          else { await lt(tgt, 2, 'Parking Lot', p); const c = this.draw('SEC'); if (c) { await this.resolve_card(c, tgt, alive().filter(x => x !== tgt)); this.after_sec_draw(c); } }
        } } break;
        case 'PULL_TAPE': { const fd = others.filter(q => q.facedown_count() > 0); if (fd.length) { const tgt = await this.pick_target(p, fd, undefined, card); if (tgt) { const a = await this.pickOrDefault(tgt, tgt.lineup.filter(t => !t.up), 'pull-the-tape'); if (a) D(tgt, a); } } break; }   // no "of your choice" on this one — the TARGET picks which to lose (cf. Walking the Walk)
        case 'REG_CAPTURE': if (this.collapsed) { const c = this.draw('SEC'); if (c) { await this.resolve_card(c, p, others); this.after_sec_draw(c); } } else this.global_sec = Math.max(0, this.global_sec - 1); break;
        case 'THROW_UNDER_BUS': for (const q of others) { q.hype += 2; if (q.hype >= MAX_HYPE) this.gainTrust(q, 1); } break;
        case 'WHISPERS_ELEVATOR': for (const q of alive()) { if (!q.hand.length) this.add_risk(q, 1, 'Whispers'); else if ((this.revealFromHand(q, 'Whispers in the Elevator'), this.rules.faithfulCards && q.hand.every(c => c.ctype === 'Dirty'))) this.add_risk(q, 1, 'Whispers (forced to reveal a Dirty Asset)'); } this.raise_shadow_sec(1, 'Whispers in the Elevator (+1 Shadow)'); break;   // faithful: reveal a Dirty Asset -> +1 Risk too
        case 'BACKDATED_GOODWILL': p.hype += 1; for (const q of others) await lt(q, 1, 'Backdated Goodwill', p); break;
        case 'MEMORY_HOLE': if (p.hand.length) { if (this.rules.faithfulCards) for (const hc of p.hand) this.discards[this._discard_key(hc)].push(hc); p.hand = []; } else p.hype -= 2; break;   // faithful: dumped hand returns to the discard piles
        case 'EXEC_RETREAT': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) this.add_risk(tgt, tgt.faceup_dirty().length, 'Exec Retreat'); } break;
        case 'HYPE_LOOP': { const h0 = p.hype; p.hype += p.asset_count(); const crossed = this.rules.faithfulCards ? (h0 < 8 && p.hype >= 8) : (p.hype >= 8); if (crossed) p.juice += 2; this.raise_shadow_sec(1, 'Hype Loop (+1 Shadow)'); break; }   // faithful: "if THIS CARD results in 8+ Hype" — not if you were already there (with 0 Assets it does nothing at all)
        case 'INHOUSE_AUDIT': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) tgt.skip_next = true; } break;
        case 'LEADERSHIP_THEATRE': for (const q of others) await lt(q, 1, 'Leadership Theatre', p); p.juice += 1; p.hype += 1; break;
        case 'MANDATORY_CLAUSE': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) {
          const discardAsset = () => { const t = tgt.lineup[0]; if (tgt.effDirty(t)) this.gainTrust(p, 1); D(tgt, t); };
          const discardMkt = () => { const md = tgt.hand.filter(c => c.deck === 'Market' || c.deck === 'AdvMarket'); if (md.length) tgt.hand.splice(tgt.hand.indexOf(md[0]), 1); };
          const hasMkt = tgt.hand.some(c => c.deck === 'Market' || c.deck === 'AdvMarket');
          if (this.rules.faithfulCards && tgt.isHuman && hasMkt && tgt.lineup.length) {   // the TARGET chooses which to shed
            const pick = await this.decide(tgt, { kind: 'chooseOr', title: 'Mandatory Clause', a: 'Discard a Market card from hand', b: 'Discard an in-play Asset' });
            if (pick === 'b') discardAsset(); else discardMkt();
          } else if (hasMkt) discardMkt(); else if (tgt.lineup.length) discardAsset();
        } } break;
        case 'NARRATIVE_RESTATEMENT': for (const q of others) { const h0 = q.hype; q.hype -= 3; const brought = this.rules.faithfulCards ? (h0 > 0 && q.hype <= 0) : (q.hype <= 0); if (brought) p.juice += 3; } break;   // faithful: "if this RESULTS IN a player going to 0 or negative" — must cross. (Open: printed reads singular "a player"; we still pay PER opponent brought down — see the audit doc.)
        case 'REDACTED_EARNINGS': for (const q of alive()) { const dirties = this.rules.faithfulCards ? q.lineup.filter(t => q.effDirty(t)) : q.faceup_dirty(); if (dirties.length) await this.loseDirtyAsset(q, dirties[0]); else q.juice += 2; } this.raise_shadow_sec(1, 'Redacted Earnings Memo (+1 Shadow)'); break;   // faithful: a face-DOWN Dirty also counts (only Clean/0 Assets gets the +2 Juice)
        case 'LIQUIDITY_SINK': for (const q of this.highest_juice()) this.add_risk(q, 2, 'Liquidity Sink'); break;
        // ---- assume-stubs finished with targeting prompts ----
        case 'FOUND_FAMILY': if (p.asset_count() <= 2 && others.length) { const tgt = await this.pick_target(p, others); this.gainTrust(p, 1); this.gainTrust(tgt, 1); this.log(`    Found Family Fund: ${p.name} and ${tgt.name} both +1 Trust`); } break;
        case 'TARGET_REVEAL': if (others.length) { const tgt = await this.pick_target(p, others); this.log(`    ${card.name}: ${tgt.name} reveals to ${p.name}`);
          const fdown = tgt.lineup.filter(t => !t.up);
          this.learn(p, tgt.hand.concat(fdown.map(t => t.card)), tgt, card.name);   // PERSISTENT — you remember what you were shown
          // and show a HUMAN viewer the actual cards
          if (p.isHuman) this.emit('reveal', { by: p.name, target: tgt.name, card: card.name, hand: tgt.hand.map(c => c.name), facedown: fdown.map(t => t.card.name) }); } break;
        case 'RANK_YANK': if (others.length) { const tgt = await this.pick_target(p, others);
          if (this.rules.faithfulCards) { this.log(`    Rank and Yank: ${tgt.name} reveals ALL face-down Assets to ${p.name}`);
            const fdy = tgt.lineup.filter(t => !t.up);
            this.learn(p, fdy.map(t => t.card), tgt, 'Rank and Yank');
            if (p.isHuman) this.emit('reveal', { by: p.name, target: tgt.name, card: 'Rank and Yank', hand: [], facedown: fdy.map(t => t.card.name) });
            this._rankYankCount = (this._rankYankCount || 0) + 1; if (this._rankYankCount > 1) { tgt.hype += 2; this.log(`    Rank and Yank used again: ${tgt.name} +2 Hype`); } }
          else { if (tgt.lineup.length) D(tgt, tgt.lineup[0]); await lt(tgt, 1, 'Rank and Yank', p); } } break;   // faithful: it's a REVEAL (+2 Hype to target on re-use), not a discard
        case 'SHREDDED_AUDIT':
          if (this.rules.faithfulCards) { if (others.length) { const tgt = await this.pick_target(p, others); this.add_risk(tgt, tgt.faceup_clean().length, 'Shredded Audit'); } for (let i = p.lineup.length - 1; i >= 0; i--) if (p.lineup[i].card === card) { p.lineup.splice(i, 1); this.discards[this._discard_key(card)].push(card); break; } }
          else { for (const q of alive()) { const fd = q.lineup.filter(t => !t.up); if (fd.length) D(q, fd[0]); } }
          break;   // faithful: 1 opponent gains +1 Risk per face-up CLEAN Asset, then discard this card
        case 'FRESH_OFFSHORE': {   // "reveal and DISCARD this card to STEAL a face-down Asset from any opponent"
          for (let i = p.lineup.length - 1; i >= 0; i--) if (p.lineup[i].card === card) { p.lineup.splice(i, 1); if (this.rules.faithfulCards) this.discards[this._discard_key(card)].push(card); break; }   // the play-path put a copy in your lineup; discard it (faithful: to the pile, not void)
          const victims = others.filter(q => q.lineup.some(t => !t.up));
          if (victims.length) { const tgt = await this.pick_target(p, victims, undefined, card); if (tgt) { const fd = tgt.lineup.filter(t => !t.up);
            const a = (await this.pick_asset(p, fd, 'fresh-offshore')) || fd[0]; const i = tgt.lineup.indexOf(a);   // the THIEF chooses (blind unless they've seen it) — printed: "steal a face-down Asset"
            if (i >= 0) { tgt.lineup.splice(i, 1); p.lineup.push(a); p.ff_stole_asset += 1; this.log(`    Fresh Offshore Vehicle: ${p.name} steals a face-down Asset from ${tgt.name}`); } } }
          return;
        }
        case 'PALACE_SKY': {   // VIP staircase: enter for 0 Juice; if under threshold the Trust Check passes on 4+ (fail = +1 Risk)
          if (p.trust >= 4 || p.hype >= 8) { p.in_lounge = true; p.pos = 'LOUNGE'; this.log(`    Palace in the Sky: ${p.name} strides into the Executive Lounge`); this.emit('enter_lounge', { player: p.name }); }
          else if (this.rules.charAwareTrust) {   // Benchmark: the printed "passes on 4+, fail penalties still apply" as a real Trust Check
            if (await this.charTrustResolve(p, 4, 'Palace in the Sky failed check')) { p.in_lounge = true; p.pos = 'LOUNGE'; this.log(`    Palace in the Sky: ${p.name} passes the check -> Lounge`); this.emit('enter_lounge', { player: p.name }); }
            else this.log(`    Palace in the Sky: ${p.name} fails the check -> +1 Risk`); }
          else { const roll = R.randint(1, 6), pass = roll >= 4; this.emit('trustCheck', { player: p.name, roll, pass, need: 4 });
            if (pass) { p.in_lounge = true; p.pos = 'LOUNGE'; this.log(`    Palace in the Sky: ${p.name} passes the 4+ check (${roll}) -> Lounge`); this.emit('enter_lounge', { player: p.name }); }
            else { this.add_risk(p, 1, 'Palace in the Sky failed check'); this.log(`    Palace in the Sky: ${p.name} fails the 4+ check (${roll}) -> +1 Risk`); } }
          break;
        }
        case 'QUICK_RINSE': { const t = await this.pickOrDefault(p, p.faceup_dirty(), 'quick-rinse'); if (t) { t.mods.push({ tag: 'clean', turns: Infinity, src: card.name }); this.log(`    Quick Rinse: a Dirty Asset now counts CLEAN`); } if (this.rules.faithfulCards) { for (let i = p.lineup.length - 1; i >= 0; i--) if (p.lineup[i].card === card) { p.lineup.splice(i, 1); this.discards[this._discard_key(card)].push(card); break; } } break; }   // faithful: Quick Rinse is a retag overlay, not a duplicate Asset
        case 'LEGAL_OPINION': {   // "Discard this card to make 1 opponent discard 1 face-down in-play Asset of YOUR choice"
          for (let i = p.lineup.length - 1; i >= 0; i--) if (p.lineup[i].card === card) { p.lineup.splice(i, 1); if (this.rules.faithfulCards) this.discards[this._discard_key(card)].push(card); break; }   // discard this card (faithful: to the pile, not void)
          const victims = others.filter(q => q.lineup.some(t => !t.up));
          if (victims.length) { const tgt = await this.pick_target(p, victims, undefined, card); if (tgt) { const fd = tgt.lineup.filter(t => !t.up);
            // "of YOUR choice" — the CASTER picks, blind unless they've seen it (was: the victim chose)
            const a = (await this.pick_asset(p, fd, 'legal-opinion')) || fd[0];
            if (a) { this._discard_asset(tgt, a); this.log(`    Legal Opinion Shopping: ${tgt.name} discards a face-down Asset`); } } }
          break;
        }
        case 'MYASS_HOLDINGS': if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { p.juice -= 2; tgt.juice += 2; const shift = this.rules.faithfulCards ? Math.min(2, Math.max(0, p.risk)) : 2; this.add_risk(p, -shift); this.add_risk(tgt, shift, 'M. Yass Holdings'); } } break;   // faithful: TRANSFER Risk (shift what you have) — don't mint it out of nothing
        case 'BLACK_HOLE': {
          // Target a SPACE and swallow EVERY opponent on it. Every space holds at most one pawn EXCEPT
          // the two stacking spaces (EXEC LOUNGE / START CIRCLE), so the kill move is nuking the whole
          // Lounge (everyone who made it in) or the Start-Circle huddle waiting to enter the tower; on
          // any other space it's a normal single hit. Each victim discards an in-play Asset (0 -> ZERO
          // Juice). Caster excluded — you nail your rivals, not yourself.
          const foes = this.alive_players().filter(q => q !== p);
          if (!foes.length) break;
          const bySpace = {}; for (const q of foes) { const k = String(q.pos); (bySpace[k] = bySpace[k] || []).push(q); }
          const spaces = Object.keys(bySpace);
          // caster picks the space; bots take the one whose occupants carry the most total threat
          // (so they naturally favour a stacked Lounge / Start huddle when one exists).
          let key = p.isHuman ? await this.decide(p, { kind: 'space', candidates: spaces.map(k => ({ space: k, players: bySpace[k] })) }) : null;
          if (key == null || !bySpace[key]) key = spaces.reduce((b, k) => { const s = bySpace[k].reduce((a, q) => a + threat(this, q), 0); return s > b.s ? { k, s } : b; }, { k: spaces[0], s: -1 }).k;
          const hit = bySpace[key] || [];
          this.log(`    90M Black Hole -> space ${key}: ${hit.map(q => q.name).join(', ')}`);
          for (const q of hit) {
            if (q.lineup.length) { const a = await this.pick_asset(q, q.lineup, 'black-hole'); if (a) this._discard_asset(q, a); }
            else { q.juice = this.rules.blackHoleFloor ? 0 : (q.juice >= 0 ? 0 : q.juice * 2); }
          }
          break;
        }
        case 'MARK_TO_MARKET': if (p.hype >= 3 && others.length) { p.hype -= 3; const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { const roll = R.randint(1, 6); const j0 = tgt.juice; const take = Math.min(roll, Math.max(0, tgt.juice)); tgt.juice -= take; p.juice += take; const broughtToZero = this.rules.faithfulCards ? (j0 > 0 && tgt.juice <= 0) : (tgt.juice <= 0); if (broughtToZero) { if (tgt.lineup.length) this._discard_asset(tgt, tgt.lineup[0]); else if (tgt.hand.length) tgt.hand.splice(R.randrange(tgt.hand.length), 1); } } if (this.collapsed) this.add_risk(p, 2, 'Mark to Market post-collapse'); } break;
        case 'MARK_TO_MOOD': { const lvl = await this.decide(p, { kind: 'choice', options: [0, 3, 5, 7] }); p.trust = (lvl === null ? 5 : lvl); if (this.collapsed) this.add_risk(p, 2, 'Mark to Mood post-collapse'); break; }
        // ---- constants: passive; handled where they apply ----
        case 'CONSTANT_3ASSET_HYPE1': case 'CONSTANT_OPP_DISCARD_CLEAN_JUICE1': case 'CONSTANT_TARGETED_JUICE1':
        case 'CONSTANT_EXACTLY1OTHER_JUICE1': case 'CONSTANT_OPP_GAIN_TRUST_JUICE1': case 'CONSTANT_PLAY_ASSET_JUICE1':
        case 'CONSTANT_FAIL_TRUSTCHECK_RISK2': case 'CONSTANT_RISK_GIVES_HYPE': break;
        case 'DISCARD_CLEAN_OR_RISK2':
          if (this.rules.faithfulCards && p.isHuman && p.faceup_clean().length) { const pick = await this.decide(p, { kind: 'chooseOr', title: 'Adjusted Expectations', a: 'Discard a Clean Asset', b: 'Take +2 Risk', bCls: 'no' }); if (pick === 'b') this.add_risk(p, 2, 'Adjusted Expectations'); else D(p, p.faceup_clean()[0]); }
          else if (p.faceup_clean().length) D(p, p.faceup_clean()[0]); else this.add_risk(p, 2, 'Adjusted Expectations');
          break;
        default: break;
      }
    }

    // ============== MANUAL (interactive / targeting / asset-modifier) ==============
    async _resolveManual(card, p, others) {
      const fx = card.fx, R = this.rng;
      const lt = (q, amt, why, by) => this.lose_trust(q, amt, why, by);
      // Every MANUAL_* targeting card routes through here, and none of them opened the 'targeted'
      // reaction window — so On a Technicality / Friendly Audit were never offered against Unmarked
      // Briefcase, It Wasn't Signed, Shadow Merger, Raptor Implosion, M. Yass International, the MOU,
      // Executive Shuffling and the rest. Both cards read unrestricted ("when targeted by a card
      // effect" / "penalized from a player-targeted card-effect"). Every caller already guards on a
      // null target, which is how a warded effect reports itself.
      const target = async (pool) => (pool || others).length ? await this.pick_target(p, pool || others, undefined, card) : null;
      switch (fx) {
        // --- reaction-window cards: passive in lineup/hand until their trigger fires ---
        case 'MANUAL_INTERCEPT': case 'MANUAL_COUNTERPARTY': case 'MANUAL_TRUSTFALL':
        case 'MANUAL_RESTRUCTURE': case 'MANUAL_REROLL': case 'MANUAL_PHANTOM':
        case 'MANUAL_TECHNICALITY': case 'MANUAL_REVERSE': case 'MANUAL_CONTROLLED_BURN':
          // These were played to the lineup/hand by take_turn; they sit and wait for a trigger.
          return;
        case 'MANUAL_GRACE_PERIOD': p.skip_next = true; p.grace_immunity = true; this.log(`    ${p.name} takes a Regulatory Grace Period (skip + immunity)`); return;

        // --- targeting / interactive ---
        case 'MANUAL_MOU': { const tgt = await target(); if (tgt) { const c = tgt.faceup_clean()[0]; if (c) { c.mods.push({ tag: 'conditional', keepEffects: this.rules.faithfulCards, turns: Infinity, src: card.name }); this.log(`    MOU: ${tgt.name}'s Clean Asset is now Conditional${this.rules.faithfulCards ? ' (Lineup Effects still usable)' : ''}`); } } return; }
        case 'MANUAL_BRIEFCASE': {
          if (this.rules.faithfulCards) {   // self-sacrifice extortion: discard YOUR OWN Asset, an opponent pays you 3 Juice
            // printed: "Discard an Asset from Lineup OR HAND". Only the Lineup was ever inspected, so a
            // player holding Assets in hand but with an empty Lineup was wrongly routed into the
            // penalty branch and gave away 3 Juice they should have been extorting.
            const handAssets = p.hand.filter(c => ['Clean', 'Dirty', 'Conditional'].includes(c.ctype));
            if (p.lineup.length || handAssets.length) {
              let discarded = false;
              if (p.lineup.length) { const a = await this.pick_asset(p, p.lineup.slice(), 'briefcase-self'); if (a) { this._discard_asset(p, a); discarded = true; } }
              if (!discarded && handAssets.length) {   // nothing in play (or it was undiscardable) — pay out of hand
                const c = handAssets[0]; p.hand.splice(p.hand.indexOf(c), 1); this.discards[this._discard_key(c)].push(c);
                this.log(`    Unmarked Briefcase: ${p.name} discards ${c.name} from hand`);
              }
              if (others.length) { const tgt = await this.pick_target(p, others, undefined, card); if (tgt) { const give = Math.min(3, Math.max(0, tgt.juice)); tgt.juice -= give; p.juice += give; } } }
            else if (others.length) { const tgt = await this.pick_target(p, others); const give = Math.min(3, Math.max(0, p.juice)); p.juice -= give; tgt.juice += give; }   // truly 0 Assets anywhere -> INSTEAD give an opponent 3 Juice
            if (p.juice <= 0) p.hype -= 1;   // Juice <= 0 following -> -1 Hype
          } else { const tgt = await target(); if (tgt) { const pool = tgt.lineup.slice(); if (pool.length) { const a = await this.pick_asset(p, pool, 'briefcase'); if (a) this._discard_asset(tgt, a); } const give = Math.min(3, tgt.juice); tgt.juice -= give; p.juice += give; } }
          return;
        }
        case 'MANUAL_SHADOW_MERGER': { const dirty = p.faceup_dirty(); if (dirty.length >= 2) { const tgt = await target(); if (tgt && tgt.faceup_clean().length) { const a = await this.pickOrDefault(p, tgt.faceup_clean(), 'shadow-merger'); const i = tgt.lineup.indexOf(a); tgt.lineup.splice(i, 1); if (this.rules.faithfulCards) { for (const d of dirty.slice(0, 2)) this._discard_asset(p, d); for (let k = p.lineup.length - 1; k >= 0; k--) if (p.lineup[k].card === card) { p.lineup.splice(k, 1); this.discards[this._discard_key(card)].push(card); break; } p.hand.push(a.card); } else { p.lineup.push(this.mkEntry(a.card, true, false)); } p.ff_stole_asset += 1; } } return; }   // faithful: pay the 2 Dirty + this card, steal the Clean TO HAND
        case 'MANUAL_BENCHMARK': { const tgt = await target(); if (!tgt) return; const third = this.others_of(p).filter(x => x !== tgt); let saved = false; for (const x of third) { if (x.hype > 0 && await this.decide(x, { kind: 'giveHype', target: tgt })) { x.hype -= 1; tgt.hype += 1; saved = true; break; } } if (saved) { if (this.rules.faithfulCards) { const e = p.lineup.find(t => t.card === card); if (e) { e.up = true; e.dirty = true; } else p.lineup.push(this.mkEntry(card, true, true)); } else p.lineup.push(this.mkEntry(card, true, true)); this.log(`    The Benchmark inverts to The Baseline (Dirty, no effect)`); } else { await lt(tgt, 1, 'The Benchmark', p); } return; }   // faithful: invert THIS card in place, not a second copy
        // Benchmark edition: The Benchmark becomes a pure rubber band — the hype LEADER is cut down (L3)
        case 'MANUAL_BENCHMARK_RB': { const field = alive(); let lead = field[0]; for (const q of field) if (q.hype > lead.hype) lead = q; const before = lead.hype; lead.hype = Math.max(0, lead.hype - 3); this.log(`    THE BENCHMARK: ${lead.name} set the bar at Hype ${before} and is cut to ${lead.hype} (−${before - lead.hype})`); return; }
        case 'MANUAL_LAST_ENCHILADA': { const tgt = await target(); if (tgt) { const clean = tgt.hand.find(c => c.ctype === 'Clean'); if (clean) { tgt.hand.splice(tgt.hand.indexOf(clean), 1); this.discards['Asset'].push(clean); } else tgt.hype = 0; } p._enchilada_clause = true; return; }
        case 'MANUAL_MARTYRDOM': { const d = p.faceup_dirty()[0]; if (d) this._discard_asset(p, d); if (this.rules.faithfulCards) p.hype += 2; for (const q of others) { await lt(q, 1, 'Mark to Martyrdom', p); if (q.trust <= 0) this.burnout(q); } p._martyr_clause = true; return; }   // faithful: +2 Hype self-gain
        case 'MANUAL_WASNT_SIGNED': { const mine = p.lineup.slice(); if (!mine.length) return; const tgt = await target(); if (!tgt || !tgt.lineup.length) return; const give = await this.pick_asset(p, mine, 'wasnt-signed-cost'); if (give) this._discard_asset(p, give); if (tgt.bribes > 0) { this.spendBribe(tgt); this.log(`    It Wasn't Signed blocked by ${tgt.name}'s Bribe`); } else { const a = await this.pick_asset(p, tgt.lineup, 'wasnt-signed-pick'); if (a) this._discard_asset(tgt, a); } return; }
        case 'MANUAL_RAPTOR_IMPLODE': { const tgt = await target(); if (tgt) { p.juice += tgt.faceup_clean().length + tgt.faceup_dirty().length; if (!this.rules.faithfulCards) this.add_risk(p, 1, 'Raptor Implosion'); } return; }   // faithful: initial play costs 0 Risk (+1 only per RE-use, after initial)
        case 'MANUAL_MYASS_INTL': { const tgt = await target(); if (tgt) { const amt = tgt.juice; tgt.juice = 0;
          let moved = null; for (let i = p.lineup.length - 1; i >= 0; i--) if (p.lineup[i].card === card) { moved = p.lineup.splice(i, 1)[0]; break; }   // PASS the asset (don't keep a copy)
          if (moved) moved.up = true; tgt.lineup.push(moved || this.mkEntry(card, true, true)); this.log(`    M. Yass International: passed to ${tgt.name}, who loses ${amt} Juice`); } return; }
        case 'MANUAL_FEED_RAPTORS': { if (this.rules.faithfulCards) return;   // faithful: NOT on play — it's a MAY, recurring at the START of your turn while in your Lineup (see startAbilities)
          const tgt = await target(); if (tgt) { const j = Math.min(4, p.juice); p.juice -= j; tgt.juice += j; const r = Math.min(3, p.risk); this.add_risk(p, -r); this.add_risk(tgt, r, 'Feeding the Raptors');
          let moved = null; for (let i = p.lineup.length - 1; i >= 0; i--) if (p.lineup[i].card === card) { moved = p.lineup.splice(i, 1)[0]; break; }   // TRANSFER the asset itself (not a duplicate)
          tgt.lineup.push(moved || this.mkEntry(card, false, true)); } return; }
        case 'MANUAL_EXEC_SHUFFLE': { const tgt = await target(); if (tgt) { if (this.rules.faithfulCards) { const an = p.abilityName, bn = tgt.abilityName; p.abilityName = bn; tgt.abilityName = an; this._pendingUnswap = { a: p, b: tgt, aName: an, bName: bn, atTurn: this.turn + this.alive_players().length }; this.log(`    Executive Shuffling: ${p.name} <-> ${tgt.name} SWAP abilities (reverts after this round)`); } else { p.swap_with = tgt; this.log(`    Executive Shuffling: ${p.name} <-> ${tgt.name} ability swap pending`); } } return; }
        case 'MANUAL_MARK_MAGIC': { if (p.lineup.length >= 3) { for (let k = 0; k < 3; k++) { const a = await this.pickOrDefault(p, p.lineup.slice(), 'mark-to-magic'); if (a) this._discard_asset(p, a); } await lt(p, 1, 'Mark to Magic'); const e = this.mkEntry(card, true, false); if (this.rules.faithfulCards) e.mods.push({ tag: 'clean', noeffect: true, turns: Infinity, src: card.name });   // printed: "as a face-up CLEAN Asset with NO LINEUP EFFECT"
          p.lineup.push(e); if (this.rules.faithfulCards && this.collapsed) this.add_risk(p, 2, 'Mark to Magic post-collapse'); } return; }

        // --- asset-modifier (place-on-top retag with timers) ---
        case 'MANUAL_SHELL_GAME': { const t = await this.pickOrDefault(p, p.lineup.filter(x => x.up && this.effDirtyOrCond(p, x)), 'offshore-shell-game'); if (t) { t.up = false; t.mods.push({ tag: 'clean', turns: Infinity, src: card.name, riskPerTurn: true }); this.log(`    Offshore Shell Game: an Asset flips face-down, counts Clean (+1 Risk/turn)`); } return; }
        case 'MANUAL_PLAUSIBLE': { const tgt = await target(); if (tgt) { const c = tgt.faceup_clean()[0]; if (c) { const only = this.rules.faithfulCards ? (tgt.lineup.filter(t => t.up).length === 1) : (tgt.faceup_clean().length === 1); c.mods.push({ tag: 'dirty', turns: only ? 3 : 2, src: card.name }); this.log(`    Plausible Deniability: ${tgt.name}'s Clean Asset is Dirty for ${only ? 3 : 2} turns`); } } return; }   // faithful: "only face-up Asset" = 1 total face-up (not 1 Clean)
        case 'MANUAL_MARK_MISSION': { const t = await this.pickOrDefault(p, p.faceup_dirty(), 'mark-to-mission'); if (t) { t.mods.push({ tag: 'clean', turns: 2, src: card.name }); this.log(`    Mark to Mission: a Dirty Asset counts Clean for 2 turns`); } if (this.rules.faithfulCards && this.collapsed) this.add_risk(p, 2, 'Mark to Mission post-collapse'); return; }
        case 'MANUAL_TEMP_OPTICS': { const t = await this.pickOrDefault(p, p.faceup_dirty(), 'temporary-optics'); if (t) { t.mods.push({ tag: 'clean', turns: this.rules.faithfulCards ? 2 : 1, src: card.name }); this.log(`    Temporary Optics: a Dirty Asset counts Clean until end of next turn`); } return; }   // faithful: "until end of your NEXT turn" = 2 owner-turn ticks
        case 'MANUAL_HYPO_FUTURE': {
          const doHypo = () => { p.hype -= 4; const e = this.mkEntry(card, true, false); e.mods.push({ tag: 'clean', noeffect: true, turns: 3, src: card.name }); p.lineup.push(e); };
          if (this.rules.faithfulCards) {   // you CHOOSE to spend; refusing (or being unable) costs -2 Trust
            const canAfford = p.hype >= 4 && p.trust >= 2;
            const doIt = canAfford && await this.decide(p, { kind: 'ability', ability: 'HypoFuture', cost: 'spend 4 Hype + 2 Trust -> Clean/no-effect 3 turns' });
            if (doIt) { doHypo(); await lt(p, 2, 'Hypothetical Future Value'); }
            else await lt(p, 2, 'Hypothetical Future Value (refused)');
          } else if (p.hype >= 4 && p.trust >= 2) { doHypo(); await lt(p, 2, 'Hypothetical Future Value'); }
          return;
        }
        case 'MANUAL_UNDERVALUATION': { const pool = []; for (const q of this.alive_players()) for (const t of q.lineup) pool.push({ q, t }); if (pool.length) { const pick = await this.decide(p, { kind: 'asset', candidates: pool.map(x => x.t), ctx: 'undervaluation' }); const hit = pool.find(x => x.t === pick) || pool[0]; hit.t.mods.push({ tag: 'conditional', turns: Infinity, src: card.name }); this.log(`    Strategic Undervaluation: an Asset is now Conditional/no-effect for the game`); } return; }

        // --- scoring-time ---
        case 'MANUAL_ACCT_WHISPER': p.acct_whisper = true; return;
        default: return;
      }
    }
    effDirtyOrCond(p, t) { return p.effDirty(t) || (t.card.ctype === 'Conditional'); }

    async enter_tower(p) {
      if (p.juice < 1) return false;
      p.juice -= 1;   // parking fee, paid whether or not the check passes
      // QUALIFIED — Trust >=4 or Hype >=8: walk straight in (no roll). Byte-identical to the locked build.
      if (p.trust >= 4 || p.hype >= 8) { p.in_lounge = true; p.pos = 'LOUNGE'; this.log(`    ${p.name} enters Executive Lounge`); this.emit('enter_lounge', { player: p.name }); return true; }
      // UNDER THRESHOLD — the WHY ASK? Trust Check. HUMANS choose Bribe vs roll and SEE the result;
      // bots fall through to the parity-locked auto path below (unchanged).
      if (p.isHuman) {
        if (p.bribes > 0 && await this.decide(p, { kind: 'bribeEntry' })) {
          this.spendBribe(p); p.in_lounge = true; p.pos = 'LOUNGE';
          this.emit('spendBribe', { player: p.name });
          this.log(`    ${p.name} spends a Bribe to enter the Executive Lounge`); this.emit('enter_lounge', { player: p.name }); return true;
        }
        // Benchmark: the WHY ASK? gamble is a real Trust Check — threshold + reactions + fail penalty all
        // honor the player's cards/abilities (Class Ring, The Safe, reroll/Phantom, Raptor, the floor).
        if (this.rules.charAwareTrust) {
          if (await this.charTrustResolve(p, 5, 'failed Why Ask? roll')) {
            p.in_lounge = true; p.pos = 'LOUNGE'; this.log(`    ${p.name} passes the Why Ask? check -> Executive Lounge`); this.emit('enter_lounge', { player: p.name }); return true; }
          this.log(`    ${p.name} fails the Why Ask? check -> +1 Risk`); return false;
        }
        const roll = this.rng.randint(1, 6), pass = roll >= 5;
        this.emit('trustCheck', { player: p.name, roll, pass, need: 5 });
        if (pass) { p.in_lounge = true; p.pos = 'LOUNGE'; this.log(`    ${p.name} passes the Why Ask? check (rolled ${roll}) -> Executive Lounge`); this.emit('enter_lounge', { player: p.name }); return true; }
        this.log(`    ${p.name} fails the Why Ask? check (rolled ${roll}) -> +1 Risk`); this.add_risk(p, 1, 'failed Why Ask? roll'); return false;
      }
      // BOTS: bribe if held, else the WHY ASK? roll. Classic path is parity-locked (raw 5+); Benchmark
      // routes the roll through the character-aware check so bot Class Ring / The Safe / Raptor also apply.
      if (p.bribes > 0) { this.spendBribe(p); p.in_lounge = true; p.pos = 'LOUNGE'; return true; }
      if (this.rules.charAwareTrust) {
        if (await this.charTrustResolve(p, 5, 'failed Why Ask? roll')) { p.in_lounge = true; p.pos = 'LOUNGE'; return true; }
        return false;
      }
      if (this.rng.randint(1, 6) >= 5) { p.in_lounge = true; p.pos = 'LOUNGE'; return true; }
      this.add_risk(p, 1, 'failed Why Ask? roll'); return false;
    }

    check_table_risk() {
      const tot = this.alive_players().reduce((s, p) => s + Math.max(0, p.risk), 0);
      const thresh = this.players.length < 4 ? 6 : 8;
      if (tot >= thresh) this.raise_global_sec(1, `table Risk ${tot} >= ${thresh}`);
    }

    // start-of-turn character abilities (the printed secondary abilities). Optional ones route
    // through decide({kind:'ability'}); triggered ones (Reflux) fire automatically.
    async startAbilities(p) {
      const opps = this.others_of(p);
      const weakest = () => opps.length ? opps.reduce((m, x) => threat(this, x) < threat(this, m) ? x : m) : null;
      const hypeAtStart = p.hype;   // Reflux triggers off the Hype you STARTED the turn with, before Doughmination doubles it
      // (Claudia — Unimpeachable fires PRE-roll, in take_turn — "before rolling to move")
      // Danny — Doughmination: give 4 Juice to an opponent, DOUBLE current Hype
      if (p.abilityName === 'Danny Dough' && p.juice >= 4 && p.hype > 0 && opps.length &&
        await this.decide(p, { kind: 'ability', ability: 'Doughmination', cost: 'give 4 Juice → double Hype' })) {
        const t = weakest(); p.juice -= 4; t.juice += 4; const b = p.hype; p.hype *= 2;
        this.log(`    Danny Doughmination: 4 Juice to ${t.name}, Hype ${b}->${p.hype}`);
      }
      // Danny — Reflux: START a turn with 7+ Hype → highest-Trust player(s) roll a Trust Check (triggered)
      if (p.abilityName === 'Danny Dough' && hypeAtStart >= 7) {
        const hi = this.highest_trust();
        if (hi && hi !== p) { const top = this.alive_players().filter(q => q !== p && q.trust === hi.trust);
          for (const q of top) { this.log(`    Danny Reflux: ${q.name} (top Trust) must roll a Trust Check`); await this.trust_check(q); } }
      }
      // Vonda — Notary Public: spend 2 Trust to discard 1 of your own played Assets
      if (p.abilityName === 'Vonda Vouch' && p.trust >= 2 && p.lineup.length &&
        await this.decide(p, { kind: 'ability', ability: 'Notary', cost: 'spend 2 Trust → discard a played Asset' })) {
        const a = await this.pick_asset(p, p.lineup, 'notary');
        if (a) { p.trust -= 2; this._discard_asset(p, a); this.log(`    Vonda Notary Public: -2 Trust, discards ${a.card.name}`); }
      }
      // Feeding the Raptors (faithful): while it's in your Lineup, you MAY at the START of your turn transfer
      // 4 Juice + up to 3 Risk + the Asset itself to an opponent (a recurring option, not an on-play effect).
      if (this.rules.faithfulCards) {
        const feed = p.lineup.find(t => t.card.fx === 'MANUAL_FEED_RAPTORS');
        if (feed && opps.length && await this.decide(p, { kind: 'ability', ability: 'FeedRaptors', cost: 'give 4 Juice + up to 3 Risk + this Asset to an opponent' })) {
          const t = weakest() || opps[0];
          const j = Math.min(4, p.juice); p.juice -= j; t.juice += j;
          const r = Math.min(3, p.risk); this.add_risk(p, -r); this.add_risk(t, r, 'Feeding the Raptors');
          const i = p.lineup.indexOf(feed); if (i >= 0) { p.lineup.splice(i, 1); t.lineup.push(feed); }
          this.log(`    Feeding the Raptors: ${p.name} feeds ${t.name} — 4 Juice, ${r} Risk, + the Asset`);
        }
      }
    }

    async take_turn(p) {
      if (!p.alive) return;
      // Executive Shuffling: the ability swap reverts once a full round has passed
      if (this._pendingUnswap && this.turn >= this._pendingUnswap.atTurn) { const s = this._pendingUnswap; s.a.abilityName = s.aName; s.b.abilityName = s.bName; this._pendingUnswap = null; this.log(`    Executive Shuffling: abilities revert`); }
      p._graceUsed = false;   // Benchmark floor resets each turn
      if (p.skip_next) { p.skip_next = false; this.log(`  ${p.name} skips this turn`); if (p.grace_immunity) p.grace_immunity = false; return; }
      this.log(`  -- ${p.name}'s turn (J${p.juice} T${p.trust} H${p.hype} R${p.risk} pos=${p.pos} lounge=${p.in_lounge}) --`);
      // Claudia — Unimpeachable: "BEFORE rolling to move", may give 5 Juice to an opponent for +1 Trust (printed timing)
      if (p.abilityName === 'Claudia Numbers') { const opps = this.others_of(p);
        if (p.juice >= 5 && opps.length && await this.decide(p, { kind: 'ability', ability: 'Unimpeachable', cost: 'give 5 Juice → +1 Trust' })) {
          const t = opps.reduce((m, x) => threat(this, x) < threat(this, m) ? x : m); p.juice -= 5; t.juice += 5; this.gainTrust(p, 1);
          this.log(`    Claudia Unimpeachable: gives 5 Juice to ${t.name}, +1 Trust (pre-roll)`); } }
      const R = this.rng;
      const roll = R.randint(1, 6); p.juice += roll;
      this.lastRoll = roll;
      this.emit('roll', { player: p.name, roll, juice: p.juice });
      this.log(`    rolls ${roll} -> Juice ${p.juice}`);

      // consume one-turn timers that target THIS player
      const junkTax = !!p._junk_tax_pending; p._junk_tax_pending = false;          // Junk Vehicle Trust: 2 Juice/space
      if (p._safe_pending) { p._forcePassOn = p._safe_pending; p._safe_pending = 0; } // The Safe: must roll 6

      // Benny — The Golden Walk (printed ability): MAY enter the Lounge FREE *at a Golden Staircase*
      // (START CIRCLE or the MARKET VIP STAIRCASE). BOTS keep the aggressive auto-camp — that path is
      // byte-identical to before, so the bots-only parity proof + validated balance are untouched. A
      // HUMAN now gets the CHOICE, and only while actually standing on a Golden Staircase, so a human
      // Benny can decline and play the board instead of being teleported into the Lounge every turn.
      // (The bug: forced + position-independent => a human Benny could NEVER move.)
      if (p.abilityName === 'Benny Boye') {
        if (!p.isHuman) { p.in_lounge = true; p.pos = 'LOUNGE'; this.log('    Benny: Golden Walk -> Executive Lounge (free)'); }
        else if (!p.in_lounge && (p.pos === 'START' || LOUNGE_EXITS.has(p.pos)) && await this.decide(p, { kind: 'goldenWalk' })) {
          p.in_lounge = true; p.pos = 'LOUNGE'; this.log('    Benny: Golden Walk -> Executive Lounge (free)'); this.emit('enter_lounge', { player: p.name });
        }
      }
      // Danny — The Dough-Man Cometh: DOUBLE current Juice. CLASSIC (frozen): keyed off the global turn
      // counter, so the cadence is SEAT-DEPENDENT — the tuned quirk, intentionally LEFT AS-IS (user decision).
      // BENCHMARK proposal (see docs/BENCHMARK.md §B): switch to literal "every other OWN turn" for a
      // seat-independent rule — faithful to the card, but it starves Danny in short games, so it's a knob.
      if (p.abilityName === 'Danny Dough' && this.turn >= 2 && this.turn % 2 === 0) { const b = p.juice; p.juice *= 2; this.log(`    Danny: Dough-Man doubles Juice ${b}->${p.juice}`); }

      await this.startAbilities(p);   // printed secondary abilities (Unimpeachable / Doughmination / Reflux / Notary)

      if (p.juice >= 3 && p.bribes === 0) {
        if (await this.decide(p, { kind: 'bribe' })) { p.juice -= 3; p.bribes += 1; this.log(`    ${p.name} buys a Bribe (-3 Juice)`); this.emit('bribe', { player: p.name }); }
      }

      // Canonical 12-space track (LOOP_N / DOOR_SPACES / DECK_BY_INDEX defined up top).
      let moved = false;
      if (!p.in_lounge) {
        let cur = (typeof p.pos === 'number') ? p.pos : 0;
        let want = await this.decide(p, { kind: 'steps' });
        const wu_free = (p.abilityName === 'Wu Drainer');
        if (wu_free && want === 0) want = 1;
        let steps = 0;
        const dir = want < 0 ? -1 : 1, count = Math.abs(want);   // HUMAN may move BACKWARD (negative want); bots only ever pass >=0, so parity is untouched
        for (let k = 0; k < count; k++) {
          const free_step = (wu_free && p.juice < 1 && steps === 0);
          if (p.juice < 1 && !free_step) break;
          const nxt = ((cur + dir) % LOOP_N + LOOP_N) % LOOP_N;
          // Wu — Floorplan Master: ignores anything that would stop movement (walks through occupied spaces)
          if (!wu_free && this.alive_players().some(q => q !== p && typeof q.pos === 'number' && q.pos === nxt)) { this.log(`    ${p.name} blocked: space ${nxt} occupied`); break; }
          if (!free_step) p.juice -= 1;
          if (!free_step && junkTax) p.juice -= 1;   // Junk Vehicle Trust: 2 Juice per space this turn
          cur = nxt; steps += 1;
          if (DOOR_SPACES.has(cur)) {
            // Index 4 is the blank TO MARKET door — can't end on it; it's pass-through BOTH ways.
            // The +1 Final Favor only applies crossing FORWARD into Market; backward just passes through.
            if (dir > 0 && p.juice >= 1 && await this.decide(p, { kind: 'door', at: cur })) { p.juice -= 1; cur = ((cur + dir) % LOOP_N + LOOP_N) % LOOP_N; p.ff_passed_to_market += 1; this.log(`    ${p.name} takes TO MARKET door -> ${cur} [+1 Final Favor]`); this.emit('door', { player: p.name, to: cur, took: true }); }
            else { cur = ((cur + dir) % LOOP_N + LOOP_N) % LOOP_N; this.log(`    ${p.name} crosses the TO MARKET door (no rest) -> ${cur}`); this.emit('door', { player: p.name, to: cur, took: false }); }
          }
        }
        p.pos = cur; moved = steps > 0;
        if (moved) {
          this.emit('move', { player: p.name, to: cur });
          const key = DECK_BY_INDEX[cur];
          const c = this.draw(key);
          if (c) {
            this.log(`    lands on loop ${cur}, draws ${key}: ${c.name}`);
            this.emit('draw', { player: p.name, deck: key, card: c.name });
            if (key === 'Asset') { this.consecutive_assets += 1; if (this.consecutive_assets >= 3) { this.raise_global_sec(1, '3 Assets drawn consecutively'); this.consecutive_assets = 0; } }
            else this.consecutive_assets = 0;
            if (key === 'SEC') {
              if (p.sec_immunity > 0) { p.sec_immunity -= 1; this.log(`    ${p.name} uses SEC Immunity (ignores ${c.name})`); this.emit('secImmunity', { player: p.name, card: c.name, left: p.sec_immunity }); this.discards['SEC'].push(c); }
              else if (p.grace_immunity) { this.log(`    ${p.name} immune (Grace Period) — ignores ${c.name}`); this.discards['SEC'].push(c); }
              else { await this.resolve_card(c, p, this.others_of(p)); this.after_sec_draw(c); }
            }
            else p.hand.push(c);
          }
        }
        // ---- ENTER THE EXECUTIVE LOUNGE ----
        // BOTS keep the locked build EXACTLY (offered whenever they qualify, from anywhere): the validated
        // balance + golden-master parity depend on this precise gate/RNG, so this branch must not change.
        // HUMANS get the full printed rule: you climb in from a GOLDEN STAIRCASE (the tower-top tiles the
        // SPIRAL LIFT marks — LOUNGE_EXITS 3/5). Qualify (Trust >=4 or Hype >=8) -> walk straight in; UNDER
        // threshold -> the WHY ASK? Trust Check gamble (spend a Bribe, or roll 5+; a failed roll = +1 Risk).
        const qualifies = (p.trust >= 4 || p.hype >= 8);
        if (p.isHuman) {
          if (p.juice >= 1 && LOUNGE_EXITS.has(p.pos) &&
              await this.decide(p, { kind: 'enterLounge', qualifies, gamble: !qualifies, bribes: p.bribes })) {
            await this.enter_tower(p);
          }
        } else if (qualifies && await this.decide(p, { kind: 'enterLounge' })) {
          await this.enter_tower(p);
        }
      }
      if (p.abilityName === 'Wu Drainer' && !moved) this.add_risk(p, -1);

      // play 1 card (reaction cards held in hand are excluded — they wait for their trigger)
      const playable = p.hand.filter(proactivelyPlayable);
      const chosen = await this.decide(p, { kind: 'play', candidates: playable });
      if (chosen && p.hand.indexOf(chosen) >= 0) {
        const c = chosen; p.hand.splice(p.hand.indexOf(c), 1);
        this.log(`    plays from hand: ${c.name}`);
        this.emit('play', { player: p.name, card: c.name });
        if (p.abilityName === 'Mark Markit' && (c.deck === 'Market' || c.deck === 'AdvMarket')) p.hype += 1;
        const others = this.others_of(p);
        if (['Clean', 'Dirty', 'Conditional'].includes(c.ctype) && ['FaceUp', 'FaceDown', 'KeepInHand'].includes(c.play)) {
          const fu = (c.play === 'FaceUp'); const isdirty = (c.ctype === 'Dirty');
          const entry = this.mkEntry(c, fu, isdirty);
          p.lineup.push(entry);
          if (p.hasConstant('CONSTANT_PLAY_ASSET_JUICE1')) p.juice += 1;
          // reaction window: opponents may intercept a freshly-played Clean Asset
          let intercepted = false;
          if (fu && !isdirty) {
            const ctx = { actor: p, asset: entry };
            await this.offerReaction('playCleanAsset', ctx);
            intercepted = !!ctx.intercepted;
          }
          // faithful: an intercepted/countered Asset was stolen or discarded before it took effect — don't resolve its on-play effect for the original player
          if (!(this.rules.faithfulCards && intercepted)) await this.resolve_card(c, p, others);
        } else {
          await this.resolve_card(c, p, others);
          this.discards[this._discard_key(c)].push(c);
        }
      }

      // end of turn
      if (p.hasConstant('CONSTANT_3ASSET_HYPE1') && p.asset_count() >= 3) p.hype += 1;
      if (p.hasConstant('CONSTANT_EXACTLY1OTHER_JUICE1') && p.asset_count() === 2) p.juice += 1;  // Leverage Loop (once/turn)
      if (p.abilityName === 'Mark Markit' && p.hype >= MAX_HYPE) { p.juice += 1; p.trust -= 1; p.maxhype_streak += 1; }
      else if (p.abilityName === 'Mark Markit') p.maxhype_streak = 0;
      if (p.abilityName === 'Mark Markit' && p.maxhype_streak >= 3) {   // Too Loud to Fail — may Bribe to avert the SEC bump
        if (p.bribes > 0 && await this.decide(p, { kind: 'ability', ability: 'TooLoudAvert', cost: 'spend a Bribe to avert Global SEC +1 (Bribe = +2 Risk)' })) { this.spendBribe(p); this.log(`    Mark bribes to avert 'Too Loud to Fail'`); }
        else this.raise_global_sec(1, "Mark 'Too Loud to Fail'");
        p.maxhype_streak = 0;
      }
      if (p.abilityName === 'Claudia Numbers' && p.hype >= 4) {   // Cooked — may Bribe to avert the -1 Trust
        if (p.bribes > 0 && await this.decide(p, { kind: 'ability', ability: 'CookedAvert', cost: 'spend a Bribe to keep your Trust (Bribe = +2 Risk)' })) { this.spendBribe(p); this.log(`    Claudia bribes to avert 'Cooked'`); }
        else p.trust -= 1;
      }

      // Offshore Shell Game: +1 Risk/turn while the flipped asset is held
      for (const t of p.lineup) if (t.mods.some(m => m.riskPerTurn && (m.turns === Infinity || m.turns > 0))) this.add_risk(p, 1, 'Offshore Shell Game upkeep');

      if (p._ringTurns > 0) p._ringTurns -= 1;   // Class Ring buff counts down (this turn + next)
      p._forcePassOn = 0;                         // The Safe debuff was only for this turn

      // BENCHMARK edition only: ending a turn deep in Risk feeds the Shadow meter (self-inflicted collapse)
      if (this.rules.shadowOnRisk && p.risk >= this.rules.shadowRiskThreshold)
        this.raise_shadow_sec(1, `${p.name} ended a turn at Risk ${p.risk} (Benchmark: Shadow +1)`);

      // BENCHMARK Tall Poppy (L3 rubber band): the conspicuous sole Juice leader draws scrutiny → +1 Risk
      if (this.rules.tallPoppy) {
        const field = this.alive_players(); let mx = -Infinity, second = -Infinity;
        for (const q of field) { if (q.juice > mx) { second = mx; mx = q.juice; } else if (q.juice > second) second = q.juice; }
        if (p.juice === mx && mx >= this.rules.tallPoppyAt && mx > second)
          this.add_risk(p, 1, `Tall Poppy (Benchmark): Juice ${mx} draws the eye`);
      }

      if (p.in_lounge) { p.lounge_streak += 1; if (p.abilityName === 'Benny Boye' && p.lounge_streak >= 3 && !this.collapsed) this.begin_collapse('Benny Castle Doctrine (3 turns ended in Lounge)'); }
      else { p.lounge_streak = 0; p._stamped = false; }

      // STAMP THE BOOKS (faithful, pre-collapse): a Lounge resident holding the 2-Clean win shape must
      // PASS a Trust Check after a full turn before the win counts (rule sheet: "After 1 full turn, pass
      // a TRUST CHECK"). One attempt per qualifying turn-end; a fail carries the standard +1 Risk.
      if (this.rules.faithfulCards && p.in_lounge && !this.collapsed && !p._stamped &&
          this.victoryCleanCount(p) === 2 && p.lounge_streak >= 1) {
        if (await this.trust_check(p)) { p._stamped = true; this.log(`    ${p.name} STAMPS THE BOOKS (Trust Check passed) — victory pending`); }
      }

      p.tickMods();          // count down asset-modifier timers
      this.check_table_risk();

      if (this.collapsed && this.collapse_turns_left !== null && this.collapse_turns_left <= 2) {
        for (const q of this.alive_players()) if (q.in_lounge) {
          const under = (q.trust < 4 && q.hype < 8);
          if (under && q.bribes > 0) {
            // the printed choice. A human is asked; a bot takes the Bribe unless paying its +2 Risk
            // would burn it out, in which case it would rather roll. No RNG either way.
            const wouldBurn = this.rules.faithfulCards && (q.risk + 2) >= BURNOUT_RISK;
            let useBribe = !wouldBurn;
            if (q.isHuman) {
              const pick = await this.decide(q, { kind: 'chooseOr', title: 'Security is clearing the Lounge',
                a: `Spend a Bribe to stay${this.rules.faithfulCards ? ' (+2 Risk)' : ''}`, b: 'Take the Trust Check instead', bCls: 'no' });
              useBribe = (pick !== 'b');
            }
            if (useBribe) { this.spendBribe(q); continue; }
          }
          const pass_on = under ? 5 : 4;
          // Benchmark charAwareTrust: the eviction check honors effPassOn (Class Ring / The Safe) + a reroll
          // reaction (fail = booted to START, so no Risk penalty). Classic keeps the frozen raw roll.
          let r, survived;
          if (this.rules.charAwareTrust) { survived = await this.charTrustResolve(q, pass_on, null, false); }
          else { r = R.randint(1, 6); survived = r >= pass_on; }
          if (survived) { q.ff_survived_collapse_round += 1; continue; }
          // Vonda — Leaky Bucket: stay anyway by discarding an Asset AND passing a (fee-free) Trust Check
          if (q.abilityName === 'Vonda Vouch' && q.lineup.length &&
            await this.decide(q, { kind: 'ability', ability: 'LeakyBucket', cost: 'discard an Asset + pass a Trust Check to STAY' })) {
            const a = await this.pick_asset(q, q.lineup, 'leaky-bucket'); if (a) this._discard_asset(q, a);
            if (await this.trust_check(q)) { q.ff_survived_collapse_round += 1; this.log(`    Vonda Leaky Bucket: discards ${a ? a.card.name : 'an Asset'}, passes — STAYS in the Lounge`); continue; }
          }
          q.in_lounge = false; q.pos = 'START'; q.lounge_streak = 0; this.log(`    COLLAPSE EVICTION: ${q.name} failed check${r !== undefined ? ` (rolled ${r})` : ''}, booted to START`); this.emit('evict', { player: q.name });
        }
      }
    }

    meets_victory(p) {
      if (!(p.in_lounge && this.victoryCleanCount(p) === 2)) return false;
      if (this.collapsed) return p.ff_survived_collapse_round >= 1;
      // faithful: pre-collapse win also requires the Books to be STAMPED (a passed Trust Check).
      return p.lounge_streak >= 1 && (!this.rules.faithfulCards || p._stamped);
    }
    // faithful: "The Last Enchilada — if this Asset is in your hand at Final Favor, lose -2 Trust."
    _endgameEnchilada() {
      if (!this.rules.faithfulCards || this._enchiladaDone) return; this._enchiladaDone = true;
      for (const q of this.alive_players()) if (q.hand.some(c => c.fx === 'MANUAL_LAST_ENCHILADA')) { q.trust -= 2; this.log(`    The Last Enchilada: ${q.name} still held it at Final Favor -> -2 Trust`); }
    }
    check_victory() {
      const q = this.alive_players().filter(p => this.meets_victory(p));
      if (!q.length) return null;
      this._endgameEnchilada();
      if (q.length === 1) return q[0];
      return this.resolve_final_favor(q);
    }
    ff(p) {
      // Accounting Whisper (Risk->0 if Shadow<6) feeds tie-break ordering via effRisk, not the FF total.
      let v = p.final_favor();
      // BENCHMARK parity bonuses (Classic FF is frozen; these are reversible edition knobs).
      if (this.rules.stampScoresFF && this.victoryCleanCount(p) === 2 && p.clean_count() !== 2) v += 1;
      if (this.rules.hypeExitFF) v += p.ff_hype_exit;
      return v;
    }
    resolve_final_favor(contenders) {
      const best = Math.max(...contenders.map(c => this.ff(c)));
      let top = contenders.filter(c => this.ff(c) === best);
      if (top.length === 1) return top[0];
      while (top.length > 1) {
        const rolls = new Map(top.map(c => [c, this.rng.randint(1, 6)]));
        const hi = Math.max(...rolls.values());
        for (const [c, r] of rolls) if (r < hi) this.add_risk(c, 1, 'Why Ask? roll-off loss');
        top = top.filter(c => rolls.get(c) === hi);
      }
      return top[0];
    }
    effRisk(p) { const active = this.rules.faithfulCards ? p.lineup.some(t => t.card.fx === 'MANUAL_ACCT_WHISPER' && !p.noEffect(t)) : p.acct_whisper; return (active && this.shadow_sec < 6) ? 0 : p.risk; }   // faithful: the Asset must STILL be in your Lineup at scoring
    score_on_timeout() {
      this._endgameEnchilada();
      const q = this.alive_players().filter(p => this.meets_victory(p));
      if (q.length) return this.resolve_final_favor(q);
      // Classic: highest [FF, Juice, -Risk] — but Juice-as-tiebreak rewards the RICHEST, which lets the
      // Juice-hoarder run away with collapses. BENCHMARK aligns the tiebreak with the design thesis
      // ("least-dirty-at-collapse is the real scoreboard"): the CLEANEST survivor wins — [FF, -Risk, Clean, Juice].
      const key = this.rules.cleanestSurvives
        ? p => [this.ff(p), -this.effRisk(p), this.victoryCleanCount(p), p.juice]
        : p => [this.ff(p), p.juice, -this.effRisk(p)];
      return this.alive_players().slice().sort((a, b) => {
        const ka = key(a), kb = key(b);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
        return 0;
      })[0];
    }

    // step ONE player's turn (async); returns the player who just acted (for the UI animator)
    async step() {
      if (this.done) return null;
      this.turn += 1;
      const p = this.players[this.order[this.idx % this.order.length]];
      this.activePlayer = p;
      this.log(`[Turn ${this.turn}] global_sec=${this.global_sec} shadow_sec=${this.shadow_sec} collapsed=${this.collapsed}`);
      this.emit('turn_start', { player: p.name, n: this.turn });
      await this.take_turn(p);
      const w = this.check_victory();
      if (w) { this.winner = w; this.end_reason = this.end_reason || 'Victory conditions met'; this.done = true; }
      else if (this.collapsed) {
        this.collapse_turns_left -= 1;
        if (this.collapse_turns_left <= 0) { this.winner = this.score_on_timeout(); this.end_reason = (this.end_reason || '') + ' (resolved on collapse timeout)'; this.done = true; }
      }
      if (this.done) this.emit('gameover', { winner: this.winner ? this.winner.name : null, reason: this.end_reason });
      else if (this.turn >= this.maxTurns) { this.winner = this.score_on_timeout(); this.end_reason = this.end_reason || 'max turns reached'; this.done = true; this.emit('gameover', { winner: this.winner ? this.winner.name : null, reason: this.end_reason }); }
      this.idx += 1;
      return p;
    }
    // run a whole game headlessly (bots only, or scripted agents)
    async run() { while (!this.done) await this.step(); return this.winner; }
  }

  global.makeRng = makeRng;
  global.ERSNGame = Game;
  global.ERSNPlayer = Player;
  global.ERSNBotAgent = BotAgent;
  global.ERSNCharacterAgent = CharacterAgent;
  global.ERSN_VERSION = VERSION;
  global.ERSN_EDITIONS = EDITIONS;
  global.ERSN_REACTS = REACTS;                   // UI reads this for the passive "⚡ can react" cue
  global.ERSN_BENCHMARK_TEXT = BENCHMARK_TEXT;   // UI shows these on-card in Benchmark edition
  if (typeof module !== 'undefined' && module.exports) module.exports = { makeRng, Game, Player, BotAgent, CharacterAgent, VERSION, EDITIONS, BENCHMARK_FX, BENCHMARK_TEXT };
})(typeof window !== 'undefined' ? window : globalThis);
