-- OncoDoseRx Database Schema
-- PostgreSQL with pgvector extension

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    report_type VARCHAR(50) DEFAULT 'oncology',
    processing_status VARCHAR(50) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    extracted_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Extracted entities table
CREATE TABLE IF NOT EXISTS extracted_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_value TEXT NOT NULL,
    confidence_score DECIMAL(3,2),
    source_text TEXT,
    page_number INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chemotherapy regimens table
CREATE TABLE IF NOT EXISTS chemotherapy_regimens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_name VARCHAR(255) NOT NULL,
    standard_dose_per_m2 DECIMAL(8,2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'mg/m²',
    route VARCHAR(50) DEFAULT 'IV',
    frequency VARCHAR(50),
    cycle_length_days INTEGER DEFAULT 21,
    indications TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dose results table
CREATE TABLE IF NOT EXISTS dose_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    regimen_id UUID,
    bsa_value DECIMAL(5,2) NOT NULL,
    bsa_formula VARCHAR(50) NOT NULL,
    standard_dose DECIMAL(8,2) NOT NULL,
    dose_reduction_percent DECIMAL(5,2) DEFAULT 0,
    final_dose_mg DECIMAL(8,2) NOT NULL,
    rounded_dose_mg DECIMAL(8,2) NOT NULL,
    calculation_steps JSONB,
    safety_warnings JSONB,
    explanation TEXT,
    confidence_score DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_reports_patient ON reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(processing_status);
CREATE INDEX IF NOT EXISTS idx_entities_report ON extracted_entities(report_id);
CREATE INDEX IF NOT EXISTS idx_dose_results_patient ON dose_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_dose_results_report ON dose_results(report_id);

-- Insert sample chemotherapy regimens
INSERT INTO chemotherapy_regimens (drug_name, standard_dose_per_m2, unit, route, frequency, cycle_length_days, indications)
VALUES
    ('Doxorubicin', 75, 'mg/m²', 'IV', 'Every 3 weeks', 21, ARRAY['Breast Cancer', 'Lymphoma', 'Ovarian Cancer']),
    ('Cisplatin', 75, 'mg/m²', 'IV', 'Every 3 weeks', 21, ARRAY['Lung Cancer', 'Bladder Cancer', 'Ovarian Cancer']),
    ('Paclitaxel', 175, 'mg/m²', 'IV', 'Every 3 weeks', 21, ARRAY['Breast Cancer', 'Ovarian Cancer', 'Lung Cancer']),
    ('5-Fluorouracil', 500, 'mg/m²', 'IV', 'Weekly', 7, ARRAY['Colorectal Cancer', 'Breast Cancer', 'Head and Neck Cancer']),
    ('Cyclophosphamide', 1000, 'mg/m²', 'IV', 'Every 3 weeks', 21, ARRAY['Breast Cancer', 'Lymphoma', 'Ovarian Cancer']),
    ('Methotrexate', 40, 'mg/m²', 'IV', 'Weekly', 7, ARRAY['Breast Cancer', 'Lymphoma', 'Osteosarcoma']),
    ('Vincristine', 1.4, 'mg/m²', 'IV', 'Every 2 weeks', 14, ARRAY['Lymphoma', 'Leukemia', 'Neuroblastoma']),
    ('Bleomycin', 15, 'mg/m²', 'IV', 'Every 3 weeks', 21, ARRAY['Testicular Cancer', 'Lymphoma', 'Cervical Cancer']),
    ('Etoposide', 100, 'mg/m²', 'IV', 'Every 3 weeks', 21, ARRAY['Lung Cancer', 'Testicular Cancer', 'Lymphoma']),
    ('Ifosfamide', 2000, 'mg/m²', 'IV', 'Every 3 weeks', 21, ARRAY['Sarcoma', 'Testicular Cancer', 'Lymphoma'])
ON CONFLICT DO NOTHING;
