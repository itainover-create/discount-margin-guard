# Flight model & systems (C++ core) — v2.0

Source: `core/src/sim.cpp`, aircraft data `core/src/aircraft_trainer.cpp`,
atmosphere/wind `core/include/osk/atmosphere.h`. Fixed 240 Hz integration,
semi-implicit Euler, quaternion attitude, NED inside the core.

## What is modelled

| Subsystem | Model |
|---|---|
| Atmosphere | ISA with QNH and temperature deviation; density altitude affects lift, drag, thrust, engine power |
| Wind | Direction/speed at 10 m with a power-law shear, gusts (random onsets with rise/decay), Dryden-like turbulence (filtered noise scaled with altitude and wind); crosswind acts through the relative airflow (weathervaning, drift) |
| Aerodynamics | Coefficient build-up per axis: CL(α) with smooth stall rounding and post-stall flat-plate blend, flap ΔCL/ΔCD/ΔCm, induced drag (k·CL²), sideslip forces, roll/yaw damping, adverse yaw, dihedral effect, weathercock stability, pitch damping, downwash lag; elevator moment saturates (horizontal tail stall) so full-aft stick cannot hold a deep stall; ground effect (lift ↑, induced drag ↓); prop slipstream raises tail dynamic pressure (rudder/elevator authority at low speed) |
| Stall | CL peak at 18° α, asymmetric wing-drop tendency with sideslip/aileron, stall horn ~5 kt above stall; spin tendency with yaw at stall |
| Engine | 180 hp fuel-injected piston: manifold pressure from throttle and rpm (intake vacuum), power ∝ MAP·rpm minus friction and pumping losses, fuel/air ratio from mixture and density (leaning at altitude), priming and flooding, starter torque vs bus voltage, magneto drop, EGT/oil temperature/oil pressure dynamics, fuel starvation, engine-failure and rough-running failures |
| Propeller | Fixed-pitch, Ct(J)/Cp(J) polynomials, windmilling, torque reaction (roll), P-factor and slipstream swirl (yaw), gyroscopic coupling |
| Fuel | Two wing tanks, selector L/R/BOTH, shutoff, aux pump, consumption from air mass flow × FAR, lateral imbalance moment, mass/CG update |
| Electrical | 24 V battery (state of charge, internal resistance), 28 V alternator (needs rpm), bus loads (avionics, lights, pitot heat, starter), low-volts annunciator; radios/AP need avionics power |
| Gear & ground | Tricycle spring-damper struts, tyre side-force with slip, rolling friction per surface (asphalt/concrete/grass/water), differential toe brakes (μ 0.40 dry, 0.28 grass), parking brake with static anchor, nose-wheel steering via rudder pedals + castering, structural contact points (tail, wingtips, prop tip, belly), crash detection (impact speed, g, prop strike, water) |
| Flight controls | Ailerons, elevator, rudder with rate limits; elevator trim; flaps 0/10/20/30 with motor speed and over-speed damage |
| Instruments | Pitot-static ASI (with lag, pitot failure), altimeter with Kollsman setting, VSI with lag, vacuum attitude indicator and heading indicator (spin-up, tumble limits, precession drift), electric turn coordinator and ball, magnetic compass (turning/acceleration errors simplified), tachometer, fuel gauges, oil T/P, EGT, fuel flow, suction, volts, ammeter |
| Autopilot | 2-axis (KAP140-like): ROL / HDG / NAV (GPS track) lateral, VS / ALT vertical, electric trim servo, disconnect on pilot override |
| Accessible assists (core bitmask) | Auto-rudder, stall protection (α limiter), attitude hold when centred, auto-mixture, perfect gyros, easy start, crash tolerance, taxi assist |

## Simplifications (stated plainly)
* Rigid airframe; no aeroelasticity. (v2 adds per-part structural damage — see the damage model below.)
* Aerodynamic coefficients are a fitted build-up, not CFD/wind-tunnel tables; post-stall/spin
  behaviour is qualitative (it spins and recovers like a trainer, but spin rates are not calibrated).
* Instrument errors: no pitot position error (IAS = CAS), compass errors simplified.
* Engine: no carburettor icing (fuel-injected), no detailed cylinder-head temperatures,
  no turbulence-dependent oil consumption.
* Ground: flat tyre/strut model; no tyre wear, no hydroplaning (wetness only reduces μ).
* Weather: wind is uniform horizontally (no terrain-induced flows, no rotor, no thermals).

## Calibration (native test harness, `make test`)

Reference values are typical published figures for the 180 hp C172S performance class
(MTOW, sea level, ISA unless noted). Results from the current build:

| Test | Result | Reference | Accepted | Status |
|---|---|---|---|---|
| Parked drift over 10 s (brake set) | 0.00 m | 0 | ≤ 0.05 | PASS |
| Engine start: crank time to catch | 1.83 s | 2 | 0.5–6 | PASS |
| Start after 60 s parked (easy start, no aux pump) | 1.83 s | 2 | 0.5–6 | PASS |
| Ground idle rpm | 781 rpm | 650 | 550–900 | PASS |
| Alternator bus volts at ~1000 rpm | 28.5 V | 28.5 | 27.5–29 | PASS |
| Static full-throttle rpm | 2318 rpm | 2350 | 2200–2500 | PASS |
| Static thrust | 2841 N | 2700 | 2200–3300 | PASS |
| Full-throttle fuel flow (static) | 11.6 gph | 13 | 10–16 | PASS |
| Battery only: SOC after 20 min at 20 A | 0.74 | 0.73 | 0.6–0.85 | PASS |
| Takeoff ground roll | 1002 ft | 960 | 760–1250 | PASS |
| Lift-off speed | 61.8 KIAS | 55 | 50–62 | PASS |
| Takeoff distance over 50 ft | 1845 ft | 1630 | 1250–2100 | PASS |
| Max rate of climb at Vy | 672 fpm | 730 | 600–880 | PASS |
| Max level speed (~1000 ft) | 125.3 KTAS | 124 | 117–131 | PASS |
| RPM at max level speed | 2729 rpm | 2700 | 2550–2800 | PASS |
| Full throttle at 8000 ft | 118.1 KTAS | 122 | 114–130 | PASS |
| Fuel flow at 8000 ft | 9.5 gph | 9.5 | 8–11.5 | PASS |
| Stall speed clean (Vs1) | 51.2 KCAS | 48 | 45–54 | PASS |
| Stall speed flaps 30 (Vso) | 43.3 KCAS | 40 | 37–46 | PASS |
| Stall warning | 53.5 KIAS | 55 | 50–62 | PASS |
| Glide ratio at 68 KIAS | 8.1 : 1 | 9 | 7.8–10.5 | PASS |
| Landing ground roll (max braking) | 435 ft | 575 | 420–760 | PASS |
| Roll rate, full aileron, 90 KIAS | 34 °/s | 45 | 30–70 | PASS |
| Short period damped (3–5 s) | 0.65 °/s | 0 | ≤ 2 | PASS |
| Phugoid period | 23.8 s | 30 | 15–50 | PASS |
| AP altitude hold in light turbulence | 15 ft | 0 | ≤ 80 | PASS |
| AP heading capture error | 1.9° | 0 | ≤ 3 | PASS |
| Accessible: max bank hands-off in turbulence | 3.9° | 0 | ≤ 12 | PASS |
| Accessible: stall protection (frames stalled) | 0 | 0 | ≤ 30 | PASS |
| 15 kt crosswind takeoff: heading deviation | 3.2° | 0 | ≤ 6 | PASS |
| + crash detection, gear compression, AP disconnect, runway-lock & A* checks | | | | PASS |

**48 / 48 checks pass.** Known deviations inside the accepted bands: lift-off speed and
50 ft distance are on the high side; landing roll is short (strong braking); the
windmilling rpm is low. These are documented, not hidden.


---

# v2.0 — the fleet, turbofans, fly-by-wire and damage

Sources: `core/src/aircraft_fleet.cpp` (fleet data), `core/src/sim.cpp` (`updateJets`,
`fbw`, `updateDamage`, `hitPart`, `aero`, `contacts`), `core/tests/test_fleet.h` (calibration).

## Fleet data
Each aircraft is defined by its own geometry (wing area, span, MAC, length, sweep), masses
(MTOW, OEW, fuel), engines (count, static thrust, afterburner, idle N1, spool times, TSFC,
thrust lapse, reversers, thrust vectoring, engine positions), landing gear (wheelbase, track,
CG height, retraction time, VLE), structural contact points (tail-strike angle, wingtips,
nacelles, belly, nose), limits (VMO/MMO, critical Mach, wave drag, g limits, gear collapse
sink rate), high-lift system (detents, Vfe, CLmax clean/landing) and flight-control law.
The lift slope comes from aspect ratio and sweep (DATCOM/Helmbold); stability derivatives
are class-typical values for airliners, business jets, fighters (relaxed stability, body /
vortex lift) and the flying wing (drag rudders). Inertias come from radii of gyration.

## Turbofan model
* N1 first-order spool with a slower response off idle (spool-up 3-5 s airliners, ~1.5 s
  fighters); N2 follows; EGT, fuel flow and generator power from the spool state.
* Thrust = static thrust × spool fraction (idle fraction + x^1.6) × lapse. High-bypass lapse
  falls quickly at low Mach and flattens at cruise; low-bypass gains from ram pressure.
  Afterburner above the 92 % throttle detent with its own lapse and TSFC.
* Start: starter motors N2 to ~25 %, fuel control RUN at > 20 % N2 → light-off, ~25 s to
  stabilised idle; starter cut-out at ~56 % N2; windmilling in flight.
* Thrust reversers on the ground; engines at their real positions, so engine-out thrust
  asymmetry yaws the aircraft.

## Fly-by-wire normal law (FlyByWireG aircraft)
* Pitch: the stick commands load factor (C*: pitch-rate command plus nz feedback). Gains are
  normalised by the elevator needed per g at the current flight condition, so the law feels
  the same from the approach to Mach 2. Hands off, it holds the flight path; auto-trim
  offloads the integrator.
* Roll: rate command (15°/s airliners, up to 240°/s fighters); hands off holds the bank;
  beyond 33° it returns to 33° (Airbus-style), bank protection 67°.
* Protections: load factor (+2.5/−1 g airliners, +9/−3 fighters), angle of attack (relative
  to the flight path), pitch attitude (+30/−15° Airbus-style), overspeed nose-up.
* Direct law on the ground, below 8 m in the flare, and after failures (hydraulics < 30 %,
  tail lost, electrical failure).
* Conventional-control airliners (737-, 747-class) fly directly from the stick with a yaw
  damper; the autopilot trims through the stabiliser.

## Systems
Retractable gear (hydraulic, free-fall without pressure, squat switch), speed brake, armed
ground spoilers (deploy on the ground at idle or with reverse), autothrottle (speed hold,
rate-limited levers), engine-driven generators, per-side fuel feed with automatic crossfeed,
inertial attitude reference, stratosphere-calibrated altimeter, wave drag beyond Mcrit (Lock),
gear and speed-brake drag.

## Damage model
Parts: left/right wing, tail, fuselage, each engine, each gear leg (0 = intact … 1 = lost).
| Cause | Consequence |
|---|---|
| Structure touching the ground (wingtip, tail, nacelle, belly, nose) | Damage from impact speed and sliding speed; only a violent impact is an immediate crash |
| Load factor beyond 1.5 × limit (ultimate) | Wing failure within tenths of a second; above limit load the wings deform (permanent damage) |
| Speed beyond 1.12 × VNE or MMO + 0.06 | Flutter: tail and wings damaged progressively |
| Gear sink rate beyond its design value, or gear not locked | Leg separates; airframe lands on its belly / nacelles; crash only beyond 2.2 × the collapse sink rate |
| Building strike by a wing tip (host collision probes) | That wing separates |
| Engine damage > 0.6 | Engine fire: spreads damage to the engine and wing; fire handle cuts fuel and discharges the bottle (out after ~2 s); engine damage > 0.55 fails the engine |
| Wing damage | Lift loss on that side (rolling moment), aileron effectiveness loss, drag, fuel leak (> 15 % damage) |
| Wing lost | 42 % lift loss on that side, uncontrollable roll |
| Tail damage / lost | Pitch and yaw stability and control power lost (wing-body alone is unstable) |
| Hydraulic leak (wings, tail, engines) | Slower or frozen surfaces, no flaps, gear only by free-fall; FBW degrades to direct law |
| Fuselage damage > 0.65 | Electrical failure: displays black (instrument blackout); ≥ 1: break-up |

## Fleet calibration (native harness, `make test` — 368/368 checks pass in this build)
References are public figures for the real type each design is modelled on (TOFL at MTOW,
typical cruise fuel flow at that weight, V-speeds, roll rates, performance envelopes).
Takeoffs: MTOW, SL ISA, takeoff flaps, full thrust (fighters clean with afterburner);
cruise: autopilot ALT + autothrottle Mach hold; approach: landing flaps, gear down, A/T at Vref.

| Test | Result | Reference | Accepted range | Status |
|---|---|---|---|---|
| Meridian 738 (737-800 class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 1945.31 m | 2400.0 | 1728.0 – 3000.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Meridian 738 (737-800 class): lift-off speed / Vr | 1.09  | 1.1 | 1.0 – 1.2 | PASS |
| Meridian 738 (737-800 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Meridian 738 (737-800 class): cruise M0.79 FL350 on AP+AT, altitude hold | 0.02 ft | 0.0 | 0.0 – 100.0 | PASS |
| Meridian 738 (737-800 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Meridian 738 (737-800 class): cruise N1 (thrust margin) | 77.17 % | 85.0 | 70.0 – 97.0 | PASS |
| Meridian 738 (737-800 class): cruise fuel flow | 2101.39 kg/h | 2450.0 | 1715.0 – 3307.5 | PASS | ref: typical block fuel / time at that weight
| Meridian 738 (737-800 class): 3-deg approach pitch attitude at Vref | 1.62 deg | 2.5 | -1.0 – 6.0 | PASS |
| Meridian 738 (737-800 class): approach N1 (AT, landing config) | 51.19 % | 55.0 | 35.0 – 82.0 | PASS |
| Meridian 738 (737-800 class): approach speed hold (AT) | 1.77 kt | 0.0 | 0.0 – 6.0 | PASS |
| Meridian 738 (737-800 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Aurora 320 (A320 class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 1848.53 m | 2100.0 | 1512.0 – 2625.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Aurora 320 (A320 class): lift-off speed / Vr | 1.09  | 1.1 | 1.0 – 1.2 | PASS |
| Aurora 320 (A320 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Aurora 320 (A320 class): cruise M0.78 FL350 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Aurora 320 (A320 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Aurora 320 (A320 class): cruise N1 (thrust margin) | 75.47 % | 85.0 | 70.0 – 97.0 | PASS |
| Aurora 320 (A320 class): cruise fuel flow | 1904.53 kg/h | 2400.0 | 1680.0 – 3240.0 | PASS | ref: typical block fuel / time at that weight
| Aurora 320 (A320 class): 3-deg approach pitch attitude at Vref | 3.07 deg | 2.5 | -1.0 – 6.0 | PASS |
| Aurora 320 (A320 class): approach N1 (AT, landing config) | 47.55 % | 55.0 | 35.0 – 82.0 | PASS |
| Aurora 320 (A320 class): approach speed hold (AT) | 0.38 kt | 0.0 | 0.0 – 6.0 | PASS |
| Aurora 320 (A320 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Horizon 789 (787-9 class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2795.65 m | 2900.0 | 2088.0 – 3625.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Horizon 789 (787-9 class): lift-off speed / Vr | 1.05  | 1.1 | 1.0 – 1.2 | PASS |
| Horizon 789 (787-9 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Horizon 789 (787-9 class): cruise M0.85 FL390 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Horizon 789 (787-9 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Horizon 789 (787-9 class): cruise N1 (thrust margin) | 87.16 % | 85.0 | 70.0 – 97.0 | PASS |
| Horizon 789 (787-9 class): cruise fuel flow | 4773.02 kg/h | 5600.0 | 3920.0 – 7560.0 | PASS | ref: typical block fuel / time at that weight
| Horizon 789 (787-9 class): 3-deg approach pitch attitude at Vref | 2.33 deg | 2.5 | -1.0 – 6.0 | PASS |
| Horizon 789 (787-9 class): approach N1 (AT, landing config) | 53.51 % | 55.0 | 35.0 – 82.0 | PASS |
| Horizon 789 (787-9 class): approach speed hold (AT) | 0.64 kt | 0.0 | 0.0 – 6.0 | PASS |
| Horizon 789 (787-9 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Titan 77W (777-300ER class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2734.71 m | 3100.0 | 2232.0 – 3875.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Titan 77W (777-300ER class): lift-off speed / Vr | 1.06  | 1.1 | 1.0 – 1.2 | PASS |
| Titan 77W (777-300ER class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Titan 77W (777-300ER class): cruise M0.84 FL350 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Titan 77W (777-300ER class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Titan 77W (777-300ER class): cruise N1 (thrust margin) | 76.51 % | 85.0 | 70.0 – 97.0 | PASS |
| Titan 77W (777-300ER class): cruise fuel flow | 7096.59 kg/h | 7800.0 | 5460.0 – 10530.0 | PASS | ref: typical block fuel / time at that weight
| Titan 77W (777-300ER class): 3-deg approach pitch attitude at Vref | 4.82 deg | 2.5 | -1.0 – 6.0 | PASS |
| Titan 77W (777-300ER class): approach N1 (AT, landing config) | 49.38 % | 55.0 | 35.0 – 82.0 | PASS |
| Titan 77W (777-300ER class): approach speed hold (AT) | 0.77 kt | 0.0 | 0.0 – 6.0 | PASS |
| Titan 77W (777-300ER class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Monarch 744 (747-400 class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2751.95 m | 3200.0 | 2304.0 – 4000.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Monarch 744 (747-400 class): lift-off speed / Vr | 1.06  | 1.1 | 1.0 – 1.2 | PASS |
| Monarch 744 (747-400 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Monarch 744 (747-400 class): cruise M0.85 FL350 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Monarch 744 (747-400 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Monarch 744 (747-400 class): cruise N1 (thrust margin) | 84.31 % | 85.0 | 70.0 – 97.0 | PASS |
| Monarch 744 (747-400 class): cruise fuel flow | 10553.42 kg/h | 11000.0 | 7700.0 – 14850.0 | PASS | ref: typical block fuel / time at that weight
| Monarch 744 (747-400 class): 3-deg approach pitch attitude at Vref | 3.55 deg | 2.5 | -1.0 – 6.0 | PASS |
| Monarch 744 (747-400 class): approach N1 (AT, landing config) | 57.62 % | 55.0 | 35.0 – 82.0 | PASS |
| Monarch 744 (747-400 class): approach speed hold (AT) | 3.78 kt | 0.0 | 0.0 – 6.0 | PASS |
| Monarch 744 (747-400 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Zephyr 359 (A350-900 class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2458.08 m | 2600.0 | 1872.0 – 3250.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Zephyr 359 (A350-900 class): lift-off speed / Vr | 1.06  | 1.1 | 1.0 – 1.2 | PASS |
| Zephyr 359 (A350-900 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Zephyr 359 (A350-900 class): cruise M0.85 FL390 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Zephyr 359 (A350-900 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Zephyr 359 (A350-900 class): cruise N1 (thrust margin) | 85.35 % | 85.0 | 70.0 – 97.0 | PASS |
| Zephyr 359 (A350-900 class): cruise fuel flow | 5218.47 kg/h | 5800.0 | 4060.0 – 7830.0 | PASS | ref: typical block fuel / time at that weight
| Zephyr 359 (A350-900 class): 3-deg approach pitch attitude at Vref | 3.10 deg | 2.5 | -1.0 – 6.0 | PASS |
| Zephyr 359 (A350-900 class): approach N1 (AT, landing config) | 51.58 % | 55.0 | 35.0 – 82.0 | PASS |
| Zephyr 359 (A350-900 class): approach speed hold (AT) | 0.78 kt | 0.0 | 0.0 – 6.0 | PASS |
| Zephyr 359 (A350-900 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Colossus 388 (A380 class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 3245.05 m | 2900.0 | 2088.0 – 3625.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Colossus 388 (A380 class): lift-off speed / Vr | 1.05  | 1.1 | 1.0 – 1.2 | PASS |
| Colossus 388 (A380 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Colossus 388 (A380 class): cruise M0.85 FL350 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Colossus 388 (A380 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Colossus 388 (A380 class): cruise N1 (thrust margin) | 91.06 % | 85.0 | 70.0 – 97.0 | PASS |
| Colossus 388 (A380 class): cruise fuel flow | 13384.91 kg/h | 12000.0 | 8400.0 – 16200.0 | PASS | ref: typical block fuel / time at that weight
| Colossus 388 (A380 class): 3-deg approach pitch attitude at Vref | 5.42 deg | 2.5 | -1.0 – 6.0 | PASS |
| Colossus 388 (A380 class): approach N1 (AT, landing config) | 59.26 % | 55.0 | 35.0 – 82.0 | PASS |
| Colossus 388 (A380 class): approach speed hold (AT) | 0.69 kt | 0.0 | 0.0 – 6.0 | PASS |
| Colossus 388 (A380 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Vega 650 (G650 class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 1686.46 m | 1800.0 | 1296.0 – 2250.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Vega 650 (G650 class): lift-off speed / Vr | 1.08  | 1.1 | 1.0 – 1.2 | PASS |
| Vega 650 (G650 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Vega 650 (G650 class): cruise M0.85 FL450 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Vega 650 (G650 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Vega 650 (G650 class): cruise N1 (thrust margin) | 88.08 % | 85.0 | 70.0 – 97.0 | PASS |
| Vega 650 (G650 class): cruise fuel flow | 1225.47 kg/h | 1400.0 | 980.0 – 1890.0 | PASS | ref: typical block fuel / time at that weight
| Vega 650 (G650 class): 3-deg approach pitch attitude at Vref | 0.41 deg | 2.5 | -1.0 – 6.0 | PASS |
| Vega 650 (G650 class): approach N1 (AT, landing config) | 52.51 % | 55.0 | 35.0 – 82.0 | PASS |
| Vega 650 (G650 class): approach speed hold (AT) | 0.18 kt | 0.0 | 0.0 – 6.0 | PASS |
| Vega 650 (G650 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Talon 15 (F-15C class): takeoff ground roll (clean, AB) | 311.64 m | 450.0 | 150.0 – 900.0 | PASS |
| Talon 15 (F-15C class): lift-off speed / Vr | 1.30  | 1.1 | 1.0 – 1.4 | PASS | afterburner: fast acceleration during rotation
| Talon 15 (F-15C class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Talon 15 (F-15C class): cruise M0.90 FL300 on AP+AT, altitude hold | 0.02 ft | 0.0 | 0.0 – 100.0 | PASS |
| Talon 15 (F-15C class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Talon 15 (F-15C class): cruise N1 (thrust margin) | 82.54 % | 85.0 | 70.0 – 97.0 | PASS |
| Talon 15 (F-15C class): cruise fuel flow | 2899.80 kg/h | 3500.0 | 2450.0 – 4725.0 | PASS | ref: typical block fuel / time at that weight
| Talon 15 (F-15C class): 3-deg approach pitch attitude at Vref | 4.98 deg | 8.0 | 2.0 – 14.0 | PASS |
| Talon 15 (F-15C class): approach N1 (AT, landing config) | 75.74 % | 55.0 | 35.0 – 82.0 | PASS |
| Talon 15 (F-15C class): approach speed hold (AT) | 0.02 kt | 0.0 | 0.0 – 6.0 | PASS |
| Talon 15 (F-15C class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Specter 22 (F-22 class): takeoff ground roll (clean, AB) | 338.78 m | 450.0 | 150.0 – 900.0 | PASS |
| Specter 22 (F-22 class): lift-off speed / Vr | 1.30  | 1.1 | 1.0 – 1.4 | PASS | afterburner: fast acceleration during rotation
| Specter 22 (F-22 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Specter 22 (F-22 class): cruise M0.90 FL300 on AP+AT, altitude hold | 0.02 ft | 0.0 | 0.0 – 100.0 | PASS |
| Specter 22 (F-22 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Specter 22 (F-22 class): cruise N1 (thrust margin) | 78.87 % | 85.0 | 70.0 – 97.0 | PASS |
| Specter 22 (F-22 class): cruise fuel flow | 3930.31 kg/h | 3500.0 | 2450.0 – 4725.0 | PASS | ref: typical block fuel / time at that weight
| Specter 22 (F-22 class): 3-deg approach pitch attitude at Vref | 7.51 deg | 8.0 | 2.0 – 14.0 | PASS |
| Specter 22 (F-22 class): approach N1 (AT, landing config) | 76.07 % | 55.0 | 35.0 – 82.0 | PASS |
| Specter 22 (F-22 class): approach speed hold (AT) | 0.02 kt | 0.0 | 0.0 – 6.0 | PASS |
| Specter 22 (F-22 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Arrow 35 (F-35A class): takeoff ground roll (clean, AB) | 473.10 m | 450.0 | 150.0 – 900.0 | PASS |
| Arrow 35 (F-35A class): lift-off speed / Vr | 1.23  | 1.1 | 1.0 – 1.4 | PASS | afterburner: fast acceleration during rotation
| Arrow 35 (F-35A class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Arrow 35 (F-35A class): cruise M0.90 FL300 on AP+AT, altitude hold | 0.02 ft | 0.0 | 0.0 – 100.0 | PASS |
| Arrow 35 (F-35A class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Arrow 35 (F-35A class): cruise N1 (thrust margin) | 83.47 % | 85.0 | 70.0 – 97.0 | PASS |
| Arrow 35 (F-35A class): cruise fuel flow | 3137.19 kg/h | 3000.0 | 2100.0 – 4050.0 | PASS | ref: typical block fuel / time at that weight
| Arrow 35 (F-35A class): 3-deg approach pitch attitude at Vref | 9.67 deg | 8.0 | 2.0 – 14.0 | PASS |
| Arrow 35 (F-35A class): approach N1 (AT, landing config) | 80.69 % | 55.0 | 35.0 – 82.0 | PASS |
| Arrow 35 (F-35A class): approach speed hold (AT) | 0.02 kt | 0.0 | 0.0 – 6.0 | PASS |
| Arrow 35 (F-35A class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Nightwing 2 (B-2 class): takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2877.53 m | 3000.0 | 2160.0 – 3750.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Nightwing 2 (B-2 class): lift-off speed / Vr | 1.07  | 1.1 | 1.0 – 1.2 | PASS |
| Nightwing 2 (B-2 class): takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Nightwing 2 (B-2 class): cruise M0.80 FL400 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Nightwing 2 (B-2 class): cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Nightwing 2 (B-2 class): cruise N1 (thrust margin) | 87.88 % | 85.0 | 70.0 – 97.0 | PASS |
| Nightwing 2 (B-2 class): cruise fuel flow | 6224.97 kg/h | 6000.0 | 4200.0 – 8100.0 | PASS | ref: typical block fuel / time at that weight
| Nightwing 2 (B-2 class): 3-deg approach pitch attitude at Vref | 5.51 deg | 2.5 | -1.0 – 6.0 | PASS |
| Nightwing 2 (B-2 class): approach N1 (AT, landing config) | 39.62 % | 55.0 | 35.0 – 82.0 | PASS |
| Nightwing 2 (B-2 class): approach speed hold (AT) | 0.80 kt | 0.0 | 0.0 – 6.0 | PASS |
| Nightwing 2 (B-2 class): approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Cessna Citation CJ4: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 1017.76 m | 1039.0 | 748.1 – 1298.8 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Cessna Citation CJ4: lift-off speed / Vr | 1.16  | 1.1 | 1.0 – 1.2 | PASS |
| Cessna Citation CJ4: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Cessna Citation CJ4: cruise M0.70 FL450 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Cessna Citation CJ4: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Cessna Citation CJ4: cruise N1 (thrust margin) | 84.18 % | 85.0 | 70.0 – 97.0 | PASS |
| Cessna Citation CJ4: cruise fuel flow | 331.31 kg/h | 380.0 | 266.0 – 513.0 | PASS | ref: typical block fuel / time at that weight
| Cessna Citation CJ4: 3-deg approach pitch attitude at Vref | 1.35 deg | 2.5 | -1.0 – 6.0 | PASS |
| Cessna Citation CJ4: approach N1 (AT, landing config) | 48.89 % | 55.0 | 35.0 – 82.0 | PASS |
| Cessna Citation CJ4: approach speed hold (AT) | 0.07 kt | 0.0 | 0.0 – 6.0 | PASS |
| Cessna Citation CJ4: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Embraer Phenom 300E: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 1162.68 m | 978.0 | 704.2 – 1222.5 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Embraer Phenom 300E: lift-off speed / Vr | 1.17  | 1.1 | 1.0 – 1.2 | PASS |
| Embraer Phenom 300E: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Embraer Phenom 300E: cruise M0.74 FL410 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Embraer Phenom 300E: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Embraer Phenom 300E: cruise N1 (thrust margin) | 85.18 % | 85.0 | 70.0 – 97.0 | PASS |
| Embraer Phenom 300E: cruise fuel flow | 380.48 kg/h | 420.0 | 294.0 – 567.0 | PASS | ref: typical block fuel / time at that weight
| Embraer Phenom 300E: 3-deg approach pitch attitude at Vref | 0.16 deg | 2.5 | -1.0 – 6.0 | PASS |
| Embraer Phenom 300E: approach N1 (AT, landing config) | 49.24 % | 55.0 | 35.0 – 82.0 | PASS |
| Embraer Phenom 300E: approach speed hold (AT) | 0.09 kt | 0.0 | 0.0 – 6.0 | PASS |
| Embraer Phenom 300E: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Bombardier Global 7500: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 1774.95 m | 1756.0 | 1264.3 – 2195.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Bombardier Global 7500: lift-off speed / Vr | 1.12  | 1.1 | 1.0 – 1.2 | PASS |
| Bombardier Global 7500: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Bombardier Global 7500: cruise M0.85 FL450 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Bombardier Global 7500: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Bombardier Global 7500: cruise N1 (thrust margin) | 85.10 % | 85.0 | 70.0 – 97.0 | PASS |
| Bombardier Global 7500: cruise fuel flow | 1382.36 kg/h | 1600.0 | 1120.0 – 2160.0 | PASS | ref: typical block fuel / time at that weight
| Bombardier Global 7500: 3-deg approach pitch attitude at Vref | 4.92 deg | 2.5 | -1.0 – 6.0 | PASS |
| Bombardier Global 7500: approach N1 (AT, landing config) | 47.59 % | 55.0 | 35.0 – 82.0 | PASS |
| Bombardier Global 7500: approach speed hold (AT) | 0.20 kt | 0.0 | 0.0 – 6.0 | PASS |
| Bombardier Global 7500: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A220-300: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 1905.35 m | 1890.0 | 1360.8 – 2362.5 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Airbus A220-300: lift-off speed / Vr | 1.09  | 1.1 | 1.0 – 1.2 | PASS |
| Airbus A220-300: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A220-300: cruise M0.78 FL350 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Airbus A220-300: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A220-300: cruise N1 (thrust margin) | 78.47 % | 85.0 | 70.0 – 97.0 | PASS |
| Airbus A220-300: cruise fuel flow | 1569.49 kg/h | 1850.0 | 1295.0 – 2497.5 | PASS | ref: typical block fuel / time at that weight
| Airbus A220-300: 3-deg approach pitch attitude at Vref | 4.76 deg | 2.5 | -1.0 – 6.0 | PASS |
| Airbus A220-300: approach N1 (AT, landing config) | 47.49 % | 55.0 | 35.0 – 82.0 | PASS |
| Airbus A220-300: approach speed hold (AT) | 0.43 kt | 0.0 | 0.0 – 6.0 | PASS |
| Airbus A220-300: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Embraer E195-E2: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 1774.05 m | 1970.0 | 1418.4 – 2462.5 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Embraer E195-E2: lift-off speed / Vr | 1.09  | 1.1 | 1.0 – 1.2 | PASS |
| Embraer E195-E2: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Embraer E195-E2: cruise M0.78 FL350 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Embraer E195-E2: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Embraer E195-E2: cruise N1 (thrust margin) | 74.71 % | 85.0 | 70.0 – 97.0 | PASS |
| Embraer E195-E2: cruise fuel flow | 1404.34 kg/h | 1700.0 | 1190.0 – 2295.0 | PASS | ref: typical block fuel / time at that weight
| Embraer E195-E2: 3-deg approach pitch attitude at Vref | 4.26 deg | 2.5 | -1.0 – 6.0 | PASS |
| Embraer E195-E2: approach N1 (AT, landing config) | 44.41 % | 55.0 | 35.0 – 82.0 | PASS |
| Embraer E195-E2: approach speed hold (AT) | 0.48 kt | 0.0 | 0.0 – 6.0 | PASS |
| Embraer E195-E2: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing 737 MAX 8: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2011.97 m | 2500.0 | 1800.0 – 3125.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Boeing 737 MAX 8: lift-off speed / Vr | 1.09  | 1.1 | 1.0 – 1.2 | PASS |
| Boeing 737 MAX 8: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing 737 MAX 8: cruise M0.79 FL350 on AP+AT, altitude hold | 0.02 ft | 0.0 | 0.0 – 100.0 | PASS |
| Boeing 737 MAX 8: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing 737 MAX 8: cruise N1 (thrust margin) | 76.62 % | 85.0 | 70.0 – 97.0 | PASS |
| Boeing 737 MAX 8: cruise fuel flow | 1894.68 kg/h | 2150.0 | 1505.0 – 2902.5 | PASS | ref: typical block fuel / time at that weight
| Boeing 737 MAX 8: 3-deg approach pitch attitude at Vref | 1.87 deg | 2.5 | -1.0 – 6.0 | PASS |
| Boeing 737 MAX 8: approach N1 (AT, landing config) | 50.32 % | 55.0 | 35.0 – 82.0 | PASS |
| Boeing 737 MAX 8: approach speed hold (AT) | 1.95 kt | 0.0 | 0.0 – 6.0 | PASS |
| Boeing 737 MAX 8: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A321neo: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2231.31 m | 2300.0 | 1656.0 – 2875.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Airbus A321neo: lift-off speed / Vr | 1.08  | 1.1 | 1.0 – 1.2 | PASS |
| Airbus A321neo: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A321neo: cruise M0.78 FL350 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Airbus A321neo: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A321neo: cruise N1 (thrust margin) | 75.10 % | 85.0 | 70.0 – 97.0 | PASS |
| Airbus A321neo: cruise fuel flow | 2061.41 kg/h | 2400.0 | 1680.0 – 3240.0 | PASS | ref: typical block fuel / time at that weight
| Airbus A321neo: 3-deg approach pitch attitude at Vref | 5.34 deg | 2.5 | -1.0 – 6.0 | PASS |
| Airbus A321neo: approach N1 (AT, landing config) | 48.18 % | 55.0 | 35.0 – 82.0 | PASS |
| Airbus A321neo: approach speed hold (AT) | 0.42 kt | 0.0 | 0.0 – 6.0 | PASS |
| Airbus A321neo: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing 767-300ER: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2399.11 m | 2700.0 | 1944.0 – 3375.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Boeing 767-300ER: lift-off speed / Vr | 1.06  | 1.1 | 1.0 – 1.2 | PASS |
| Boeing 767-300ER: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing 767-300ER: cruise M0.80 FL350 on AP+AT, altitude hold | 0.02 ft | 0.0 | 0.0 – 100.0 | PASS |
| Boeing 767-300ER: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing 767-300ER: cruise N1 (thrust margin) | 78.85 % | 85.0 | 70.0 – 97.0 | PASS |
| Boeing 767-300ER: cruise fuel flow | 4761.36 kg/h | 5200.0 | 3640.0 – 7020.0 | PASS | ref: typical block fuel / time at that weight
| Boeing 767-300ER: 3-deg approach pitch attitude at Vref | 3.53 deg | 2.5 | -1.0 – 6.0 | PASS |
| Boeing 767-300ER: approach N1 (AT, landing config) | 54.29 % | 55.0 | 35.0 – 82.0 | PASS |
| Boeing 767-300ER: approach speed hold (AT) | 2.50 kt | 0.0 | 0.0 – 6.0 | PASS |
| Boeing 767-300ER: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A330-900: takeoff distance to 35 ft x1.15 (MTOW, SL ISA) | 2482.56 m | 2800.0 | 2016.0 – 3500.0 | PASS | ref: published TOFL (usually engine-out governed, longer)
| Airbus A330-900: lift-off speed / Vr | 1.05  | 1.1 | 1.0 – 1.2 | PASS |
| Airbus A330-900: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A330-900: cruise M0.82 FL370 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Airbus A330-900: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Airbus A330-900: cruise N1 (thrust margin) | 87.85 % | 85.0 | 70.0 – 97.0 | PASS |
| Airbus A330-900: cruise fuel flow | 5207.89 kg/h | 5700.0 | 3990.0 – 7695.0 | PASS | ref: typical block fuel / time at that weight
| Airbus A330-900: 3-deg approach pitch attitude at Vref | 1.16 deg | 2.5 | -1.0 – 6.0 | PASS |
| Airbus A330-900: approach N1 (AT, landing config) | 54.50 % | 55.0 | 35.0 – 82.0 | PASS |
| Airbus A330-900: approach speed hold (AT) | 0.66 kt | 0.0 | 0.0 – 6.0 | PASS |
| Airbus A330-900: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Lockheed Martin F-16C: takeoff ground roll (clean, AB) | 380.52 m | 450.0 | 150.0 – 900.0 | PASS |
| Lockheed Martin F-16C: lift-off speed / Vr | 1.28  | 1.1 | 1.0 – 1.4 | PASS | afterburner: fast acceleration during rotation
| Lockheed Martin F-16C: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Lockheed Martin F-16C: cruise M0.90 FL300 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Lockheed Martin F-16C: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Lockheed Martin F-16C: cruise N1 (thrust margin) | 80.68 % | 85.0 | 70.0 – 97.0 | PASS |
| Lockheed Martin F-16C: cruise fuel flow | 1504.75 kg/h | 1600.0 | 1120.0 – 2160.0 | PASS | ref: typical block fuel / time at that weight
| Lockheed Martin F-16C: 3-deg approach pitch attitude at Vref | 8.50 deg | 8.0 | 2.0 – 14.0 | PASS |
| Lockheed Martin F-16C: approach N1 (AT, landing config) | 75.88 % | 55.0 | 35.0 – 82.0 | PASS |
| Lockheed Martin F-16C: approach speed hold (AT) | 0.02 kt | 0.0 | 0.0 – 6.0 | PASS |
| Lockheed Martin F-16C: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing F/A-18E Super Hornet: takeoff ground roll (clean, AB) | 465.97 m | 450.0 | 150.0 – 900.0 | PASS |
| Boeing F/A-18E Super Hornet: lift-off speed / Vr | 1.21  | 1.1 | 1.0 – 1.4 | PASS | afterburner: fast acceleration during rotation
| Boeing F/A-18E Super Hornet: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing F/A-18E Super Hornet: cruise M0.85 FL300 on AP+AT, altitude hold | 0.01 ft | 0.0 | 0.0 – 100.0 | PASS |
| Boeing F/A-18E Super Hornet: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Boeing F/A-18E Super Hornet: cruise N1 (thrust margin) | 82.03 % | 85.0 | 70.0 – 97.0 | PASS |
| Boeing F/A-18E Super Hornet: cruise fuel flow | 2669.12 kg/h | 3200.0 | 2240.0 – 4320.0 | PASS | ref: typical block fuel / time at that weight
| Boeing F/A-18E Super Hornet: 3-deg approach pitch attitude at Vref | 7.61 deg | 8.0 | 2.0 – 14.0 | PASS |
| Boeing F/A-18E Super Hornet: approach N1 (AT, landing config) | 77.41 % | 55.0 | 35.0 – 82.0 | PASS |
| Boeing F/A-18E Super Hornet: approach speed hold (AT) | 0.02 kt | 0.0 | 0.0 – 6.0 | PASS |
| Boeing F/A-18E Super Hornet: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Eurofighter Typhoon: takeoff ground roll (clean, AB) | 350.15 m | 450.0 | 150.0 – 900.0 | PASS |
| Eurofighter Typhoon: lift-off speed / Vr | 1.22  | 1.1 | 1.0 – 1.4 | PASS | afterburner: fast acceleration during rotation
| Eurofighter Typhoon: takeoff without tail strike, crash or damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Eurofighter Typhoon: cruise M0.90 FL300 on AP+AT, altitude hold | 0.02 ft | 0.0 | 0.0 – 100.0 | PASS |
| Eurofighter Typhoon: cruise Mach hold (autothrottle) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Eurofighter Typhoon: cruise N1 (thrust margin) | 81.11 % | 85.0 | 70.0 – 97.0 | PASS |
| Eurofighter Typhoon: cruise fuel flow | 2645.47 kg/h | 2800.0 | 1960.0 – 3780.0 | PASS | ref: typical block fuel / time at that weight
| Eurofighter Typhoon: 3-deg approach pitch attitude at Vref | 7.90 deg | 8.0 | 2.0 – 14.0 | PASS |
| Eurofighter Typhoon: approach N1 (AT, landing config) | 76.25 % | 55.0 | 35.0 – 82.0 | PASS |
| Eurofighter Typhoon: approach speed hold (AT) | 0.02 kt | 0.0 | 0.0 – 6.0 | PASS |
| Eurofighter Typhoon: approach without stall warning | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| 738: cold & dark, engines stopped | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| 738: engine start, starter to stable idle | 43.13 s | 40.0 | 15.0 – 70.0 | PASS | ref: ~40-60 s per engine
| 738: idle N1 | 21.00 % | 21.0 | 18.0 – 24.0 | PASS |
| 738: generators on line (bus volts) | 28.00 V | 28.0 | 27.5 – 28.5 | PASS |
| 738: idle fuel flow (both engines) | 458.77 kg/h | 500.0 | 250.0 – 800.0 | PASS |
| 738: spool-up idle -> 95 % N1 | 3.75 s | 6.0 | 3.0 – 9.0 | PASS | ref: ~5-8 s (certification: < 5 s to go-around thrust from approach idle)
| 738: static takeoff thrust (2 engines) | 239.32 kN | 242.0 | 220.0 – 250.0 | PASS |
| 738: fuel levers cut-off stops both engines | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| A320 FBW: hands off 60 s in light turbulence, max bank | 0.36 deg | 0.0 | 0.0 – 3.0 | PASS |
| A320 FBW: hands off 60 s, altitude change | 2.40 ft | 0.0 | 0.0 – 150.0 | PASS | flight path held, auto-trim
| A320 FBW: half stick pull -> load factor | 1.65 g | 1.8 | 1.5 – 2.0 | PASS | C* law: stick = load factor demand
| A320 FBW: full stick, load factor protection | 2.24 g | 2.5 | 2.2 – 2.6 | PASS |
| A320 FBW: full roll stick, roll rate | 15.84 deg/s | 15.0 | 12.0 – 17.5 | PASS |
| A320 FBW: bank angle protection | 68.24 deg | 67.0 | 60.0 – 70.0 | PASS |
| A320 FBW: stick released beyond 33 deg -> rolls back to 33 | 33.24 deg | 33.0 | 28.0 – 36.0 | PASS |
| A320 FBW: full aft stick at idle, max alpha (protection) | 15.03 deg | 15.0 | 11.0 – 16.5 | PASS |
| A320 FBW: ... no stall | 0.00 frames | 0.0 | 0.0 – 0.0 | PASS |
| F-15 class: M0.9 -> M1.4 at FL300, full afterburner | 56.13 s | 60.0 | 20.0 – 120.0 | PASS |
| F-15 class: Mach after 150 s full AB at FL300 | 1.71  | 1.9 | 1.6 – 2.3 | PASS | ref: Vmax M2.5 at 40,000+ ft
| F-15 class: afterburner flag | 1.00  | 1.0 | 1.0 – 1.0 | PASS |
| F-15 class: full aft stick 450 KIAS, g limiter | 8.68 g | 9.0 | 8.3 – 9.4 | PASS |
| F-15 class: 9 g pull, no structural damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| F-22 class: supercruise, military power, FL400, Mach after 120 s | 1.56  | 1.6 | 1.4 – 1.8 | PASS | no afterburner
| F-22 class: supercruise without afterburner | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Stinger 330 (Extra 330 class): full aileron roll rate at 150 KIAS | 409.94 deg/s | 400.0 | 320.0 – 460.0 | PASS | ref: ~400 deg/s
| F-16C: full aft stick 450 KIAS, g limiter | 8.57 g | 9.0 | 8.3 – 9.4 | PASS | ref: +9 g FLCS limit
| F-16C: 9 g pull, no structural damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| F-16C: full lateral stick roll rate, 400 KIAS | 247.66 deg/s | 300.0 | 220.0 – 330.0 | PASS | ref: ~300 deg/s FLCS roll-rate limit
| F/A-18E: full aft stick 450 KIAS, g limiter | 7.28 g | 7.5 | 6.9 – 7.9 | PASS | ref: +7.5 g FCS limit
| F/A-18E: 7.5 g pull, no structural damage | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| Typhoon: full aft stick 450 KIAS, g limiter | 8.52 g | 9.0 | 8.3 – 9.4 | PASS | ref: +9 g carefree handling
| Typhoon: supercruise, military power, FL360, Mach after 120 s | 1.25  | 1.3 | 1.1 – 1.6 | PASS | ref: ~M1.1-1.5 without reheat
| Typhoon: supercruise without afterburner | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| A220-300 FBW: full roll stick, bank angle protection | 66.07 deg | 67.0 | 60.0 – 70.0 | PASS |
| 738 damage: engine 1 hit -> fire warning | 1.00  | 1.0 | 1.0 – 1.0 | PASS |
| 738 damage: damaged engine runs down (N1) | 17.20 % | 10.0 | 0.0 – 30.0 | PASS |
| 738 damage: AP holds heading on one engine | 0.93 deg | 0.0 | 0.0 – 5.0 | PASS |
| 738 damage: fire handle -> fire out | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| 738 damage: other engine still running | 1.00  | 1.0 | 1.0 – 1.0 | PASS |
| 738 damage: left wing separation -> parts lost flag | 1.00  | 1.0 | 1.0 – 1.0 | PASS |
| 738 damage: left wing separation -> rolls left | 179.56 deg | 90.0 | 45.0 – 180.0 | PASS |
| A320 damage: right wing hit -> fuel leak rate | 1.50 kg/s | 1.5 | 0.5 – 4.0 | PASS |
| A320 damage: right tank loses more fuel than left (kg in 60 s) | 90.00 kg | 90.0 | 30.0 – 250.0 | PASS |
| A320 damage: hydraulic pressure after heavy damage | 0.00  | 0.1 | 0.0 – 0.3 | PASS |
| A320 damage: FBW degraded to direct law | 2.00  | 2.0 | 2.0 – 2.0 | PASS |
| 738 overstress: full aft stick 330 KIAS, load factor reached | 4.59 g | 4.5 | 3.8 – 8.0 | PASS | limit 2.5 g, ultimate 3.75 g
| 738 overstress: wing failure (parts lost) | 1.00  | 1.0 | 1.0 – 1.0 | PASS |
| 738 landing roll: ground spoilers deployed | 1.00  | 1.0 | 0.9 – 1.0 | PASS |
| 738 landing roll: Vref -> stop, spoilers + reversers + max braking | 718.23 m | 850.0 | 600.0 – 1300.0 | PASS | ref: ~800-1000 m max manual braking, dry
| 738 gear-up landing: gear warning sounded | 1.00  | 1.0 | 1.0 – 1.0 | PASS |
| 738 gear-up landing: survivable (no crash) | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| 738 gear-up landing: nacelle / belly damage | 0.53  | 0.5 | 0.1 – 0.9 | PASS | 737 nacelles hang lowest and take the slide
| 738 gear-up landing: slides to a stop | 0.01 m/s | 0.0 | 0.0 – 1.0 | PASS |
| 738 hard landing 5 m/s: main gear legs fail | 1.00  | 1.0 | 1.0 – 1.0 | PASS |
| 738 hard landing 5 m/s: airframe survives | 0.00  | 0.0 | 0.0 – 0.0 | PASS |
| 738 impact 10 m/s: destroyed | 1.00  | 1.0 | 1.0 – 1.0 | PASS |

Notes: published TOFL is usually engine-out governed, so all-engine distances ×1.15 sit at
the low end of the accepted range; fighter lift-off speeds are well above the rotation speed
because afterburner acceleration during the rotation is ~10 kt/s.

## v2.1 real-type extension (ids 14-25)
Twelve further types, each with its own `Spec` in `core/src/aircraft_fleet.cpp` and a mirrored
entry in `web/js/aircraft/fleet.js`. Figures are manufacturer / public data (SL ISA, MTOW);
"est." marks values not published by the manufacturer, chosen to be consistent with the
published ones. Control law: FBW = `FlyByWireG` (C* pitch, rate-command roll, protections),
conventional = `Direct` + yaw damper.

| Id | Type | MTOW / OEW / fuel (kg) | Wing area, span, length, sweep | Engines (dry / AB per engine) | Vr / Vref (kt) | Cruise | Ceiling, range, seats | Controls |
|---|---|---|---|---|---|---|---|---|
| 14 | Cessna Citation CJ4 | 7,761 / 4,663 / 2,644 | 30.7 m², 15.5 m, 16.3 m, 12.5° | 2 × FJ44-4A 16.1 kN, no reversers | 110 / 105 | M0.70 FL450 | 45,000 ft, 2,165 nm, 9 | conventional, yoke |
| 15 | Embraer Phenom 300E | 8,415 / 5,425 / 2,428 | 28.5 m², 15.9 m, 15.6 m, 23° (est.) | 2 × PW535E1 15.5 kN, no reversers | 112 / 110 | M0.74 FL410 | 45,000 ft, 2,010 nm, 9 | conventional, yoke |
| 16 | Bombardier Global 7500 | 52,096 / 25,764 / 23,360 | 110 m² (est.), 31.7 m, 33.9 m, 33° | 2 × Passport 84.2 kN | 138 / 115 | M0.85 FL450 | 51,000 ft, 7,700 nm, 17 | FBW, yoke |
| 17 | Airbus A220-300 | 70,900 / 37,081 / 17,440 | 112.3 m², 35.1 m, 38.7 m, 26° | 2 × PW1524G 103.6 kN | 140 / 130 | M0.78 FL350 | 41,000 ft, 3,450 nm, 140 | FBW, sidestick |
| 18 | Embraer E195-E2 | 62,500 / 35,700 / 13,690 | 103 m², 35.1 m, 41.5 m, 26° | 2 × PW1900G 102 kN | 145 / 130 | M0.78 FL350 | 41,000 ft, 2,600 nm, 132 | FBW, yoke |
| 19 | Boeing 737 MAX 8 | 82,191 / 45,070 / 20,730 | 127 m², 35.9 m, 39.5 m, 25° | 2 × LEAP-1B 130 kN | 150 / 145 | M0.79 FL350 | 41,000 ft, 3,550 nm, 172 | conventional, yoke |
| 20 | Airbus A321neo | 97,000 / 50,100 / 18,860 | 122.6 m², 35.8 m, 44.5 m, 25° | 2 × LEAP-1A / PW1100G 147 kN | 155 / 140 | M0.78 FL350 | 39,800 ft, 3,500 nm, 206 | FBW, sidestick |
| 21 | Boeing 767-300ER | 186,880 / 90,011 / 73,100 | 283.3 m², 47.6 m, 54.9 m, 31.5° | 2 × CF6-80C2 / PW4000 276 kN | 160 / 142 | M0.80 FL350 | 43,100 ft, 5,980 nm, 261 | conventional, yoke |
| 22 | Airbus A330-900 | 251,000 / 132,000 (est.) / 111,270 | 465 m², 64.0 m, 63.7 m, 30° | 2 × Trent 7000 324 kN | 155 / 137 | M0.82 FL370 | 41,450 ft, 7,200 nm, 287 | FBW, sidestick |
| 23 | Lockheed Martin F-16C | 19,187 / 8,570 / 3,175 | 27.9 m², 10.0 m, 15.1 m, 40° LE | 1 × F110-GE-129 76.3 / 131 kN | 140 / 145 | M0.9 FL300 | 50,000 ft, 2,280 nm ferry | FBW (+9 g), sidestick |
| 24 | Boeing F/A-18E Super Hornet | 29,937 / 14,552 / 6,531 | 46.5 m², 13.6 m, 18.3 m, 28° | 2 × F414-GE-400 62.3 / 97.9 kN | 150 / 140 | M0.85 FL300 | 50,000 ft, 1,800 nm ferry | FBW (+7.5 g), centre stick |
| 25 | Eurofighter Typhoon | 23,500 / 11,000 / 4,996 | 51.2 m², 11.0 m, 16.0 m, 53° LE | 2 × EJ200 60 / 90 kN | 140 / 150 | M0.9 FL300 | 55,000 ft, 2,000 nm ferry | FBW (+9 g), centre stick |

Per-type checks beyond takeoff / cruise / approach: F-16C 9 g limiter and ~250-300°/s roll
rate, F/A-18E 7.5 g limiter, Typhoon 9 g limiter and supercruise (military power, FL360,
stays above M1.1), A220-300 bank-angle protection. Tail-strike angles are for extended
oleos (the contact geometry is uncompressed), e.g. A321neo 11.2°.

## v2 simplifications (stated plainly)
* Class-typical aerodynamic derivatives per category, not type-specific wind-tunnel data.
* No compressibility effects on stability (Mach tuck), no pressurisation, no APU, no FMS/VNAV.
* One fuel lever input for all engines; fire handles per engine.
* Damage is per part, not a finite-element structure; visual separation is of the outer wing
  section and the whole empennage.
