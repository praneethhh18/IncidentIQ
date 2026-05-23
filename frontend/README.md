# IncidentIQ Frontend

Next.js 14 (App Router) + TypeScript + Tailwind CSS.

## Run locally

```bash
npm install
copy .env.example .env.local         # Windows
# cp .env.example .env.local         # macOS/Linux
npm run dev
```

Live at <http://localhost:3000>. Make sure the backend is running at the
URL set in `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Run built app |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Pages

| Route | Description |
| --- | --- |
| `/` | Landing page with hero, features, CTA |
| `/dashboard` | Main analyze flow — paste/upload/integration tabs |
| `/incidents` | Incident history list |
| `/incidents/[id]` | Full incident analysis view |

## Deploy to Vercel

```bash
vercel deploy --prod
```

Set `NEXT_PUBLIC_API_URL` in the Vercel project settings to your deployed
backend URL.
