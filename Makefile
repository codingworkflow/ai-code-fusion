# -------------------------------------------------------------
# Repository AI Code Fusion - Makefile for Linux/Mac
# -------------------------------------------------------------

# Make these targets phony (they don't create files with these names)
.PHONY: all setup dev clean clean-all build build-win build-linux \
        build-mac build-mac-arm build-mac-universal \
        test perf-test stress-metrics prometheus-verify css css-watch lint lint-md format validate qa docs-screenshots setup-hooks sonar \
        security gitleaks sbom renovate renovate-local mend-scan \
        icons sample-logo release

# Set executable permissions for scripts
setup-scripts:
	@chmod +x scripts/index.js scripts/lib/*.js

# Use Node.js to run commands through our unified script
all: setup-scripts
	@node scripts/index.js

setup: setup-scripts
	@node scripts/index.js setup

dev: setup-scripts
	@node scripts/index.js dev

clean: setup-scripts
	@node scripts/index.js clean

clean-all: setup-scripts
	@node scripts/index.js clean-all

build: setup-scripts
	@node scripts/index.js build

build-win: setup-scripts
	@node scripts/index.js build-win

build-linux: setup-scripts
	@node scripts/index.js build-linux

build-mac: setup-scripts
	@node scripts/index.js build-mac

build-mac-arm: setup-scripts
	@node scripts/index.js build-mac-arm

build-mac-universal: setup-scripts
	@node scripts/index.js build-mac-universal

test: setup-scripts
	@node scripts/index.js test

perf-test: setup-scripts
	@node scripts/index.js perf-test

stress-metrics: setup-scripts
	@node scripts/index.js stress-metrics

prometheus-verify: setup-scripts
	@node scripts/index.js prometheus-verify

css: setup-scripts
	@node scripts/index.js css

css-watch: setup-scripts
	@node scripts/index.js css-watch

lint: setup-scripts
	@node scripts/index.js lint

lint-md: setup-scripts
	@node scripts/index.js lint-md

format: setup-scripts
	@node scripts/index.js format

validate: setup-scripts
	@node scripts/index.js validate

qa: setup-scripts
	@node scripts/index.js qa

docs-screenshots: setup-scripts
	@node scripts/index.js docs-screenshots

setup-hooks: setup-scripts
	@node scripts/index.js hooks

sonar: setup-scripts
	@node scripts/index.js sonar

security: setup-scripts
	@node scripts/index.js security

gitleaks: setup-scripts
	@node scripts/index.js gitleaks

sbom: setup-scripts
	@node scripts/index.js sbom

renovate: setup-scripts
	@node scripts/index.js renovate

renovate-local: setup-scripts
	@node scripts/index.js renovate-local

mend-scan: setup-scripts
	@node scripts/index.js mend-scan

release: setup-scripts
	@node scripts/index.js release $(VERSION)

# Support for version argument
%:
	@:

icons: setup-scripts
	@node scripts/index.js icons

sample-logo: setup-scripts
	@node scripts/index.js run create-sample-logo
