import type treatmentPlanContent from "./treatmentPlan.en";
import type { DeepDict } from "./types";

const it: DeepDict<typeof treatmentPlanContent> = {
  interval: "21 giorni",
  durationTemplate: "{weeks} settimane ({cycles} cicli × 21 giorni)",
  durationContinuous: "Terapia continua / mirata (nessun ciclo fisso)",
  generalNotes: {
    ecogPs2: "ECOG PS 2 — considerare una riduzione della dose (75-80% della dose standard)",
    ageOver70: "Età >70 anni — considerare una valutazione geriatrica e adeguamenti del dosaggio",
  },
  breast: {
    supportiveCare: [
      "Supporto con G-CSF (Filgrastim) con schema dose-dense",
      "Profilassi antiemetica: antagonista 5-HT3 + antagonista NK1 + Desametasone",
      "Monitoraggio cardiaco (FEVS) con regimi contenenti antracicline",
      "Monitoraggio cardiaco per Herceptin (Trastuzumab) se HER2+",
    ],
    monitoring: [
      "Emocromo prima di ogni ciclo",
      "Test di funzionalità epatica",
      "Ecocardiogramma ogni 3 mesi (se antraciclina)",
      "Rivalutazione HER2/ER/PR in caso di progressione",
    ],
    secondaryNotes: {
      canAvoidChemo1: "Genomic Risk Score: rischio basso — chemioterapia evitabile in sicurezza secondo Oncotype DX/MammaPrint",
      canAvoidChemo2: "La sola terapia endocrina è sufficiente per questa paziente",
      brcaPositive1: "Rilevata mutazione BRCA1/BRCA2 — idoneità a inibitore PARP (olaparib/talazoparib) per malattia metastatica",
      brcaPositive2: "Considerare mastectomia bilaterale e salpingo-ovariectomia di riduzione del rischio",
      nodeNegative1: "Biopsia del linfonodo sentinella: linfonodi negativi — prognosi eccellente",
      nodeNegative2: "Decisione chemioterapica guidata dal punteggio di rischio genomico e dalle dimensioni del tumore",
      nodePositive1: "Biopsia del linfonodo sentinella: linfonodi positivi — chemioterapia consigliata",
      nodePositive2: "Considerare regime dose-dense e irradiazione linfonodale estesa",
    },
  },
  lung: {
    supportiveCare: [
      "Profilassi per Pneumocystis (se steroidi ad alto dosaggio)",
      "Profilassi antiemetica",
      "Monitoraggio della funzionalità polmonare",
    ],
    monitoring: [
      "Emocromo, pannello metabolico prima di ogni ciclo",
      "TC torace ogni 2-3 cicli",
      "Rivalutazione EGFR/ALK in caso di progressione",
      "Rivalutazione PD-L1 se si considera l'immunoterapia",
    ],
  },
  colorectal: {
    supportiveCare: [
      "Profilassi antiemetica",
      "Monitoraggio della neuropatia periferica (oxaliplatino)",
      "Gestione della diarrea (loperamide al bisogno)",
    ],
    monitoring: [
      "Emocromo, pannello metabolico prima di ogni ciclo",
      "CEA ogni 2-3 cicli",
      "TC torace/addome/pelvi ogni 8-12 settimane",
      "Rivalutazione KRAS/NRAS/BRAF in caso di progressione",
    ],
  },
  brain: {
    supportiveCare: [
      "Desametasone per l'edema cerebrale",
      "Profilassi antiepilettica (levetiracetam)",
      "Supporto con G-CSF se radioterapia concomitante",
      "Profilassi PJP se steroidi prolungati",
    ],
    monitoring: [
      "RM cerebrale ogni 2-3 mesi durante il trattamento",
      "Valutazione neurologica prima di ogni frazione di radioterapia",
      "Revisione dello stato di metilazione MGMT",
      "Valutazione KPS/ECOG prima di ogni ciclo",
    ],
    stuppNote: "Protocollo Stupp: radioterapia con temozolomide concomitante seguita da temozolomide adiuvante",
    optuneNote: "Considerare i campi elettrici antitumorali (Optune) per i pazienti idonei",
  },
  lymphoma: {
    supportiveCare: [
      "Profilassi antiemetica",
      "Profilassi della sindrome da lisi tumorale (allopurinolo/idratazione)",
      "Profilassi HBV se HBsAg+ (regimi contenenti rituximab)",
    ],
    monitoring: [
      "Emocromo, pannello metabolico prima di ogni ciclo",
      "PET-TC dopo il ciclo 2 (valutazione di risposta intermedia)",
      "Monitoraggio LDH",
      "Livelli di CD20 se regime a base di rituximab",
    ],
  },
  leukemia: {
    supportiveCare: [
      "Profilassi della sindrome da lisi tumorale (idratazione intensiva + allopurinolo)",
      "Profilassi antiemetica",
      "Profilassi antifungina (posaconazolo durante la neutropenia)",
      "Profilassi antivirale (aciclovir)",
    ],
    monitoring: [
      "Emocromo giornaliero durante l'induzione",
      "Biopsia del midollo osseo al giorno 14 e al giorno 28",
      "Monitoraggio citogenetico/FISH",
      "Valutazione MRD (malattia residua minima) post-consolidamento",
    ],
  },
  ovarian: {
    supportiveCare: [
      "Profilassi antiemetica",
      "Monitoraggio della neuropatia periferica",
      "Monitoraggio delle reazioni di ipersensibilità (carboplatino)",
    ],
    monitoring: [
      "Emocromo, pannello metabolico prima di ogni ciclo",
      "CA-125 ogni 3 cicli",
      "TC torace/addome/pelvi al completamento",
      "Revisione dello stato BRCA/HRD per la terapia di mantenimento",
    ],
  },
  pancreatic: {
    supportiveCare: [
      "Profilassi antiemetica",
      "Supporto nutrizionale (sostituzione enzimatica pancreatica)",
      "Gestione del diabete di nuova insorgenza",
    ],
    monitoring: [
      "Emocromo, pannello metabolico prima di ogni ciclo",
      "CA 19-9 ogni 2-3 cicli",
      "TC protocollo pancreas ogni 8-12 settimane",
      "Revisione dello stato BRCA/PALB2 per l'idoneità a olaparib",
    ],
  },
  prostate: {
    supportiveCare: [
      "Coordinamento della terapia di deprivazione androgenica (ADT)",
      "Gestione della salute ossea (acido zoledronico/denosumab)",
      "Gestione delle vampate di calore",
    ],
    monitoring: [
      "PSA ogni 3 mesi",
      "Scintigrafia ossea se progressione sintomatica",
      "PET-TC con PSMA per la ristadiazione",
      "Livelli di testosterone (se in ADT)",
    ],
  },
};

export default it;
