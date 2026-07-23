import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const projectFile = path => new URL(`../../${path}`, import.meta.url);

describe('contrato acessível da interface', () => {
  it('não usa handlers, estilos inline ou diálogos bloqueantes', async () => {
    const [html, app] = await Promise.all([
      readFile(projectFile('index.html'), 'utf8'),
      readFile(projectFile('app.js'), 'utf8')
    ]);

    expect(html).not.toMatch(/\s(?:on\w+|style)=/i);
    expect(app).not.toMatch(/\b(?:alert|confirm|prompt)\s*\(/);
  });

  it('nomeia diálogos e oferece navegação semântica', async () => {
    const html = await readFile(projectFile('index.html'), 'utf8');

    expect(html).toContain('class="skip-link"');
    expect(html).toContain('id="main-content"');
    expect(html.match(/role="(?:alert)?dialog"/g)).toHaveLength(4);
    expect(html.match(/aria-modal="true"/g)).toHaveLength(4);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-controls="app-sidebar"');
  });
});
