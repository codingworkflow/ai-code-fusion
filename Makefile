# -------------------------------------------------------------
# AI Code Fusion - Makefile for Linux/Mac
# -------------------------------------------------------------

# Make these targets phony (they don't create files with these names)
.PHONY: all setup dev clean build build-win build-linux \
        build-mac build-mac-arm build-mac-universal \
        test lint format sonar release help

# Set executable permissions for scripts
setup-scripts:
	@chmod +x scripts/index.js scripts/lib/*.js

# Help command
help:
	@echo "Available commands:"
	@echo "  setup              - Install dependencies"
	@echo "  dev                - Start development environment"
	@echo "  build              - Build for current platform"
	@echo "  build-win          - Build for Windows"
	@echo "  build-mac          - Build for macOS"
	@echo "  build-mac-arm      - Build for macOS ARM"
	@echo "  build-mac-universal - Build for macOS Universal"
	@echo "  build-linux        - Build for Linux"
	@echo "  test               - Run tests"
	@echo "  lint               - Run linting"
	@echo "  format             - Format code"
	@echo "  clean              - Clean build artifacts"
	@echo "  release VERSION=x.y.z - Create a new release"
	@echo "  sonar              - Run SonarQube analysis"

# Map to npm scripts
all: help

setup: setup-scripts
	@npm install

dev: setup-scripts
	@npm start

clean: setup-scripts
	@npm run clean

build: setup-scripts
	@npm run build

build-win: setup-scripts
	@npm run build:win

build-linux: setup-scripts
	@npm run build:linux

build-mac: setup-scripts
	@npm run build:mac

build-mac-arm: setup-scripts
	@npm run build:mac-arm

build-mac-universal: setup-scripts
	@npm run build:mac-universal

test: setup-scripts
	@npm test

lint: setup-scripts
	@npm run lint

format: setup-scripts
	@npm run format

sonar: setup-scripts
	@npm run sonar

release: setup-scripts
	@npm run release -- $(VERSION)

# Support for version argument
%:
	@:
