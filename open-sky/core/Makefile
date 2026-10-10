# OPEN SKY core — build targets
#   make test   native calibration/regression tests (g++)
#   make wasm   WebAssembly module for the web client (clang + wasm-ld)
#   make js     wasm2js fallback for browsers/hosts that block WebAssembly
#   make all    everything

CXX      ?= g++
CLANG    ?= clang++
WASM2JS  ?= wasm2js
SRC      := src/sim.cpp src/aircraft_trainer.cpp src/aircraft_fleet.cpp src/traffic.cpp src/api.cpp
HDR      := $(wildcard include/osk/*.h)
OUTDIR   := ../web/wasm

.PHONY: all test wasm js layout clean

all: test wasm js layout

build/test_native: $(SRC) $(HDR) tests/test_main.cpp tests/test_fleet.h
	@mkdir -p build
	$(CXX) -std=c++17 -O2 -Wall -Wextra -Wno-unused-parameter -Iinclude $(SRC) tests/test_main.cpp -o $@

test: build/test_native
	./build/test_native

$(OUTDIR)/opensky_core.wasm: $(SRC) $(HDR)
	@mkdir -p $(OUTDIR)
	$(CLANG) --target=wasm32 -std=c++17 -O3 -nostdlib -ffreestanding -fno-exceptions -fno-rtti \
	  -fvisibility=hidden -Iinclude $(SRC) -o $@ \
	  -Wl,--no-entry -Wl,--export=__wasm_call_ctors -Wl,--export-memory \
	  -Wl,--initial-memory=8388608 -Wl,-z,stack-size=1048576 -Wl,--strip-all

wasm: $(OUTDIR)/opensky_core.wasm

$(OUTDIR)/opensky_core_fallback.js: $(OUTDIR)/opensky_core.wasm
	$(WASM2JS) $< -O2 -o build/fallback_raw.js
	node ../tools/patch_wasm2js.mjs build/fallback_raw.js $@

js: $(OUTDIR)/opensky_core_fallback.js

layout:
	node ../tools/gen_layout.mjs include/osk/api.h ../web/js/core/layout.js

clean:
	rm -rf build
