# Aegis AI — Your City's AI Guardian 🛡️

Aegis AI is an end-to-end, AI-powered traffic safety system that uses computer vision (YOLOv11) to detect road accidents in real-time. When an accident is detected, it instantly alerts the nearest emergency services (Hospitals and Police Stations) and **nearby local shops/businesses** via automated Twilio Voice Calls and SMS messages. By involving the immediate community, the system ensures that help arrives in seconds, even before official responders reach the scene.

## ✨ Features

- **Real-Time Video Analytics**: Powered by YOLOv11 and OpenCV to process live CCTV feeds and detect vehicle accidents.
- **Automated Emergency Dispatch**: Integrates with Mappls API to instantly find the absolute closest hospitals, police stations, and **local businesses** to the accident scene.
- **Community First Response**: Sends instant SMS alerts with location links to nearby shops so bystanders can provide immediate life-saving assistance.
- **Government Command Dashboard**: A secure, real-time React dashboard for traffic authorities to monitor accidents, view heatmaps, and track emergency response times.
- **Public Citizen Map**: A live traffic and routing map using Leaflet and TomTom Traffic Data, directly alerting citizens of nearby accidents so they can reroute safely.

---

## 🛠️ Technology Stack

- **AI Core**: Python 3.11, YOLOv11, OpenCV, PyTorch
- **Backend API**: Node.js, Express.js, MongoDB, Socket.io
- **Frontends**: React.js, Vite, React-Leaflet
- **3rd Party Integrations**: 
  - **Twilio** (Automated Emergency Voice Calls & SMS)
  - **Mappls / MapMyIndia API** (Nearby hospital/services discovery)
  - **TomTom Traffic API** (Live map traffic layers)
  - **OpenStreetMap** (Routing & Mapping)

---

## 🚀 Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/aegis-ai.git
   cd aegis-ai
   ```

2. **Environment Variables**
   Rename all three `.env.example` files to `.env` and fill in your API keys (Twilio, Mappls, MongoDB, etc.):
   - Python root: `./.env`
   - Node.js backend: `./backend/.env`
   - User Frontend: `./frontend-user/.env`

3. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

4. **Install Frontend Dependencies**
   ```bash
   cd frontend-gov
   npm install
   ```
   ```bash
   cd frontend-user
   npm install
   ```

5. **Install Python AI Dependencies**
   It's highly recommended to use a virtual environment.
   ```bash
   python -m venv accident_env
   .\accident_env\Scripts\activate  # Windows
   # source accident_env/bin/activate # Mac/Linux
   pip install -r requirements.txt
   ```

---

## 🏃‍♂️ Running the System

To run the entire system locally, you need to spin up the 4 services, each in a separate terminal:

**1. Start the Node.js Backend**
```bash
cd backend
npm run dev
# Starts on port 5000
```

**2. Start the Government Dashboard**
```bash
cd frontend-gov
npm start
# Starts on port 3000
```

**3. Start the Public Citizen Map**
```bash
cd frontend-user
npm run dev
# Starts on port 3001
```

**4. Start the AI Accident Detection Engine**
*Make sure your Python virtual environment is activated before running!*
```bash
# In the root directory
python main.py
```

The AI engine will boot up, initialize your webcam (or load your sample CCTV video files), and begin processing frames for accidents. Once a crash is detected, watch your Government Dashboard map light up instantly!

---

## 🔑 Required API Keys
To get the system fully operational with live SMS, Calls, and nearby hospital routing, you'll need the following free API keys:
- **Twilio**: Account SID and Auth Token for automated calls.
- **Mappls**: Client ID and Secret for discovering nearby Indian emergency services.
- **TomTom API**: For live traffic heatmap layers on the custom route map.

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page or submit a Pull Request.
