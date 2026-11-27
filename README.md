# Buzzbite

Your social media on autopilot, in your brand.

Buzzbite keeps a brand kit for each business (logo, colours, fonts, voice, audience, content themes, facts and photo style). From it, Buzzbite:

1. **Fills the calendar.** Pick your posting days; one click creates the month's posts for LinkedIn and Instagram, each a finished design with captions written for each platform.
2. **Makes the visuals.** Photo posts get an AI photo in the brand's art direction (fal.ai, FLUX 3); video posts animate that photo into a short clip (fal.ai, Kling) with moving headlines; graphic posts use the brand's colours and type.
3. **Waits for your OK.** Review posts one at a time: approve, or ask for a change ("new photo", "make it a video", "shorter caption", or anything in your own words). "Approve all" is there when you trust it.
4. **Watches what's happening.** Trend radar searches the web for news, events, seasons and conversations in the brand's market and suggests post ideas, each with sources. "Add to calendar" turns one into a finished post on the next free day.
5. **Exports.** Download any post as a 1080×1350 PNG or an H.264 MP4.

## Stack

| Part | Choice |
| --- | --- |
| App | Next.js 15 (App Router), TypeScript |
| Database | Neon Postgres (`@neondatabase/serverless`, HTTP driver) |
| Writing, planning, trend research | Claude API (`@anthropic-ai/sdk`), model `claude-opus-5-5`, structured outputs, web search, server-side refusal fallbacks |
| Photos and video | fal.ai (`FAL_IMAGE_MODEL`, `FAL_VIDEO_MODEL` to swap models); files stored in Vercel Blob |
| Rendering | Post designs are React components (`src/templates`); exports run in the browser (`html-to-image`, WebCodecs + `mp4-muxer`) |
| Hosting | Vercel |

## Post designs

Photo, Photo + band, Framed photo, Photo + figure, Video, Statement, Big number, Checklist, Chat, Poster, Animated graphic. Claude picks the design for each post and varies them across the month.

## How the pipeline works

`/api/brands/[id]/fill` asks Claude to write finished posts for up to 7 empty posting days at a time (the calendar calls it until the month is full). Posts that need a photo are saved as "making" and their photo is queued on fal.ai. `/api/brands/[id]/advance` (polled by the calendar and review screens) collects finished photos, queues clips for video posts, and moves posts to "review".

## Running locally

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run db:migrate           # creates the tables (safe to re-run)
npm run dev
```

Environment variables: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `APP_PASSWORD`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`, `FAL_KEY` (see `.env.example`).

## Roadmap to a product

- Real accounts (Neon Auth) with a workspace per customer; check workspace ownership on every route.
- Publish approved posts directly to Instagram and LinkedIn.
- Run trend research and calendar filling on a schedule (Vercel Cron).
- Import a brand kit from Canva; "Edit in Canva" for hand-finishing.
- Carousels, Stories and Reels formats; billing.
