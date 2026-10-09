# Flight model & systems (C++ core)

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
* Rigid airframe; no aeroelasticity, no structural failure other than flap over-speed and crash.
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
