export const API_SCOPES = {
  'employees:read':    'Citire angajați',
  'employees:write':   'Creare/modificare angajați',
  'examinations:read': 'Citire examinări (fără date medicale sensibile)',
  'companies:read':    'Citire companii și locuri de muncă',
  'recalls:read':      'Citire scadențe',
  'webhooks:write':    'Gestionare webhook-uri',
} as const

export type ApiScope = keyof typeof API_SCOPES
