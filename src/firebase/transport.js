const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function shouldUseFirebaseLongPolling({
  userAgent = '',
  userAgentDataMobile = false,
  maxTouchPoints = 0
} = {}) {
  if (userAgentDataMobile === true) return true;
  if (MOBILE_USER_AGENT.test(userAgent)) return true;

  // O iPadOS pode se identificar como macOS quando solicita sites para desktop.
  return /Macintosh/i.test(userAgent) && Number(maxTouchPoints) > 1;
}

export function getBrowserTransportInfo(navigatorObject = globalThis.navigator) {
  return {
    userAgent: navigatorObject?.userAgent || '',
    userAgentDataMobile: navigatorObject?.userAgentData?.mobile === true,
    maxTouchPoints: navigatorObject?.maxTouchPoints || 0
  };
}
