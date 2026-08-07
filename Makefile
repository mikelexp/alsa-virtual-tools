APP_NAME := alsachain
VERSION := $(shell node -p "require('./package.json').version")
ARCH := x86_64
DIST_DIR := dist
RELEASE_DIR := $(DIST_DIR)/release
TARBALL := $(DIST_DIR)/$(APP_NAME)-$(VERSION)-linux-$(ARCH).tar.gz

.PHONY: help install-deps check build build-native test-native install-native build-release package clean version release aur-update

help:
	@printf '%s\n' \
		'Targets:' \
		'  install-deps  Install JavaScript dependencies with Bun' \
		'  check         Format, lint, test, and TypeScript build' \
		'  build         Build JavaScript output for development' \
		'  build-native  Build the ALSA profile-status PCM module' \
		'  test-native   Smoke-test the ALSA PCM module against the null PCM' \
		'  install-native Install the ALSA PCM module system-wide' \
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
	$(MAKE) test-native

build:
	pnpm build

build-native:
	$(MAKE) -C native

test-native: build-native
	bash native/smoke-test.sh

install-native: build-native
	sudo install -Dm755 build/libasound_module_pcm_alsachain_status.so /usr/lib/alsa-lib/libasound_module_pcm_alsachain_status.so

build-release:
	bash scripts/build-release.sh

package: build-release
	bash scripts/package-release.sh "$(VERSION)" "$(ARCH)"

release: check build-native package

aur-update:
	test -n "$(VERSION)" || (printf '%s\n' 'Usage: make aur-update VERSION=x.y.z' >&2; exit 1)
	bash scripts/aur-update.sh "$(VERSION)"

clean:
	rm -rf "$(DIST_DIR)"

version:
	@printf '%s\n' "$(VERSION)"
