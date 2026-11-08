# Grahok CRM

Responsive single-admin customer, product and order management app.

## Run locally
1. Install Node.js (LTS).
2. Copy `.env.example` to `.env` and fill in Firebase Web App config values.
3. Run `npm install`, then `npm run dev`.

## Firebase setup
- Enable Authentication > Email/Password.
- Create your admin user manually in Firebase Authentication > Users.
- Create a Cloud Firestore database.
- Publish the included `firestore.rules`.
- Keep public sign-up disabled: this app has login only.

## Deploy on Vercel
Import this GitHub repository into Vercel. Add all `VITE_...` variables from `.env.example` in Project Settings > Environment Variables, then deploy.
