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

## Tech Stack

### Backend
- Node.js / Express
- PostgreSQL with pg extension
- Tesseract.js for OCR
- pdf-parse for PDF text extraction

### Frontend
- Vanilla JavaScript
- Modern CSS with dark medical theme
- Responsive design

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
│   └── data_checker.js       # Missing data checker
├── services/
│   ├── database.js           # PostgreSQL service
│   ├── bsaCalculator.js      # BSA calculation service
│   ├── doseEngine.js         # Chemotherapy dose engine
│   └── explainableAI.js      # Explainable AI service
├── data/
│   ├── cancer_patients.csv   # Training dataset
│   ├── model_rules.json      # ML model rules
│   ├── dataset_stats.json    # Dataset statistics
│   └── feature_importance.json
├── public/
│   ├── index.html            # Main HTML
│   ├── app.js                # Frontend JavaScript
│   └── style.css             # Styles
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

5. **Start the server**
   ```bash
   npm start
   ```

6. **Open in browser**
   ```
   http://localhost:3000
   ```

## API Endpoints

### Analysis
- `POST /api/analyze` - Single file upload and analysis
- `POST /api/analyze-multi` - Multi-file upload and analysis
- `POST /api/analyze-text` - Analyze pasted text
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

## Clinical Disclaimer

This is a clinical decision-support tool only. All recommendations must be reviewed by a licensed oncologist before administration. The system is designed to assist healthcare professionals and should not replace clinical judgment.

## License

MIT
