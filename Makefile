APP_NAME := alsachain
VERSION := $(shell node -p "require('./package.json').version")
ARCH := x86_64
DIST_DIR := dist
RELEASE_DIR := $(DIST_DIR)/release
TARBALL := $(DIST_DIR)/$(APP_NAME)-$(VERSION)-linux-$(ARCH).tar.gz

.PHONY: help install-deps check build build-release package clean version release aur-update

help:
	@printf '%s\n' \
		'Targets:' \
		'  install-deps  Install JavaScript dependencies with Bun' \
		'  check         Format, lint, test, and TypeScript build' \
		'  build         Build JavaScript output for development' \
		'  build-release Build standalone Bun executable' \
		'  package       Create release tarball and SHA256SUMS' \
		'  release       Build and package the current version' \
		'  aur-update    Update the AUR package (VERSION=x.y.z)' \
		'  clean         Remove generated build artifacts' \
		'  version       Print the package version'

install-deps:
	bun install

check:
	pnpm format:check
	pnpm lint
	pnpm test
	pnpm build

build:
	pnpm build

build-release:
	bash scripts/build-release.sh

package: build-release
	bash scripts/package-release.sh "$(VERSION)" "$(ARCH)"

release: check package

aur-update:
	test -n "$(VERSION)" || (printf '%s\n' 'Usage: make aur-update VERSION=x.y.z' >&2; exit 1)
	bash scripts/aur-update.sh "$(VERSION)"

clean:
	rm -rf "$(DIST_DIR)"

version:
	@printf '%s\n' "$(VERSION)"
