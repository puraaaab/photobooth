import * as os from 'os'

/** /24 prefixes (e.g. "192.168.29") of every non-internal IPv4 interface on this machine. */
// Virtual adapters (Hyper-V/WSL, VirtualBox, VMware, Docker, VPNs) are not the venue Wi-Fi; scanning or
// advertising them made the laptop show the wrong address in QR codes and wasted discovery time.
const VIRTUAL_IFACE = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Docker|vboxnet|tailscale|ZeroTier|Loopback|utun|tun\d|wg\d/i

function lanInterfaces(): Array<{ name: string; address: string }> {
  const out: Array<{ name: string; address: string }> = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal && net.address && !net.address.startsWith('169.254.') && !VIRTUAL_IFACE.test(name)) {
        out.push({ name, address: net.address })
      }
    }
  }
  return out
}

/** The laptop's address on the venue network (Wi-Fi/Ethernet preferred over anything else). */
export function getPrimaryLanAddress(): string {
  const list = lanInterfaces()
  const preferred = list.find(i => /wi-?fi|wlan|wireless|ethernet|^en|^eth/i.test(i.name)) || list[0]
  return preferred?.address || '127.0.0.1'
}

export function getAllLocalSubnetPrefixes(): string[] {
  const prefixes = new Set<string>()
  for (const net of lanInterfaces()) {
    prefixes.add(net.address.substring(0, net.address.lastIndexOf('.')))
  }
  return Array.from(prefixes)
}
