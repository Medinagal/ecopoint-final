Educational project for the course Business Analysis, Astana IT University. Not a real product or service. All data are fictional.

# EcoPoint

EcoPoint is an educational recycling application with four user roles, a shared backend, and a database. It demonstrates recycling deposits, points, station servicing, and administrative review.

## Application link

[Open EcoPoint](https://ecopoint-final.netlify.app)

The prototype is intended for the project team, invited testers, and the instructor. Use fictional data only. Recycling equipment and financial transactions are simulated.

## User roles

| Role | Main permissions |
|---|---|
| Resident | Find stations, submit simulated deposits, view points and receipts, submit feedback and support requests, update their profile |
| Collector | View assigned stations, confirm collection visits, and empty stations |
| Manager | View statistics for assigned stations and manage campaigns |
| Administrator | Review deposits, manage test accounts, respond to support requests, and view audit records |

The default collector can service all seven stations. The default manager is assigned stations ES-1 through ES-3.

## Main features

- Authentication and server-side role permissions.
- Station map with filters for accepted materials.
- Shared station fill levels.
- Station QR validation.
- Simulated recycling deposits and point calculation.
- Administrative review of incomplete or disputed deposit data.
- Deposit history, expandable receipts, and receipt downloads.
- Collector visits and station emptying.
- Support requests and administrator replies.
- Feedback and application ratings.
- Campaigns and manager statistics.
- Profile updates and password changes.
- Russian, Kazakh, and English interfaces.
- FAQ and first-use guidance.
- Display of deposited unit counts and corresponding total weight separately for each material.
- Detailed downloadable deposit receipts.
- Administrator access to deposit history and session details.

Shared data refreshes approximately every five seconds. For example, a resident's support request appears in the administrator's queue, and a collector's station-emptying action updates the fill level for other users.

## Technology stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | JavaScript and Netlify Function |
| Hosted database | PostgreSQL through @netlify/database |
| Local runtime | Node.js 24 or later |
| Local database | SQLite |

The browser interface communicates with a shared API. Business operations and access permissions are validated on the server.

The database stores versioned JSON state in the `ecopoint_state` table. Conditional updates prevent concurrent requests from overwriting committed changes.

Logical entities include users, sessions, stations, deposits, receipts, point transactions, collection visits, campaigns, support requests, ratings, simulated payouts, and audit events. The logical data model must be distinguished from the physical single-table storage implementation.

## Local installation and execution

Install Node.js 24 or later.

From the project directory, run:

```sh
npm ci
npm run setup
npm run build
npm run dev
```

Open:

```text
http://localhost:5173
```

The setup script generates an initial password in the local `.env` file. Local data is stored in `.data/ecopoint.sqlite`.

For subsequent launches, run:

```sh
npm run dev
```

The Russian setup guide is available in [START_HERE_RU.txt](START_HERE_RU.txt).

## Test accounts

| Role | Login |
|---|---|
| Resident | resident@example.test |
| Second resident | resident2@example.test |
| Collector | collector@example.test |
| Manager | manager@example.test |
| Administrator | admin@example.test |

Passwords are provided privately by the project owner.

For local execution, the initial password is stored in `.env`. On Netlify, the initial password is configured through the secret environment variable `EP_BOOTSTRAP_PASSWORD`.

This variable initializes test accounts in a new database. Changing its value later does not reset existing account passwords.

Do not publish actual passwords in this README, GitHub commits, screenshots, or the demonstration video.

## Security

- Passwords are stored as salted PBKDF2-SHA256 hashes.
- The backend checks user roles and access to individual records.
- Residents can access only their own private records.
- Session cookies use HttpOnly, SameSite=Strict, and Secure over HTTPS.
- Changing a resident's password revokes their other sessions.
- Repeated requests are controlled to prevent duplicate point credits.
- Administrative decisions record the actor, reason, and timestamp.
- Audit records exclude authentication secrets.

Keep `.env`, local databases, API keys, and database connection strings out of Git. The supplied `.gitignore` excludes local secrets and runtime data. `.env.example` contains an empty configuration template.

## Implemented requirements

The following IDs must match the final SRS, traceability matrix, acceptance tests, and presentation.

| ID | Requirement | Test reference |
|---|---|---|
| FR-01 | Authenticate fictional test accounts using salted password hashes | AT-01 |
| FR-02 | Enforce role permissions, session expiry, and logout on the server | AT-01, AT-16, AT-19 |
| FR-03 | Display shared station capabilities and prevent deposits at full stations | AT-02, AT-18 |
| FR-04 | Validate a station QR reference and issue a five-minute deposit session | AT-02, AT-17 |
| FR-05 | Require explicit deposit submission and prevent credits for cancelled deposits | AT-02, AT-17 |
| FR-06 | Return the same account balance and history on another device | AT-03 |
| FR-07 | Restrict private resident records to their owner | AT-03 |
| FR-08 | Credit each event at most once and reject conflicting repeated requests | AT-04 |
| FR-09 | Retain incomplete deposit evidence without automatically issuing points or a penalty | AT-05 |
| FR-10 | Allow only an administrator to approve or reject disputed deposit evidence | AT-06 |
| FR-11 | Record the actor, reason, and timestamp of a deposit decision | AT-06 |
| FR-12 | Debit reward points atomically and issue a unique demonstration reference | AT-07 |
| FR-13 | Require a matching station QR and collector permissions for servicing | AT-08 |
| FR-14 | Record collection visits and publish station fill updates to other devices | AT-08 |
| FR-15 | Apply an eligible campaign to new sessions, with a maximum multiplier of two | AT-09 |
| FR-16 | Restrict manager statistics to assigned stations | AT-09 |
| FR-17 | Store resident complaints in a shared administrative queue | AT-10 |
| FR-18 | Deliver administrator replies to the complaint owner | AT-10 |
| FR-19 | Reserve points for simulated payouts and complete or release reservations | AT-11 |
| FR-20 | Save fictional profile updates on the server | AT-12 |
| FR-21 | Record account deletion requests without claiming immediate deletion | AT-12 |
| FR-22 | Allow administrators to create, block, and deactivate test accounts | AT-13 |
| FR-23 | Revoke sessions when account access or roles change | AT-13 |
| FR-24 | Retain committed data after a server restart | AT-14 |
| FR-25 | Maintain an administrator-only audit trail without authentication secrets | AT-15 |
| FR-26 | Provide residents with FAQ information and first-use guidance | AT-22 |
| FR-27 | Display the number of deposited units and their corresponding total weight separately for each material | AT-23 |
| FR-28 | Generate detailed deposit receipts and allow residents to download them | AT-24 |
| FR-29 | Allow administrators to view deposit history and session details | AT-25 |

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/health | Check database connectivity |
| POST | /api/login | Authenticate a test account |
| POST | /api/logout | End the current session |
| GET | /api/state | Retrieve data permitted for the current account |
| POST | /api/action | Execute validated business operations |

The server generates item counts and mass estimates for simulated deposits. Users cannot directly supply their own awarded points or equipment measurements.

## Netlify deployment

The project is deployed from the GitHub repository.

| Setting | Value |
|---|---|
| Branch | main |
| Base directory | Leave empty |
| Build command | npm run build |
| Publish directory | public |
| Functions directory | netlify/functions |
| Node.js version | 24 |

Deployment settings are included in `netlify.toml`.

Set `EP_BOOTSTRAP_PASSWORD` as a secret environment variable available to Functions.

The migration at `netlify/database/migrations/0001_ecopoint.sql` creates the PostgreSQL state table. Check database provisioning under Data & Storage → Database.

Use only a free hosting option that does not require a payment card, as required by the course. Restrict prototype access to the intended audience. Local execution is also supported.

A new deployment uses its own database. Data from older sites or standalone HTML previews is not transferred automatically.

## Testing and validation

Run:

```sh
npm test
npm run build
npm run check
```

Server checks cover SQLite and the PostgreSQL engine PGlite through the Netlify handler and database adapter.

The checks include:

- Authentication and role permissions.
- Independent user sessions.
- Shared complaints and administrator replies.
- Shared station fill levels.
- Repeated and concurrent requests.
- Point credits and simulated transactions.
- Data persistence.

Results are included in:

- `test-results.json`
- `test-results-postgres.json`

Separate JSDOM interface checks use five independent sessions across four roles. Automated tests do not replace real-browser, phone-camera, deployed-infrastructure, or external-user testing.

For the final submission, document at least 10 acceptance tests with the following fields:

| Field | Description |
|---|---|
| Test ID | Unique acceptance test identifier |
| Requirement ID | Related functional requirement |
| Steps | Actions performed by the tester |
| Test data | Fictional accounts and input values |
| Expected result | Required system behaviour |
| Actual result | Observed system behaviour |
| Status | Pass or Fail |

At least three people outside the team must try the main use case. Report their findings anonymously and describe the changes made in response. Record only testing that actually took place.

## Known limitations

- Recycling equipment, item counts, and mass measurements are simulated.
- Rewards and payouts do not involve real financial transactions.
- Shared updates use periodic refresh rather than a permanent real-time connection.
- The physical database uses a versioned JSON state table.
- Hardware integration and production operation are outside the prototype scope.

## Demo video

The demo video presents the key features of the EcoPoint prototype and demonstrates its functionality from two user perspectives: Resident and Administrator.

It covers the main recycling process, including station selection, QR-linked deposit simulation, points crediting, and transaction history. The Administrator view demonstrates access to deposit records and management functions.

The video highlights the relevant functional requirements and shows how the system stores and displays data using fictional test accounts.

## Repository access and team contributions

The repository is private. The instructor and team members must be invited as collaborators.

Each team member must commit their own actual contributions from their own GitHub account.

Application credentials are provided to the instructor privately.

## Third-party credits

The application preserves the EcoPoint project team's original interface.

| Component | Attribution and license |
|---|---|
| QR generation | Kazuhiko Arase, qrcode-generator — MIT |
| QR decoding | jsQR — Apache-2.0 |
| Map library | Leaflet 1.9.4 — BSD-2-Clause |
| Font | Unbounded — SIL Open Font License |

Map attribution is displayed in the application. Original third-party license notices are retained.

## AI disclosure

AI tools were used as development and documentation assistance during the project.

- **ChatGPT (GPT-6):** Used for frontend and backend code generation and refinement, implementation of application functions, debugging, integration support, technical explanations, and documentation.
- **Claude (Sonnet 5.5):** Used to a limited extent during the early prototype stages for development assistance and review of diagrams.

AI-generated suggestions and code were reviewed and checked by the team. The team is responsible for the final requirements, system models, implementation decisions, analysis, testing, and conclusions. Every team member must be able to explain the requirements, diagrams, and code during the defense.
