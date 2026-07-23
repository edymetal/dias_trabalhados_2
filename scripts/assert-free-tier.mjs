import { readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fail(message) {
  console.error(`Restrição de plano gratuito violada: ${message}`);
  process.exitCode = 1;
}

const firebaseConfig = readJson('firebase.json');
const firebaseProjects = readJson('.firebaserc').projects || {};
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_PATH) {
  const event = readJson(process.env.GITHUB_EVENT_PATH);
  if (event.repository?.private !== false) {
    fail('GitHub Pages no plano Free exige que este repositório permaneça público.');
  }
}

const firebaseSectionsThatRequireBilling = ['apphosting', 'extensions', 'functions', 'storage'];
for (const section of firebaseSectionsThatRequireBilling) {
  if (Object.hasOwn(firebaseConfig, section)) {
    fail(`firebase.json não pode configurar "${section}" sem revisão explícita do custo.`);
  }
}

for (const [alias, projectId] of Object.entries(firebaseProjects)) {
  if (!String(projectId).startsWith('demo-')) {
    fail(`o alias Firebase "${alias}" aponta para "${projectId}", não para um projeto demo.`);
  }
}

const runners = [...workflow.matchAll(/^\s*runs-on:\s*(.+)\s*$/gm)]
  .map(match => match[1].trim().replaceAll(/['"]/g, ''));
for (const runner of runners) {
  if (runner !== 'ubuntu-latest') {
    fail(`o runner "${runner}" não faz parte da configuração gratuita aprovada.`);
  }
}

if (/firebase\s+deploy|gcloud\s+(?:app|functions|run)\s+deploy/i.test(workflow)) {
  fail('o workflow não pode publicar serviços Firebase ou Google Cloud.');
}

if (!process.exitCode) {
  console.log('Configuração compatível com GitHub Free e Firebase Spark.');
}
