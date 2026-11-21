-include .env
-include ../qCLS/.env

PYTHON = python3
NODE = node
EMCC = emcc
EMFLAGS = -O3 -Wall
FTP_HOST ?= audres.org
FTP_DIR ?= qPRO

all: qpro_core.wasm qpro_core.js

bake: bake_qpro_model_h.py
	$(PYTHON) bake_qpro_model_h.py

qpro_core.wasm qpro_core.js: qpro_core.c qpro_model.h build_wasm.py
	$(PYTHON) build_wasm.py

# Optional Emscripten build target matching qCLS/Makefile:
emcc: qpro_core.c qpro_model.h
	$(EMCC) $(EMFLAGS) qpro_core.c -o qpro_emcc.js \
		-s EXPORTED_FUNCTIONS="['_qpro_get_in_ptr','_qpro_get_out_ptr','_qpro_evaluate','_qpro_eq_snr_deficit','_qpro_eq_pc_from_deficit']" \
		-s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPF64']" -lm

test: qpro_core.wasm qpro_core.js
	$(NODE) test_parity.mjs

deploy:
	@if [ -z "$(FTP_CREDS)" ]; then \
		echo "Error: FTP_CREDS environment variable is not set. Use: FTP_CREDS='user:pass' make deploy"; \
		exit 1; \
	fi
	@set -e; for f in index.html guide.html qpro_core.js qpro_core.wasm qpro_demo_cases.js qpro_report_svg.js assets/boys-town-logo.png; do \
		echo "Uploading $$f -> ftp://$(FTP_HOST)/$(FTP_DIR)/$$f"; \
		curl -sS --ftp-create-dirs -T $$f "ftp://$(FTP_CREDS)@$(FTP_HOST)/$(FTP_DIR)/$$f"; \
	done
	@echo "Verify HTTP status:"
	@curl -sS -I "http://$(FTP_HOST)/$(FTP_DIR)/" | head -n 5 || true
