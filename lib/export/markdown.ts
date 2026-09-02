import { prosemirrorToMarkdown } from '@/lib/content/markdown-serializer'
import type { PMDocument } from '@/lib/content/article-schema'

/**
 * YAML double-quoted scalars: backslashes and quotes need escaping, and raw
 * newlines would terminate the scalar.
 */
function yamlString(value: string | undefined): string {
  const escaped = (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
  return `"${escaped}"`
}

export function exportToMarkdown(
  doc: PMDocument,
  meta: { titleTag?: string; metaDescription?: string; slug?: string }
): string {
  const content = prosemirrorToMarkdown(doc)
  const frontmatter = `---
title: ${yamlString(meta.titleTag)}
description: ${yamlString(meta.metaDescription)}
slug: ${yamlString(meta.slug)}
---

`
  return frontmatter + content
}
