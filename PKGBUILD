# Maintainer: Mikele <mikele@gmail.com>

pkgname=alsachain-bin
pkgver=0.1.0
pkgrel=1
pkgdesc='Safe ALSA alsaequal virtual PCM manager'
arch=('x86_64')
url='https://github.com/mikelexp/alsachain'
license=('custom')
depends=('glibc' 'alsa-lib' 'alsa-utils' 'caps' 'alsaequal')
source=("${url}/releases/download/v${pkgver}/alsachain-${pkgver}-linux-${CARCH}.tar.gz")
sha256sums=('4afa38e7ee5962162e9a97d58801582fd9771207cfa6c102279be85c5c994a53')

package() {
  install -Dm755 "${srcdir}/alsachain" "${pkgdir}/usr/bin/alsachain"
  install -Dm755 "${srcdir}/libasound_module_pcm_alsachain_status.so" "${pkgdir}/usr/lib/alsa-lib/libasound_module_pcm_alsachain_status.so"
  install -Dm644 "${srcdir}/README.md" "${pkgdir}/usr/share/doc/${pkgname}/README.md"
}
