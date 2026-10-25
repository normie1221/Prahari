# PRAHARI — Advanced Predictive Safety Platform

PRAHARI helps people choose safer, better-informed routes — built first for
women travelling alone, students, night-shift workers, and daily commuters.
It combines your existing OSMnx + XGBoost street-safety model with a full
Node.js backend, a Neon/Postgres database, Clerk authentication, a real-time
community discussion forum, journey tracking, and an SOS system.

**Read `ARCHITECTURE.md` first** — it explains exactly what was preserved
from your original model (unmodified, byte-for-byte) versus what was newly
built around it, and why.

## Project layout

```
prahari/
├── navigation-service/   Python/FastAPI — wraps your existing model, unmodified
│   └── app/model/        prahari_route_finder.py + prahari_safety_pipeline.py
│                         (identical to the files you provided)
├── backend/              Node.js/Express — REST API, Prisma, Clerk, Socket.IO
├── frontend/             React (Vite) — dashboard, map, journey, community, admin
├── docker-compose.yml    Local Postgres + navigation-service + backend
├── ARCHITECTURE.md       Integration design, data flow, responsible-AI notes
└── SETUP.md              Step-by-step: Neon, Clerk, running everything locally
```

## Quickstart (local development)

See **SETUP.md** for full details. In short:

```bash
# 1. Navigation microservice
cd navigation-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in an internal token
uvicorn app.main:app --reload

# 2. Backend (needs Postgres — see docker-compose.yml for a local one)
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, CLERK keys, etc.
npx prisma migrate dev
npm run seed
npm run dev

# 3. Frontend
cd frontend
npm install
cp .env.example .env   # fill in Clerk publishable key
npm run dev
```

Then open http://localhost:5173.

## What's real vs. a documented dev fallback

Everything in the request/response path for routing is **real**: your actual
model computes actual routes against actual OpenStreetMap data. The only
things gated behind configuration are external accounts you'll create
yourself (Neon, Clerk) — see `SETUP.md`. Until you configure Clerk,
`AUTH_DEV_BYPASS=true` lets you run the whole app locally as a single fixed
dev user; this is hard-blocked from ever running in production regardless of
the env var (see `backend/src/middleware/auth.js`).

## Safety & responsible-AI notes

- Risk scores are model predictions from map-derived proxies (lighting tags,
  road type, proximity to police/nightlife POIs) — **not verified crime
  data**. Every route response says so explicitly.
- Seed/demo data is clearly labeled `[Demo]` and must never be presented as
  real-world statistics.
- PRAHARI's SOS feature notifies your saved emergency contacts — it is
  **not** a substitute for calling local emergency services, and the UI says
  so every time it's used.
