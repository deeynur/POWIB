# POWIB Organization Hub

Protection without Borders: dashboards, procurement approvals, HR and signed documents for every team.
Built with React 18, Vite 6 and Tailwind CSS 4.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Use `npm run build` for a production build in `dist/`, and `npm run preview` to serve it.

## What's inside

| Tab | What it does |
| --- | --- |
| Dashboard | What is waiting on the selected role, with counts and a "needs your attention" list |
| Procurement | Purchase requests from a filled PR Excel template → Project Manager, Finance and Procurement approve → PO upload and approval → received → paid. Signed PR/PO downloads, process file, register and ZIP export |
| Finance | Request for Payment (RFP) → Payment Voucher (PV) → paid, read from the filled Excel forms (RFP and PV may be two sheets of one workbook). RFP: requested by (whoever raises it), checked by Project Manager, approved by ED. PV: prepared by Finance, checked by Project Manager, approved by ED. Signatures go into the forms' own boxes. An RFP can be linked to a received purchase request, which is marked paid with it. PV payee and bank account are checked against the vendor list |
| Vendors | Supplier list with registration (CAC, TIN, SCUML), contacts, terms, bank details (Procurement, Finance and ED only) and PO history. Procurement adds, edits, removes and imports from the supplier evaluation Excel sheet |
| Documents | Upload documents and collect signatures by department |
| HR | HR and ED only. Staff & contracts (6 months, 1 year or a chosen end date; renewals keep the contract history), monthly timesheets (6-month tracker, upload, approve or return), appraisals (due 30 days before the contract ends, reviewed with a rating), and leave on POWIB's LEAVE REQUEST FORM: the employee fills it in and signs it in My HR (or HR logs it for them), then HR approves or rejects and signs. The filled form can be printed or saved as PDF; the supervisor's box is left blank for the supervisor to tick and sign by hand. Timesheet and appraisal templates are uploaded by HR. A filled TIMESHEET.xlsx is read (month, days worked, hours, overtime, public holidays, leave) and approving it signs the supervisor's box. A filled Professional Evaluation (.docx) is read (overall rating, Part I–III ratings, new objectives, training needs, comments) |

## ED sign-off rule

The ED **must** sign every request and PO of ₦5,000,000 or more (`ED_LIMIT` in `src/lib/logic.js`).
Below that, the ED **may** still approve a request or PO, and may sign any document.

## Project layout

```
src/
  main.jsx, App.jsx, index.css
  components/
    Header.jsx, NavTabs.jsx, Footer.jsx, Logo.jsx, Dashboard.jsx, Documents.jsx, HR.jsx
    procurement/  Procurement, RequestCard, NewRequestModal, SheetViewer, TemplatesPanel, useRequestActions
    ui/           Buttons, cards, modal, tags, file links, signatures, icons, toasts
  lib/
    logic.js   approval rules and the ED limit
    store.jsx  app state, saved to localStorage
    files.js   uploaded files, saved to IndexedDB
    excel.js   reads PR/PO templates, writes signed copies and the register
    exports.js register, ZIP and process-file downloads
public/
  favicon.svg, powib-logo-banner.png (original logo image)
```

## Data

**Without Supabase** (no `.env.local`): records and uploaded files are saved **in the browser on this device** only.
The "Viewing as" role picker sets who you are acting as, and each role keeps its own signature image.

**With Supabase** (shared and online, with staff logins):

1. Create a free project at supabase.com. In Authentication → Sign In / Providers → Email, turn off "Confirm email".
2. In the SQL Editor, run `supabase/setup.sql`, then `supabase/security.sql`, then `supabase/admin.sql`, `supabase/files.sql` and `supabase/hardening.sql`. Also set the minimum password length to 8.
3. Copy `.env.example` to `.env.local` and fill in the Project URL and anon/publishable key, then restart `npm run dev`.
4. Create the first account on the sign-in page. It becomes the admin (role HR).
5. As admin, open **Team**: move this browser's old data online, then approve staff as they sign up, set their roles and link each to their staff record.

Roles: Project Manager, Program, Procurement, Finance, HR, ED, and **Staff** (only sees **My HR**: own contract, timesheets and appraisals).
Everyone with a linked staff record gets **My HR** to upload their monthly timesheet and acknowledge their appraisal.
Each person signs with their own signature. Records update live for everyone.

### Security

`supabase/security.sql` makes the database itself enforce the rules, so they hold even for someone who bypasses the app:

- Approvals follow the real order (PM first on PRs, the ED from ₦5,000,000), and each person can only sign as their own role with their own signature.
- Amounts, request numbers and record history cannot be changed afterwards, and purchase requests and payments cannot be deleted.
- Vendor bank details are kept in separate records that only Procurement, Finance, the ED and the Project Manager can read.
- Only admins can approve accounts, set roles or give admin rights. An admin cannot remove their own admin rights or access, the last admin can never be removed, and account emails cannot be edited (`supabase/admin.sql`).
- Uploaded files open only for the person who uploaded them, or for people who can see the record they are attached to; uploads are capped at 20 MB (`supabase/files.sql`).
- Every change is written to `records_audit` (who, when, before and after), which only the admin and the ED can read and nobody can edit.

`supabase/security-test.sql` tries to break these rules as a signed-in user and rolls everything back; the results appear as the error message.

`supabase/hardening.sql` closes the database API to anyone not signed in, only accepts known record types up to 1 MB, and limits each person to 300 changes and 30 uploads a minute.
In the app:
- Typed text is cleaned before saving: hidden control characters and text-direction tricks are removed.
- Sign-in pauses after 5 wrong passwords, starting at 1 minute and doubling up to 15 minutes, and a password reset can be requested once a minute. Supabase also limits sign-ins to 30 per 5 minutes per network.
- The app refuses to start if `.env.local` holds a secret key or a wrong address.

### Security headers

`npm run build` writes the headers into `dist/_headers` (Netlify, Cloudflare Pages) and `dist/vercel.json` (Vercel). It also puts the Content Security Policy in the page itself, so it applies on any host. The headers:
- **Content Security Policy:** the page only runs its own scripts and only talks to its own Supabase project. Google Fonts is the one outside source allowed.
- **No framing:** other sites can't show the Hub inside their own pages.
- **nosniff:** browsers won't guess a different file type than the one sent.
- **Strict referrer policy:** less of the Hub's address is passed to other sites.
- **No camera, microphone or location access.**
- **HTTPS only:** browsers must always use a secure connection.

Production builds have no source maps and no console output. To try the built site locally, run `npm run build` then `npx vite preview`.

**About the keys in `.env.local`:** the URL and the publishable (anon) key are sent to every visitor's browser by design. Supabase intends them to be public, and the database rules above are what protect the data. Never put the secret (service_role) key or the database password in this project.
