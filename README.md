> **STATUS: WORKING BUILD, LIVE ON GITHUB PAGES. Not a finished game.**
> - The game: <https://anderspartnersck.github.io/ERSN/>
>
> The rules engine is balance-tested and the card set audits clean. The presentation is still rough, and it's one-screen only:
> no online play.

# ER$N — THE HOME GAME

The video build of the board game. Up to six players, one collapsing market, and a Lounge almost nobody reaches.

A Castle Killscreen game by **Anders & Partners**. The finished Castle Killscreen titles are
**[SUCK UP](https://anderspartnersck.github.io/suck-up/3d.html?arcade)** and
**[ONE-TIMER: THE HIGH TABLE](https://anderspartnersck.github.io/high-table/)**. This repo exists so the
work can happen in the open, not because the work is done.

## About

Juice, Trust, Hype and Risk, a Global and a Shadow SEC, and a collapse that comes for everyone. Winning
means reaching the Executive Lounge with two clean players behind you.

**Most runs do not.** That's the design, not a bug: you can't win at fraud. Roughly 96% of runs collapse
and about 3% end clean, and the Lounge is deliberately not tuned upward to make it feel better.

## Which rules

- **BENCHMARK** is the default and the current digital edition. It plays the printed core track.
- **CLASSIC** is the printed product, kept frozen as the reference. Pick it on the setup screen.
- **Benchmark v4** is a playtest package, **off by default**. It only turns on with `?v4` in the URL.
- The expansion is on by default; there's a switch for it on the setup screen.

## How to play

1. Click or press a key to start, then **ENTER THE TOWER** (or press **Enter**).
2. On setup, pick the number of players (2–6; the official game is 4–6, and 2–3 are a sandbox), the edition,
   the expansion and the board. Each character card has a **YOU / BOT** button: you get seat one, and you can
   turn any other seat into a human for **pass-and-play** at one screen.
3. In the game, **NEXT TURN** (or **Space**) plays the next turn; **AUTO** runs the bots on their own, and the slider sets the speed.
   When a human seat has a decision, the game stops and asks; click your choice.

| Key | Does |
|---|---|
| **Enter** | ENTER THE TOWER on the title |
| **Space** | Next turn |
| **Esc** or **P** | Pause menu: resume, how to play, settings, new game, quit to title |
| **?** or **R** | The rules sheet |
| **Esc** | Closes a sheet or prompt; on setup or the final screen, back to the title |

Left alone on the title for 30 seconds, the game plays a bots-only demo. Any key or click stops it.

**Opt-in URL options** (off unless you add them): `?v4` the Benchmark v4 package · `?levels` the tower's floors
(Benchmark only) · `?levels&art=3d` the rendered floor pieces · `?attract=0` no title demo.

## What still needs work

- One screen only: no online or networked play.
- The UI works but isn't finished; the board art is further along than the chrome around it.
- The print files, the rules work in progress (including v4) and the test harness stay in the private tree.

## Rebuilding this bundle

This repo is **generated**. Never edit it directly. Everything here is built from the private Castle
Killscreen tree, and this README's source is `tools/PAGES_README.md` there:

```
cd "ANDERS CASTLE KILLSCREEN/ERSN/VIDEO GAME BUILD"
python3 tools/build_pages.py
```

The bundler shrinks art by **resolution, not by pruning**: these engines build most asset paths by
string concatenation, so a static scan can't see what's used, and a wrongly-cut sprite doesn't error.
It just silently fails to draw.

## Credits

Created by **Joseph Coleman**, with Claude, ChatGPT, and Blender.
Anders & Partners.

<sub>Generated from the private Castle Killscreen tree. Edit there, not here.</sub>
