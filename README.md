# OncoDoseRx

AI-powered chemotherapy dose calculation and oncology report extraction platform.

## Features

- **PDF/Image Upload**: Upload oncology reports (PDF, PNG, JPG, WEBP) with OCR text extraction
- **AI Report Parsing**: Extract structured clinical data from free-text reports
- **ML Prediction**: Random Forest model trained on 120,000 patients for chemotherapy cycle prediction
- **BSA Calculator**: Calculate Body Surface Area using multiple formulas (Mosteller, Du Bois, Haycock, Boyd, Gehan & George)
- **Dose Engine**: Calculate chemotherapy drug doses based on BSA with clinical rounding
- **Explainable AI**: Generate human-readable explanations for all predictions and calculations
- **Patient Management**: Store and manage patient records in PostgreSQL
- **Dashboard**: View platform statistics and recent activity
- **Continuous Learning**: Every analysis is saved as patient data, and every treatment decision a clinician confirms is NCCN-checked, added to the training dataset, and used to retrain the model — see [Continuous Learning](#continuous-learning)

## Tech Stack

### Backend
- Node.js / Express
- PostgreSQL with pg extension
- Tesseract.js for OCR
- pdf-parse for PDF text extraction

### Frontend
- Next.js / React (TypeScript, App Router, Tailwind CSS)
- Talks to the Express API via `/api/*` (proxied — see `frontend/next.config.ts`)

### AI/ML
- Random Forest model (120k patient dataset)
- Rule-based NCCN guideline engine
- Report classifier
- Data completeness checker

## Project Structure

```
OncoDoseRx/
├── server.js                 # Main Express server
├── package.json              # Dependencies
├── .env.example              # Environment variables template
├── engine/
│   ├── parser.js             # Report text parser
│   ├── predictor.js          # NCCN rule-based prediction engine
│   ├── ml_predictor.js       # ML model bridge
│   ├── report_classifier.js  # Report type classifier
│   ├── data_checker.js       # Missing data checker
│   └── nccn_validator.js     # NCCN cross-check of a clinician's decision
├── services/
│   ├── database.js           # SQLite service
│   ├── bsaCalculator.js      # BSA calculation service
│   ├── doseEngine.js         # Chemotherapy dose engine
│   ├── explainableAI.js      # Explainable AI service
│   ├── analysisPersistence.js # Auto-saves each analysis as patient data
│   ├── datasetWriter.js      # Appends confirmed cases to the training corpus
│   ├── learningStore.js      # Decisions, contributions, model-version history
│   └── retrainer.js          # Runs, gates and promotes retraining
├── ml/
│   ├── generate_and_train.py # Regenerates the synthetic corpus (overwrites the CSV)
│   └── retrain_from_dataset.py # Retrains on the corpus as it stands (read-only)
├── data/
│   ├── cancer_patients.csv   # Training dataset (synthetic + RW- clinical cases)
│   ├── clinical_contributions.csv # Provenance of every contributed case
│   ├── model_rules.json      # ML model rules
│   ├── dataset_stats.json    # Dataset statistics
│   ├── feature_importance.json
│   └── models/               # Retraining staging dirs and model backups
├── frontend/                 # Next.js/React UI (see below)
│   ├── src/app/               # Pages (upload, multi-upload, patients, bsa, dashboard, model)
│   ├── src/components/        # Analysis rendering, decision capture, pending sign-off
│   └── src/lib/                # API client, slot definitions, treatment-plan generator
├── database/
│   └── schema.sql            # PostgreSQL schema
└── scripts/
    └── migrate.js            # Database migration script
```

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ with pgvector extension

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd OncoDoseRx
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up PostgreSQL**
   ```bash
   # Create database
   createdb oncodoserx

   # Run schema
   psql -d oncodoserx -f database/schema.sql
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

5. **Start the API server**
   ```bash
   npm start
   ```
   This serves the API on `http://localhost:3000` — it has no UI of its
   own.

6. **Start the frontend** (in a second terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Runs on `http://localhost:3001` and proxies all `/api/*` calls to the
   Express server on port 3000 (see `frontend/next.config.ts`) — the API
   server must already be running before you start this.

7. **Open in browser**
   ```
   http://localhost:3001
   ```

The field name the upload form sends (`report`) and the JSON response
shapes in `frontend/src/lib/api.ts` are matched directly to `server.js`'s
routes — if you add or change an API route in `server.js`, update
`frontend/src/lib/api.ts` (and, for slot/pathway changes, `frontend/src/lib/slots.ts`) to match.

## API Endpoints

### Analysis
- `POST /api/analyze` - Single file upload and analysis
- `POST /api/analyze-multi` - Multi-file upload and analysis (also accepts pasted text)
- `POST /api/analyze-text` - Analyze pasted text only
- `POST /api/analyze-breast-secondary` - Analyze a breast-cancer conditional report (genomic risk score, BRCA, nodal staging)
- `POST /api/upload-and-analyze` - Upload, analyze, and save to database

### Patients
- `GET /api/patients` - Get all patients
- `GET /api/patients/:id` - Get patient by ID
- `POST /api/patients` - Create new patient
- `PUT /api/patients/:id` - Update patient
- `DELETE /api/patients/:id` - Delete patient

### Calculations
- `POST /api/calculate-bsa` - Calculate Body Surface Area
- `POST /api/calculate-dose` - Calculate chemotherapy dose

### Data
- `GET /api/dashboard` - Get dashboard statistics
- `GET /api/regimens` - Get chemotherapy regimens
- `GET /api/reports/:id` - Get report with entities
- `GET /api/patients/:id/reports` - Get patient reports
- `GET /api/patients/:id/dose-results` - Get patient dose results

### Continuous learning
- `POST /api/treatment-decision` - Record the clinician's confirmed regimen and cycles, cross-check it against NCCN, and add it to the training dataset
- `GET /api/model/status` - Dataset size, clinician-confirmed case count, accuracy, retraining history
- `POST /api/model/retrain` - Start a retraining run immediately (runs in the background)
- `GET /api/learning/decisions` - Recent treatment decisions across all patients
- `GET /api/patients/:id/decisions` - Treatment decisions for one patient
- `GET /api/patients/:id/pending-decisions` - Analyses on this chart that nobody has signed off on yet, each with its current recommendation
- `POST /api/patients/:id/confirm-decisions` - Batch sign-off for several of those at once

### Information
- `GET /api/health` - Health check
- `GET /api/dataset` - Dataset information
- `GET /api/cancer-types` - List supported cancer types
- `GET /api/cancer-type/:type/requirements` - Get requirements for cancer type

## BSA Formulas

1. **Mosteller**: √((height × weight) / 3600)
2. **Du Bois**: 0.007184 × height^0.725 × weight^0.425
3. **Haycock**: 0.024265 × height^0.3964 × weight^0.5378
4. **Boyd**: 0.0003207 × weight^0.7285 - 0.0188 × ln(weight) × height^0.3
5. **Gehan & George**: 0.0235 × height^0.42246 × weight^0.51456

## Chemotherapy Regimens

The system includes standard dosing for:
- Doxorubicin
- Cisplatin
- Paclitaxel
- 5-Fluorouracil
- Cyclophosphamide
- Methotrexate
- Vincristine
- Bleomycin
- Etoposide
- Ifosfamide

## Database Schema

### Tables
- `patients` - Patient demographic information
- `reports` - Uploaded reports and processing status
- `extracted_entities` - Structured data extracted from reports
- `chemotherapy_regimens` - Standard drug dosing protocols
- `dose_results` - Calculated dose results with explanations
- `treatment_decisions` - What the clinician decided vs. what the model predicted, with NCCN concordance
- `training_contributions` - Which decisions became training rows, and which retraining run consumed them
- `model_versions` - Every retraining run: dataset size, accuracy, and whether it was promoted or rejected

## Development

### Running in development mode
```bash
npm run dev
```

### Database migrations
```bash
npm run db:migrate
```

### Seeding data
```bash
npm run db:seed
```

## Continuous Learning

The model gets better as clinicians use the platform.

### The loop

1. **Analyse** — a report is uploaded (`/upload`, `/multi-upload`, or pasted text). The parser
   extracts the clinical data, the NCCN rule engine and the ML model both produce recommendations.
2. **Auto-save** — the analysis is written to the patient record automatically: a patient row, the
   report, its extracted entities, and the clinical profile used by Trial Match. No extra step, no
   lost cases. Set `AUTO_SAVE_ANALYSIS=false` to analyse without saving.
3. **Decide** — the *Confirm Treatment Decision* card at the bottom of the analysis is pre-filled
   with the recommendation, and **Confirm** records it exactly as shown: one click, no required
   fields. *Adjust details* opens the rest — a different regimen or cycle count, plus the fields a
   report rarely states (sex, ECOG, Charlson score, prior treatment), all optional. The clinician's
   name is remembered in the browser so it is typed once, not once per case.

   Reports analysed in a batch and reviewed later do not get lost: the patient page shows an
   **Unconfirmed analyses** card listing everything still awaiting sign-off, with each item's
   current recommendation, so a whole backlog can be reviewed and confirmed together. Those
   recommendations are re-derived from the stored report text at read time, so confirming a
   month-old analysis commits today's recommendation, not the one the model gave back then.
4. **Cross-check** — the decision is validated against the NCCN rule set for that exact profile and
   labelled `guideline_match`, `regimen_match`, `variant`, `off_guideline` or `unverifiable`. An
   off-guideline decision is never blocked — off-guideline care is legitimate — but it is weighted
   lower during training.
5. **Enrich** — the case is appended to `data/cancer_patients.csv` with an `RW-` patient id, in
   exactly the same 35-column schema as the synthetic corpus. Provenance (who decided, NCCN
   concordance, whether the model was overridden) goes to `data/clinical_contributions.csv`.
6. **Retrain** — once `RETRAIN_THRESHOLD` (default 10) new cases have accumulated,
   `ml/retrain_from_dataset.py` runs in the background over the whole corpus, real cases up-weighted
   `CLINICAL_SAMPLE_WEIGHT`x (default 25) so a few hundred real rows are not drowned out by 150,000
   synthetic ones.
7. **Promote** — if bucket accuracy has not regressed, the new artefacts replace the live model and
   are hot-reloaded, so the *next* prediction already benefits. If accuracy regressed, the run is
   rejected and the live model is untouched.

Everything above is visible on the **Model Learning** page (`/model`): dataset growth, override rate,
NCCN concordance mix, and every retraining run including the rejected ones.

### Why a human confirmation is required

The dataset is only ever enriched from a **clinician-confirmed** decision, never from the model's own
prediction. Writing a model's output back into its training data does not teach it anything — it
amplifies whatever bias the model already has, and accuracy degrades run over run. The confirmation
step is what makes the loop a learning loop rather than an echo.

### Safety rails

| Rail | What it prevents |
| --- | --- |
| Human-confirmed labels only | The model training on its own predictions |
| NCCN concordance weighting | A mistyped or off-guideline case outvoting guideline-concordant ones |
| Fingerprint de-duplication | The same case being submitted twice and counted twice |
| Staged artefacts + backup | A half-written model going live |
| Accuracy gate (`RETRAIN_ACCURACY_TOLERANCE`, default 1%) | A worse model being promoted |
| Single-flight retraining | Two concurrent runs racing over the same files |
| `model_versions` audit log | A silent degradation nobody notices |

### Retraining by hand

```bash
# Retrain over the current corpus into a staging directory (nothing goes live)
python ml/retrain_from_dataset.py --out data/models/manual --trees 300

# Or trigger a full run (train, gate, promote, hot-reload) through the API
curl -X POST http://localhost:3000/api/model/retrain
```

`ml/generate_and_train.py` is a different script: it **regenerates** the synthetic corpus and
overwrites `data/cancer_patients.csv`, which would erase every contributed case. Use
`ml/retrain_from_dataset.py` for retraining; only run the generator to rebuild the corpus from
scratch.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTO_SAVE_ANALYSIS` | `true` | Save every analysis as patient data |
| `AUTO_RETRAIN` | `true` | Retrain automatically once the threshold is reached |
| `RETRAIN_THRESHOLD` | `10` | New confirmed cases needed to trigger a run |
| `CLINICAL_SAMPLE_WEIGHT` | `25` | How much a real case counts vs. a synthetic one. Lower it (towards 10) once several hundred real cases have accumulated, so a small number of them cannot dominate the model. |
| `RETRAIN_ACCURACY_TOLERANCE` | `0.01` | Accuracy drop tolerated before a run is rejected |
| `RETRAIN_TREES` | `300` | Trees in the Random Forest |
| `PYTHON_BIN` | auto-detected | Interpreter used for retraining (a `ml/venv` is preferred) |

Retraining needs `pandas`, `numpy` and `scikit-learn`. Install them into a project virtualenv rather
than the system Python:

```bash
python -m venv ml/venv
ml/venv/Scripts/python -m pip install pandas numpy scikit-learn   # Windows
```

## Clinical Disclaimer

This is a clinical decision-support tool only. All recommendations must be reviewed by a licensed oncologist before administration. The system is designed to assist healthcare professionals and should not replace clinical judgment.

## License

MIT

Terminal 1 — backend (API on port 3000):


cd C:\FibonnaciProjectOncodoseRx
npm start
Terminal 2 — frontend (UI on port 3001):


cd C:\FibonnaciProjectOncodoseRx\frontend
npm run dev
