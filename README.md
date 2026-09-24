# ER$N — THE HOME GAME

The video build of the board game. Six players, one collapsing market, and a Lounge almost nobody reaches.

## ▶ [PLAY IT IN YOUR BROWSER](https://anderspartnersck.github.io/ER-N/)

A Castle Killscreen game by **Anders & Partners**.

> ### ⚠︎ Working build — not a finished game
>
> The most complete of the board-game builds — the rules engine is balance-tested and the card set audits clean. The presentation around it is still rough, and it's a hot-seat build: no online play.
>
> The finished Castle Killscreen titles are **[SUCK UP](https://anderspartnersck.github.io/suck-up/)**
> and **[ONE-TIMER: THE HIGH TABLE](https://anderspartnersck.github.io/high-table/)**. This repo
> exists so the work can happen in the open, not because the work is done.

## About

Juice, Trust, Hype and Risk, a Global and a Shadow SEC, and a collapse that comes
for everyone. Winning means reaching the Executive Lounge with two clean players
behind you.

**Most runs do not.** That's the design, not a bug: you can't win at fraud. Roughly
96% of runs collapse and about 3% end clean, and the Lounge is deliberately not
tuned upward to make it feel better.

## How to play

It's a **hot-seat** game — everyone plays at one screen, passing the turn. Click to
choose; the game prompts for every decision it needs.

## What still needs work

- Hot-seat only — no online or networked play.
- The UI is functional rather than finished; the board art is further along than the chrome around it.

## Rebuilding this bundle

This repo is **generated** — never edit it directly. Everything here is built from the
private Castle Killscreen tree:

```
cd "ANDERS CASTLE KILLSCREEN/ERSN/VIDEO GAME BUILD"
python3 tools/build_pages.py
```

The bundler shrinks art by **resolution, not by pruning**: these engines build most asset
paths by string concatenation, so a static scan can't see what's used, and a wrongly-cut
sprite doesn't error — it just silently fails to draw.

## Credits

Created by **Joseph Coleman**, with Claude and ChatGPT.
Anders & Partners.

<sub>Generated from the private Castle Killscreen tree. Edit there, not here.</sub>
