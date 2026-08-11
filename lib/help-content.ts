// Single source of truth for the Help Center (/help) and any inline
// <HelpText> content that wants to point at a topic. Add/edit topics here —
// no page files need to change.

export type HelpCategory =
  | 'Attendance'
  | 'Training'
  | 'Equipment & Inventory'
  | 'Incidents'
  | 'Inspections'
  | 'Personnel'
  | 'Reports'

export const HELP_CATEGORIES: HelpCategory[] = [
  'Attendance',
  'Training',
  'Equipment & Inventory',
  'Incidents',
  'Inspections',
  'Personnel',
  'Reports',
]

// Matches the legacyMinRole rank convention used by lib/permissions.ts —
// this is a content-relevance filter, not a security boundary, so a simple
// role-rank proxy is enough here rather than pulling in the full
// permission-group resolver.
export type HelpMinRole = 'member' | 'officer' | 'admin'

export interface HelpTopic {
  id: string
  category: HelpCategory
  question: string
  answer: string
  href: string
  linkLabel: string
  minRole: HelpMinRole
}

export const HELP_TOPICS: HelpTopic[] = [
  // ── Attendance ──────────────────────────────────────────────────────────
  {
    id: 'log-attendance',
    category: 'Attendance',
    question: 'How do I log my attendance for an event?',
    answer: 'Open the event on the Events page and tap "Log Attendance," then confirm. Self-logging is only open for a window around the event — after that, log in with an officer or request an excuse instead.',
    href: '/events',
    linkLabel: 'Go to Events',
    minRole: 'member',
  },
  {
    id: 'request-excuse',
    category: 'Attendance',
    question: "How do I request an excuse if I can't attend?",
    answer: 'On the Events page, tap "Can\'t attend?" (or "Request Excuse" after the fact), pick an excuse type, and add optional notes. An officer reviews and approves it.',
    href: '/events',
    linkLabel: 'Go to Events',
    minRole: 'member',
  },
  {
    id: 'approve-attendance',
    category: 'Attendance',
    question: 'How do I approve pending attendance or excuse requests?',
    answer: 'Manage Events lets you bulk-log attendance for a whole roster, approve or deny pending excuse requests, and close out an event once it\'s done.',
    href: '/dept-admin/events',
    linkLabel: 'Go to Manage Events',
    minRole: 'officer',
  },

  // ── Training ─────────────────────────────────────────────────────────────
  {
    id: 'view-training',
    category: 'Training',
    question: 'How do I view my certifications and training history?',
    answer: 'Your Training page lists every class you\'re enrolled in, your attendance status for each, and every certification you currently hold with its expiration date.',
    href: '/training',
    linkLabel: 'Go to Training',
    minRole: 'member',
  },
  {
    id: 'log-outside-training',
    category: 'Training',
    question: 'How do I log training I completed outside the department?',
    answer: 'Use "Log Outside Training" on the Training page — you can optionally upload a photo of your certificate and it will pre-fill the class name and dates for you. It sits as pending until an officer approves it.',
    href: '/training',
    linkLabel: 'Go to Training',
    minRole: 'member',
  },
  {
    id: 'assign-certification',
    category: 'Training',
    question: 'How do I assign a certification or set up a training class?',
    answer: 'Training Admin lets you create certification types, assign them to members or the whole department, and verify attendance so certs get issued automatically.',
    href: '/dept-admin/training',
    linkLabel: 'Go to Training Admin',
    minRole: 'officer',
  },

  // ── Equipment & Inventory ────────────────────────────────────────────────
  {
    id: 'vehicle-check',
    category: 'Equipment & Inventory',
    question: 'How do I run a vehicle check on an apparatus?',
    answer: 'From the Inventory page, pick the apparatus and tap "Vehicle Check." Every item has instructions expanded by default — what to look for and what counts as pass or fail.',
    href: '/equipment',
    linkLabel: 'Go to Inventory',
    minRole: 'member',
  },
  {
    id: 'run-inventory-inspection',
    category: 'Equipment & Inventory',
    question: 'How do I run a compartment inventory inspection?',
    answer: 'Open an apparatus from the Inventory page and start an inspection session — scan or select each compartment, check off items, and flag anything missing or damaged.',
    href: '/equipment',
    linkLabel: 'Go to Inventory',
    minRole: 'member',
  },
  {
    id: 'setup-equipment-items',
    category: 'Equipment & Inventory',
    question: 'How do I set up new equipment items or categories?',
    answer: 'Dept Setup\'s Items tab handles the full hierarchy — Asset Categories, then Assets nested inside each category — plus assigning them to an apparatus or storage location.',
    href: '/dept-admin/setup',
    linkLabel: 'Go to Dept Setup',
    minRole: 'admin',
  },

  // ── Incidents ────────────────────────────────────────────────────────────
  {
    id: 'create-incident',
    category: 'Incidents',
    question: 'How do I create a new incident report?',
    answer: 'Start a new incident and either fill it in manually or import a run sheet — the parser reads a Central Square CFS export and pre-fills times, units, and personnel for you.',
    href: '/incidents/new',
    linkLabel: 'Create an Incident',
    minRole: 'officer',
  },
  {
    id: 'sign-run-report',
    category: 'Incidents',
    question: 'How do I sign off on a run report?',
    answer: 'Any run you were on shows up under the Signatures tab in your Inbox. Tap Sign, review the details, and sign on the pad — it\'s required before the run can be finalized.',
    href: '/inbox',
    linkLabel: 'Go to Inbox',
    minRole: 'member',
  },
  {
    id: 'submit-neris',
    category: 'Incidents',
    question: 'How do I submit an incident to NERIS?',
    answer: 'Once an incident\'s required fields are complete, its detail page shows a NERIS readiness check and a Submit button. Rejected submissions show the exact field that needs fixing.',
    href: '/operations',
    linkLabel: 'Go to Operations',
    minRole: 'officer',
  },

  // ── Inspections ──────────────────────────────────────────────────────────
  {
    id: 'inspection-session',
    category: 'Inspections',
    question: 'What\'s the difference between a Vehicle Check and an Inventory Inspection?',
    answer: 'Vehicle Check covers the truck itself (fluids, lights, brakes). Inventory Inspection walks each compartment\'s equipment. Both are started from the same apparatus card on Inventory.',
    href: '/equipment',
    linkLabel: 'Go to Inventory',
    minRole: 'member',
  },
  {
    id: 'configure-vehicle-check-items',
    category: 'Inspections',
    question: 'How do I configure what shows up on a vehicle check?',
    answer: 'Dept Admin > Inspections manages the Vehicle Check item list — add, edit, or reorder items, and toggle apparatus-specific groups like Air Brakes.',
    href: '/dept-admin/inspections',
    linkLabel: 'Go to Inspections Setup',
    minRole: 'admin',
  },

  // ── Personnel ────────────────────────────────────────────────────────────
  {
    id: 'update-my-profile',
    category: 'Personnel',
    question: 'How do I update my own contact information?',
    answer: 'Find your card on the Personnel roster and tap "Edit Profile" — you can update your phone, address, and emergency contact yourself at any time.',
    href: '/personnel',
    linkLabel: 'Go to Personnel',
    minRole: 'member',
  },
  {
    id: 'add-member',
    category: 'Personnel',
    question: 'How do I add a new member to the roster?',
    answer: 'Add Personnel from the Dept Admin Personnel page — set their access level or permission group, and a temporary password is generated (or a welcome email sent) automatically.',
    href: '/dept-admin/personnel',
    linkLabel: 'Go to Dept Admin Personnel',
    minRole: 'officer',
  },
  {
    id: 'permission-groups',
    category: 'Personnel',
    question: 'How do custom permission groups work?',
    answer: 'Permission Groups let you define named roles like "Chief" or "Records Clerk" with individual capability checkboxes, instead of the fixed Admin/Officer/Member tiers. Assign a group to anyone on the roster.',
    href: '/dept-admin/permission-groups',
    linkLabel: 'Go to Permission Groups',
    minRole: 'admin',
  },

  // ── Reports ──────────────────────────────────────────────────────────────
  {
    id: 'my-activity-report',
    category: 'Reports',
    question: 'Where can I see my own attendance and training history in one place?',
    answer: 'My Activity pulls together your events, training, and inspections into one timeline so you can check your own participation without digging through separate pages.',
    href: '/reports/my-activity',
    linkLabel: 'Go to My Activity',
    minRole: 'member',
  },
  {
    id: 'department-attendance-report',
    category: 'Reports',
    question: 'How do I view department-wide attendance records?',
    answer: 'The Attendance report shows every logged event across the department with filters by date range and member — useful for spotting participation gaps.',
    href: '/reports/attendance',
    linkLabel: 'Go to Attendance Report',
    minRole: 'officer',
  },
  {
    id: 'print-run-sheet',
    category: 'Reports',
    question: 'How do I print a run sheet for an incident?',
    answer: 'Run Report lists every incident with a Print link that opens a formatted, single-page run sheet matching the department\'s paper Run Field Report.',
    href: '/reports/run-report',
    linkLabel: 'Go to Run Report',
    minRole: 'officer',
  },
]
