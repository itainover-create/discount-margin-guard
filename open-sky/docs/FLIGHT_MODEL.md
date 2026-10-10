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

## Fleet calibration (native harness, `make test` — 227/227 checks pass in this build)
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

## v2 simplifications (stated plainly)
* Class-typical aerodynamic derivatives per category, not type-specific wind-tunnel data.
* No compressibility effects on stability (Mach tuck), no pressurisation, no APU, no FMS/VNAV.
* One fuel lever input for all engines; fire handles per engine.
* Damage is per part, not a finite-element structure; visual separation is of the outer wing
  section and the whole empennage.
