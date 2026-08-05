# Maintainer: Mikele <mikele@gmail.com>

pkgname=alsa-virtual-tools-bin
pkgver=0.1.0
pkgrel=1
pkgdesc='Safe ALSA alsaequal virtual PCM manager'
arch=('x86_64')
url='https://github.com/mikelexp/alsa-virtual-tools'
license=('custom')
depends=('glibc' 'alsa-utils' 'caps' 'alsaequal')
optdepends=('qastools: graphical QasMixer controls')
source=("${url}/releases/download/v${pkgver}/alsa-virtual-tools-${pkgver}-linux-${CARCH}.tar.gz")
sha256sums=('SKIP')

package() {
  install -Dm755 "${srcdir}/alsa-virtual-tools" "${pkgdir}/usr/bin/alsa-virtual-tools"
  install -Dm644 "${srcdir}/README.md" "${pkgdir}/usr/share/doc/${pkgname}/README.md"
}
