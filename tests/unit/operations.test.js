import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { checkPagesHealth } from '../../scripts/check-pages-health.mjs';
import { createContentSecurityPolicy } from '../../vite.config.js';

const projectFile = path => new URL(`../../${path}`, import.meta.url);

function response(body, url, contentType = 'text/plain') {
  return new Response(body, {
    headers: { 'content-type': contentType },
    status: 200
  });
}

describe('operação e entrega', () => {
  it('valida a página, o bundle, o manifesto e seus ícones sem consultar o Firebase', async () => {
    const calls = [];
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const html = [
      '<html><head>',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
      '<link rel="manifest" href="./site.webmanifest">',
      '<script type="module" src="./assets/index.js"></script>',
      '<title>Dias Trabalhados</title>',
      '</head></html>'
    ].join('');
    const fetchImpl = async input => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('site.webmanifest')) {
        return response(JSON.stringify({
          name: 'Dias Trabalhados',
          icons: [
            { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        }), url, 'application/json');
      }
      if (url.endsWith('.png')) return response(png, url, 'image/png');
      if (url.endsWith('assets/index.js')) return response('x'.repeat(1_001), url);
      return response(html, url, 'text/html');
    };

    const result = await checkPagesHealth('https://example.test/app/', { fetchImpl });

    expect(result.status).toBe('healthy');
    expect(calls).toEqual([
      'https://example.test/app/',
      'https://example.test/app/assets/index.js',
      'https://example.test/app/site.webmanifest',
      'https://example.test/app/icons/icon-192.png',
      'https://example.test/app/icons/icon-512.png'
    ]);
    expect(calls.some(url => /firebase|googleapis/.test(url))).toBe(false);
  });

  it('gera CSP de produção sem endpoints locais e libera emuladores apenas em teste', () => {
    const production = createContentSecurityPolicy('production');
    const test = createContentSecurityPolicy('test');

    expect(production).toContain("default-src 'self'");
    expect(production).toContain('https://firebaseappcheck.googleapis.com');
    expect(production).toContain("object-src 'none'");
    expect(production).not.toContain('127.0.0.1');
    expect(test).toContain('http://127.0.0.1:9000');
    expect(test).toContain('http://127.0.0.1:9099');

    const scriptSources = production.split('; ').find(value => value.startsWith('script-src'));
    const frameSources = production.split('; ').find(value => value.startsWith('frame-src'));
    expect(scriptSources).toContain('https://*.firebaseio.com');
    expect(scriptSources).toContain('https://*.firebasedatabase.app');
    expect(frameSources).toContain('https://*.firebaseio.com');
    expect(frameSources).toContain('https://*.firebasedatabase.app');
  });

  it('mantém os assets de instalação relativos ao subdiretório do Pages', async () => {
    const html = await readFile(projectFile('index.html'), 'utf8');
    const manifest = JSON.parse(await readFile(projectFile('public/site.webmanifest'), 'utf8'));
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

    expect(html).not.toMatch(/\b(?:href|src)="\/(?:favicon|icons|site\.webmanifest)/);
    expect(html).toContain('name="referrer" content="strict-origin-when-cross-origin"');
    expect(manifest.start_url).toBe('./');
    expect(manifest.icons.map(icon => icon.src)).toEqual([
      './icons/icon-192.png',
      './icons/icon-512.png'
    ]);

    for (const icon of manifest.icons) {
      const bytes = await readFile(projectFile(`public/${icon.src}`));
      expect(Array.from(bytes.subarray(0, pngSignature.length))).toEqual(pngSignature);
    }

    await expect(readFile(projectFile('site.webmanifest'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });
});
