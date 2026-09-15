// PrivacyLens Content Script - Page Telemetry Collector

(function () {
  // Listen for analysis request from popup or background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCAN_PAGE') {
      try {
        const telemetry = collectPageTelemetry();
        sendResponse({ success: true, data: telemetry });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }
    return true; // Keep channel open for async response
  });

  /**
   * Collects detailed privacy indicators from the active DOM
   */
  function collectPageTelemetry() {
    const currentDomain = window.location.hostname.replace(/^www\./, '');

    // 1. Collect all resource domains (scripts, links, images, iframes, performance timing)
    const externalDomains = new Set();
    const trackerDomains = new Set();

    // Tracker signatures database
    const KNOWN_TRACKERS = [
      'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'googleadservices.com',
      'connect.facebook.net', 'facebook.com/tr', 'analytics.tiktok.com', 'static.criteo.net',
      'cdn.hotjar.com', 'clarity.ms', 'api.mixpanel.com', 'cdn.segment.com', 'quantserve.com',
      'scorecardresearch.com', 'taboola.com', 'outbrain.com', 'adnxs.com', 'rubiconproject.com',
      'pubmatic.com', 'casalemedia.com', 'amazon-adsystem.com', 'bizzlick.com', 'intercom.io'
    ];

    function addUrlDomain(urlStr) {
      if (!urlStr || urlStr.startsWith('data:') || urlStr.startsWith('blob:')) return;
      try {
        const parsed = new URL(urlStr, window.location.href);
        const domain = parsed.hostname.replace(/^www\./, '');
        if (domain && domain !== currentDomain && !domain.endsWith('.' + currentDomain)) {
          externalDomains.add(domain);
          if (KNOWN_TRACKERS.some(t => domain.includes(t))) {
            trackerDomains.add(domain);
          }
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    }

    // Inspect script tags
    document.querySelectorAll('script[src]').forEach(el => addUrlDomain(el.src));

    // Inspect images & iframes
    document.querySelectorAll('img[src], iframe[src], link[rel="stylesheet"]').forEach(el => addUrlDomain(el.src || el.href));

    // Inspect Performance API resource entries
    if (window.performance && typeof window.performance.getEntriesByType === 'function') {
      const resources = window.performance.getEntriesByType('resource');
      resources.forEach(r => addUrlDomain(r.name));
    }

    // 2. Collect Data Collection Indicators (Forms, Permissions, APIs)
    const dataIndicators = new Set();

    // Form inputs analysis
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
    inputs.forEach(input => {
      const type = (input.type || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const placeholder = (input.placeholder || '').toLowerCase();
      const autocomplete = (input.autocomplete || '').toLowerCase();

      if (type === 'email' || name.includes('email') || placeholder.includes('email') || autocomplete.includes('email')) {
        dataIndicators.add('Email Address Input');
      }
      if (type === 'tel' || name.includes('phone') || name.includes('mobile') || placeholder.includes('phone')) {
        dataIndicators.add('Phone Number Input');
      }
      if (type === 'password' || name.includes('password') || name.includes('pass')) {
        dataIndicators.add('Password / Credentials Input');
      }
      if (name.includes('address') || name.includes('zip') || name.includes('city') || placeholder.includes('address')) {
        dataIndicators.add('Physical Address Input');
      }
      if (name.includes('card') || name.includes('cvv') || name.includes('payment') || autocomplete.includes('cc-number')) {
        dataIndicators.add('Payment / Credit Card Form');
      }
    });

    // Storage usage
    let hasLocalStorage = false;
    let hasSessionStorage = false;
    try {
      if (window.localStorage && window.localStorage.length > 0) hasLocalStorage = true;
      if (window.sessionStorage && window.sessionStorage.length > 0) hasSessionStorage = true;
    } catch (e) {
      // Storage access blocked or restricted
    }

    if (hasLocalStorage) dataIndicators.add('Local Storage Persistence');
    if (hasSessionStorage) dataIndicators.add('Session Storage');

    // Canvas fingerprinting detector heuristic
    const canvas = document.querySelector('canvas');
    if (canvas) dataIndicators.add('Canvas / Graphics Rendering');

    // Return aggregated DOM telemetry
    return {
      domain: currentDomain,
      url: window.location.href,
      thirdPartyDomains: Array.from(externalDomains),
      thirdPartyCount: externalDomains.size,
      trackerDomains: Array.from(trackerDomains),
      trackerCount: trackerDomains.size,
      dataIndicators: Array.from(dataIndicators),
      hasLocalStorage,
      hasSessionStorage
    };
  }
})();
