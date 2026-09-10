// Mock data for the User Portal.
// Every screen reads from here. Once the backend is ready, replace these
// exports with TanStack Query hooks that call the real Django endpoints —
// the component layer doesn't need to change shape, just the data source.

export const currentUser = {
  name: 'Lakshita Shrivastava',
  role: 'Primary Account',
  avatarInitials: 'LS',
};

export const familyMembers = [
  { id: 'self', name: 'Lakshita Shrivastava', relation: 'Self', initials: 'LS' },
  { id: 'father', name: 'Ramesh Shrivastava', relation: 'Father', initials: 'RS' },
  { id: 'mother', name: 'Sunita Shrivastava', relation: 'Mother', initials: 'SS' },
];

export const healthScore = {
  score: 86,
  label: 'Excellent',
  note: "You're doing great! Keep it up",
};

export const glanceStats = [
  { label: 'Active Medicines', value: 3, sub: 'View All', icon: 'Pill' },
  { label: 'Upcoming Reminders', value: 2, sub: 'Today', icon: 'BellRing' },
  { label: 'Reports This Month', value: 4, sub: 'View All', icon: 'FileText' },
  { label: 'Doctor Visits', value: 1, sub: 'This Month', icon: 'Stethoscope' },
];

export type DocType = 'Report' | 'Prescription' | 'Scan' | 'Discharge' | 'Diagnosis' | 'Allergy';

export const recentRecords: { id: string; title: string; meta: string; type: DocType }[] = [
  { id: 'r1', title: 'Blood Test Report', meta: '12 May 2026 · Pathkind Labs', type: 'Report' },
  { id: 'r2', title: 'Chest X-Ray', meta: '10 May 2026 · City Hospital', type: 'Scan' },
  { id: 'r3', title: 'Prescription - Dr. Sharma', meta: '08 May 2026', type: 'Prescription' },
  { id: 'r4', title: 'MRI Spine Report', meta: '01 May 2026 · HealthCare Center', type: 'Report' },
];

export const upcomingReminders = [
  { id: 'm1', time: '08:00 AM', name: 'Paracetamol 650mg', dose: '1 Tablet' },
  { id: 'm2', time: '02:00 PM', name: 'Vitamin D3 60K', dose: '1 Capsule' },
  { id: 'm3', time: '08:00 PM', name: 'Aspirin 75mg', dose: '1 Tablet' },
];

export type TimelineEvent = {
  id: string;
  date: string;
  title: string;
  meta: string;
  type: DocType;
};

export const timelineByYear: { year: string; events: TimelineEvent[] }[] = [
  {
    year: '2026',
    events: [
      { id: 't1', date: '12 May', title: 'Blood Test', meta: 'Pathkind Labs', type: 'Report' },
      { id: 't2', date: '08 May', title: 'Prescription', meta: 'Dr. R. Sharma', type: 'Prescription' },
      { id: 't3', date: '05 May', title: 'MRI Spine', meta: 'HealthCare Center', type: 'Report' },
    ],
  },
  {
    year: '2025',
    events: [
      { id: 't4', date: '15 Dec', title: 'Typhoid', meta: 'City Hospital', type: 'Diagnosis' },
      { id: 't5', date: '20 Aug', title: 'Allergy Recorded', meta: 'Dust Pollen', type: 'Allergy' },
    ],
  },
  {
    year: '2024',
    events: [
      { id: 't6', date: '10 Nov', title: 'Chest X-Ray', meta: 'City Hospital', type: 'Scan' },
    ],
  },
];

export type MedicalDocument = {
  id: string;
  title: string;
  meta: string;
  type: DocType;
  format: 'PDF' | 'JPG';
  size: string;
};

export const medicalDocuments: MedicalDocument[] = [
  { id: 'd1', title: 'Blood Test Report - May 2026', meta: '12 May 2026 · Pathkind Labs', type: 'Report', format: 'PDF', size: '2.4 MB' },
  { id: 'd2', title: 'MRI Spine Report', meta: '01 May 2026 · HealthCare Center', type: 'Report', format: 'PDF', size: '4.8 MB' },
  { id: 'd3', title: 'Chest X-Ray', meta: '10 May 2026 · City Hospital', type: 'Scan', format: 'JPG', size: '1.2 MB' },
  { id: 'd4', title: 'Prescription - Dr. Sharma', meta: '08 May 2026', type: 'Prescription', format: 'PDF', size: '1.1 MB' },
  { id: 'd5', title: 'Discharge Summary', meta: '26 Apr 2026 · City Hospital', type: 'Discharge', format: 'PDF', size: '2.6 MB' },
  { id: 'd6', title: 'ECG Report', meta: '20 Apr 2026 · Heart Care', type: 'Report', format: 'PDF', size: '1.5 MB' },
];

export const insurancePolicy = {
  insurer: 'Star Health Insurance',
  plan: 'Family Health Optima',
  status: 'Active',
  policyNumber: 'SHI/2025/4567806',
  sumInsured: '₹10,00,000',
  startDate: '01 Apr 2025',
  expiryDate: '31 Mar 2026',
  coverage: [
    { label: 'Hospitalization', value: 'Covered', tone: 'success' as const },
    { label: 'Pre & Post Hospitalization', value: '60 Days', tone: 'neutral' as const },
    { label: 'Room Eligibility', value: '1 Private AC', tone: 'neutral' as const },
    { label: 'Co-payment', value: '10%', tone: 'neutral' as const },
  ],
  benefits: [
    { label: 'Day Care Procedures', covered: true },
    { label: 'Ambulance', covered: true, note: 'Up to ₹2,000' },
    { label: 'Maternity Benefits', covered: true },
    { label: 'New Born Baby', covered: true },
  ],
  aiInsight: 'Your maternity waiting period will be applicable after 2 years of policy start.',
};

export const insuranceChat = [
  { id: 'c1', role: 'user' as const, text: 'Is cataract surgery covered in my policy?' },
  {
    id: 'c2',
    role: 'ai' as const,
    text: 'Yes, cataract surgery is covered in your policy.',
    bullets: [
      'It is covered after a waiting period of 2 years from the policy start date.',
      'The coverage is up to the sum insured under hospitalization benefits.',
      'Subject to policy terms, conditions and sub-limits.',
    ],
    time: '10:20 AM',
  },
  { id: 'c3', role: 'user' as const, text: 'What is the room rent limit?' },
  {
    id: 'c4',
    role: 'ai' as const,
    text: 'Your policy provides coverage for 1 Private AC room.',
    bullets: ['If you choose a higher category room, extra amount may be payable by you.'],
    time: '10:20 AM',
  },
];

export const claimEstimatorDefaults = {
  estimatedBill: '₹2,50,000',
  possibleInsurerCoverage: '₹2,10,000',
  estimatedOutOfPocket: '₹40,000',
};

export type MedicineDose = { time: string; status: 'taken' | 'upcoming'; label: string };

export const medicines: { id: string; name: string; instruction: string; frequency: string; doses: MedicineDose[] }[] = [
  {
    id: 'med1',
    name: 'Paracetamol 650mg',
    instruction: '1 Tablet · After Food',
    frequency: 'Today, 12 May 2026',
    doses: [
      { time: '08:00 AM', status: 'taken', label: 'Taken' },
      { time: '02:00 PM', status: 'taken', label: 'Taken' },
      { time: '08:00 PM', status: 'upcoming', label: 'Take Now' },
    ],
  },
  {
    id: 'med2',
    name: 'Vitamin D3 60K',
    instruction: '1 Capsule · Weekly',
    frequency: 'Every Sunday',
    doses: [{ time: '', status: 'upcoming', label: 'Next: Sun, 18 May' }],
  },
  {
    id: 'med3',
    name: 'Aspirin 75mg',
    instruction: '1 Tablet · After Food',
    frequency: 'Daily',
    doses: [{ time: '08:00 AM', status: 'upcoming', label: 'Upcoming' }],
  },
  {
    id: 'med4',
    name: 'Allegra 120mg',
    instruction: '1 Tablet · Before Sleep',
    frequency: 'Daily',
    doses: [{ time: '10:00 PM', status: 'upcoming', label: 'Upcoming' }],
  },
];

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: number;
  reviews: number;
};

export const doctors: Doctor[] = [
  { id: 'doc1', name: 'Dr. R. Sharma', specialty: 'General Physician', experience: '10+ Years Exp.', rating: 4.8, reviews: 230 },
  { id: 'doc2', name: 'Dr. Neha Verma', specialty: 'Gynecologist', experience: '8+ Years Exp.', rating: 4.7, reviews: 180 },
  { id: 'doc3', name: 'Dr. Amit Singh', specialty: 'Orthopedic', experience: '12+ Years Exp.', rating: 4.9, reviews: 300 },
];

export const specialties = ['General Physician', 'Gynecologist', 'Dermatologist', 'Neurologist', 'Pediatrician'];

export const emergencyProfile = {
  name: 'Lakshita Shrivastava',
  bloodGroup: 'B+',
  allergies: 'Dust, Pollen',
  emergencyContact: { name: 'Priyanshi Shrivastava', phone: '+91 80000 00000' },
  includedFields: ['Personal Information', 'Blood Group', 'Allergies', 'Current Medications', 'Medical Conditions', 'Emergency Contact', 'Insurance Summary'],
};
