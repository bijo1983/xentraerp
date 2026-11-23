// ICD-10 (WHO / ICD-10-CM style codes) for quick picking in outpatient care. The list covers the
// conditions most seen in general practice and the specialties CLINZA supports; any other valid
// code can still be typed in full (claim forms in the GCC, India and the EU all take ICD-10 codes).
// Searching matches the code, the description and common clinical abbreviations (URTI, HTN, DM…).
export const COMMON_ICD10: [string, string][] = [
  // infections / respiratory
  ['J00', 'Acute nasopharyngitis (common cold)'],
  ['J06.9', 'Acute upper respiratory infection, unspecified'],
  ['J02.9', 'Acute pharyngitis, unspecified'],
  ['J02.0', 'Streptococcal pharyngitis'],
  ['J03.90', 'Acute tonsillitis, unspecified'],
  ['J01.90', 'Acute sinusitis, unspecified'],
  ['J32.9', 'Chronic sinusitis, unspecified'],
  ['J04.0', 'Acute laryngitis'],
  ['J20.9', 'Acute bronchitis, unspecified'],
  ['J18.9', 'Pneumonia, unspecified organism'],
  ['J11.1', 'Influenza with other respiratory manifestations'],
  ['U07.1', 'COVID-19, virus identified'],
  ['J45.909', 'Asthma, unspecified, uncomplicated'],
  ['J45.901', 'Asthma, unspecified, with acute exacerbation'],
  ['J44.9', 'Chronic obstructive pulmonary disease, unspecified'],
  ['J44.1', 'COPD with acute exacerbation'],
  ['J30.9', 'Allergic rhinitis, unspecified'],
  ['J30.2', 'Other seasonal allergic rhinitis'],
  ['R05.9', 'Cough, unspecified'],
  ['R06.02', 'Shortness of breath'],
  ['A09', 'Infectious gastroenteritis and colitis, unspecified'],
  ['K52.9', 'Non-infective gastroenteritis and colitis, unspecified'],
  ['A01.00', 'Typhoid fever, unspecified'],
  ['A90', 'Dengue fever'],
  ['B54', 'Unspecified malaria'],
  ['B34.9', 'Viral infection, unspecified'],
  ['B01.9', 'Varicella (chickenpox) without complication'],
  ['B02.9', 'Zoster (shingles) without complication'],
  ['B00.1', 'Herpesviral vesicular dermatitis (cold sore)'],
  ['A15.0', 'Tuberculosis of lung'],
  ['B37.0', 'Candidal stomatitis (oral thrush)'],
  ['B37.3', 'Candidiasis of vulva and vagina'],
  ['N39.0', 'Urinary tract infection, site not specified'],
  ['N30.00', 'Acute cystitis without haematuria'],
  ['N10', 'Acute pyelonephritis'],
  ['R50.9', 'Fever, unspecified'],
  // cardiometabolic
  ['I10', 'Essential (primary) hypertension'],
  ['I11.9', 'Hypertensive heart disease without heart failure'],
  ['I50.9', 'Heart failure, unspecified'],
  ['I20.9', 'Angina pectoris, unspecified'],
  ['I25.10', 'Atherosclerotic heart disease without angina pectoris'],
  ['I48.91', 'Unspecified atrial fibrillation'],
  ['I49.9', 'Cardiac arrhythmia, unspecified'],
  ['R00.2', 'Palpitations'],
  ['R07.9', 'Chest pain, unspecified'],
  ['I83.90', 'Varicose veins of lower extremities, asymptomatic'],
  ['I95.9', 'Hypotension, unspecified'],
  ['E11.9', 'Type 2 diabetes mellitus without complications'],
  ['E11.65', 'Type 2 diabetes mellitus with hyperglycaemia'],
  ['E11.40', 'Type 2 diabetes mellitus with diabetic neuropathy, unspecified'],
  ['E10.9', 'Type 1 diabetes mellitus without complications'],
  ['R73.03', 'Prediabetes'],
  ['O24.419', 'Gestational diabetes mellitus in pregnancy, unspecified control'],
  ['E78.5', 'Hyperlipidaemia, unspecified'],
  ['E78.00', 'Pure hypercholesterolaemia, unspecified'],
  ['E66.9', 'Obesity, unspecified'],
  ['E66.3', 'Overweight'],
  ['E55.9', 'Vitamin D deficiency, unspecified'],
  ['E53.8', 'Vitamin B12 deficiency'],
  ['D50.9', 'Iron deficiency anaemia, unspecified'],
  ['D64.9', 'Anaemia, unspecified'],
  ['D56.9', 'Thalassaemia, unspecified'],
  ['D57.1', 'Sickle-cell disease without crisis'],
  ['E03.9', 'Hypothyroidism, unspecified'],
  ['E05.90', 'Thyrotoxicosis, unspecified'],
  ['E04.9', 'Nontoxic goitre, unspecified'],
  ['E28.2', 'Polycystic ovarian syndrome'],
  ['M10.9', 'Gout, unspecified'],
  ['E79.0', 'Hyperuricaemia without signs of inflammatory arthritis'],
  ['N18.9', 'Chronic kidney disease, unspecified'],
  ['K76.0', 'Fatty (change of) liver, not elsewhere classified'],
  // digestive
  ['K21.9', 'Gastro-oesophageal reflux disease without oesophagitis'],
  ['K29.70', 'Gastritis, unspecified'],
  ['K30', 'Functional dyspepsia'],
  ['K27.9', 'Peptic ulcer, unspecified'],
  ['K58.9', 'Irritable bowel syndrome without diarrhoea'],
  ['K59.00', 'Constipation, unspecified'],
  ['R19.7', 'Diarrhoea, unspecified'],
  ['R11.2', 'Nausea with vomiting, unspecified'],
  ['R10.9', 'Unspecified abdominal pain'],
  ['R10.13', 'Epigastric pain'],
  ['K64.9', 'Haemorrhoids, unspecified'],
  ['K40.90', 'Inguinal hernia, unilateral, without obstruction or gangrene'],
  ['K80.20', 'Calculus of gallbladder without cholecystitis'],
  ['K35.80', 'Acute appendicitis, unspecified'],
  ['B15.9', 'Hepatitis A without hepatic coma'],
  ['K12.0', 'Recurrent oral aphthae'],
  // neuro / mental health
  ['R51.9', 'Headache, unspecified'],
  ['G44.209', 'Tension-type headache, unspecified, not intractable'],
  ['G43.909', 'Migraine, unspecified'],
  ['R42', 'Dizziness and giddiness'],
  ['H81.10', 'Benign paroxysmal vertigo, unspecified ear'],
  ['G40.909', 'Epilepsy, unspecified, not intractable'],
  ['G51.0', 'Bell’s palsy'],
  ['G56.00', 'Carpal tunnel syndrome, unspecified upper limb'],
  ['G62.9', 'Polyneuropathy, unspecified'],
  ['I63.9', 'Cerebral infarction, unspecified'],
  ['G47.00', 'Insomnia, unspecified'],
  ['G47.33', 'Obstructive sleep apnoea'],
  ['F41.9', 'Anxiety disorder, unspecified'],
  ['F41.1', 'Generalised anxiety disorder'],
  ['F32.A', 'Depression, unspecified'],
  ['F32.9', 'Major depressive disorder, single episode, unspecified'],
  ['F43.10', 'Post-traumatic stress disorder, unspecified'],
  ['F90.9', 'Attention-deficit hyperactivity disorder, unspecified type'],
  ['F84.0', 'Autistic disorder'],
  ['F17.210', 'Nicotine dependence, cigarettes, uncomplicated'],
  ['R53.83', 'Other fatigue'],
  ['R55', 'Syncope and collapse'],
  // musculoskeletal / injury
  ['M54.50', 'Low back pain, unspecified'],
  ['M54.2', 'Cervicalgia (neck pain)'],
  ['M54.16', 'Radiculopathy, lumbar region'],
  ['M51.26', 'Other intervertebral disc displacement, lumbar region'],
  ['M17.9', 'Osteoarthritis of knee, unspecified'],
  ['M19.90', 'Unspecified osteoarthritis, unspecified site'],
  ['M06.9', 'Rheumatoid arthritis, unspecified'],
  ['M81.0', 'Age-related osteoporosis without current fracture'],
  ['M25.561', 'Pain in right knee'],
  ['M25.562', 'Pain in left knee'],
  ['M25.511', 'Pain in right shoulder'],
  ['M25.512', 'Pain in left shoulder'],
  ['M75.100', 'Rotator cuff tear, unspecified shoulder'],
  ['M75.00', 'Adhesive capsulitis (frozen shoulder), unspecified shoulder'],
  ['M77.10', 'Lateral epicondylitis (tennis elbow), unspecified elbow'],
  ['M72.2', 'Plantar fascial fibromatosis (plantar fasciitis)'],
  ['M79.1', 'Myalgia'],
  ['M79.7', 'Fibromyalgia'],
  ['M62.830', 'Muscle spasm of back'],
  ['S93.401A', 'Sprain of right ankle, initial encounter'],
  ['S93.402A', 'Sprain of left ankle, initial encounter'],
  ['S83.90XA', 'Sprain of unspecified knee, initial encounter'],
  ['S16.1XXA', 'Strain of neck muscle, initial encounter'],
  ['S39.012A', 'Strain of muscle of lower back, initial encounter'],
  ['S61.419A', 'Laceration of hand, initial encounter'],
  ['S01.80XA', 'Open wound of head, initial encounter'],
  ['S52.509A', 'Fracture of lower end of radius, initial encounter'],
  ['T14.90XA', 'Injury, unspecified, initial encounter'],
  ['T78.40XA', 'Allergy, unspecified, initial encounter'],
  ['T63.441A', 'Toxic effect of bee venom (sting), initial encounter'],
  ['T30.0', 'Burn, unspecified body region, unspecified degree'],
  // skin
  ['L20.9', 'Atopic dermatitis, unspecified'],
  ['L30.9', 'Dermatitis, unspecified'],
  ['L23.9', 'Allergic contact dermatitis, unspecified cause'],
  ['L50.9', 'Urticaria, unspecified'],
  ['L70.0', 'Acne vulgaris'],
  ['L71.9', 'Rosacea, unspecified'],
  ['L40.0', 'Psoriasis vulgaris'],
  ['L21.9', 'Seborrhoeic dermatitis, unspecified'],
  ['L80', 'Vitiligo'],
  ['L81.4', 'Other melanin hyperpigmentation'],
  ['L81.1', 'Chloasma (melasma)'],
  ['L63.9', 'Alopecia areata, unspecified'],
  ['L64.9', 'Androgenic alopecia, unspecified'],
  ['L65.9', 'Nonscarring hair loss, unspecified'],
  ['B35.1', 'Tinea unguium (onychomycosis)'],
  ['B35.4', 'Tinea corporis'],
  ['B35.6', 'Tinea cruris'],
  ['B35.3', 'Tinea pedis'],
  ['B36.0', 'Pityriasis versicolor'],
  ['B86', 'Scabies'],
  ['B07.9', 'Viral wart, unspecified'],
  ['L01.00', 'Impetigo, unspecified'],
  ['L02.91', 'Cutaneous abscess, unspecified'],
  ['L03.90', 'Cellulitis, unspecified'],
  ['L60.0', 'Ingrowing nail'],
  ['L72.0', 'Epidermal cyst'],
  ['L82.1', 'Other seborrhoeic keratosis'],
  ['D22.9', 'Melanocytic naevi, unspecified'],
  // eye
  ['H10.9', 'Unspecified conjunctivitis'],
  ['H10.10', 'Acute atopic (allergic) conjunctivitis, unspecified eye'],
  ['H04.123', 'Dry eye syndrome of bilateral lacrimal glands'],
  ['H00.019', 'Hordeolum externum (stye), unspecified eye'],
  ['H01.009', 'Unspecified blepharitis, unspecified eye'],
  ['H52.13', 'Myopia, bilateral'],
  ['H52.03', 'Hypermetropia, bilateral'],
  ['H52.203', 'Unspecified astigmatism, bilateral'],
  ['H52.4', 'Presbyopia'],
  ['H40.9', 'Unspecified glaucoma'],
  ['H40.10X0', 'Unspecified open-angle glaucoma, stage unspecified'],
  ['H25.9', 'Unspecified age-related cataract'],
  ['E11.319', 'Type 2 diabetes mellitus with unspecified diabetic retinopathy without macular oedema'],
  ['H35.30', 'Unspecified macular degeneration'],
  ['H50.9', 'Unspecified strabismus'],
  ['H53.009', 'Unspecified amblyopia, unspecified eye'],
  ['H11.009', 'Unspecified pterygium of unspecified eye'],
  ['H16.9', 'Unspecified keratitis'],
  ['T15.90XA', 'Foreign body on external eye, initial encounter'],
  // ENT
  ['H66.90', 'Otitis media, unspecified'],
  ['H60.90', 'Unspecified otitis externa'],
  ['H61.20', 'Impacted cerumen, unspecified ear'],
  ['H91.90', 'Unspecified hearing loss, unspecified ear'],
  ['H93.19', 'Tinnitus, unspecified ear'],
  ['J34.2', 'Deviated nasal septum'],
  ['J33.9', 'Nasal polyp, unspecified'],
  ['R04.0', 'Epistaxis'],
  ['J35.01', 'Chronic tonsillitis'],
  // dental
  ['K02.9', 'Dental caries, unspecified'],
  ['K02.52', 'Dental caries on pit and fissure surface penetrating into dentin'],
  ['K04.0', 'Pulpitis'],
  ['K04.7', 'Periapical abscess without sinus'],
  ['K04.5', 'Chronic apical periodontitis'],
  ['K05.10', 'Chronic gingivitis, plaque induced'],
  ['K05.00', 'Acute gingivitis, plaque induced'],
  ['K05.30', 'Chronic periodontitis, unspecified'],
  ['K03.6', 'Deposits (accretions) on teeth (calculus)'],
  ['K03.1', 'Abrasion of teeth'],
  ['K03.81', 'Cracked tooth'],
  ['K08.109', 'Complete loss of teeth, unspecified cause'],
  ['K08.409', 'Partial loss of teeth, unspecified cause'],
  ['K01.1', 'Impacted teeth'],
  ['K00.6', 'Disturbances in tooth eruption'],
  ['K07.4', 'Malocclusion, unspecified'],
  ['K10.3', 'Alveolitis of jaws (dry socket)'],
  ['M26.609', 'Unspecified temporomandibular joint disorder'],
  ['K06.010', 'Localised gingival recession'],
  ['K03.89', 'Other specified diseases of hard tissues of teeth (dentine hypersensitivity)'],
  ['S02.5XXA', 'Fracture of tooth (traumatic), initial encounter'],
  // women's health
  ['Z34.90', 'Supervision of normal pregnancy, unspecified trimester'],
  ['Z34.00', 'Supervision of normal first pregnancy, unspecified trimester'],
  ['O21.0', 'Mild hyperemesis gravidarum'],
  ['O20.0', 'Threatened abortion'],
  ['O13.9', 'Gestational hypertension, unspecified trimester'],
  ['Z30.09', 'Encounter for contraceptive counselling'],
  ['Z39.2', 'Routine postpartum follow-up'],
  ['N94.6', 'Dysmenorrhoea, unspecified'],
  ['N92.6', 'Irregular menstruation, unspecified'],
  ['N92.0', 'Excessive and frequent menstruation with regular cycle (menorrhagia)'],
  ['N91.2', 'Amenorrhoea, unspecified'],
  ['N95.1', 'Menopausal and female climacteric states'],
  ['N76.0', 'Acute vaginitis'],
  ['N73.9', 'Female pelvic inflammatory disease, unspecified'],
  ['N83.20', 'Unspecified ovarian cyst'],
  ['D25.9', 'Leiomyoma of uterus (fibroid), unspecified'],
  ['N60.19', 'Diffuse cystic mastopathy of unspecified breast'],
  ['N97.9', 'Female infertility, unspecified'],
  // men's / urology
  ['N40.0', 'Benign prostatic hyperplasia without lower urinary tract symptoms'],
  ['N20.0', 'Calculus of kidney'],
  ['N52.9', 'Male erectile dysfunction, unspecified'],
  ['R31.9', 'Haematuria, unspecified'],
  ['N47.1', 'Phimosis'],
  // paediatrics
  ['Z00.129', 'Routine child health examination without abnormal findings'],
  ['Z00.110', 'Health examination for newborn under 8 days old'],
  ['P59.9', 'Neonatal jaundice, unspecified'],
  ['L22', 'Diaper (napkin) dermatitis'],
  ['R62.51', 'Failure to thrive (child)'],
  ['B08.4', 'Enteroviral vesicular stomatitis with exanthem (hand, foot and mouth)'],
  ['B26.9', 'Mumps without complication'],
  ['B05.9', 'Measles without complication'],
  ['R56.00', 'Simple febrile convulsions'],
  ['E86.0', 'Dehydration'],
  ['K00.7', 'Teething syndrome'],
  ['B80', 'Enterobiasis (pinworm)'],
  // preventive / administrative
  ['Z00.00', 'General adult medical examination without abnormal findings'],
  ['Z00.01', 'General adult medical examination with abnormal findings'],
  ['Z02.89', 'Encounter for other administrative examinations (fitness, visa, work)'],
  ['Z01.00', 'Encounter for examination of eyes and vision'],
  ['Z01.20', 'Encounter for dental examination and cleaning'],
  ['Z01.419', 'Encounter for gynaecological examination without abnormal findings'],
  ['Z23', 'Encounter for immunisation'],
  ['Z09', 'Encounter for follow-up examination after completed treatment'],
  ['Z76.0', 'Encounter for issue of repeat prescription'],
  ['Z71.3', 'Dietary counselling and surveillance'],
  ['Z13.1', 'Encounter for screening for diabetes mellitus'],
  ['Z12.31', 'Encounter for screening mammogram for malignant neoplasm of breast'],
  ['Z11.59', 'Encounter for screening for other viral diseases'],
  ['Z48.02', 'Encounter for removal of sutures'],
  ['Z51.81', 'Encounter for therapeutic drug level monitoring'],
  ['Z79.4', 'Long-term (current) use of insulin'],
  ['Z88.0', 'Allergy status to penicillin'],
]

/** Clinical shorthand and lay terms → words that appear in the descriptions above. */
const SYNONYMS: Record<string, string[]> = {
  urti: ['upper respiratory'], uti: ['urinary tract'], htn: ['hypertension'], bp: ['hypertension'], dm: ['diabetes'], t2dm: ['type 2 diabetes'],
  t1dm: ['type 1 diabetes'], gerd: ['reflux'], gord: ['reflux'], ibs: ['irritable bowel'], copd: ['obstructive pulmonary'], af: ['atrial fibrillation'],
  ihd: ['atherosclerotic heart'], cad: ['atherosclerotic heart'], ckd: ['chronic kidney'], lbp: ['low back'], oa: ['osteoarthritis'], ra: ['rheumatoid'],
  pcos: ['polycystic'], bph: ['prostatic'], osa: ['sleep apnoea'], adhd: ['attention-deficit'], ptsd: ['post-traumatic'], gad: ['anxiety'],
  flu: ['influenza'], cold: ['nasopharyngitis'], covid: ['covid'], sore: ['pharyngitis'], throat: ['pharyngitis'], wheeze: ['asthma'],
  sugar: ['diabetes'], cholesterol: ['hypercholesterol', 'hyperlipid'], lipid: ['hyperlipid'], thyroid: ['thyroid', 'goitre'],
  piles: ['haemorrhoids'], stone: ['calculus'], stye: ['hordeolum'], pink: ['conjunctivitis'], wax: ['cerumen'], eczema: ['dermatitis'],
  pimples: ['acne'], dandruff: ['seborrhoeic'], ringworm: ['tinea'], fungal: ['tinea', 'candid'], hives: ['urticaria'], shingles: ['zoster'],
  chickenpox: ['varicella'], toothache: ['pulpitis', 'caries'], cavity: ['caries'], decay: ['caries'], gum: ['gingivitis', 'periodontitis'],
  wisdom: ['impacted'], abscess: ['abscess'], period: ['menstruation', 'dysmenorrhoea'], pregnancy: ['pregnancy'], anc: ['pregnancy'],
  checkup: ['examination'], 'check-up': ['examination'], vaccine: ['immunisation'], vaccination: ['immunisation'], fatigue: ['fatigue'],
  vertigo: ['vertigo', 'dizziness'], giddiness: ['dizziness'], migraine: ['migraine'], anaemia: ['anaemia'], anemia: ['anaemia'],
  diarrhea: ['diarrhoea'], vomiting: ['vomiting'], fever: ['fever'], sprain: ['sprain'], fracture: ['fracture'], cut: ['laceration', 'open wound'],
}

let recent: [string, string][] = []
const RECENT_KEY = 'clinza.icd.recent'
try {
  recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
} catch {
  recent = []
}

/** Remembers a code the doctor used (shown first next time). */
export function rememberIcd(code: string, description: string) {
  if (!code) return
  recent = [[code, description] as [string, string], ...recent.filter(([c]) => c !== code)].slice(0, 12)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch {
    /* not remembered */
  }
}
export function recentIcd(): [string, string][] {
  return recent
}

export function searchIcd(q: string, limit = 10): [string, string][] {
  const s = q.trim().toLowerCase()
  if (!s) return (recent.length ? recent : COMMON_ICD10).slice(0, limit)
  const words = s.split(/\s+/)
  const syn = words.map((w) => SYNONYMS[w] || [])
  const scored: [number, [string, string]][] = []
  for (const row of COMMON_ICD10) {
    const [c, d] = row
    const cl = c.toLowerCase()
    const dl = d.toLowerCase()
    let score = 0
    if (cl === s) score = 100
    else if (cl.startsWith(s) || cl.replace('.', '').startsWith(s.replace('.', ''))) score = 80
    else if (words.every((w, i) => syn[i].some((a) => dl.includes(a)) || dl.includes(w))) {
      // an abbreviation's meaning ranks above the letters happening to appear in a word (URTI vs urticaria)
      const viaSyn = words.some((_, i) => syn[i].some((a) => dl.includes(a)))
      const atStart = dl.startsWith(words[0]) || syn[0].some((a) => dl.startsWith(a))
      score = (viaSyn ? 60 : 50) + (atStart ? 5 : 0)
    }
    if (score) scored.push([score, row])
  }
  scored.sort((a, b) => b[0] - a[0] || a[1][0].localeCompare(b[1][0]))
  return scored.slice(0, limit).map(([, r]) => r)
}
