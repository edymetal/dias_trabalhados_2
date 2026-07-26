import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

function requireHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error(`Health check exige HTTPS: ${url.href}`);
  }
  return url;
}

function findAsset(html, pattern, label) {
  const match = html.match(pattern);
  if (!match?.[1]) throw new Error(`${label} não encontrado no HTML publicado.`);
  return match[1];
}

async function fetchRequired(url, fetchImpl, options = {}) {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}.`);
  return response;
}

export async function checkPagesHealth(target, {
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const pageUrl = requireHttpsUrl(target);
  const pageResponse = await fetchRequired(pageUrl, fetchImpl, { timeoutMs });
  const html = await pageResponse.text();

  if (!/<title>\s*Dias Trabalhados\s*<\/title>/i.test(html)) {
    throw new Error('A página publicada não contém o título esperado.');
  }
  if (!/http-equiv=["']Content-Security-Policy["']/i.test(html)) {
    throw new Error('A página publicada não contém a política CSP esperada.');
  }

  const modulePath = findAsset(
    html,
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/i,
    'Bundle JavaScript'
  );
  const manifestPath = findAsset(
    html,
    /<link\b[^>]*\brel=["']manifest["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i,
    'Manifesto'
  );
  const manifestUrl = new URL(manifestPath, pageUrl);
  const [moduleResponse, manifestResponse] = await Promise.all([
    fetchRequired(new URL(modulePath, pageUrl), fetchImpl, { timeoutMs }),
    fetchRequired(manifestUrl, fetchImpl, { timeoutMs })
  ]);
  const manifest = await manifestResponse.json();
  const moduleSource = await moduleResponse.text();

  if (manifest.name !== 'Dias Trabalhados') {
    throw new Error('Manifesto publicado não corresponde à aplicação.');
  }
  const requiredIconSizes = ['192x192', '512x512'];
  const requiredIcons = requiredIconSizes.map(size => {
    const icon = manifest.icons?.find(candidate =>
      candidate.src && candidate.sizes?.split(/\s+/).includes(size)
    );
    if (!icon) throw new Error(`Manifesto publicado não contém o ícone ${size}.`);
    return { icon, size };
  });
  const iconResponses = await Promise.all(requiredIcons.map(({ icon }) =>
    fetchRequired(new URL(icon.src, manifestUrl), fetchImpl, { timeoutMs })
  ));
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

  for (let index = 0; index < iconResponses.length; index += 1) {
    const response = iconResponses[index];
    const contentType = response.headers.get('content-type') || '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    const validSignature = pngSignature.every((byte, offset) => bytes[offset] === byte);

    if (!contentType.toLowerCase().startsWith('image/png') || !validSignature) {
      throw new Error(`Ícone ${requiredIcons[index].size} publicado não é um PNG válido.`);
    }
  }
  if (moduleSource.length < 1_000) {
    throw new Error('Bundle JavaScript publicado está vazio ou incompleto.');
  }

  return {
    checkedAt: new Date().toISOString(),
    manifest: manifest.name,
    page: pageResponse.url || pageUrl.href,
    status: 'healthy'
  };
}

export async function checkPagesHealthWithRetry(target, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await checkPagesHealth(target, options);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw lastError;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  const target = process.argv[2];
  if (!target) {
    console.error('Uso: node scripts/check-pages-health.mjs <url-https>');
    process.exit(2);
  }

  try {
    console.log(JSON.stringify(await checkPagesHealthWithRetry(target), null, 2));
  } catch (error) {
    console.error(`Health check falhou: ${error.message}`);
    process.exit(1);
  }
}
