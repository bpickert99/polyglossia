# Cherokee source documents

Drop Cherokee learning materials in this folder — `.txt`, `.md`, or `.pdf`:

- grammars and grammar sketches
- word lists / dictionaries / phrasebooks
- lesson notes, curricula, readers
- cultural background material

When files here change on `main`, the **Build course from sources** workflow reads
everything in this folder and regenerates `data/chr/` — updating the skill tree,
adding units, and revising lessons to match the documents.

> The bundled starter course was seeded from public reference material and is
> **not** derived from documents in this folder. The first upload you make here
> becomes the authoritative basis for the course going forward.

Tips:

- Prefer several focused files over one giant one (better incremental rebuilds).
- Name files descriptively (`beginner-grammar.pdf`, `kinship-terms.txt`) — the
  builder cites filenames when deciding what each unit teaches.
- Deleting a file and pushing also triggers a rebuild that drops material which
  is no longer supported by any source.
