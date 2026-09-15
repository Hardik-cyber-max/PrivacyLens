# PrivacyLens 🛡️

**PrivacyLens** is a Chrome Browser Extension (Manifest V3) + Node.js Express backend that provides a real-time **"Privacy Nutrition Label"** and dynamic AI Privacy Score for any website you visit.

---

## 🌟 Key Features

- 🎯 **Privacy Score (0-100)**: Deterministic, rule-based scoring engine calculating real-time safety scores based on cookies, trackers, third-party domains, and sensitive input fields.
- 🚦 **Risk Level Assessment**: Dynamic risk badge classification (**LOW**, **MEDIUM**, **HIGH**).
- 🍪 **Cookies & Third-Party Monitoring**: Real-time counter of site cookies and third-party script/domain connections.
- 📥 **Data Category Extraction**: Identifies sensitive DOM inputs (Emails, Phone, Payments, Credentials) and web storage persistence.
- 🤖 **AI Privacy Nutrition Label**: Powered by OpenAI (`gpt-4o-mini`) to generate structured summaries, key concerns, and actionable privacy recommendations.
- ⚡ **Heuristic Fallback Mode**: Works out of the box even without an OpenAI API key or during offline demo environments.
- 🎛️ **Hackathon Demo Mode**: Interactive header toggle for hackathon presentations that injects rich privacy telemetry on restricted pages.

---

## 📁 Project Structure

```
PrivacyLens/
├── extension/
│   ├── manifest.json      # Chrome Extension Manifest V3
│   ├── popup.html         # Extension popup HTML UI
│   ├── popup.css          # Cybersecurity dark-mode glassmorphic styling
│   ├── popup.js           # Score engine, telemetry collector, backend API client
│   ├── background.js      # Service worker for cookie inspection
│   └── content.js         # Page DOM analyzer script
│
├── backend/
│   ├── server.js          # Express API server with OpenAI & fallback analysis
│   ├── package.json       # Node.js dependencies
│   ├── .env               # Environment configuration (Port & API Keys)
│   └── .env.example       # Example environment variables
│
└── README.md              # Documentation & setup guide
```

---

## 🚀 Quickstart Setup Guide

### Step 1: Install & Start the Backend

1. Open PowerShell / Terminal in the `backend/` directory:
   ```bash
   cd backend
   npm install
   ```

2. *(Optional)* Add your OpenAI API Key in `backend/.env`:
   ```env
   PORT=5000
   OPENAI_API_KEY=sk-proj-your-openai-key-here
   ```
   *Note: If no API key is set, PrivacyLens automatically runs in **Heuristic Fallback Mode**.*

3. Start the backend server:
   ```bash
   npm start
   ```
   The backend server will run on `http://localhost:5000`.

---

### Step 2: Load the Extension in Google Chrome

1. Open Google Chrome and navigate to: `chrome://extensions/`
2. Enable **Developer mode** using the toggle switch in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the `extension` folder inside `PrivacyLens` (`PrivacyLens/extension`).
5. Pin **PrivacyLens** to your Chrome toolbar.

---

### Step 3: Test & Demo PrivacyLens

1. **Live Web Scan**: Visit any public website (e.g. `https://news.ycombinator.com`, `https://wikipedia.org`, `https://cnn.com`) and click the PrivacyLens extension icon.
2. **Instant Nutrition Label**: View the live Privacy Score, Risk Badge, Cookie Count, Third Parties Count, Data Collected, AI Summary, Concerns, and Recommendations.
3. **Demo Mode (Hackathon Feature)**: Toggle the **DEMO MODE** switch at the top of the popup to simulate rich privacy telemetry on restricted pages (e.g., `chrome://` system pages).

---

## 🔒 Security Note

- **API Key Security**: The `OPENAI_API_KEY` is strictly confined to the Node.js backend server environment variables (`backend/.env`). It is **never** embedded or exposed inside the Chrome extension client code.
