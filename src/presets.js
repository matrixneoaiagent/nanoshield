// Real-world PII test presets for NanoShield demo and testing

export const PRESETS = [
  {
    id: 'support',
    name: 'Customer Support Escalation',
    category: 'Fintech & eCommerce',
    text: `Support Ticket #84912 - Urgent Billing Query
From: Marcus Holloway <m.holloway@nexuscorp.net>
Phone: +1 (415) 892-0193
Address: 1428 Market Street, Apt 4B, San Francisco, CA 94102

Hi Support Team,
My company corporate card was billed twice for the enterprise license renewal.
The transaction was charged to Visa card ending in 4532-8901-2345-6789 (Exp 09/28, CVV 819).
Please verify this refund with our finance director Sarah Connor at s.connor@nexuscorp.net or call her direct line at +1 (415) 892-0199.

Regards,
Marcus Holloway
Senior VP of Operations`,
  },
  {
    id: 'medical',
    name: 'Clinical Health Record',
    category: 'Healthcare & HIPAA',
    text: `St. Jude Medical Center - Confidential Patient Intake
Date: 2026-11-19
Patient Name: Emily Richardson
Date of Birth: 1984-06-12 | SSN: 482-19-4820
Contact Phone: +1 (312) 555-0144
Emergency Contact: David Richardson (Spouse) at david.r@richardson-fam.org (+1 312-555-0199)
Home Address: 842 North Michigan Ave, Apt 1204, Chicago, IL 60611

Chief Complaint: Patient presenting with acute symptoms. Attending physician Dr. Jonathan Vance reviewed initial lab results. Prescriptions sent to Walgreens Pharmacy on Chicago Ave under insurance policy ID BCBS-IL-892314-X.`,
  },
  {
    id: 'devops',
    name: 'Production Crash Incident',
    category: 'Cybersecurity & Infrastructure',
    text: `[ALERT] 2026-11-19T14:32:01Z - kubernetes-worker-09 crash report
Operator: Alex Chen <alex.chen@infra-cloud.io>
Internal IP: 10.240.12.88 | Node: prod-cluster-east-1

Exception in auth_middleware.go:42:
Failed to authenticate connection to Postgres primary db-prod-01.internal.corp.
Database credential string: postgres://admin_user:P@ssw0rdSecure991!@10.240.12.90:5432/core
AWS Access Key used: AKIAIOSFODNN7EXAMPLE
Cloudflare Tunnel Token: bearer_tok_9f81a7b6c5d4e3f21a00b8
Please page on-call engineer Elena Rostova at +1 (206) 555-0177 immediately.`,
  },
  {
    id: 'legal',
    name: 'Corporate NDA & Agreement',
    category: 'Legal & Executive',
    text: `CONFIDENTIAL MUTUAL NON-DISCLOSURE AGREEMENT
This agreement is entered into between Apex Horizons LLC, represented by Chief Legal Counsel Jonathan Vance (jvance@apexhorizons.com, phone +1 212-555-8392), located at 350 Fifth Avenue, 54th Floor, New York, NY 10118, and Quantum BioVentures Inc.

Direct all wire notices and settlement escrows to Chase Manhattan Bank, Routing Number 021000021, Account Number 9871234567, Attention: CFO Melissa Brooks (mbrooks@quantumbio.com, +1 212-555-9011).`,
  },
];
