/* ER$N character voice — witty barks for the bots, keyed to game events. PRESENTATION ONLY
   (the engine stays pure). Voices are built from each character's ability names + "Sharky's
   Disgusting Cubicle" rules-sheet tone. Plus Sharky himself as a trading-floor color commentator.
   Pick lines with VOICE.say(name, eventKey). */
(function (global) {
  'use strict';

  const VOICES = {
    // The Runaway Cycle — greedy, Jersey, money runs downhill and he's at the bottom catching it
    'Danny Dough': {
      turn:    ["More dough. Always more.", "Let it ride, let it ride.", "I smell liquidity."],
      highRoll:["Fuhgeddaboudit — that's a stack.", "Cha-CHING.", "The Dough-Man cometh."],
      lowRoll: ["Eh, I'll double it next turn.", "That's fine, I compound.", "Rounding error."],
      bribe:   ["Cost of doing business.", "Greasing the wheel."],
      sec:     ["Whoa whoa whoa, that's not my signature.", "I don't recall that line item."],
      play:    ["Watch this stack work.", "It's all liquid, baby."],
      lounge:  ["Top floor. Where the dough lives.", "I belong up here, structurally."],
      react:   ["Not on my balance sheet.", "Nuh-uh, eat it."],
      target:  ["You. You look overfunded.", "Lemme see your books, pal."],
      flush:   ["IT'S DOUBLING. IT'S DOUBLING AGAIN.", "I am too liquid to fail."],
      burnout: ["...where'd it all go?", "It was here a second ago!"],
      collapse:["Cash out, cash out, CASH OUT.", "Everybody stay liquid!"],
      win:     ["The Dough always finds its level.", "Runaway? I prefer 'undefeated.'"],
    },
    // The Belief Engine — hype-man, all-caps, a brand not a bluff; the Hype→Lounge bridge is on fire
    'Mark Markit': {
      turn:    ["It's not a company, it's a MOVEMENT.", "Narrative is everything.", "Feel the momentum?"],
      highRoll:["TO THE MOON.", "GENERATIONAL roll.", "Bullish. Deeply bullish."],
      lowRoll: ["Still bullish.", "We're 'building.'", "Pivoting. Always pivoting."],
      bribe:   ["Marketing spend.", "Awareness isn't free."],
      sec:     ["No comment, but optimistically.", "We're 'cooperating fully.'"],
      play:    ["BRANDING is forever.", "Print the deck, print the dream."],
      lounge:  ["I MANIFESTED this.", "Vision gets you the top floor."],
      react:   ["Reframe it!", "That's not a loss, it's a learning."],
      target:  ["You're off-message.", "Time for a rebrand — yours."],
      flush:   ["THE HYPE IS PARABOLIC.", "We've gone EXPONENTIAL, people."],
      burnout: ["It was a 'down round.'", "Strategic. Pivot. Restructure."],
      collapse:["This is the BEST thing to happen to the brand.", "Disruption! We love disruption!"],
      win:     ["Told you it wasn't a bubble.", "BELIEVE harder next time."],
    },
    // The Auditor's Shadow — precise, ominous, keeps receipts; wins if left alone, bleeds Trust if poked
    'Claudia Numbers': {
      turn:    ["The numbers don't lie. You do.", "I've already reconciled you.", "Everything ties out. Eventually."],
      highRoll:["As forecast.", "Within tolerance.", "Nonmaterial luck."],
      lowRoll: ["Noted. Footnoted.", "I'll restate that.", "Variance. Explainable."],
      bribe:   ["Reclassified as 'consulting.'", "Off the books, on the record."],
      sec:     ["I keep receipts, gentlemen.", "My trail is clean. Is yours?"],
      play:    ["Documented and dated.", "Audit-proof. Try me."],
      lounge:  ["Earned, line by line.", "I qualified honestly. Unusual here."],
      react:   ["I anticipated this. Page 4.", "Objection — see footnote."],
      target:  ["Your math doesn't reconcile.", "Let's open YOUR ledger."],
      spiral:  ["...the numbers are turning on me.", "This does not reconcile. This does NOT reconcile."],
      burnout: ["Cooked. Predictably.", "The figures finally ate me."],
      collapse:["I called this in the footnotes.", "Told you. It's all in the footnotes."],
      win:     ["Left alone, I always win.", "The math was never in your favor."],
    },
    // The Golden One — entitled, gilded, born up top; rushes the Tower, may prove gilded in daylight
    'Benny Boye': {
      turn:    ["I was practically born in the Lounge.", "Rules are for the staircase.", "Daddy built this tower."],
      highRoll:["Naturally.", "The dice know who I am.", "As one does."],
      lowRoll: ["The dice are mistaken.", "I'll allow it. Once.", "Beneath me, frankly."],
      bribe:   ["A gratuity.", "For the little people."],
      sec:     ["My lawyers will adore this.", "Do you know who my father is?"],
      play:    ["Effortless.", "It's just taste, really."],
      lounge:  ["The Golden Walk. No charge.", "Home. Obviously.", "Velvet rope parts for me."],
      react:   ["Not to me, you don't.", "Denied. Golden privilege."],
      target:  ["You don't belong up here.", "Run along."],
      burnout: ["This is... unprecedented.", "Gilded, not guilty!"],
      collapse:["The tower wouldn't dare.", "It'll hold. It always holds. ...It's holding?"],
      win:     ["Gilded, darling. Not guilty.", "Was there ever any doubt?"],
    },
    // Floorplan Master — spacey, distracted, deadpan; nobody moves like Wu, burns hot, opens your books
    'Wu Drainer': {
      turn:    ["Wait — is it my turn?", "I'll just... drift over here.", "Hm. Interesting floor plan."],
      highRoll:["Oh. That's a lot of dots.", "Neat.", "I'll walk it off."],
      lowRoll: ["Doesn't matter, I move free.", "Fine, I'll watch.", "Less is more."],
      bribe:   ["Sure, why not.", "Pocket money."],
      sec:     ["Was I supposed to read that?", "Hm. Words."],
      play:    ["Let's open your books.", "Oops, did that disrupt you?"],
      lounge:  ["I wandered in. Cozy.", "How'd I get up here?"],
      react:   ["Yeah, no.", "I saw that coming. Vaguely."],
      target:  ["Show me everything you've got.", "Private dance. Reveal it all."],
      burnout: ["I burned a little hot there.", "...what just happened?"],
      collapse:["Told you I collapse faster.", "Was wondering when this'd happen."],
      win:     ["No one moves like Wu.", "...did I win? Huh."],
    },
    // The Endorser — reassuring, notarial, shows clean / pulls dirty; learned it all from Mark
    'Vonda Vouch': {
      turn:    ["It's all above board, I assure you.", "Trust me — I vouch for everything.", "Clean? Define clean."],
      highRoll:["Endorsed by fortune.", "I vouch for that roll.", "Stamped."],
      lowRoll: ["Optically, that's a win.", "I'll notarize it as fine.", "Looks clean to me."],
      bribe:   ["A token of good faith.", "Notarized, naturally."],
      sec:     ["My optics are impeccable.", "I have references."],
      play:    ["Two dirty, one clean — magic.", "Pulled it right out of the air."],
      lounge:  ["After you. No, I insist — me first.", "All vouched for."],
      react:   ["I'll stamp THAT denied.", "Notary public says no."],
      target:  ["I'll vouch... against you.", "Your references didn't check out."],
      burnout: ["The pedestal cracked.", "My optics! My beautiful optics!"],
      collapse:["I endorsed the lifeboat, don't worry.", "Stay calm, I'll vouch for everyone."],
      win:     ["See? All above board.", "Dirty becomes clean. The Stamp."],
    },
  };

  // Sharky / Bill Shahkman — trading-floor color commentary on the table at large
  const SHARKY = {
    collapse:["Sharks embrace collapse, baby.", "Chum's in the water.", "And THERE goes the tower."],
    burnout: ["One down. Eat up.", "Somebody got fed to the raptors."],
    win:     ["That's how a shark exits.", "Least-dirty books in the building."],
    bigSec:  ["The regulators are circling.", "SEC's got the scent now."],
    react:   ["Ooh, a counter-move. Spicy.", "He saw it coming two turns ago."],
    flush:   ["Somebody's drowning in liquidity.", "That's not a stack, that's a flood."],
  };

  const VOICE = {
    lines(name, key) { const v = VOICES[name]; return (v && v[key]) || null; },
    say(name, key, rnd) {
      const pool = this.lines(name, key); if (!pool || !pool.length) return null;
      const r = (typeof rnd === 'number') ? rnd : Math.random();
      return pool[Math.floor(r * pool.length) % pool.length];
    },
    sharky(key, rnd) { const pool = SHARKY[key]; if (!pool) return null; const r = (typeof rnd === 'number') ? rnd : Math.random(); return pool[Math.floor(r * pool.length) % pool.length]; },
  };

  global.ERSN_VOICES = VOICES;
  global.ERSN_SHARKY = SHARKY;
  global.VOICE = VOICE;
})(typeof window !== 'undefined' ? window : globalThis);
