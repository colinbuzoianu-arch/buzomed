import { NextResponse } from 'next/server'

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Buzomed Public API',
    version: '1.0.0',
    description: `REST API for integrating HR systems (SAP, Workday, Charisma, Zapier) with Buzomed occupational medicine platform.

## Authentication
All endpoints require an API key sent as a Bearer token:
\`\`\`
Authorization: Bearer bz_live_<your-key>
\`\`\`
Create and manage API keys at **Settings → API & Webhooks** in the Buzomed dashboard.

## Scopes
Each API key has a set of scopes. Endpoints require a specific scope — requests with insufficient scope return HTTP 403.

## Rate Limiting
1000 requests per hour per API key. Remaining quota is returned in response headers:
- \`X-RateLimit-Limit\`: total allowed per hour
- \`X-RateLimit-Remaining\`: remaining in current window

## Webhooks
Register HTTPS endpoints to receive real-time event notifications. Each delivery is signed with HMAC-SHA256:
\`\`\`
X-Buzomed-Signature: sha256=<hex>
\`\`\`
Verify: \`sha256=\` + HMAC-SHA256(secret, rawBody).

The \`employee.updated\` event fires on **any** employee change — whether made via this API (PATCH /employees/{id}) or through the Buzomed dashboard UI — enabling bidirectional sync with external HR systems.

## Privacy
Clinical and medical fields are never returned by this API (no CNP, birth date, diagnoses, anamnesis, vital signs, etc.).`,
  },
  servers: [
    { url: 'https://buzomed.com/api/v1', description: 'Production' },
  ],
  security: [{ BearerAuth: [] }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key (bz_live_...)',
      },
    },
    schemas: {
      Employee: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          companyEmployeeId: { type: 'string', nullable: true },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          jobTitle: { type: 'string', nullable: true },
          email: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          companyId: { type: 'string', format: 'uuid', nullable: true },
          companyName: { type: 'string', nullable: true },
          workplaceId: { type: 'string', format: 'uuid', nullable: true },
          workplaceName: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Examination: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          examinationNumber: { type: 'string', nullable: true },
          employeeId: { type: 'string', format: 'uuid' },
          employeeName: { type: 'string' },
          companyId: { type: 'string', format: 'uuid', nullable: true },
          companyName: { type: 'string', nullable: true },
          workplaceId: { type: 'string', format: 'uuid', nullable: true },
          workplaceName: { type: 'string', nullable: true },
          examinationTypeName: { type: 'string' },
          status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'] },
          verdict: { type: 'string', enum: ['apt', 'apt_conditionat', 'inapt_temporar', 'inapt'], nullable: true },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          signedAt: { type: 'string', format: 'date-time', nullable: true },
          nextExaminationDueDate: { type: 'string', format: 'date', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Company: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          cui: { type: 'string', nullable: true },
          registrationNumber: { type: 'string', nullable: true },
          city: { type: 'string', nullable: true },
          county: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          contractStartDate: { type: 'string', format: 'date', nullable: true },
          contractEndDate: { type: 'string', format: 'date', nullable: true },
        },
      },
      Workplace: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          department: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          examinationIntervalMonths: { type: 'integer', nullable: true },
        },
      },
      Recall: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          employeeId: { type: 'string', format: 'uuid' },
          employeeName: { type: 'string' },
          companyId: { type: 'string', format: 'uuid', nullable: true },
          companyName: { type: 'string', nullable: true },
          workplaceId: { type: 'string', format: 'uuid', nullable: true },
          workplaceName: { type: 'string', nullable: true },
          examinationTypeName: { type: 'string' },
          dueDate: { type: 'string', format: 'date' },
          status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
          notificationSentAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/employees': {
      get: {
        summary: 'List employees',
        description: 'Returns employees for your tenant. Requires scope `employees:read`.',
        operationId: 'listEmployees',
        tags: ['Employees'],
        parameters: [
          { name: 'companyId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by company' },
          { name: 'workplaceId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by workplace' },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' }, description: 'Filter by active status (default: true)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Pagination' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Employee' } } } },
                  ],
                },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Forbidden / insufficient scope' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/employees/{id}': {
      get: {
        summary: 'Get employee',
        description: 'Returns a single employee by ID. Requires scope `employees:read`.',
        operationId: 'getEmployee',
        tags: ['Employees'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } } },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        summary: 'Update employee',
        description: `Partially updates an employee. All body fields are optional — only include what you want to change. Requires scope \`employees:write\`.

**Writable fields**: \`companyEmployeeId\`, \`firstName\`, \`lastName\`, \`jobTitle\`, \`email\`, \`phone\`, \`isActive\`, \`workplaceId\`.

**workplaceId**: set to a workplace UUID to assign or transfer the employee; set to \`null\` to remove the current assignment. The workplace must belong to the same company as the employee.

**Forbidden clinical fields**: sending any of \`cnp\`, \`dateOfBirth\`, \`birthDate\`, \`gender\`, \`idDocumentType\`, \`idDocumentNumber\`, \`nationality\`, \`addressLine1\`–\`postalCode\`, \`bloodType\`, \`emergencyContact*\`, \`vitalSigns\`, \`diagnoses\`, \`anamnesis\`, \`notes\`, or any other medical/PII field returns HTTP 400 \`forbidden_field\`. These fields require elevated permissions and must be managed through the Buzomed dashboard.

**Optimistic concurrency**: include \`expectedUpdatedAt\` (ISO string from a previous GET or PATCH response \`updatedAt\` field) to detect concurrent modifications. If the record was changed since your last read, the request returns HTTP 409 with the current employee data so you can reconcile before retrying.

A successful update fires the \`employee.updated\` webhook to all registered endpoints.`,
        operationId: 'updateEmployee',
        tags: ['Employees'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  companyEmployeeId: { type: 'string', nullable: true, description: 'Internal HR badge / matricola number' },
                  firstName: { type: 'string', minLength: 1 },
                  lastName: { type: 'string', minLength: 1 },
                  jobTitle: { type: 'string', nullable: true },
                  email: { type: 'string', nullable: true },
                  phone: { type: 'string', nullable: true },
                  isActive: { type: 'boolean' },
                  workplaceId: { type: 'string', format: 'uuid', nullable: true, description: 'Set to a workplace UUID to assign/transfer; null to remove current assignment' },
                  expectedUpdatedAt: { type: 'string', format: 'date-time', description: 'ISO timestamp from a previous read; triggers optimistic concurrency check' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Employee updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } },
          },
          '400': {
            description: 'Validation error or forbidden field',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', enum: ['validation_failed', 'forbidden_field', 'invalid_json'] },
                    issues: { type: 'array', items: { type: 'string' }, description: 'Present on validation_failed' },
                    fields: { type: 'array', items: { type: 'string' }, description: 'Present on forbidden_field — lists which fields were rejected' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized — missing or invalid API key' },
          '403': { description: 'Forbidden — key lacks the employees:write scope' },
          '404': { description: 'Employee not found, or workplace not found / not in same company' },
          '409': {
            description: 'Conflict — record was modified since expectedUpdatedAt; current employee data is returned so the caller can reconcile',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', enum: ['conflict'] },
                    employee: { $ref: '#/components/schemas/Employee' },
                  },
                },
              },
            },
          },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/examinations': {
      get: {
        summary: 'List examinations',
        description: 'Returns examinations. Clinical/medical fields are excluded. Requires scope `examinations:read`.',
        operationId: 'listExaminations',
        tags: ['Examinations'],
        parameters: [
          { name: 'companyId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'employeeId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'] } },
          { name: 'signedOnly', in: 'query', schema: { type: 'boolean' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start of scheduledAt range (ISO date)' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End of scheduledAt range (ISO date)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Pagination' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Examination' } } } },
                  ],
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/examinations/{id}': {
      get: {
        summary: 'Get examination',
        description: 'Returns a single examination by ID. Requires scope `examinations:read`.',
        operationId: 'getExamination',
        tags: ['Examinations'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { examination: { $ref: '#/components/schemas/Examination' } } } } } },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/companies': {
      get: {
        summary: 'List companies',
        description: 'Returns companies for your tenant. Requires scope `companies:read`.',
        operationId: 'listCompanies',
        tags: ['Companies'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Pagination' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Company' } } } },
                  ],
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/companies/{id}/workplaces': {
      get: {
        summary: 'List workplaces for a company',
        description: 'Returns all workplaces (locuri de muncă) for a company. Requires scope `companies:read`.',
        operationId: 'listCompanyWorkplaces',
        tags: ['Companies'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { workplaces: { type: 'array', items: { $ref: '#/components/schemas/Workplace' } } } } } } },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Company not found' },
        },
      },
    },
    '/recalls': {
      get: {
        summary: 'List upcoming recalls',
        description: 'Returns pending examination recall records. Requires scope `recalls:read`.',
        operationId: 'listRecalls',
        tags: ['Recalls'],
        parameters: [
          { name: 'companyId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'overdue'] }, description: '`overdue` filters to dueDate < today' },
          { name: 'horizon', in: 'query', schema: { type: 'integer', enum: [30, 60, 90] }, description: 'Days ahead to include (default: all pending)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Pagination' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Recall' } } } },
                  ],
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
    },
  },
}

export async function GET() {
  return NextResponse.json(spec)
}
