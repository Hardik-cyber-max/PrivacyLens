// PrivacyLens Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log('[PrivacyLens] Service worker initialized successfully.');
});

// Handle incoming messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_COOKIES') {
    getCookiesForUrl(request.url)
      .then(cookies => sendResponse({ success: true, count: cookies.length, cookies }))
      .catch(err => sendResponse({ success: false, error: err.message, count: 0, cookies: [] }));
    return true; // Keep channel open for async response
  }
});

/**
 * Fetch cookies associated with the given target URL using chrome.cookies API
 */
async function getCookiesForUrl(urlStr) {
  if (!urlStr || !chrome.cookies) return [];
  try {
    const url = new URL(urlStr);
    const domain = url.hostname;
    
    // Attempt fetching cookies by url
    let cookies = await chrome.cookies.getAll({ url: urlStr });
    
    // If empty, attempt fetching by root domain
    if ((!cookies || cookies.length === 0) && domain) {
      const rootDomain = domain.replace(/^www\./, '');
      cookies = await chrome.cookies.getAll({ domain: rootDomain });
    }
    
    return cookies || [];
  } catch (err) {
    console.warn('[PrivacyLens] Unable to retrieve cookies:', err);
    return [];
  }
}
