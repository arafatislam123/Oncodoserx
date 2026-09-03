import en from "./treatmentPlan.en";
import bn from "./treatmentPlan.bn";
import it from "./treatmentPlan.it";
import type { Lang } from "./context";
import type { DeepDict } from "./types";

const DICTS: Record<Lang, DeepDict<typeof en>> = { en, bn, it };

export function getTreatmentPlanContent(lang: Lang) {
  return DICTS[lang];
}
