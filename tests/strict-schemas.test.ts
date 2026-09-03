import { z } from 'zod'
import { OutlineSchema, SectionDraftSchema, ImagePlanSchema, ProofreadSchema, SeoSchema } from '../lib/ai/schemas'
import { InferredProfileSchema } from '../lib/brand/infer-profile'

/**
 * OpenAI's strict structured outputs reject any object whose `required` does
 * not list every key in `properties`. An optional field is therefore not
 * expressible: a field the model may leave out has to be nullable instead.
 * Anthropic tolerates optionals, so this only shows up on an OpenAI-only
 * deployment — at runtime, mid-generation. This test catches it at build time.
 */

let failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok  ${label}`)
  else { failures++; console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

type JsonSchema = { type?: unknown; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; [k: string]: unknown }

/** Every object node whose `required` misses a key in `properties`. */
function findOptionalFields(node: JsonSchema, path = '$'): string[] {
  const bad: string[] = []
  if (!node || typeof node !== 'object') return bad
  if (node.properties) {
    const required = new Set(node.required ?? [])
    for (const key of Object.keys(node.properties)) {
      if (!required.has(key)) bad.push(`${path}.${key}`)
      bad.push(...findOptionalFields(node.properties[key], `${path}.${key}`))
    }
  }
  if (node.items) bad.push(...findOptionalFields(node.items as JsonSchema, `${path}[]`))
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const branch = node[key]
    if (Array.isArray(branch)) branch.forEach((b, i) => bad.push(...findOptionalFields(b as JsonSchema, `${path}.${key}[${i}]`)))
  }
  return bad
}

// Only schemas actually handed to a model as a response format.
const LLM_SCHEMAS: Array<[string, z.ZodType]> = [
  ['OutlineSchema', OutlineSchema],
  ['SectionDraftSchema', SectionDraftSchema],
  ['ImagePlanSchema', ImagePlanSchema],
  ['ProofreadSchema', ProofreadSchema],
  ['SeoSchema', SeoSchema],
  ['InferredProfileSchema', InferredProfileSchema],
]

for (const [name, schema] of LLM_SCHEMAS) {
  let json: JsonSchema
  try {
    json = z.toJSONSchema(schema, { io: 'output' }) as JsonSchema
  } catch (e) {
    check(`${name} converts to JSON Schema`, false, (e as Error).message)
    continue
  }
  const optional = findOptionalFields(json, name)
  check(`${name} has no optional fields (use .nullable())`, optional.length === 0, optional)
}

console.log(`\n${failures === 0 ? 'all passed' : `${failures} failed`}`)
if (failures > 0) process.exit(1)
