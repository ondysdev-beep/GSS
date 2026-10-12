# GSS node reference

How every node type behaves in the simulation, written against the actual
engine (`src/core/TickEngine.ts`, tick spec v2). The same text, shortened, is
in the app: select a node and open **"How does this node work?"** in the
inspector.

- [How a simulation runs](#how-a-simulation-runs)
- [Rules that apply to every node](#rules-that-apply-to-every-node)
- [Pool](#pool) · [Source](#source) · [Converter](#converter) · [Drain](#drain) · [Gate](#gate) · [Chance](#chance) · [Splitter](#splitter) · [Timer](#timer) · [Formula](#formula) · [Player Action](#player-action)
- [Common patterns](#common-patterns)
- [Validation messages](#validation-messages)

## How a simulation runs

The simulation advances in ticks. Each tick covers **Δt** seconds (the time
step, set in the Simulation tab; default 1). Within one tick the nodes act in
this order:

1. **Timers** fire their pulses
2. **Sources** produce
3. **Converters** convert
4. **Formulas** produce
5. **Player Actions** fire
6. **Drains** consume
7. **Gates** re-check their condition

The order matters. A Drain sees what Sources and Converters added in the same
tick, and a Gate that opens at the end of tick 10 starts letting flow through
in tick 11.

## Rules that apply to every node

**Push and pull.** Sources, Converters (their output), Timers, Formulas and
Player Actions *push* resources into whatever they are connected to. Drains
and Converters (their input) *pull* from the pools connected into them. Pools
never push.

**Flow is copied, not divided.** If a node pushes into two or more
connections, each connection gets the full amount. A Source with rate 5
connected to two pools adds 5 to each of them. If you want to divide the
flow, put a [Splitter](#splitter) in between. The Issues panel shows an info
message when a node copies its flow like this.

**Resources are matched by name.** `Gold` and `gold` are different
resources. A pool only accepts the resource it holds; anything else sent to
it is ignored. Gates and Formulas read the *total* of a resource across all
pools.

**Capacity.** Whatever doesn't fit into a pool is lost.

**Determinism.** Everything random (Chance, Player Action) uses the seed.
Same graph, same seed and same settings always give the same result. Change
the seed to see a different outcome of the same luck.

**Loops.** Graphs may contain feedback loops. A loop made only of routing
nodes (Gate, Splitter, Chance) is cut after 64 hops in a single tick, so it
can't freeze the simulation.

**FREE limits.** The FREE edition runs graphs of up to 15 nodes for up to
120 simulated seconds.

---

## Pool

Stores one resource.

| Field | Meaning |
|---|---|
| Resource | Name of the resource it holds. Empty = takes the first resource that flows in. |
| Capacity | Maximum amount. Overflow is lost. |
| Initial Amount | Amount at t = 0 (clamped to 0 … capacity). |

A pool doesn't do anything on its own. Connect a Source/Converter/Timer into
it to fill it, and connect it into a Drain or Converter to empty it.

## Source

Produces a resource at a constant rate.

| Field | Meaning |
|---|---|
| Resource | What it produces. |
| Rate (per second) | Produces rate × Δt every tick. |

Example: rate 2 produces 2 per second, so 120 over a 60-second run,
whatever the time step.

If nothing is connected to the output, the production is lost.

## Converter

Turns one resource into another, like a crafting station or a factory.

| Field | Meaning |
|---|---|
| Input Resource / Input Amount (per cycle) | What one cycle consumes. |
| Output Resource / Output Amount (per cycle) | What one cycle produces. |
| Cycle Time (seconds) | Length of one cycle. |

Every tick the converter wants `input amount × (Δt ÷ cycle time)` of input.
It takes it first from its own buffer (see below), then pulls the rest from
the pools connected into it (in connection order). It produces output in the
same ratio as the input it actually got, so **partial input gives partial
output**: getting half the input produces half the output. The output is
pushed to all connected nodes (copied).

Flow that is *pushed* into a converter (for example Source → Converter)
lands in a small input buffer. The buffer holds at most one tick (or one
cycle, if that is larger) of input; anything beyond that is lost. Input of
any other resource is ignored.

Example: Wood 5 → Planks 2, cycle 1 s, Δt 1. With 3 Wood available, the
converter takes 3 and makes 1.2 Planks.

## Drain

Removes a resource from the game: spending, decay, upkeep, a sink.

| Field | Meaning |
|---|---|
| Resource | What it consumes. |
| Rate (per second) | Removes up to rate × Δt every tick. |

It pulls from the pools connected into it, in connection order, and only
takes what is there. An empty pool simply means the drain consumes less.
Drains can pull through an open Gate (Pool → Gate → Drain).

## Gate

A condition that opens or closes a path. "Only after the player has 100
Gold", "only while Energy ≥ 10".

| Field | Meaning |
|---|---|
| Resource (total of all pools) | The resource to watch, by **name**, summed over all pools. |
| Operator | `>`, `>=`, `<`, `<=`, `==`, `!=` |
| Threshold | The value to compare with. |

The condition is checked when the simulation starts and at the end of every
tick, so a change takes effect on the next tick.

- **Open:** anything pushed into the gate passes to all of its outputs
  (copied, like any other fan-out). Drains and Converters behind it can pull
  through it from the pools in front of it.
- **Closed:** pushed flow is lost, and pulling through it gets nothing.

The gate watches a resource name, not a specific pool. If you type a pool's
ID instead of its resource name, the gate never opens; the Issues panel warns
about this.

## Chance

A random branch: loot drops, crits, success/failure of an action.

| Field | Meaning |
|---|---|
| Success Chance | 0–100 %. 0 never succeeds, 100 always does. |

Every time flow arrives at the node, it rolls **once**:

- success → the whole amount goes out of the **green** output (port 0)
- failure → the whole amount goes out of the **red** output (port 1)

It does **not** split the flow proportionally. A Source sending 10 per tick
into a 30 % Chance sends 10 to the green output in roughly 3 ticks out of
10, and 10 to the red one in the others. For a steady split (3 of every 10
units, every tick) use a Splitter in weighted mode instead.

Each delivery rolls separately: two Sources pushing into the same Chance
cause two rolls per tick. Rolls use the seed.

## Splitter

Divides flow.

| Field | Meaning |
|---|---|
| Split Mode | Equal or Weighted. |
| Output Count | How many weights you plan to use (the flow is always divided across all connections). |
| Weights | Comma-separated, e.g. `7,3`. Applied in connection order. Missing or invalid weights count as 1. |

Equal: each connection gets `amount ÷ number of connections`. Weighted:
each gets `amount × weight ÷ sum of weights`. Nothing is copied and nothing
is lost.

## Timer

An exact, regular pulse: daily login reward, a wave every 30 seconds.

| Field | Meaning |
|---|---|
| Resource | What it sends. |
| Amount per pulse | How much each pulse sends. |
| Interval (seconds) | Time between pulses. |

The first pulse comes after one full interval, not at t = 0. If Δt is longer
than the interval, the timer fires several times in that tick, so no pulse
is skipped.

## Formula

Production that depends on the state of the economy: income that grows with
level, interest on savings.

| Field | Meaning |
|---|---|
| Expression (per second) | A rate per second, e.g. `Level * 1.5` or `Gold * 0.01`. |
| Output Resource | What it produces. |

Every tick it evaluates the expression and produces `result × Δt` of the
output resource, pushed to all connected nodes. A negative result produces
nothing.

- Variables: any resource name (its total across all pools) and `tick` (the
  tick number; equal to seconds when Δt is 1).
- Allowed: numbers, `+ - * /`, parentheses, unary minus. No functions.
- Unknown names count as 0. Division by zero produces nothing for that tick.

## Player Action

A player doing something by hand, at an irregular pace: clicking "gather",
opening chests, fighting.

| Field | Meaning |
|---|---|
| Resource | What one action sends. |
| Amount per action | How much each action sends. |
| Average cadence (seconds) | On average one action every N seconds. |

Each tick it fires a random number of times that averages out to
`Δt ÷ cadence`. The timing varies, the long-run average doesn't. For an
exact interval use Timer.

---

## Common patterns

**Divide production 70 / 30.** Source → Splitter (Weighted, `7,3`) → two
pools.

**Income that starts after a threshold.** Source → Gate (XP `>=` 100) →
Gold pool. Nothing reaches the pool until there is 100 XP in total.

**Spend only while you can afford it.** Gold pool → Gate (Gold `>=` 50) →
Drain. The drain stops as soon as Gold drops below 50.

**Loot table.** Source (1 drop per second) → Chance 5 % → green: Legendary
pool; red: Chance 30 % → green: Rare pool, red: Common pool. That gives 5 %
legendary, 28.5 % rare (95 % × 30 %), 66.5 % common.

**Crafting chain.** Wood pool → Converter (Wood → Planks) → Planks pool →
Converter (Planks → Furniture) → Furniture pool.

## Validation messages

Shown under the editor. **Errors** stop the simulation from running;
warnings and info don't.

| Message | Severity | What to do |
|---|---|---|
| Not connected to anything yet | Warning | Connect the node or delete it. |
| Sends the full amount to each of its N connections | Info | Intended? Fine. Otherwise put a Splitter after the node. |
| Pool has no incoming connections | Info | The pool will never fill (unless it has an initial amount). |
| Gate watches a pool ID, not a resource name | Warning | Type the resource name (e.g. `Gold`). |
| Initial amount above capacity | Warning | The pool starts at its capacity. |
| Negative or invalid value (rate, interval, cycle time, amount…) | Error, for some amounts Warning | Use a positive number. |
| Empty resource name | Warning | Type the resource name. |
| Chance outside 0–100 % | Error | Use a value from 0 to 100. |
| Converter is missing input/output settings | Warning or Error | Fill in input and output resource, amounts and cycle time. |
| Formula is empty or has a syntax error | Error | Fix the expression. |
| Feedback loop detected | Info | Loops are allowed; just make sure it's intended. |
| Routing loop | Warning | A loop made only of Gates/Splitters/Chances; it is cut after 64 hops. |
