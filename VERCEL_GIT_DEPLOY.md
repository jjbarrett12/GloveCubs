# Vercel Git Deploy

Deploy Glovecubs to Vercel by connecting your Git repository. Every push to your main branch will trigger a new deployment.

## 1. Connect your repo to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New…** → **Project**.
3. **Import** your Git repository (GitHub, GitLab, or Bitbucket).
4. Select the **Glovecubs** repo.
5. Vercel will detect the project and use the existing `vercel.json`:
   - **Build:** Node.js server (`server.js`)
   - **Routes:** All requests → `server.js`
6. (Optional) Add **Environment Variables** in the project settings if you use `.env` (e.g. `JWT_SECRET`, `FISHBOWL_*`, email vars). Use the same names as in `.env.example`.
7. Click **Deploy**.

## 2. How Git deploy works

- **Production:** Pushes to `main` (or your default branch) create a **Production** deployment.
- **Preview:** Other branches or pull requests get a **Preview** URL.
- No need to run `vercel` locally; Vercel builds and deploys from Git.

## 3. Config file

Deployment is driven by **`vercel.json`** in the project root:

```json
{
  "version": 2,
  "builds": [{ "src": "server.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "server.js" }]
}
```

- All traffic is sent to your Node server.
- Static files under `public/` are served by Express from `server.js`.

## 4. Deploying changes

1. Commit and push to `main`:
   ```bash
   git add -A
   git commit -m "Your message"
   git push origin main
   ```
2. Vercel will build and deploy automatically. Check the **Deployments** tab in the Vercel dashboard for status and URL.

## 5. Custom domain (optional)

In the Vercel project: **Settings** → **Domains** → add your domain and follow the DNS instructions.
