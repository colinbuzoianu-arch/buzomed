/**
 * Guards the sandbox's hard isolation from the backend.
 *
 * The public demo under app/(sandbox)/** and lib/sandbox/** must never touch
 * the database, auth, Supabase, crypto, email, or the AI SDK, and must not
 * define server actions or route handlers. This script walks those folders,
 * plus one level into any @/components/** they import (a reused component that
 * imported Prisma would leak the backend into the demo), and fails on any
 * forbidden import or construct.
 *
 * Run by `npm run lint`. No dependencies — plain fs walk + regex.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..')

// Folders that must stay isolated.
const SANDBOX_DIRS = [join(ROOT, 'app', '(sandbox)'), join(ROOT, 'lib', 'sandbox')]

// Import specifiers the sandbox (and the components it reuses) may not use.
const FORBIDDEN: { test: (spec: string) => boolean; label: string }[] = [
  { test: (s) => s === '@/lib/prisma' || s.startsWith('@/lib/prisma/'), label: '@/lib/prisma' },
  { test: (s) => s === '@/lib/auth' || s.startsWith('@/lib/auth/'), label: '@/lib/auth' },
  { test: (s) => s.startsWith('@/lib/supabase'), label: '@/lib/supabase/**' },
  { test: (s) => s.startsWith('@/lib/crypto'), label: '@/lib/crypto/**' },
  { test: (s) => s.startsWith('@/lib/email'), label: '@/lib/email/**' },
  {
    test: (s) => s === '@anthropic-ai/sdk' || s.startsWith('@anthropic-ai/'),
    label: '@anthropic-ai/sdk',
  },
  { test: (s) => s === '@prisma/client' || s.startsWith('.prisma/'), label: '@prisma/client' },
  { test: (s) => s === '@supabase/ssr' || s === '@supabase/supabase-js', label: '@supabase/*' },
]

const SOURCE_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']

function isSourceFile(path: string): boolean {
  return SOURCE_EXT.some((ext) => path.endsWith(ext))
}

function walk(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      out = out.concat(walk(full))
    } else if (isSourceFile(full)) {
      out.push(full)
    }
  }
  return out
}

/** Extract every module specifier referenced by a file. */
function extractImports(source: string): string[] {
  const specs: string[] = []
  const patterns = [
    /\bimport\s+(?:type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+(?:type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
    while ((m = re.exec(source)) !== null) specs.push(m[1])
  }
  return specs
}

/** Resolve a `@/...` alias to an on-disk source file, if one exists. */
function resolveAlias(spec: string): string | null {
  if (!spec.startsWith('@/')) return null
  const base = join(ROOT, spec.slice(2))
  for (const ext of SOURCE_EXT) {
    const candidate = base + ext
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // not this extension
    }
  }
  for (const ext of SOURCE_EXT) {
    const candidate = join(base, `index${ext}`)
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // not an index file
    }
  }
  return null
}

const errors: string[] = []

function checkFile(path: string, viaComponent: string | null): string[] {
  const rel = relative(ROOT, path).replace(/\\/g, '/')
  const source = readFileSync(path, 'utf8')
  const specs = extractImports(source)
  const found: string[] = []

  // Server action / route handler bans — only for files inside the sandbox
  // folders themselves (reused components can't be routes).
  if (viaComponent === null) {
    if (/^\s*['"]use server['"]/m.test(source)) {
      errors.push(
        `${rel}: contains a 'use server' directive (server actions are forbidden in the sandbox).`
      )
    }
    if (/[/\\]route\.(ts|tsx|js|jsx)$/.test(path)) {
      errors.push(`${rel}: route handlers are forbidden in the sandbox.`)
    }
  }

  for (const spec of specs) {
    for (const rule of FORBIDDEN) {
      if (rule.test(spec)) {
        const where = viaComponent ? ` (reused via ${viaComponent})` : ''
        errors.push(`${rel}${where}: forbidden import "${spec}" (matches ${rule.label}).`)
      }
    }
    // Collect reused components to scan one level deep.
    if (viaComponent === null && spec.startsWith('@/components/')) found.push(spec)
  }

  return found
}

const sandboxFiles = SANDBOX_DIRS.flatMap(walk)
if (sandboxFiles.length === 0) {
  console.error('check-sandbox-isolation: no sandbox files found — is the path correct?')
  process.exit(1)
}

const componentSpecs = new Set<string>()
for (const file of sandboxFiles) {
  for (const spec of checkFile(file, null)) componentSpecs.add(spec)
}

// One level into reused @/components/**.
for (const spec of componentSpecs) {
  const resolved = resolveAlias(spec)
  if (resolved) checkFile(resolved, spec)
}

if (errors.length > 0) {
  console.error('\n✖ Sandbox isolation check failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  console.error(`\n${errors.length} problem(s). The sandbox must not reach the backend.\n`)
  process.exit(1)
}

console.log(
  `✓ Sandbox isolation OK (${sandboxFiles.length} files, ${componentSpecs.size} reused components checked).`
)
