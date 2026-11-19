// R5: strict IPC sender validation. Pure so it can be unit-tested without Electron.
// A call is trusted only if ALL hold: it comes from our window's webContents, from its MAIN frame (not an iframe),
// and that frame's URL is exactly our bundled renderer page (no extra query/hash, no host, no look-alike path).

export interface SenderInfo {
  senderIsOurWebContents: boolean;
  senderIsMainFrame: boolean;
  frameUrl: string | undefined;
}

function filePath(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'file:' || u.host !== '' || u.search !== '' || u.hash !== '') return null;
    return decodeURIComponent(u.pathname).replaceAll('\\', '/').toLowerCase(); // Windows paths are case-insensitive
  } catch {
    return null;
  }
}

export function isTrustedSender(info: SenderInfo, expectedFileUrl: string): boolean {
  if (!info.senderIsOurWebContents || !info.senderIsMainFrame || !info.frameUrl) return false;
  const got = filePath(info.frameUrl);
  const want = filePath(expectedFileUrl);
  return got !== null && want !== null && got === want;
}
