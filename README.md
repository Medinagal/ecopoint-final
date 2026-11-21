Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.

# EcoPoint

EcoPoint is a classroom prototype of a residential recycling service. It brings together Residents, Collectors, Building Managers and Administrators in one application. Residents can find a suitable station, complete a simulated deposit and view their points and receipt. Collectors can record station servicing, Building Managers can view information for their assigned stations, and Administrators can review deposits and manage support and test accounts.

EcoPoint is a learning prototype, not an operating recycling service. Station information, QR references, item counts, weights, points and transactions are simulated. The application is not connected to physical recycling equipment, calibrated scales, banks or real reward providers.

## What the application does

- **Resident:** browse the station map, filter by accepted material, check the displayed fill level, complete a QR-linked or demo deposit, view points and deposit history, download a receipt, use the Guide/FAQ and contact support.
- **Collector:** select an assigned station, confirm its QR reference and record a servicing visit. The station fill level is then updated for other signed-in users.
- **Building Manager:** view aggregate information and manage demonstration campaigns for assigned stations. Manager access does not include Resident records or disputed-deposit decisions.
- **Administrator:** review deposit records and disputed evidence, inspect session details, respond to support requests, manage fictional accounts and review audit information.

The default Collector account can service all seven demonstration stations. The default Building Manager account is assigned stations ES-1 to ES-3.

## Technology and data storage

| Part | Implementation |
|---|---|
| Browser interface | HTML, CSS and JavaScript |
| Application logic | JavaScript API / Worker-style request handler |
| Local runtime | Node.js 24 or later |
| Local storage | SQLite through a D1-compatible adapter |
| Optional hosted code path | Netlify Function with a PostgreSQL adapter using `@netlify/database` |
| PostgreSQL-compatible tests | PGlite |

The physical data store uses one versioned `ecopoint_state` record containing an identifier, version and JSON body. Conditional version updates help prevent concurrent requests from overwriting a newer state. The ERD in the project report is a logical model of the application's entities and relationships; it does not mean that each logical entity is stored in a separate SQL table.

The repository includes Netlify configuration, a Function and a PostgreSQL migration. The recorded PGlite tests exercise the Netlify handler with a PostgreSQL-compatible test engine; they do not demonstrate that a live managed Netlify database has been deployed or validated. Local execution is supported and is the straightforward option for a controlled classroom demonstration.

## Run locally

Install Node.js 24 or later. Then open a terminal in the project folder (the folder containing `package.json`) and run:

```sh
npm ci
npm run setup
npm run dev
```

Open **http://localhost:5173** in a browser.

`npm run setup` creates a local `.env` file with a randomly generated bootstrap password if the file does not already exist. The local SQLite database is stored in `.data/ecopoint.sqlite`. For later sessions, start the application with `npm run dev`; the setup step does not need to be repeated.

To build the Netlify-ready frontend and run the build checks, use:

```sh
npm run build
```

The Russian setup guide is available in [START_HERE_RU.txt](START_HERE_RU.txt).

## Test accounts

The initial database is seeded with five fictional accounts:

| Role | Login |
|---|---|
| Resident | `resident@example.test` |
| Second Resident | `resident2@example.test` |
| Collector | `collector@example.test` |
| Building Manager | `manager@example.test` |
| Administrator | `admin@example.test` |

For a new local database, these initial accounts use the bootstrap password generated during setup and stored in the ignored `.env` file. Do not commit that file or include the password in screenshots or the demo video. If the instructor needs to sign in, provide the current test password privately.

For a new hosted database, configure `EP_BOOTSTRAP_PASSWORD` as a secret environment variable before the first use. It must contain 16–128 characters. It is used when the initial accounts are created; changing the variable later does not reset passwords in an existing database.

## Main requirements implemented

The implementation inventory is aligned with FR-01–FR-29 in the Final Project SRS. The table below gives a short, user-facing summary and the corresponding evidence references.

| Requirement IDs | Implemented capability | Evidence |
|---|---|---|
| FR-01–FR-02 | Sign-in, role permissions, session expiry and sign-out | AT-01, AT-13, AT-16, AT-19 |
| FR-03–FR-05 | Station information, fill-level check, QR-linked session and confirmed deposit | AT-02, AT-17, AT-18 |
| FR-06–FR-07 | Shared account history across sessions and protection of each Resident's records | AT-03 |
| FR-08 | Duplicate-deposit protection and rejection of conflicting repeated requests | AT-04 |
| FR-09 | Pending evidence and controlled reconciliation without an automatic points credit or strike | AT-05 |
| FR-10–FR-11 | Administrator review of disputed evidence and a recorded decision reason | AT-06 |
| FR-12 | DEMO reward redemption and points deduction | AT-07 |
| FR-13–FR-14 | Collector QR/scope validation, unique servicing visit and shared station fill update | AT-08, AT-20 |
| FR-15–FR-16 | Eligible campaign rules and Building Manager statistics for assigned stations | AT-09 |
| FR-17–FR-18 | Resident support requests and Administrator replies | AT-10 |
| FR-19 | Simulated payout reservation and outcome handling | AT-11 |
| FR-20–FR-21 | Profile updates and tracked account-deletion requests | AT-12 |
| FR-22–FR-23 | Administrator account management and session revocation | AT-13 |
| FR-24 | Persistence after closing and reopening the local database | AT-14 |
| FR-25 | Administrator audit history without exposing authentication secrets | AT-15 |
| FR-26 | Resident Guide/FAQ and first-use guidance | AT-22 (additional UI acceptance check) |
| FR-27 | Per-material unit counts and corresponding estimated total weight | AT-23 (additional UI acceptance check) |
| FR-28 | Detailed receipt that Residents can download | AT-24 (additional UI acceptance check) |
| FR-29 | Administrator deposit history and session details | AT-25 (additional UI acceptance check) |

AT-20 is an additional automated scenario for the Collector scope migration and is linked to FR-13 and FR-14. AT-21 checks the database health endpoint; it returns a successful status when the database is available and an unavailable status when the adapter fails. AT-21 is an operational check, not a separate functional requirement.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Check database availability |
| `GET` | `/api/state` | Return the data available to the signed-in account |
| `POST` | `/api/login` | Sign in to a test account |
| `POST` | `/api/logout` | End the current session |
| `POST` | `/api/action` | Submit a business action for server-side validation |

The server validates sessions, roles, record ownership and business actions. The simulator generates deposit quantities and estimated weights; users do not enter awarded points or physical measurements.

## Tests and validation

Run the supplied checks from the project folder:

```sh
npm test
npm run build
npm run check
```

The recorded server test results cover **21 unique scenarios (AT-01–AT-21)**. The same scenarios were run in two environments:

- `test-results.json` — SQLite and the local Worker handler: 21 PASS, 0 FAIL.
- `test-results-postgres.json` — PGlite PostgreSQL-compatible engine and the Netlify handler: 21 PASS, 0 FAIL.

These are two executions of the same 21 scenarios, not 42 different test cases. `npm test` also runs a separate JSDOM interface check using five independent sessions across the four roles. It exercises role-specific navigation and selected workflows such as support, deposits, receipts, servicing, payouts, profile changes, ratings and campaigns. A JSDOM check is not the same as testing in a real browser or with a phone camera.

AT-22–AT-25 are additional UI acceptance checks documented separately in the Final Project report. They cover the Guide/FAQ, per-material quantities and weights, the downloadable receipt, and Administrator deposit history. They are not counted as part of the 21 automated server scenarios.

Three people from outside the project team tested the initial Resident PET-recycling scenario. Their feedback informed the FAQ, support flow, Back and Sign out controls, itemised receipt and Administrator session history. The same three participants then tried the updated prototype; all three completed the updated scenario. This is a qualitative retest with the same participants, not a second group of three. Task times and SUS scores were not collected.

The included checks do not establish live production deployment, physical scale accuracy, real station telemetry, real payments, external notification delivery, full WCAG conformance or the performance targets that were not measured in the report.

## Security and project data

- Passwords are stored as salted PBKDF2-SHA256 hashes.
- The backend checks role permissions, record ownership and session validity.
- Session cookies use `HttpOnly` and `SameSite=Strict`; `Secure` is used over HTTPS.
- Access-sensitive account changes can revoke existing sessions.
- `.env`, `.data`, `node_modules` and generated build output are excluded through `.gitignore`.
- `.env.example` is a blank configuration template; keep actual passwords and connection details out of Git.
- Use fictional test data only. Do not publish passwords, API keys, database credentials or real personal data.

## Demo Video

The demo video presents the key features of the EcoPoint prototype and demonstrates its functionality from two user perspectives: Resident and Administrator.

It covers the main recycling process, including station selection, QR-linked deposit simulation, points crediting, and transaction history. The Administrator view demonstrates access to deposit records and management functions.

The video highlights the relevant functional requirements and shows how the system stores and displays data using fictional test accounts.

**Demo video:** [Team02_FP_Demo.mp4](https://astanait-my.sharepoint.com/:v:/g/personal/242122_astanait_edu_kz/IQClZJ64rxQZQ6ZjxLnYQ-wCAYe3Yr2ecJLykvTiutInk1Q?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJPbmVEcml2ZUZvckJ1c2luZXNzIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXciLCJyZWZlcnJhbFZpZXciOiJNeUZpbGVzTGlua0NvcHkifX0)

## Third-party components

| Component | Use | Licence / credit |
|---|---|---|
| `qrcode-generator` by Kazuhiko Arase | QR code generation | MIT |
| `jsQR` | QR code reading from camera or image | Apache-2.0 |
| Leaflet 1.9.4 | Interactive map | BSD-2-Clause; map attribution is displayed in the interface |
| Unbounded | Interface font | SIL Open Font License |

Original licence notices are retained with the relevant components.

## AI Disclosure

AI tools were used as development and documentation assistance. The team reviewed the generated suggestions and remains responsible for the submitted implementation and project work.

- **ChatGPT (OpenAI, GPT-6):** Used for frontend and backend code generation and refinement, implementation support, debugging, integration, technical explanations and project documentation.
- **Claude (Anthropic, Sonnet 5.5):** Used to a limited extent during early prototype development and for review of system diagrams.

The team is responsible for the final requirements, system models, analysis, design and implementation decisions, testing, interpretation of results and conclusions. Every team member should be able to explain the requirements, diagrams and relevant code during the project defence.
