// PrivacyLens Backend Server (Zero-Dependency Native Node.js Server)

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables from .env
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const index = trimmed.indexOf('=');
        const key = trimmed.substring(0, index).trim();
        const val = trimmed.substring(index + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT || '5000', 10);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();

// 2. Create HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      openaiAvailable: !!OPENAI_API_KEY,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Privacy Analysis Endpoint
  if (req.method === 'POST' && req.url === '/api/analyze') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const {
          domain = 'unknown.com',
          url = '',
          privacyScore = 70,
          calculatedRiskLevel = 'MEDIUM',
          cookieCount = 0,
          thirdPartyCount = 0,
          thirdPartyDomains = [],
          trackerDomains = [],
          dataIndicators = [],
          isDemo = false
        } = payload;

        console.log(`[PrivacyLens] Request for domain: ${domain} (Score: ${privacyScore}, Risk: ${calculatedRiskLevel}, Demo: ${isDemo})`);

        let resultData = null;
        let source = 'heuristic_fallback';

        // Attempt OpenAI Call if key is configured
        if (OPENAI_API_KEY) {
          try {
            resultData = await callOpenAiApi({
              domain, url, privacyScore, calculatedRiskLevel,
              cookieCount, thirdPartyCount, thirdPartyDomains, trackerDomains, dataIndicators
            });
            source = 'openai';
          } catch (err) {
            console.warn('[PrivacyLens] OpenAI call failed, using heuristic fallback:', err.message);
          }
        }

        // Fallback to dynamic heuristic analysis if OpenAI unavailable
        if (!resultData) {
          resultData = generateHeuristicAnalysis({
            domain, privacyScore, calculatedRiskLevel,
            cookieCount, thirdPartyCount, thirdPartyDomains, trackerDomains, dataIndicators
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          source,
          data: resultData
        }));

      } catch (err) {
        console.error('[PrivacyLens] Server error:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Invalid request payload or JSON syntax',
          details: err.message
        }));
      }
    });
    return;
  }

  // 404 Route
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

/**
 * Call OpenAI Chat Completions API via HTTPS
 */
function callOpenAiApi(telemetry) {
  return new Promise((resolve, reject) => {
    const prompt = `
You are PrivacyLens AI, an expert cybersecurity and data privacy auditing assistant.
Analyze the following website privacy telemetry and return structured JSON.

Website Telemetry:
- Domain: ${telemetry.domain}
- Full URL: ${telemetry.url}
- Privacy Score: ${telemetry.privacyScore}/100
- Initial Risk Assessment: ${telemetry.calculatedRiskLevel}
- Cookies Detected: ${telemetry.cookieCount}
- Third-Party Domains (${telemetry.thirdPartyCount}): ${telemetry.thirdPartyDomains.slice(0, 15).join(', ')}
- Trackers Identified (${telemetry.trackerDomains.length}): ${telemetry.trackerDomains.slice(0, 10).join(', ')}
- Data Collection Forms/APIs: ${telemetry.dataIndicators.join(', ') || 'None detected'}

IMPORTANT REQUIREMENTS:
Return ONLY valid JSON matching this exact structure:
{
  "summary": "2-3 concise sentences summarizing the site's overall privacy hygiene and risk factor.",
  "dataCollected": ["List 2-5 specific data types collected or likely collected"],
  "concerns": ["List 2-4 key privacy risks or tracker concerns"],
  "recommendations": ["List 2-3 actionable user security recommendations"],
  "riskLevel": "${telemetry.calculatedRiskLevel}"
}
`;

    const requestBody = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a privacy audit assistant that responds strictly in JSON format.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            const contentJson = JSON.parse(parsed.choices[0].message.content);
            resolve(contentJson);
          } catch (e) {
            reject(new Error('Failed to parse OpenAI JSON response: ' + e.message));
          }
        } else {
          reject(new Error(`OpenAI API returned HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('OpenAI request timed out'));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Dynamic Heuristic Fallback Analysis
 */
function generateHeuristicAnalysis({ domain, privacyScore, calculatedRiskLevel, cookieCount, thirdPartyCount, thirdPartyDomains, trackerDomains, dataIndicators }) {
  const dataCollected = [];
  if (dataIndicators.some(i => i.toLowerCase().includes('email'))) dataCollected.push('Email Address');
  if (dataIndicators.some(i => i.toLowerCase().includes('location') || i.toLowerCase().includes('geo'))) dataCollected.push('Location / IP');
  if (dataIndicators.some(i => i.toLowerCase().includes('phone') || i.toLowerCase().includes('tel'))) dataCollected.push('Phone Number');
  if (cookieCount > 0 || thirdPartyCount > 0) dataCollected.push('Browsing Activity');
  if (trackerDomains.length > 0) dataCollected.push('Cross-Site Ad ID');
  if (dataCollected.length === 0) dataCollected.push('Basic HTTP Logs', 'Session Tokens');

  const concerns = [];
  if (trackerDomains.length > 0) {
    concerns.push(`Identified ${trackerDomains.length} known ad/analytics tracker(s): ${trackerDomains.slice(0, 3).join(', ')}.`);
  }
  if (thirdPartyCount > 8) {
    concerns.push(`High density of external domains (${thirdPartyCount}) loaded on page startup.`);
  }
  if (cookieCount > 10) {
    concerns.push(`Site sets ${cookieCount} cookies, which may persist tracking tokens across sessions.`);
  }
  if (dataIndicators.length > 0) {
    concerns.push(`Detected sensitive input forms: ${dataIndicators.join(', ')}.`);
  }
  if (concerns.length === 0) {
    concerns.push('Standard website session cookies active on domain.');
    concerns.push('Network traffic connects to standard third-party content delivery assets.');
  }

  const recommendations = [];
  if (privacyScore < 50) {
    recommendations.push('Enable an ad-blocker or strict tracking protection in your browser settings.');
    recommendations.push('Avoid creating accounts or entering personal emails unless necessary.');
  } else if (privacyScore < 80) {
    recommendations.push('Clear cookies periodically or use private browsing mode for this domain.');
    recommendations.push('Reject non-essential tracking cookies on cookie banner prompts.');
  } else {
    recommendations.push('This site exhibits good privacy hygiene with minimal third-party requests.');
    recommendations.push('Maintain standard privacy protection settings.');
  }

  let summary = '';
  if (privacyScore < 50) {
    summary = `${domain} exhibits elevated privacy risks due to ${trackerDomains.length > 0 ? trackerDomains.length + ' active trackers and ' : ''}${thirdPartyCount} third-party domain connections. Exercise caution when submitting personal information.`;
  } else if (privacyScore < 80) {
    summary = `${domain} maintains moderate privacy controls with ${cookieCount} active cookies and ${thirdPartyCount} third-party requests detected during session scan.`;
  } else {
    summary = `${domain} demonstrates a strong privacy posture with low third-party footprint and minimal tracking mechanisms detected.`;
  }

  return {
    summary,
    dataCollected,
    concerns,
    recommendations,
    riskLevel: calculatedRiskLevel
  };
}

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🛡️  PrivacyLens Backend Server Running on Port ${PORT}`);
  console.log(`👉 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`👉 Mode: ${OPENAI_API_KEY ? 'OPENAI GPT-4o-MINI ACTIVE ✅' : 'HEURISTIC FALLBACK ACTIVE ⚠️ (Set OPENAI_API_KEY in .env to enable OpenAI)'}`);
  console.log(`=======================================================`);
});
