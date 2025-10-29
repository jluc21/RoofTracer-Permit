import crypto from 'crypto';

export function generateFingerprint(data: {
  street?: string;
  city?: string;
  state?: string;
  parcelId?: string;
  issueDate?: string;
  permitType?: string;
}): string {
  // Deterministic fingerprint: sha256(lower(street)+city+state+parcel+date+upper(type))
  const parts = [
    (data.street || '').toLowerCase().trim(),
    (data.city || '').toLowerCase().trim(),
    (data.state || '').toUpperCase().trim(),
    (data.parcelId || '').trim(),
    (data.issueDate || '').trim(),
    (data.permitType || '').toUpperCase().trim(),
  ];
  
  const combined = parts.join('|');
  return crypto.createHash('sha256').update(combined).digest('hex');
}
