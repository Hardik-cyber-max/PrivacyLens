// PrivacyLens Extension Popup Logic

const BACKEND_URL = 'http://localhost:5000/api/analyze';

// Demo Mode Preset Telemetry for Hackathon Presentation
const DEMO_TELEMETRY = {
  domain: 'shop-privacy-demo.com',
  url: 'https://shop-privacy-demo.com/checkout',
  cookieCount: 14,
  thirdPartyCount: 12,
  thirdPartyDomains: [
    'google-analytics.com', 'connect.facebook.net', 'doubleclick.net',
    'cdn.hotjar.com', 'static.criteo.net', 'analytics.tiktok.com',
    'cdn.segment.com', 'scorecardresearch.com', 'clarity.ms',
    'adnxs.com', 'pubmatic.com', 'casalemedia.com'
  ],
  trackerDomains: [
    'google-analytics.com', 'connect.facebook.net', 'doubleclick.net',
    'cdn.hotjar.com', 'static.criteo.net', 'analytics.tiktok.com'
  ],
  dataIndicators: [
    'Email Address Input',
    'Phone Number Input',
    'Location / IP Tracking',
    'Payment / Credit Card Form',
    'Local Storage Persistence'
  ],
  isDemo: true
};

document.addEventListener('DOMContentLoaded', async () => {
  const demoToggle = document.getElementById('demoToggle');
  const rescanBtn = document.getElementById('rescanBtn');

  // Load saved demo state
  chrome.storage.local.get(['privacyLensDemoMode'], (result) => {
    if (result.privacyLensDemoMode) {
      demoToggle.checked = true;
      runAudit(true);
    } else {
      runAudit(false);
    }
  });

  // Demo toggle event listener
  demoToggle.addEventListener('change', (e) => {
    const isDemo = e.target.checked;
    chrome.storage.local.set({ privacyLensDemoMode: isDemo });
    runAudit(isDemo);
  });

  // Rescan button event listener
  rescanBtn.addEventListener('click', () => {
    runAudit(demoToggle.checked);
  });
});

/**
 * Main function to execute privacy audit
 */
async function runAudit(isDemo = false) {
  setLoadingState(true);
  updateDemoBadge(isDemo);

  let telemetry = null;

  if (isDemo) {
    telemetry = { ...DEMO_TELEMETRY };
  } else {
    telemetry = await gatherLiveTelemetry();
  }

  // 1. Calculate Privacy Score Deterministically
  const scoringResult = calculatePrivacyScore(telemetry);
  telemetry.privacyScore = scoringResult.score;
  telemetry.calculatedRiskLevel = scoringResult.riskLevel;

  // 2. Render Score and Immediate Local Telemetry
  renderScoreAndMetrics(telemetry, scoringResult);

  // 3. Send Telemetry to Backend / OpenAI Analysis
  try {
    const backendData = await fetchBackendAnalysis(telemetry);
    renderAiAnalysis(backendData);
    setBackendStatus(true, 'Backend Active');
  } catch (err) {
    console.warn('[PrivacyLens] Backend API error, using local fallback:', err);
    const fallbackAi = generateLocalFallbackAnalysis(telemetry, scoringResult);
    renderAiAnalysis(fallbackAi);
    setBackendStatus(false, 'Local Heuristic Mode');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Deterministic Privacy Scoring Engine
 * Starts at 100, deducts transparently based on telemetry rules.
 */
function calculatePrivacyScore(telemetry) {
  let score = 100;

  const cookieCount = telemetry.cookieCount || 0;
  const thirdPartyCount = telemetry.thirdPartyCount || 0;
  const trackerCount = (telemetry.trackerDomains || []).length;
  const indicators = telemetry.dataIndicators || [];

  // Rule 1: Third-Party Domains deduction (-2 per domain, max -26)
  const thirdPartyDeduction = Math.min(26, thirdPartyCount * 2);
  score -= thirdPartyDeduction;

  // Rule 2: Tracker-like domains deduction (-6 per tracker, max -30)
  const trackerDeduction = Math.min(30, trackerCount * 6);
  score -= trackerDeduction;

  // Rule 3: Cookie Count deduction (-1 per 2 cookies, max -15)
  const cookieDeduction = Math.min(15, Math.floor(cookieCount / 2));
  score -= cookieDeduction;

  // Rule 4: Personal Data Indicators deduction
  let dataDeduction = 0;
  if (indicators.some(i => i.toLowerCase().includes('email'))) dataDeduction += 8;
  if (indicators.some(i => i.toLowerCase().includes('phone'))) dataDeduction += 6;
  if (indicators.some(i => i.toLowerCase().includes('payment') || i.toLowerCase().includes('card'))) dataDeduction += 12;
  if (indicators.some(i => i.toLowerCase().includes('password'))) dataDeduction += 5;
  dataDeduction = Math.min(25, dataDeduction);
  score -= dataDeduction;

  // Rule 5: Location & Fingerprinting indicators deduction (-8 each, max -16)
  let geoDeduction = 0;
  if (indicators.some(i => i.toLowerCase().includes('location') || i.toLowerCase().includes('geo'))) geoDeduction += 8;
  if (indicators.some(i => i.toLowerCase().includes('canvas') || i.toLowerCase().includes('fingerprint'))) geoDeduction += 8;
  score -= geoDeduction;

  // Clamp score strictly between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Determine Risk Level
  let riskLevel = 'LOW';
  if (score < 50) {
    riskLevel = 'HIGH';
  } else if (score < 80) {
    riskLevel = 'MEDIUM';
  }

  return {
    score,
    riskLevel,
    breakdown: {
      thirdPartyDeduction,
      trackerDeduction,
      cookieDeduction,
      dataDeduction,
      geoDeduction
    }
  };
}

/**
 * Gather telemetry from Chrome active tab & background scripts
 */
async function gatherLiveTelemetry() {
  const defaultTelemetry = {
    domain: 'localhost',
    url: '',
    cookieCount: 0,
    thirdPartyCount: 0,
    thirdPartyDomains: [],
    trackerDomains: [],
    dataIndicators: [],
    isDemo: false
  };

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0 || !tabs[0].url) {
      return defaultTelemetry;
    }

    const tab = tabs[0];
    const urlStr = tab.url;

    // Check if system page (chrome://, about:blank, etc.)
    if (urlStr.startsWith('chrome://') || urlStr.startsWith('edge://') || urlStr.startsWith('about:')) {
      return {
        ...defaultTelemetry,
        domain: 'System / Restricted Page',
        url: urlStr,
        dataIndicators: ['Browser Internal Page']
      };
    }

    const parsedUrl = new URL(urlStr);
    const domain = parsedUrl.hostname.replace(/^www\./, '');

    // Get cookies count from background script
    let cookieCount = 0;
    try {
      const cookieResponse = await chrome.runtime.sendMessage({ action: 'GET_COOKIES', url: urlStr });
      if (cookieResponse && cookieResponse.success) {
        cookieCount = cookieResponse.count;
      }
    } catch (e) {
      console.warn('[PrivacyLens] Cookie lookup failed:', e);
    }

    // Get DOM Telemetry from content script
    let domData = {};
    try {
      const contentResponse = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' });
      if (contentResponse && contentResponse.success) {
        domData = contentResponse.data;
      }
    } catch (e) {
      console.warn('[PrivacyLens] Content script message failed (page may not support content scripts):', e);
    }

    return {
      domain: domain || 'unknown.com',
      url: urlStr,
      cookieCount: cookieCount,
      thirdPartyCount: domData.thirdPartyCount || 0,
      thirdPartyDomains: domData.thirdPartyDomains || [],
      trackerDomains: domData.trackerDomains || [],
      dataIndicators: domData.dataIndicators || [],
      isDemo: false
    };

  } catch (err) {
    console.error('[PrivacyLens] Error gathering live telemetry:', err);
    return defaultTelemetry;
  }
}

/**
 * Fetch AI analysis from backend API
 */
async function fetchBackendAnalysis(telemetry) {
  const response = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(telemetry)
  });

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json && json.success && json.data) {
    return json.data;
  } else {
    throw new Error('Invalid backend response structure');
  }
}

/**
 * Render Score, Metrics, and Badges to UI
 */
function renderScoreAndMetrics(telemetry, scoringResult) {
  // Domain Name
  document.getElementById('siteDomain').textContent = telemetry.domain;

  // Score Value & Dial Color
  const scoreEl = document.getElementById('scoreValue');
  const scoreCircle = document.getElementById('scoreCircle');
  scoreEl.textContent = scoringResult.score;

  if (scoringResult.score >= 80) {
    scoreCircle.style.borderColor = 'var(--accent-green)';
    scoreCircle.style.boxShadow = '0 0 12px rgba(0, 255, 157, 0.4)';
  } else if (scoringResult.score >= 50) {
    scoreCircle.style.borderColor = 'var(--accent-yellow)';
    scoreCircle.style.boxShadow = '0 0 12px rgba(255, 183, 3, 0.4)';
  } else {
    scoreCircle.style.borderColor = 'var(--accent-red)';
    scoreCircle.style.boxShadow = '0 0 12px rgba(255, 59, 92, 0.4)';
  }

  // Risk Badge
  const riskBadge = document.getElementById('riskBadge');
  riskBadge.textContent = scoringResult.riskLevel;
  riskBadge.className = `risk-badge ${scoringResult.riskLevel.toLowerCase()}`;

  // Metrics
  document.getElementById('cookieCount').textContent = telemetry.cookieCount || 0;
  document.getElementById('thirdPartyCount').textContent = telemetry.thirdPartyCount || 0;

  // Data Collected Tags
  const tagsContainer = document.getElementById('dataCollectedTags');
  tagsContainer.innerHTML = '';
  
  const indicators = telemetry.dataIndicators || [];
  if (indicators.length === 0) {
    tagsContainer.innerHTML = '<span class="tag tag-empty">No explicit data collection forms detected</span>';
  } else {
    indicators.forEach(item => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = item;
      tagsContainer.appendChild(tag);
    });
  }
}

/**
 * Render AI Analysis fields
 */
function renderAiAnalysis(aiData) {
  // Summary Text
  document.getElementById('summaryText').textContent = aiData.summary || 'Privacy summary unavailable.';

  // Data Collected (Merge with AI output if returned)
  if (aiData.dataCollected && Array.isArray(aiData.dataCollected) && aiData.dataCollected.length > 0) {
    const tagsContainer = document.getElementById('dataCollectedTags');
    // Ensure unique tags
    const existingTags = new Set(Array.from(tagsContainer.querySelectorAll('.tag')).map(t => t.textContent));
    aiData.dataCollected.forEach(item => {
      if (!existingTags.has(item) && !existingTags.has('No explicit data collection forms detected')) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = item;
        tagsContainer.appendChild(tag);
      }
    });
  }

  // Concerns List
  const concernsList = document.getElementById('concernsList');
  concernsList.innerHTML = '';
  const concerns = aiData.concerns || ['No immediate tracking concerns identified.'];
  concerns.forEach(c => {
    const li = document.createElement('li');
    li.textContent = c;
    concernsList.appendChild(li);
  });

  // Recommendations List
  const recommendationsList = document.getElementById('recommendationsList');
  recommendationsList.innerHTML = '';
  const recommendations = aiData.recommendations || ['Maintain standard browser security controls.'];
  recommendations.forEach(r => {
    const li = document.createElement('li');
    li.textContent = r;
    recommendationsList.appendChild(li);
  });
}

/**
 * Local Fallback Analysis generator
 */
function generateLocalFallbackAnalysis(telemetry, scoringResult) {
  const isHighRisk = scoringResult.score < 50;
  const isMedRisk = scoringResult.score < 80;

  return {
    summary: `${telemetry.domain} scored ${scoringResult.score}/100 (${scoringResult.riskLevel} risk). Scan detected ${telemetry.cookieCount} cookies and ${telemetry.thirdPartyCount} third-party requests.`,
    dataCollected: telemetry.dataIndicators.length > 0 ? telemetry.dataIndicators : ['Browsing Activity'],
    concerns: [
      `Detected ${telemetry.thirdPartyCount} third-party domain connections.`,
      `Active cookies: ${telemetry.cookieCount}.`,
      isHighRisk ? 'Multiple active ad trackers detected.' : 'Standard tracking scripts loaded.'
    ],
    recommendations: [
      isHighRisk ? 'Enable strict ad-blocking and tracking protection.' : 'Opt out of marketing cookies where possible.',
      'Clear session cookies periodically.'
    ],
    riskLevel: scoringResult.riskLevel
  };
}

function setLoadingState(isLoading) {
  const summaryCard = document.getElementById('summaryCard');
  if (isLoading) {
    summaryCard.classList.add('loading');
    document.getElementById('summaryText').textContent = 'Analyzing website privacy telemetry...';
  } else {
    summaryCard.classList.remove('loading');
  }
}

function updateDemoBadge(isDemo) {
  const demoBadge = document.getElementById('demoBadge');
  if (isDemo) {
    demoBadge.classList.remove('hidden');
  } else {
    demoBadge.classList.add('hidden');
  }
}

function setBackendStatus(isConnected, label) {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('statusText');
  
  statusText.textContent = label;
  if (isConnected) {
    statusDot.className = 'status-dot green';
  } else {
    statusDot.className = 'status-dot amber';
  }
}
