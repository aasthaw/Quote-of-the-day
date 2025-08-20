# React + TypeScript + Vite

A simple, user-friendly web app that displays motivational quotes fetched from the ZenQuotes API. 

Built with React, Vite, and TypeScript — deployed on GitHub Pages.


Features - 

Daily quote: fetches and shows the quote of the day
Random quotes: get a new random quote anytime
Favorites: save or remove quotes (saved in browser storage)
Dark / light mode: switch themes, setting is remembered
Streak: tracks how many days you’ve opened the app
Simple and responsive design with a side menu


Tech Stack- 

React
Vite
TypeScript
CSS (custom styling)
ZenQuotes API

Getting Started

1. Clone the repo
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>

2. Install dependencies
npm install

3. Run locally
npm run dev


App will be available at: http://localhost:5173

Deployment (GitHub Pages)

1. Ensure vite.config.ts has your correct repo name:

const repoName = 'YourRepoName';
export default defineConfig({
  base: `/${repoName}/`,
  plugins: [react()],
})

2. Push code to GitHub.

3. GitHub Actions workflow (.github/workflows/deploy.yml) will build and deploy automatically.

4. Your site will be live at:

https://<your-username>.github.io/<your-repo-name>/


API Notes - 

Free tier allows 5 requests per 30 seconds.
Cached daily quotes reduce API calls.
Attribution is required when using ZenQuotes → link back to zenquotes.io



License

MIT License © 2025 [Aastha]