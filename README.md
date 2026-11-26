# Brandloom

On-brand social content, from idea to finished post.

Brandloom keeps a profile for each brand (voice, audience, content pillars, facts, colours, fonts and logos). From that profile it:

1. **Researches trends** (Trend radar): Claude searches the web for news, events, seasonal moments, competitor activity and audience conversations, then recommends posts with sources.
2. **Suggests post ideas** across the brand's pillars, using the season and anything you ask it to focus on.
3. **Keeps a media library** of uploaded photos and clips, and generates images (and animates them into 5-second clips) with fal.ai in the brand's art direction.
4. **Turns an idea into a finished post**: it picks a template, writes the on-image text, and writes separate LinkedIn and Instagram captions.
5. **Renders the post in the brand's look** (accent plus up to four secondary colours), live in the browser, and exports a 1080×1350 PNG, or an H.264 MP4 for animated posts and posts with a video background.
6. **Revises on request** ("make it about Abuja, and punchier") and keeps a calendar of what goes out when.

## Stack

| Part | Choice |
| --- | --- |
| App | Next.js 15 (App Router), TypeScript |
| Database | Neon Postgres (`@neondatabase/serverless`, HTTP driver) |
| AI | Claude API (`@anthropic-ai/sdk`), model `claude-opus-5-5`, structured outputs, server-side refusal fallbacks |
| Rendering | Templates are React components (`src/templates`). Exports run in the browser: `html-to-image` for PNG frames, WebCodecs + `mp4-muxer` for MP4. No server rendering, no storage bucket. |
| Media | Vercel Blob for files; fal.ai for generation (`FAL_IMAGE_MODEL`, `FAL_VIDEO_MODEL` to swap models) |
| Trend research | Claude with the `web_search` server tool, then structured into recommendations |
| Hosting | Vercel |

## Templates

| Template | Use |
| --- | --- |
| Statement | One bold headline with a highlighted phrase |
| Big number | One striking figure from the brand's facts |
| Checklist | A headline and 3-4 numbered points |
| Chat | A chat thread that dramatises the customer's problem |
| Photo | A library photo or video clip, full-bleed, with a headline over it |
| Animated | 9-second video: lines appear one by one, then an end card |

Wrap words in `*asterisks*` to highlight them in the brand's accent colour.

## Running locally

```bash
cp .env.example .env.local   # fill in the four values
npm install
npm run db:migrate           # creates the tables (safe to re-run)
npm run dev
```

Environment variables:

- `DATABASE_URL`: Neon pooled connection string
- `ANTHROPIC_API_KEY`: Claude API key
- `APP_PASSWORD`: the password used to sign in (v1 has one shared login)
- `AUTH_SECRET`: at least 32 random characters, e.g. `openssl rand -hex 32`
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob store token
- `FAL_KEY`: fal.ai API key (only needed for AI images and video)

## Roadmap to a product

v1 is built for internal use with one shared password. The database already scopes everything under a `workspaces` table, so the path to selling it is:

- Replace the password gate with real accounts (Neon Auth) and map each user to a workspace; check workspace ownership on every post and idea route.
- Direct publishing to Instagram (Graph API) and LinkedIn (Community Management API), or through a scheduler's API.
- Weekly autopilot: generate and draft next week's posts automatically for approval.
- Carousels, more templates, and a template editor per brand.
- Billing (Stripe) and usage limits per plan.
